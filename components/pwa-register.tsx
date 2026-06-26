"use client"

import { useEffect } from "react"

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation failure must never prevent normal web use.
    })
  }, [])

  return null
}
