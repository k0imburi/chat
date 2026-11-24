import Image from "next/image"

const PLAY_STORE_URL = process.env.ANDROID_STORE_URL || "https://play.google.com/store/apps/details?id=com.chatandtip.app"
const APP_STORE_URL = process.env.IOS_STORE_URL || ""

export const metadata = {
  title: "Get ChatAndTip",
  description: "Download ChatAndTip — connect with people from all over the world.",
}

const badge = "flex h-14 w-44 items-center gap-3 rounded-lg border border-white/40 bg-black px-3 text-left text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"

function AppleLogo() {
  return <svg aria-hidden="true" width="28" height="32" viewBox="0 0 16 16" fill="currentColor"><path d="M11.182 1.037c-.453.022-1.006.326-1.335.71-.294.341-.551.879-.451 1.398.494.038 1.006-.278 1.303-.655.316-.392.555-.925.483-1.453M12.66 12.46c-.293.65-.432.94-.81 1.515-.528.8-1.274 1.8-2.199 1.806-.822.009-1.033-.534-2.15-.528-1.116.006-1.348.538-2.17.53-.926-.007-1.633-.909-2.16-1.71C1.69 11.837 1.126 9.21 2.25 7.48c.798-1.228 2.057-1.946 3.24-1.946 1.204 0 1.96.54 2.954.54.964 0 1.551-.542 2.944-.542 1.054 0 2.171.575 2.966 1.57-2.606 1.43-2.183 5.15.307 6.098z"/></svg>
}

export default function DownloadPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center text-black dark:bg-black dark:text-white">
      <Image src="/chatandtip-logo-v2.png" alt="ChatAndTip" width={96} height={96} className="mb-6 rounded-2xl" priority />
      <h1 className="text-2xl font-black">Get ChatAndTip</h1>
      <p className="mt-2 max-w-sm text-sm text-black/60 dark:text-white/60">Connect and interact with people from all over the world.</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {APP_STORE_URL ? (
          <a href={APP_STORE_URL} className={badge} aria-label="Download ChatAndTip on the App Store">
            <AppleLogo /><span><span className="block text-[10px] leading-3">Download on the</span><span className="block text-xl font-semibold leading-6">App Store</span></span>
          </a>
        ) : (
          <span className={`${badge} cursor-not-allowed opacity-60`} aria-label="App Store download coming soon">
            <AppleLogo /><span><span className="block text-[10px] leading-3">Download on the</span><span className="block text-xl font-semibold leading-6">App Store</span></span>
          </span>
        )}
        <a href={PLAY_STORE_URL} className={badge} aria-label="Get ChatAndTip on Google Play">
          <svg aria-hidden="true" width="29" height="32" viewBox="0 0 30 34"><path fill="#32bbff" d="M2 1 19 17 2 33z"/><path fill="#ffcf32" d="m19 17 6-5 4 3c1.3.8 1.3 2.2 0 3l-4 3z"/><path fill="#f44a53" d="M2 33 19 17l6 5z"/><path fill="#35d17a" d="M2 1 19 17l6-5z"/></svg>
          <span><span className="block text-[10px] leading-3">GET IT ON</span><span className="block whitespace-nowrap text-lg font-semibold leading-6">Google Play</span></span>
        </a>
      </div>
      {!APP_STORE_URL && <p className="mt-4 text-sm text-black/60 dark:text-white/60">App Store download coming soon.</p>}
    </main>
  )
}
