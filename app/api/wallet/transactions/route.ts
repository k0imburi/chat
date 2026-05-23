import { NextResponse } from "next/server"
import { z } from "zod"
import { createWalletTransaction, getWalletTransactions } from "@/lib/mobile-wallet"

const getSchema = z.object({
  userId: z.string().min(1),
})

const postSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number(),
  type: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  senderName: z.string().min(1),
  receiverName: z.string().min(1),
  transactionId: z.string().min(1),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const transactions = await getWalletTransactions(parsed.data.userId)
  return NextResponse.json({ success: true, data: transactions })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const transaction = await createWalletTransaction(parsed)
    return NextResponse.json({ success: true, data: transaction })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to save transaction" },
      { status: 500 },
    )
  }
}
