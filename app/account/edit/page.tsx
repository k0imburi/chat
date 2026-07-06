import { redirect } from "next/navigation"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { updateMobileUserProfile } from "@/lib/mobile-users"

export default async function EditAccountPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/account" signedIn={false}><SignInRequired title="Sign in to edit your profile" /></CustomerShell>
  return (
    <CustomerShell active="/account" signedIn>
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Account</p>
        <h1 className="mt-2 text-3xl font-black">Edit profile</h1>
        <form action={saveProfile} className="mt-6 space-y-4">
          <input type="hidden" name="userId" value={user.userId} />
          <Field label="Full name" name="fullName" defaultValue={user.fullname || ""} />
          <Field label="Username" name="username" defaultValue={user.username || ""} />
          <Field label="Email" name="email" defaultValue={user.email || ""} type="email" />
          <Field label="Phone" name="phoneNumber" defaultValue={user.phoneNumber || ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" name="city" defaultValue={user.location?.city || ""} />
            <Field label="Country" name="country" defaultValue={user.location?.country || ""} />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">Bio</span>
            <Textarea name="bio" defaultValue={user.bio || ""} className="min-h-32 rounded-3xl" />
          </label>
          <Button type="submit" className="rounded-full px-7">Save profile</Button>
        </form>
      </section>
    </CustomerShell>
  )
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">{label}</span>
      <Input name={name} defaultValue={defaultValue} type={type} className="h-11 rounded-2xl" />
    </label>
  )
}

async function saveProfile(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer || viewer.userId !== String(formData.get("userId") || "")) throw new Error("Sign in required")
  await updateMobileUserProfile(viewer.userId, {
    fullName: String(formData.get("fullName") || ""),
    username: String(formData.get("username") || ""),
    email: String(formData.get("email") || "") || undefined,
    phoneNumber: String(formData.get("phoneNumber") || ""),
    city: String(formData.get("city") || ""),
    country: String(formData.get("country") || ""),
    bio: String(formData.get("bio") || ""),
  })
  redirect("/account")
}
