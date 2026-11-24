"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Folder, Sparkles, X } from "lucide-react"
import { VaultIcon } from "@/components/vault-icon"

type FolderRow = { id: string; name: string; parentId: string | null }
export type CopyableChatMedia = {
  type?: string
  imageUrl?: string | null
  videoUrl?: string | null
  documentUrl?: string | null
  documentName?: string | null
  documentMimeType?: string | null
  textMsg?: string | null
  text?: string | null
}

export function VaultCopyDialog({ message, onClose, onSuccess }: { message: CopyableChatMedia; onClose: () => void; onSuccess?: (deleteFromChat: boolean) => void }) {
  const [code, setCode] = useState("")
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [root, setRoot] = useState<string | null>(null)
  const [destination, setDestination] = useState<string | null>(null)
  const [step, setStep] = useState<"code" | "folder" | "subfolder">("code")
  const [deleteFromChat, setDeleteFromChat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const PREFERRED_ORDER = ["images", "videos", "documents", "audio", "other"]
  const roots = useMemo(() => folders.filter(folder => !folder.parentId), [folders])
  const children = useMemo(() => {
    const list = folders.filter(folder => folder.parentId === root)
    return [...list].sort((a, b) => {
      const aName = a.name.toLowerCase().trim()
      const bName = b.name.toLowerCase().trim()
      const aIndex = PREFERRED_ORDER.indexOf(aName)
      const bIndex = PREFERRED_ORDER.indexOf(bName)
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.name.localeCompare(b.name)
    })
  }, [folders, root])
  const url = message.imageUrl || message.videoUrl || message.documentUrl || ""
  const category = (message.documentMimeType || "").startsWith("image/") || String(message.type).toLowerCase() === "image" ? "Images" : (message.documentMimeType || "").startsWith("video/") || String(message.type).toLowerCase() === "video" ? "Videos" : (message.documentMimeType || "").startsWith("audio/") ? "Audio" : "Documents"

  async function unlock() {
    if (!/^\d{4}$/.test(code)) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/mobile/vault/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", code }) })
      const data = await response.json()
      if (!response.ok) throw new Error("No matches found")
      const rows: FolderRow[] = Array.isArray(data.data?.folders) ? data.data.folders : []
      setFolders(rows)
      if (!rows.length) throw new Error("Create a Vault folder before saving a copy")
      setStep("folder")
    } catch (_cause) { setError("No matches found") }
    finally { setBusy(false) }
  }

  function chooseRoot(id: string) {
    setRoot(id)
    setDestination("__AUTO__")
  }

  async function saveCopy() {
    if (!url || !destination) return
    setBusy(true); setError("")
    try {
      const source = await fetch(url)
      if (!source.ok) throw new Error("Could not read the chat media")
      const blob = await source.blob()
      const parsedName = (() => { try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "") } catch { return "" } })()
      const name = message.documentName || parsedName || `chat-media-${Date.now()}`
      const file = new File([blob], name, { type: blob.type || message.documentMimeType || "application/octet-stream" })
      const targetFolderId = (destination === "__AUTO__"
        ? (folders.find(folder => folder.parentId === root && folder.name.toLowerCase() === category.toLowerCase())?.id || root)
        : destination) || ""
      const form = new FormData(); form.set("file", file); form.set("code", code); form.set("folderId", targetFolderId)
      const response = await fetch("/api/customer/vault/upload", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not save a copy to Vault")
      onSuccess?.(deleteFromChat)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save a copy to Vault") }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-5 text-black shadow-2xl dark:bg-[#171c19] dark:text-white">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2"><VaultIcon className="h-5 w-5 text-[#159a49]"/><h2 className="text-lg font-black">Save a copy to Vault</h2></div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X className="h-4 w-4"/></button>
        </header>
        <p className="mt-2 text-sm text-black/55 dark:text-white/55">The original stays in this chat. The copy is saved only inside the Vault opened with your code.</p>
        {step === "code" ? (
          <>
            <label className="mt-5 block text-sm font-bold" htmlFor="vault-copy-code">Vault code</label>
            <input id="vault-copy-code" autoFocus inputMode="numeric" maxLength={4} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl bg-black/5 px-4 text-center text-xl font-black tracking-[.6em] outline-none focus:ring-2 focus:ring-[#25d366]/50 dark:bg-white/10" placeholder="••••"/>
            <button onClick={() => void unlock()} disabled={code.length !== 4 || busy} className="mt-4 h-11 w-full rounded-xl bg-[#25d366] text-sm font-extrabold text-white disabled:opacity-50">{busy ? "Opening Vault…" : "Continue"}</button>
          </>
        ) : (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-black/45 dark:text-white/45">{step === "folder" ? "Choose a folder" : "Choose a subfolder"}</p>
            <div className="mt-2 max-h-[42vh] space-y-1 overflow-y-auto">
              {step === "folder" ? roots.map(folder => (
                <label key={folder.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                  <input type="radio" name="vault-copy-folder" checked={root === folder.id} onChange={() => chooseRoot(folder.id)}/><Folder className="h-4 w-4 text-[#159a49]"/><span className="text-sm font-semibold">{folder.name}</span>
                </label>
              )) : (
                <>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                    <input type="radio" name="vault-copy-subfolder" checked={destination === "__AUTO__"} onChange={() => setDestination("__AUTO__")}/>
                    <Sparkles className="h-4 w-4 text-[#159a49]"/>
                    <div>
                      <span className="block text-sm font-semibold">Auto select ({category})</span>
                      <span className="text-xs text-black/45 dark:text-white/45">Sorts automatically based on file extension</span>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                    <input type="radio" name="vault-copy-subfolder" checked={destination === root} onChange={() => setDestination(root)}/><Folder className="h-4 w-4 text-[#159a49]"/><span className="text-sm font-semibold">Save in {folders.find(folder => folder.id === root)?.name}</span>
                  </label>
                  {children.map(folder => (
                    <label key={folder.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                      <input type="radio" name="vault-copy-subfolder" checked={destination === folder.id} onChange={() => setDestination(folder.id)}/><Folder className="h-4 w-4 text-[#159a49]"/><span className="text-sm font-semibold">{folder.name}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
            {step === "subfolder" ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-black/[.02] p-2.5 text-xs font-semibold text-black/75 dark:border-white/10 dark:bg-white/[.04] dark:text-white/80">
                <input type="checkbox" checked={deleteFromChat} onChange={e => setDeleteFromChat(e.target.checked)} className="h-4 w-4 accent-[#25d366]"/>
                <span>Delete original from this chat (move to Vault)</span>
              </label>
            ) : null}
            <div className="mt-4 flex gap-2">
              {step === "subfolder" ? <button onClick={() => setStep("folder")} className="grid h-11 w-11 place-items-center rounded-xl bg-black/5 dark:bg-white/10" aria-label="Back to folders"><ChevronLeft className="h-4 w-4"/></button> : null}
              <button onClick={onClose} className="h-11 flex-1 rounded-xl bg-black/5 text-sm font-bold dark:bg-white/10">Cancel</button>
              {step === "folder" ? <button onClick={() => setStep("subfolder")} disabled={!root} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-[#25d366] text-sm font-extrabold text-white disabled:opacity-40">Choose subfolder <ChevronRight className="h-4 w-4"/></button> : <button onClick={() => void saveCopy()} disabled={!destination || busy} className="h-11 flex-1 rounded-xl bg-[#25d366] text-sm font-extrabold text-white disabled:opacity-50">{busy ? (deleteFromChat ? "Moving…" : "Saving copy…") : (deleteFromChat ? "Move and delete" : "Save copy here")}</button>}
            </div>
          </>
        )}
        {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      </section>
    </div>
  )
}
