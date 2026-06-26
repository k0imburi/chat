import "server-only"

import { Buffer } from "node:buffer"
import { MpesaRequestStatus } from "@prisma/client"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

type MpesaConfig = {
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  shortcodeType: string
  storeNumber: string
  environment: string
}

type StkRequestInput = {
  phone: string
  amount: number
  reference?: string
  description?: string
  userId?: string
}

type SafaricomStkResponse = {
  MerchantRequestID?: string
  CheckoutRequestID?: string
  ResponseCode?: string
  ResponseDescription?: string
  CustomerMessage?: string
}

type StkCallbackPayload = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string
      CheckoutRequestID?: string
      ResultCode?: number
      ResultDesc?: string
      CallbackMetadata?: {
        Item?: Array<{ Name?: string; Value?: string | number }>
      }
    }
  }
}

function baseUrl(environment: string) {
  return environment === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
}

function mapStatusToCode(status: MpesaRequestStatus) {
  switch (status) {
    case "SUCCESS":
      return 1
    case "FAILED":
      return 2
    case "CANCELLED":
      return 3
    default:
      return 0
  }
}

export function normalizePhone(phone: string) {
  const cleaned = phone.replace(/\s+/g, "").replace(/^\+/, "")
  if (cleaned.startsWith("0")) return `254${cleaned.slice(1)}`
  if (/^[17]/.test(cleaned)) return `254${cleaned}`
  return cleaned
}

function stkPassword(shortcode: string, passkey: string) {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64")
  return { password, timestamp }
}

function normalizeReference(reference?: string, fallback?: string) {
  const resolved = reference?.trim() || fallback?.trim() || "ChatAndTip"
  return resolved.slice(0, 12)
}

async function resolveConfig(): Promise<MpesaConfig> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  return {
    consumerKey: settings?.mpesaConsumerKey || "",
    consumerSecret: settings?.mpesaConsumerSecret || "",
    shortcode: settings?.mpesaShortcode || "",
    passkey: settings?.mpesaPasskey || "",
    shortcodeType: settings?.mpesaShortcodeType || "CustomerPayBillOnline",
    storeNumber: settings?.mpesaStoreNumber || "",
    environment: settings?.mpesaEnvironment || "sandbox",
  }
}

export async function fetchMpesaAccessToken(config: MpesaConfig) {
  const creds = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64")
  const response = await fetch(`${baseUrl(config.environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${creds}`,
    },
    cache: "no-store",
  })

  const data = (await response.json()) as { access_token?: string; errorMessage?: string }
  if (!data.access_token) {
    throw new Error(data.errorMessage || "Unable to fetch M-PESA access token")
  }

  return data.access_token
}

export async function initiateStkPush(input: StkRequestInput) {
  const config = await resolveConfig()
  if (!config.consumerKey || !config.consumerSecret || !config.shortcode || !config.passkey) {
    throw new Error("M-PESA settings are incomplete")
  }

  const token = await fetchMpesaAccessToken(config)
  const { password, timestamp } = stkPassword(config.shortcode, config.passkey)
  const appUrl = env.APP_URL?.replace(/\/$/, "")
  if (!appUrl) {
    throw new Error("APP_URL is required for M-PESA callbacks")
  }

  const normalizedPhone = normalizePhone(input.phone)
  const accountReference = normalizeReference(input.reference, config.storeNumber || "ChatAndTip")
  const transactionDesc = input.description?.trim() || "Wallet top up"
  const callbackUrl = `${appUrl}/api/lnmo/callbacks/default/default/stk`

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.shortcodeType || "CustomerPayBillOnline",
    Amount: Math.round(input.amount),
    PartyA: normalizedPhone,
    PartyB: config.shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  }

  const response = await fetch(`${baseUrl(config.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  const data = (await response.json()) as SafaricomStkResponse
  const success = String(data.ResponseCode || "") === "0"

  const record = await prisma.mpesaPaymentRequest.create({
    data: {
      userId: input.userId,
      phone: normalizedPhone,
      amount: input.amount,
      merchantRequestId: data.MerchantRequestID || null,
      checkoutRequestId: data.CheckoutRequestID || null,
      status: success ? "PENDING" : "FAILED",
      responsePayload: {
        request: payload,
        response: data,
        reference: accountReference,
        description: transactionDesc,
      },
    },
  })

  return {
    success,
    message: data.CustomerMessage || data.ResponseDescription || (success ? "STK push request sent" : "STK push request failed"),
    merchantRequestID: data.MerchantRequestID || "",
    checkoutRequestID: data.CheckoutRequestID || "",
    responseCode: data.ResponseCode || "",
    responseDescription: data.ResponseDescription || "",
    customerMessage: data.CustomerMessage || "",
    data,
    record,
  }
}

export async function handleStkCallback(body: unknown) {
  const payload = body as StkCallbackPayload
  const stkCallback = payload.Body?.stkCallback
  if (!stkCallback?.CheckoutRequestID) {
    return { ResultCode: 0, ResultDesc: "Accepted" }
  }

  const metadataItems = stkCallback.CallbackMetadata?.Item ?? []
  const getValue = (name: string) => metadataItems.find((item) => item.Name === name)?.Value

  const updatedRecord = await prisma.mpesaPaymentRequest.updateMany({
    where: { checkoutRequestId: stkCallback.CheckoutRequestID },
    data: {
      status: stkCallback.ResultCode === 0 ? "SUCCESS" : "FAILED",
      phone: String(getValue("PhoneNumber") || ""),
      amount: Number(getValue("Amount") || 0),
      responsePayload: {
        callback: payload,
        merchantRequestID: stkCallback.MerchantRequestID || "",
        checkoutRequestID: stkCallback.CheckoutRequestID,
        resultCode: stkCallback.ResultCode ?? null,
        resultDesc: stkCallback.ResultDesc || "",
        mpesaReceipt: String(getValue("MpesaReceiptNumber") || ""),
        transactionDate: String(getValue("TransactionDate") || ""),
        phone: String(getValue("PhoneNumber") || ""),
        amount: Number(getValue("Amount") || 0),
      },
    },
  })

  return {
    ResultCode: 0,
    ResultDesc: updatedRecord.count > 0 ? "Success" : "Accepted",
    checkoutRequestId: stkCallback.CheckoutRequestID,
    success: stkCallback.ResultCode === 0,
  }
}

export async function getStkRequestStatus(input: { merchantRequestID?: string; checkoutRequestID?: string }) {
  const record = await prisma.mpesaPaymentRequest.findFirst({
    where: {
      OR: [
        input.merchantRequestID ? { merchantRequestId: input.merchantRequestID } : undefined,
        input.checkoutRequestID ? { checkoutRequestId: input.checkoutRequestID } : undefined,
      ].filter(Boolean) as Array<{ merchantRequestId?: string; checkoutRequestId?: string }>,
    },
  })

  if (!record) {
    return {
      success: false,
      status: 0,
      message: "Transaction not found",
      merchantRequestID: input.merchantRequestID || "",
      checkoutRequestID: input.checkoutRequestID || "",
      mpesa_receipt: "",
    }
  }

  const payload = (record.responsePayload ?? {}) as Record<string, unknown>
  const callback = (payload.callback ?? payload) as Record<string, unknown>

  return {
    success: record.status !== "FAILED",
    status: mapStatusToCode(record.status),
    message:
      String(payload.customerMessage || payload.resultDesc || payload.responseDescription || (record.status === "SUCCESS" ? "Payment successful" : "Payment pending")),
    merchantRequestID: record.merchantRequestId || "",
    checkoutRequestID: record.checkoutRequestId || "",
    mpesa_receipt: String(payload.mpesaReceipt || callback.mpesaReceipt || ""),
    amount: Number(record.amount),
    phone: record.phone,
    updatedAt: record.updatedAt.toISOString(),
  }
}
