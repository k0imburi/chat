import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string
  effectiveDate?: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold">
            <Image src="/chatandtip-logo.jpg" alt="" width={54} height={34} className="h-9 w-14 object-contain" priority />
            <span>ChatAndTip</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-bold text-black/60 dark:text-white/60">
            <Link href="/about" className="hover:text-black dark:hover:text-white">About</Link>
            <Link href="/terms" className="hover:text-black dark:hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-black dark:hover:text-white">Privacy</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-black">{title}</h1>
        {effectiveDate ? (
          <p className="mt-2 text-sm font-semibold text-black/50 dark:text-white/50">Effective date: {effectiveDate}</p>
        ) : null}
        <div className="legal-body mt-8 space-y-6">{children}</div>
      </article>

      <footer className="border-t border-black/10 py-8 text-center text-xs text-black/40 dark:border-white/10 dark:text-white/40">
        <p>© {new Date().getUTCFullYear()} ChatAndTip. All rights reserved.</p>
        <p className="mt-2 space-x-4">
          <Link href="/about" className="hover:text-black dark:hover:text-white">About</Link>
          <Link href="/terms" className="hover:text-black dark:hover:text-white">Terms</Link>
          <Link href="/privacy" className="hover:text-black dark:hover:text-white">Privacy</Link>
          <Link href="/contact" className="hover:text-black dark:hover:text-white">Contact</Link>
        </p>
      </footer>
    </main>
  )
}

export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-black">{children}</h2>
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-black/70 dark:text-white/70">{children}</p>
}

export function LegalUl({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-black/70 dark:text-white/70">{children}</ul>
}
