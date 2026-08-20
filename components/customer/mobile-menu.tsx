"use client"

import Link from "next/link"
import { useState } from "react"
import { FileText, Info, LifeBuoy, Menu, ShieldCheck, X } from "lucide-react"

const items = [
  { href: "/contact", label: "Contact Us", icon: LifeBuoy },
  { href: "/about", label: "About", icon: Info },
  { href: "/terms", label: "Terms", icon: FileText },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck },
]

// Mobile-only hamburger + slide-out drawer, matching how the TikTok web app
// surfaces Company/Legal links (About, Contact, Terms, Privacy) — the bottom
// tab bar has no room for them, and they weren't reachable at all from the
// video feed itself without first navigating to Account.
export function MobileMenu({ variant = "adaptive" }: { variant?: "adaptive" | "onDark" }) {
  const [open, setOpen] = useState(false)
  const onDark = variant === "onDark"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className={
          onDark
            ? "flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
            : "flex h-9 w-9 items-center justify-center rounded-full border border-black/20 text-black/80 hover:bg-black/5 dark:border-white/20 dark:text-white/80 dark:hover:bg-white/5"
        }
      >
        <Menu className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div
            className={
              onDark
                ? "absolute inset-y-0 left-0 w-72 max-w-[80vw] overflow-y-auto bg-black p-5 text-white"
                : "absolute inset-y-0 left-0 w-72 max-w-[80vw] overflow-y-auto bg-white p-5 text-black dark:bg-black dark:text-white"
            }
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className={onDark ? "rounded-full p-1.5 hover:bg-white/10" : "rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-6 space-y-1">
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={
                    onDark
                      ? "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"
                      : "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                  }
                >
                  <Icon className="h-5 w-5" />{label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  )
}
