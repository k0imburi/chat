import Image from "next/image"
import Link from "next/link"

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7faf8] p-6 text-center text-neutral-950">
      <section className="max-w-sm rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
        <Image src="/chatandtip-logo-v2.png" alt="ChatAndTip" width={64} height={64} className="mx-auto rounded-full" />
        <h1 className="mt-5 text-2xl font-black">You’re offline</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Reconnect to refresh conversations, media, wallet balances, and payments.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-[#25d366] px-5 py-3 text-sm font-extrabold text-white">Try again</Link>
      </section>
    </main>
  )
}
