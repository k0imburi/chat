import Image from "next/image"
import Link from "next/link"

// Web account creation is disabled — users register in the ChatAndTip app.
// This page is kept as a friendly notice; restore the form from git history
// to re-enable web signup.
export default function SignupPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-950">
      <section className="mx-auto max-w-md rounded-[2rem] border border-black/5 bg-white p-6 text-center shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Image src="/chatandtip-logo.jpg" alt="ChatAndTip" width={54} height={34} className="h-9 w-14 object-contain" />
          <b className="text-lg">ChatAndTip</b>
        </div>
        <h1 className="text-2xl font-black">Create your account in the app</h1>
        <p className="mt-3 text-sm text-neutral-500">
          New accounts are created in the ChatAndTip mobile app. Once you have an account,
          sign in here to manage payments, credits, and sessions.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-2xl bg-[#25d366] px-6 py-3 font-black text-white"
        >
          Sign in
        </Link>
      </section>
    </main>
  )
}
