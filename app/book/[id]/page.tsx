import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BookingType } from "@prisma/client"
import { PhoneCall, Video } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { proposeBooking } from "@/lib/mobile-bookings"
import { getCurrentCustomerUser, getCustomerBookingSlots, getCustomerProfile } from "@/lib/customer-web"

export default async function BookCreatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return <CustomerShell active="/sessions" signedIn={false}><SignInRequired title="Sign in to propose a session" /></CustomerShell>
  const [{ id }, query] = await Promise.all([params, searchParams])
  const type = String(query.type || "VOICE").toUpperCase() === "VIDEO" ? BookingType.VIDEO : BookingType.VOICE
  const [creator, slots] = await Promise.all([getCustomerProfile(id), getCustomerBookingSlots(id, type)])
  if (!creator) return notFound()
  const Icon = type === BookingType.VOICE ? PhoneCall : Video

  return (
    <CustomerShell active="/sessions" signedIn>
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="bg-neutral-950 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 overflow-hidden rounded-full bg-white/10">
              {creator.profileAvatarUrl ? <Image src={creator.profileAvatarUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Propose a session</p>
              <h1 className="truncate text-3xl font-black">{creator.fullname || "Creator"}</h1>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/book/${id}?type=VOICE`} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${type === BookingType.VOICE ? "bg-blue-500 text-white" : "border border-white/15 text-white"}`}><PhoneCall className="h-4 w-4" /> Voice</Link>
            <Link href={`/book/${id}?type=VIDEO`} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${type === BookingType.VIDEO ? "bg-purple-500 text-white" : "border border-white/15 text-white"}`}><Video className="h-4 w-4" /> Video</Link>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-neutral-500"><Icon className="h-4 w-4" /> One {type.toLowerCase()} credit reserves one 15-minute booking.</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => (
              <form key={slot.start} action={proposeSession} className="rounded-3xl bg-neutral-50 p-4">
                <input type="hidden" name="creatorId" value={id} />
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="start" value={slot.start} />
                <input type="hidden" name="timezone" value={slot.timezone} />
                <p className="font-black">{new Date(slot.start).toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric", timeZone: "Africa/Nairobi" })}</p>
                <p className="mt-1 text-sm text-neutral-500">{new Date(slot.start).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} · EAT</p>
                <Button type="submit" className="mt-4 w-full rounded-full">Propose this time</Button>
              </form>
            ))}
          </div>
          {!slots.length ? <p className="rounded-3xl bg-neutral-50 p-8 text-center text-sm text-neutral-500">No {type.toLowerCase()} slots are available right now.</p> : null}
        </div>
      </section>
    </CustomerShell>
  )
}

async function proposeSession(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const creatorId = String(formData.get("creatorId") || "")
  const type = String(formData.get("type") || "VOICE").toUpperCase() as BookingType
  await proposeBooking(viewer.userId, {
    creatorId,
    type,
    start: String(formData.get("start") || ""),
    timezone: String(formData.get("timezone") || "Africa/Nairobi"),
  })
  revalidatePath("/sessions")
}
