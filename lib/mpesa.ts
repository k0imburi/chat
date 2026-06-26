import "server-only"

import { Buffer } from "node:buffer"
import { MpesaRequestStatus } from "@prisma/client"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { markAttemptFailed, paymentPayloadHash } from "@/lib/payment-attempts"
import { validateSuccessfulStkPayment } from "@/lib/mpesa-validation"

export type MpesaConfig = {
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  shortcodeType: string
  storeNumber: string
  environment: string
}

export function isMpesaConfigComplete(config: MpesaConfig) {
  return Boolean(config.consumerKey && config.consumerSecret && config.shortcode && config.passkey)
}

type StkRequestInput = {
  phone: string
  amount: number
  reference?: string
  description?: string
  userId?: string
  paymentAttemptId?: string
}

type SafaricomStkResponse = {
  MerchantRequestID?: string
  CheckoutRequestID?: string
  ResponseCode?: string
  ResponseDescription?: string
  CustomerMessage?: string
}

const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().min(1).max(200),
      CheckoutRequestID: z.string().min(1).max(200),
      ResultCode: z.number().int(),
      ResultDesc: z.string().max(1000).default(""),
      CallbackMetadata: z.object({
        Item: z.array(z.object({ Name: z.string().max(100), Value: z.union([z.string(), z.number()]).optional() })).max(20),
      }).optional(),
    }),
  }),
})

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

export async function resolveMpesaConfig(): Promise<MpesaConfig> {
  if (env.MPESA_CONFIG_SOURCE === "env") {
    return {
      consumerKey: env.MPESA_CONSUMER_KEY || "",
      consumerSecret: env.MPESA_CONSUMER_SECRET || "",
      shortcode: env.MPESA_SHORTCODE || "",
      passkey: env.MPESA_PASSKEY || "",
      shortcodeType: env.MPESA_SHORTCODE_TYPE,
      storeNumber: env.MPESA_STORE_NUMBER || "",
      environment: env.MPESA_ENVIRONMENT,
    }
  }
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
  const config = await resolveMpesaConfig()
  if (!isMpesaConfigComplete(config)) {
    throw new Error("M-PESA settings are incomplete")
  }

  const token = await fetchMpesaAccessToken(config)
  const { password, timestamp } = stkPassword(config.shortcode, config.passkey)
  const appUrl = env.APP_URL?.replace(/\/$/, "")
  if (!appUrl) {
    throw new Error("APP_URL is required for M-PESA callbacks")
  }

  const normalizedPhone = normalizePhone(input.phone)
  if (input.paymentAttemptId) {
    await prisma.paymentAttempt.update({
      where: { id: input.paymentAttemptId },
      data: { status: "SUBMITTING" },
    })
  }
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

  if (input.paymentAttemptId) {
    await prisma.paymentAttempt.update({
      where: { id: input.paymentAttemptId },
      data: {
        status: success ? "PENDING" : "FAILED",
        merchantRequestId: data.MerchantRequestID || null,
        checkoutRequestId: data.CheckoutRequestID || null,
        failureReason: success ? null : data.ResponseDescription || "STK request rejected",
      },
    })
  }

  const record = await prisma.mpesaPaymentRequest.create({
    data: {
      userId: input.userId,
      phone: normalizedPhone,
      amount: input.amount,
      merchantRequestId: data.MerchantRequestID || null,
      checkoutRequestId: data.CheckoutRequestID || null,
      status: success ? "PENDING" : "FAILED",
      responsePayload: {
        request: {
          businessShortCode: config.shortcode,
          transactionType: payload.TransactionType,
          amount: payload.Amount,
          phone: `${normalizedPhone.slice(0, 5)}***${normalizedPhone.slice(-2)}`,
          callbackUrl,
          accountReference,
          transactionDesc,
        },
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

export async function queryStkPush(checkoutRequestId: string) {
  const config = await resolveMpesaConfig()
  if (!config.consumerKey || !config.consumerSecret || !config.shortcode || !config.passkey) throw new Error("M-PESA settings are incomplete")
  const token = await fetchMpesaAccessToken(config)
  const { password, timestamp } = stkPassword(config.shortcode, config.passkey)
  const response = await fetch(`${baseUrl(config.environment)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: config.shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
    cache: "no-store",
  })
  const data = await response.json() as { ResponseCode?: string; ResultCode?: string | number; ResultDesc?: string; errorMessage?: string }
  return {
    confirmed: response.ok && String(data.ResponseCode || "") === "0" && Number(data.ResultCode) === 0,
    definitive: data.ResultCode != null && Number.isFinite(Number(data.ResultCode)),
    resultCode: data.ResultCode == null ? null : Number(data.ResultCode),
    description: data.ResultDesc || data.errorMessage || "Unable to verify STK result",
  }
}

export async function handleStkCallback(body: unknown, rawBody: string) {
  const payload = stkCallbackSchema.parse(body)
  const stkCallback = payload.Body.stkCallback

  const metadataItems = stkCallback.CallbackMetadata?.Item ?? []
  const getValue = (name: string) => metadataItems.find((item) => item.Name === name)?.Value

  const attempt = await prisma.paymentAttempt.findFirst({
    where: {
      provider: "MPESA",
      checkoutRequestId: stkCallback.CheckoutRequestID,
      merchantRequestId: stkCallback.MerchantRequestID,
    },
  })
  const amount = Number(getValue("Amount") || 0)
  const phone = normalizePhone(String(getValue("PhoneNumber") || ""))
  const receipt = String(getValue("MpesaReceiptNumber") || "").trim()
  const eventKey = `mpesa:${stkCallback.CheckoutRequestID}:${stkCallback.ResultCode}:${receipt || "none"}`
  await prisma.paymentWebhookEvent.upsert({
    where: { eventKey },
    create: {
      attemptId: attempt?.id || null, provider: "MPESA", eventKey,
      payloadHash: paymentPayloadHash(rawBody), resultCode: stkCallback.ResultCode,
      metadata: {
        merchantRequestId: stkCallback.MerchantRequestID,
        checkoutRequestId: stkCallback.CheckoutRequestID,
        amount,
        phone: phone ? `${phone.slice(0, 5)}***${phone.slice(-2)}` : "",
        receipt: receipt ? `${receipt.slice(0, 3)}***${receipt.slice(-3)}` : "",
      },
    },
    update: {},
  })

  const updatedRecord = await prisma.mpesaPaymentRequest.updateMany({
    where: { checkoutRequestId: stkCallback.CheckoutRequestID },
    data: {
      status: stkCallback.ResultCode === 0 ? "PENDING" : stkCallback.ResultCode === 1032 ? "CANCELLED" : "FAILED",
      responsePayload: {
        merchantRequestID: stkCallback.MerchantRequestID || "",
        checkoutRequestID: stkCallback.CheckoutRequestID,
        resultCode: stkCallback.ResultCode ?? null,
        resultDesc: stkCallback.ResultDesc || "",
        mpesaReceipt: String(getValue("MpesaReceiptNumber") || ""),
        transactionDate: String(getValue("TransactionDate") || ""),
        phone: phone ? `${phone.slice(0, 5)}***${phone.slice(-2)}` : "",
        amount,
      },
    },
  })

  if (!attempt) {
    return { ResultCode: 0, ResultDesc: "Accepted for review", checkoutRequestId: stkCallback.CheckoutRequestID, success: false, verified: false }
  }
  if (attempt.status === "SUCCEEDED") {
    return { ResultCode: 0, ResultDesc: "Already processed", checkoutRequestId: stkCallback.CheckoutRequestID, success: true, verified: true, attemptId: attempt.id, purpose: attempt.purpose }
  }
  if (stkCallback.ResultCode !== 0) {
    await markAttemptFailed(attempt.id, stkCallback.ResultDesc || "M-PESA payment failed", stkCallback.ResultCode)
    return { ResultCode: 0, ResultDesc: "Accepted", checkoutRequestId: stkCallback.CheckoutRequestID, success: false, verified: false, attemptId: attempt.id, purpose: attempt.purpose }
  }
  const mismatch = validateSuccessfulStkPayment(
    { amount: Number(attempt.amount), phone: attempt.expectedPhone },
    { amount, phone, receipt },
  )
  if (mismatch) {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: {
      status: "REQUIRES_REVIEW", resultCode: stkCallback.ResultCode,
      callbackReceivedAt: new Date(), failureReason: mismatch,
    } })
    return { ResultCode: 0, ResultDesc: "Accepted for review", checkoutRequestId: stkCallback.CheckoutRequestID, success: false, verified: false, attemptId: attempt.id, purpose: attempt.purpose }
  }

  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: {
    status: "VERIFYING", resultCode: 0, providerReceipt: receipt, callbackReceivedAt: new Date(),
  } })
  let verification: Awaited<ReturnType<typeof queryStkPush>>
  try {
    verification = await queryStkPush(stkCallback.CheckoutRequestID)
  } catch {
    return { ResultCode: 0, ResultDesc: "Accepted for verification", checkoutRequestId: stkCallback.CheckoutRequestID, success: true, verified: false, attemptId: attempt.id, purpose: attempt.purpose }
  }
  if (!verification.confirmed) {
    if (!verification.definitive) {
      return { ResultCode: 0, ResultDesc: "Accepted for verification", checkoutRequestId: stkCallback.CheckoutRequestID, success: true, verified: false, attemptId: attempt.id, purpose: attempt.purpose }
    }
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: {
      status: "REQUIRES_REVIEW", failureReason: verification.description,
    } })
    return { ResultCode: 0, ResultDesc: "Accepted for review", checkoutRequestId: stkCallback.CheckoutRequestID, success: true, verified: false, attemptId: attempt.id, purpose: attempt.purpose }
  }
  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { verifiedAt: new Date(), failureReason: null } })
  await prisma.paymentWebhookEvent.update({ where: { eventKey }, data: { status: "VERIFIED", processedAt: new Date() } })

  return {
    ResultCode: 0,
    ResultDesc: updatedRecord.count > 0 ? "Success" : "Accepted",
    checkoutRequestId: stkCallback.CheckoutRequestID,
    success: true,
    verified: true,
    attemptId: attempt.id,
    purpose: attempt.purpose,
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
