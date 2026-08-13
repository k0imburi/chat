"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

// `variant="onDark"` is for chrome that sits over the immersive video feed
// (FeedShell) — that surface is hardcoded dark regardless of the site theme,
// so the button itself must stay styled for a dark background rather than
// switching with `dark:` classes like it does everywhere else.
export function ModeToggle({ variant = "adaptive" }: { variant?: "adaptive" | "onDark" }) {
  const { resolvedTheme, setTheme } = useTheme()
  // Avoid a hydration mismatch — next-themes only knows the real theme after
  // mount, so the icon renders blank until then rather than guessing wrong.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle light and dark mode"
      className={
        variant === "onDark"
          ? "flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
          : "flex h-9 w-9 items-center justify-center rounded-full border border-black/20 text-black/80 hover:bg-black/5 dark:border-white/20 dark:text-white/80 dark:hover:bg-white/5"
      }
    >
      {mounted ? isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" /> : null}
    </button>
  )
}
