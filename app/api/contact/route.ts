import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { logError } from "@/lib/log-error"

const schema = z.object({
  fullName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1).max(50),
  message: z.string().trim().min(1).max(5000),
})

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())
    const saved = await prisma.contactMessage.create({ data: input })

    // Best-effort notification — the submission is already durable above, so a
    // disabled/misconfigured SMTP setup doesn't lose the message, just the ping.
    const to = process.env.CONTACT_RECEIVER_EMAIL || "admin@chatandtip.com"
    await sendEmail({
      to,
      subject: `New contact message from ${input.fullName}`,
      text: [
        `Name: ${input.fullName}`,
        `Email: ${input.email}`,
        `Phone: ${input.phone}`,
        `Address: ${input.address}`,
        "",
        input.message,
      ].join("\n"),
    }).catch((error) => logError("/api/contact notify", error))

    return NextResponse.json({ success: true, data: { id: saved.id } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/contact", error)
    return NextResponse.json({ success: false, message: "Could not send your message" }, { status: 500 })
  }
}
