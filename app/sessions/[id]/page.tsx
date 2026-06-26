import { revalidatePath } from "next/cache"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PhoneCall, RadioTower, Video } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { joinBooking } from "@/lib/mobile-bookings"
import { getCurrentCustomerUser, getCustomerBooking } from "@/lib/customer-web"

export default async function SessionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return <CustomerShell active="/sessions" signedIn={false}><SignInRequired title="Sign in to join this session" /></CustomerShell>
  const { id } = await params
  const booking = await getCustomerBooking(viewer.userId, id)
  if (!booking) return notFound()
  const other = booking.creatorId === viewer.userId ? booking.customer : booking.creator
  const Icon = booking.type === "VOICE" ? PhoneCall : Video
  const roomOpen = ["APPROVED", "LIVE"].includes(booking.status)

  return (
    <CustomerShell active="/sessions" signedIn>
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="bg-neutral-950 p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">Session room</p>
          <h1 className="mt-2 text-3xl font-black">{booking.type === "VOICE" ? "Voice" : "Video"} session</h1>
          <p className="mt-2 text-sm text-white/60">With {other.fullName || "ChatAndTip user"} · {booking.scheduledStart.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
        </div>

        <div className="p-5">
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] bg-gradient-to-br from-neutral-950 via-neutral-900 to-emerald-950 p-8 text-center text-white">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 shadow-2xl backdrop-blur">
              <Icon className="h-12 w-12" />
            </div>
            <h2 className="mt-6 text-2xl font-black">{roomOpen ? "Ready to join" : "Room is not open"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/60">The browser Agora UI scaffold is ready for SDK mounting. Joining records your presence against this booking-bound channel.</p>
            <div className="mt-6 rounded-2xl bg-white/10 px-4 py-3 font-mono text-xs text-white/70">
              <RadioTower className="mr-2 inline h-4 w-4" /> {booking.channelId}
            </div>
            {roomOpen ? (
              <form action={joinSession} className="mt-6">
                <input type="hidden" name="bookingId" value={booking.id} />
                <Button type="submit" className="rounded-full bg-[#25d366] px-7 text-white hover:bg-[#25d366]/90">Join / refresh presence</Button>
              </form>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Status" value={booking.status.replaceAll("_", " ")} />
            <Info label="Timezone" value={booking.timezone} />
            <Info label="Customer joined" value={booking.customerJoinedAt ? booking.customerJoinedAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "Not yet"} />
            <Info label="Creator joined" value={booking.creatorJoinedAt ? booking.creatorJoinedAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "Not yet"} />
          </div>

          <Link href="/sessions" className="mt-5 inline-flex rounded-full border border-black/10 px-5 py-2 text-sm font-bold">Back to sessions</Link>
        </div>
      </section>
    </CustomerShell>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-neutral-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-1 font-black">{value}</p></div>
}

async function joinSession(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const bookingId = String(formData.get("bookingId") || "")
  await joinBooking(viewer.userId, bookingId)
  revalidatePath(`/sessions/${bookingId}`)
  revalidatePath("/sessions")
}
