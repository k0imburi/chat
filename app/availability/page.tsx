import { revalidatePath } from "next/cache"
import Link from "next/link"
import { Clock, PhoneCall, Video } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { replaceAvailability } from "@/lib/mobile-bookings"
import { getCurrentCustomerUser, getCustomerAvailability } from "@/lib/customer-web"

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function AvailabilityPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/sessions" signedIn={false}><SignInRequired title="Sign in to manage availability" /></CustomerShell>
  const windows = await getCustomerAvailability(user.userId)
  const byDay = new Map(windows.map((window) => [window.weekday, window]))

  return (
    <CustomerShell active="/sessions" signedIn>
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="bg-neutral-950 p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">Availability</p>
          <h1 className="mt-2 text-3xl font-black">Set your weekly session hours</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">People can only propose Voice or Video sessions inside these windows. The system keeps a 10-minute buffer and one 15-minute credit covers one booking.</p>
        </div>

        <form action={saveAvailability} className="space-y-4 p-5">
          <input type="hidden" name="userId" value={user.userId} />
          <div className="grid gap-3">
            {days.map((label, weekday) => {
              const current = byDay.get(weekday)
              return (
                <div key={label} className="rounded-3xl bg-neutral-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-3 font-black">
                      <input name={`active-${weekday}`} type="checkbox" defaultChecked={Boolean(current)} className="h-5 w-5 accent-emerald-500" />
                      {label}
                    </label>
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-500"><Clock className="h-4 w-4" /> 15 min sessions · 10 min buffer</div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Start" name={`start-${weekday}`} defaultValue={minuteToTime(current?.startMinute ?? 540)} type="time" />
                    <Field label="End" name={`end-${weekday}`} defaultValue={minuteToTime(current?.endMinute ?? 1020)} type="time" />
                    <Field label="Max/day" name={`max-${weekday}`} defaultValue={String(current?.maxSessionsDay ?? 1)} type="number" min="1" max="20" />
                    <label className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold"><input name={`voice-${weekday}`} type="checkbox" defaultChecked={current?.voiceEnabled ?? true} className="accent-blue-500" /><PhoneCall className="h-4 w-4 text-blue-600" /> Voice</label>
                    <label className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold"><input name={`video-${weekday}`} type="checkbox" defaultChecked={current?.videoEnabled ?? true} className="accent-purple-500" /><Video className="h-4 w-4 text-purple-600" /> Video</label>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-5">
            <Button type="submit" className="rounded-full px-6">Save availability</Button>
            <Link href="/sessions" className="rounded-full border border-black/10 px-5 py-2 text-sm font-bold">Back to sessions</Link>
          </div>
        </form>
      </section>
    </CustomerShell>
  )
}

function Field({ label, name, defaultValue, ...props }: { label: string; name: string; defaultValue: string; type: string; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</span>
      <Input name={name} defaultValue={defaultValue} {...props} className="h-11 rounded-2xl bg-white" />
    </label>
  )
}

async function saveAvailability(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer || viewer.userId !== String(formData.get("userId") || "")) throw new Error("Sign in required")
  const windows = days.flatMap((_, weekday) => {
    if (formData.get(`active-${weekday}`) !== "on") return []
    return [{
      weekday,
      startMinute: timeToMinute(String(formData.get(`start-${weekday}`) || "09:00")),
      endMinute: timeToMinute(String(formData.get(`end-${weekday}`) || "17:00")),
      timezone: "Africa/Nairobi",
      voiceEnabled: formData.get(`voice-${weekday}`) === "on",
      videoEnabled: formData.get(`video-${weekday}`) === "on",
      maxSessionsDay: Number(formData.get(`max-${weekday}`) || 1),
    }]
  })
  await replaceAvailability(viewer.userId, windows)
  revalidatePath("/availability")
}

function minuteToTime(value: number) {
  const h = Math.floor(value / 60).toString().padStart(2, "0")
  const m = (value % 60).toString().padStart(2, "0")
  return `${h}:${m}`
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part))
  return (Number.isFinite(hour) ? hour : 9) * 60 + (Number.isFinite(minute) ? minute : 0)
}
