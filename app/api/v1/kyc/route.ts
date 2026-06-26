import { NextResponse } from "next/server"
import { z } from "zod"
import { getCustomerSession } from "@/lib/customer-auth"
import { logError } from "@/lib/log-error"
import { submitKyc } from "@/lib/mobile-finance"

const schema = z.object({
  idFrontObjectKey: z.string().min(1),
  idBackObjectKey: z.string().min(1),
  selfieObjectKey: z.string().min(1),
})

function isPrivateKycObject(userId: string, key: string) {
  return key.startsWith(`private/${userId}/kyc/`)
}

export async function POST(request: Request) {
  const session = await getCustomerSession()
  if (!session?.userId) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const body = schema.parse(await request.json())
    const keys = [body.idFrontObjectKey, body.idBackObjectKey, body.selfieObjectKey]
    if (!keys.every((key) => isPrivateKycObject(session.userId, key))) {
      return NextResponse.json({ success: false, message: "KYC files must be private uploads from your account" }, { status: 403 })
    }

    const kyc = await submitKyc(session.userId, body)
    return NextResponse.json({ success: true, data: { status: kyc.status } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/v1/kyc", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to submit KYC" },
      { status: 400 },
    )
  }
}
