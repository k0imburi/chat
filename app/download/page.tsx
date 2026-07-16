import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Image from "next/image"

// Branded app-invite landing. Shared invite links point here
// (chatandtip.com/download) rather than a raw store URL, so the underlying
// store package name is never exposed in the link users see. Android devices
// are bounced straight to the Play Store; everyone else gets a clean landing.
const PLAY_STORE_URL =
  process.env.ANDROID_STORE_URL ||
  "https://play.google.com/store/apps/details?id=com.goldtech.dating"
const APP_STORE_URL = process.env.IOS_STORE_URL || ""

export const metadata = {
  title: "Get ChatAndTip",
  description: "Download ChatAndTip — connect with creators, chat, and tip.",
}

export default async function DownloadPage() {
  const ua = (await headers()).get("user-agent") || ""
  const isAndroid = /android/i.test(ua)
  const isIOS = /iphone|ipad|ipod/i.test(ua)

  // Send mobile users straight to their store when we have a link for it.
  if (isAndroid) redirect(PLAY_STORE_URL)
  if (isIOS && APP_STORE_URL) redirect(APP_STORE_URL)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
      <Image
        src="/chatandtip-logo-v2.png"
        alt="ChatAndTip"
        width={96}
        height={96}
        className="mb-6 rounded-2xl"
        priority
      />
      <h1 className="text-2xl font-black">Get ChatAndTip</h1>
      <p className="mt-2 max-w-sm text-sm text-white/60">
        Connect with creators, chat, and tip — right from your phone.
      </p>
      <a
        href={PLAY_STORE_URL}
        className="mt-6 rounded-full bg-[#25d366] px-6 py-3 text-sm font-black text-white"
      >
        Get it on Google Play
      </a>
      {APP_STORE_URL ? (
        <a
          href={APP_STORE_URL}
          className="mt-3 rounded-full border border-white/20 px-6 py-3 text-sm font-black text-white"
        >
          Download on the App Store
        </a>
      ) : null}
    </main>
  )
}
