import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { CalendarClock, PhoneCall, Video } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { bookingAction } from "@/lib/mobile-bookings"
import { getCurrentCustomerUser, getCustomerBookings } from "@/lib/customer-web"

export default async function SessionsPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/sessions" signedIn={false}><SignInRequired title="Sign in to manage sessions" /></CustomerShell>
  const bookings = await getCustomerBookings(user.userId)

  const upcoming = bookings.filter((booking) => ["PROPOSED", "APPROVED", "LIVE", "UNDER_REVIEW"].includes(booking.status))
  const history = bookings.filter((booking) => !["PROPOSED", "APPROVED", "LIVE", "UNDER_REVIEW"].includes(booking.status))

  return (
    <CustomerShell active="/sessions" signedIn>
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">Sessions</p>
          <h1 className="mt-2 text-3xl font-black">Voice & video bookings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Review proposals, join approved rooms, manage cancellations and set your creator availability.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/availability" className="rounded-full bg-[#25d366] px-5 py-3 text-sm font-black text-white">Set availability</Link>
            <Link href="/wallet" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black text-white">Check session credits</Link>
          </div>
        </section>

        <BookingList title="Active sessions" userId={user.userId} bookings={upcoming} empty="No active session proposals yet." />
        <BookingList title="History" userId={user.userId} bookings={history} empty="Completed, cancelled and expired sessions will appear here." />
      </div>
    </CustomerShell>
  )
}

function BookingList({ title, empty, bookings, userId }: { title: string; empty: string; userId: string; bookings: Awaited<ReturnType<typeof getCustomerBookings>> }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
      <div className="border-b border-black/5 p-5"><h2 className="text-xl font-black">{title}</h2></div>
      <div className="divide-y divide-black/5">
        {bookings.map((booking) => <BookingCard key={booking.id} booking={booking} userId={userId} />)}
        {!bookings.length ? <p className="p-8 text-center text-sm text-neutral-500">{empty}</p> : null}
      </div>
    </section>
  )
}

function BookingCard({ booking, userId }: { booking: Awaited<ReturnType<typeof getCustomerBookings>>[number]; userId: string }) {
  const isCreator = booking.creatorId === userId
  const other = isCreator ? booking.customer : booking.creator
  const Icon = booking.type === "VOICE" ? PhoneCall : Video
  return (
    <article className="p-4">
      <div className="flex gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full bg-neutral-100">
          {other.avatarUrl ? <Image src={other.avatarUrl} alt="" fill sizes="48px" className="object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">{other.fullName || "ChatAndTip user"}</p>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black">{booking.status.replaceAll("_", " ")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800"><Icon className="h-3 w-3" />{booking.type}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">{booking.scheduledStart.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
          {booking.endReason ? <p className="mt-2 text-xs text-neutral-500">{booking.endReason}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {booking.status === "APPROVED" || booking.status === "LIVE" ? <Link href={`/sessions/${booking.id}`} className="rounded-full bg-neutral-950 px-4 py-2 text-sm font-black text-white">Open room</Link> : null}
        {isCreator && booking.status === "PROPOSED" ? <ActionButton id={booking.id} action="approve" label="Approve" /> : null}
        {isCreator && booking.status === "PROPOSED" ? <ActionButton id={booking.id} action="decline" label="Decline" variant="outline" /> : null}
        {["PROPOSED", "APPROVED"].includes(booking.status) ? <ActionWithReason id={booking.id} action="cancel" label="Cancel" /> : null}
        {["APPROVED", "LIVE"].includes(booking.status) ? <ActionWithReason id={booking.id} action="end" label="End session" /> : null}
      </div>
    </article>
  )
}

function ActionButton({ id, action, label, variant = "default" }: { id: string; action: string; label: string; variant?: "default" | "outline" }) {
  return (
    <form action={updateBooking}>
      <input type="hidden" name="bookingId" value={id} />
      <input type="hidden" name="action" value={action} />
      <Button type="submit" size="sm" variant={variant}>{label}</Button>
    </form>
  )
}

function ActionWithReason({ id, action, label }: { id: string; action: string; label: string }) {
  return (
    <form action={updateBooking} className="flex min-w-64 flex-1 gap-2 sm:flex-initial">
      <input type="hidden" name="bookingId" value={id} />
      <input type="hidden" name="action" value={action} />
      <Textarea name="reason" placeholder={`${label} reason`} className="min-h-9 flex-1 rounded-2xl" />
      <Button type="submit" size="sm" variant="outline">{label}</Button>
    </form>
  )
}

async function updateBooking(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  await bookingAction(
    viewer.userId,
    String(formData.get("bookingId") || ""),
    String(formData.get("action") || ""),
    formData.get("reason") ? String(formData.get("reason")) : undefined,
  )
  revalidatePath("/sessions")
}
