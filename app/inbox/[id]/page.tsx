import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Lock } from "lucide-react"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentCustomerUser, getCustomerProfile } from "@/lib/customer-web"
import { getMessages, sendMessage, unlockReply } from "@/lib/mobile-chats"
import { prisma } from "@/lib/prisma"
import { generateR2Key, getR2Client } from "@/lib/r2"

const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024

export default async function InboxThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return <CustomerShell active="/inbox" signedIn={false}><SignInRequired title="Sign in to open chats" /></CustomerShell>

  const { id } = await params
  const other = await getCustomerProfile(id)
  if (!other) return notFound()

  let messages: Awaited<ReturnType<typeof getMessages>> = []
  try {
    messages = await getMessages(viewer.userId, id)
  } catch {
    messages = []
  }
  const newestFirst = messages
  const chronological = [...newestFirst].reverse()
  const broadcastOnly = newestFirst.some((message) => message.type === "system") && other.username === "chatandtip"

  return (
    <CustomerShell active="/inbox" signedIn>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <Link href="/inbox" className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80">Back</Link>
          <div className="relative h-11 w-11 overflow-hidden rounded-full bg-white/10">
            {other.profileAvatarUrl ? <Image src={other.profileAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-black">{other.fullname || "ChatAndTip"}</h1>
            <p className="truncate text-xs text-white/50">{broadcastOnly ? "Broadcast-only thread" : "Conversation"}</p>
          </div>
        </div>

        <div className="min-h-[460px] space-y-3 bg-black/30 p-4">
          {chronological.map((message) => {
            const mine = message.senderId === viewer.userId
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm ${mine ? "bg-[#25d366] text-white" : "bg-white/10 text-white"}`}>
                  {message.locked ? (
                    <LockedMessage messageId={message.id} unlockKind={message.unlockKind} otherUserId={id} />
                  ) : message.imageUrl ? (
                    <img src={message.imageUrl} alt="" className="max-h-80 rounded-2xl object-contain" />
                  ) : (
                    <p className="whitespace-pre-wrap leading-6">{message.textMsg || "Media message"}</p>
                  )}
                  <p className={`mt-2 text-[10px] ${mine ? "text-white/70" : "text-white/40"}`}>{new Date(message.sentAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                </div>
              </div>
            )
          })}
          {!chronological.length ? <p className="py-16 text-center text-sm text-white/50">No messages yet.</p> : null}
        </div>

        {broadcastOnly ? (
          <div className="border-t border-white/10 bg-amber-950/40 p-4 text-sm font-medium text-amber-400">Replies are not available for broadcast messages.</div>
        ) : (
          <form action={sendTextMessage} className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="receiverId" value={id} />
            <div className="space-y-2">
              <Textarea name="text" placeholder="Write a message…" className="min-h-12 resize-none rounded-3xl" />
              <Input name="image" type="file" accept="image/*" className="rounded-2xl" />
              <p className="text-[11px] text-white/30">Images are stored privately and only signed after entitlement checks.</p>
            </div>
            <Button type="submit" className="self-end rounded-full px-6">Send</Button>
          </form>
        )}
      </section>
    </CustomerShell>
  )
}

async function sendTextMessage(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const receiverId = String(formData.get("receiverId") || "")
  const textMsg = String(formData.get("text") || "").trim()
  const image = formData.get("image")
  let imageObjectKey = ""
  if (image instanceof File && image.size > 0) {
    if (!image.type.startsWith("image/")) throw new Error("Only image attachments are supported here")
    if (image.size > MAX_CHAT_ATTACHMENT_BYTES) throw new Error("Image exceeds the 25MB chat limit")
    const { client, settings } = await getR2Client()
    const objectKey = generateR2Key(image.name, `private/${viewer.userId}/chat`)
    const buffer = Buffer.from(new Uint8Array(await image.arrayBuffer()))
    await client.send(new PutObjectCommand({
      Bucket: settings.privateBucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: image.type || "application/octet-stream",
      ContentLength: buffer.length,
      Metadata: { userId: viewer.userId, source: "customer-web-chat" },
    }))
    await prisma.asset.create({
      data: {
        name: image.name,
        objectKey,
        url: null,
        contentType: image.type || "application/octet-stream",
        sizeBytes: buffer.length,
        bucket: settings.privateBucketName,
        visibility: "private",
        metadata: { userId: viewer.userId, source: "customer-web-chat" },
      },
    })
    imageObjectKey = objectKey
  }
  if (!receiverId || (!textMsg && !imageObjectKey)) return
  await sendMessage({ senderId: viewer.userId, receiverId, textMsg, imageObjectKey })
  revalidatePath(`/inbox/${receiverId}`)
}

async function unlockMessage(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const messageId = String(formData.get("messageId") || "")
  const otherUserId = String(formData.get("otherUserId") || "")
  await unlockReply({ userId: viewer.userId, messageId })
  revalidatePath(`/inbox/${otherUserId}`)
}

function LockedMessage({ messageId, unlockKind, otherUserId }: { messageId: string; unlockKind: string; otherUserId: string }) {
  return (
    <div className="min-w-52">
      <div className="mb-3 flex items-center gap-2 font-black"><Lock className="h-4 w-4" /> Locked reply</div>
      <div className="space-y-2">
        <div className="h-3 w-40 rounded-full bg-neutral-200/80" />
        <div className="h-3 w-32 rounded-full bg-neutral-200/70" />
        <div className="h-3 w-44 rounded-full bg-neutral-200/60" />
      </div>
      <form action={unlockMessage} className="mt-4">
        <input type="hidden" name="messageId" value={messageId} />
        <input type="hidden" name="otherUserId" value={otherUserId} />
        <Button size="sm" type="submit" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">Unlock with {unlockKind === "KEY" ? "Key" : "ChatCredit"}</Button>
      </form>
    </div>
  )
}
