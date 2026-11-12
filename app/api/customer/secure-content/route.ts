import { NextResponse } from "next/server"
import { z } from "zod"
import { getCustomerSession } from "@/lib/customer-auth"
import { listHiddenChats } from "@/lib/mobile-chat-privacy"
import { listSecureFolderMessages, secureFolderCodeExists } from "@/lib/mobile-chat-privacy"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"

const schema = z.object({ mode: z.enum(["vault", "hidden"]), code: z.string().regex(/^\d{4}$/) })

export async function POST(request: Request) {
  const session = await getCustomerSession()
  if (!session?.userId) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })
  try {
    const input = schema.parse(await request.json())
    if (input.mode === "vault") {
      if (!(await secureFolderCodeExists(session.userId, input.code))) {
        return NextResponse.json({ success: false, message: "Code not recognised" }, { status: 404 })
      }
      return NextResponse.json({ success: true, data: await listSecureFolderMessages(session.userId, input.code) })
    }
    const hidden = await listHiddenChats(session.userId, input.code)
    const data = hidden.flatMap((entry) => {
      const peer = entry.thread.participants.find((participant) => participant.userId !== session.userId)
      if (!peer) return []
      const self = entry.thread.participants.find((participant) => participant.userId === session.userId)
      const last = entry.thread.messages.find((message) => {
        const deleted = Array.isArray(message.deletedForUserIds) ? message.deletedForUserIds as string[] : []
        return message.type !== "SYSTEM" && !deleted.includes(session.userId) && (!self?.clearedAt || message.sentAt > self.clearedAt)
      })
      return [{ chatUserId: peer.userId, lastMsg: last?.text || (last?.type === "DOCUMENT" ? "Document" : "Media message"), sentAt: (last?.sentAt || entry.hiddenAt).toISOString(), receiver: serializeMobileUser(peer.user), hiddenCodeGroupId: entry.codeGroupId, hideForAll: entry.hideForAll }]
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to open protected content" }, { status: 400 })
  }
}
