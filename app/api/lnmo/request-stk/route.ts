import { NextResponse } from "next/server"
import { z } from "zod"
import { initiateStkPush } from "@/lib/mpesa"

const schema = z.object({
  phone: z.string().min(6),
  amount: z.coerce.number().positive(),
  reference: z.string().min(1).optional(),
  description: z.string().optional(),
  userId: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const result = await initiateStkPush({
      phone: parsed.phone,
      amount: parsed.amount,
      reference: parsed.reference,
      description: parsed.description,
      userId: parsed.userId,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to queue STK request" },
      { status: 500 },
    )
  }
}
