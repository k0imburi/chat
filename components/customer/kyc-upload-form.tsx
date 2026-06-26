"use client"

import { ChangeEvent, useMemo, useState } from "react"

type UploadSlot = "idFrontObjectKey" | "idBackObjectKey" | "selfieObjectKey"

type SlotConfig = {
  key: UploadSlot
  label: string
  hint: string
  accept: string
}

const slots: SlotConfig[] = [
  { key: "idFrontObjectKey", label: "ID front", hint: "Photo or PDF of the front side", accept: "image/*,.pdf" },
  { key: "idBackObjectKey", label: "ID back", hint: "Photo or PDF of the back side", accept: "image/*,.pdf" },
  { key: "selfieObjectKey", label: "Selfie", hint: "Clear face photo for verification", accept: "image/*" },
]

type FilesState = Partial<Record<UploadSlot, File>>
type KeysState = Partial<Record<UploadSlot, string>>

export function KycUploadForm({ currentStatus }: { currentStatus: string }) {
  const [files, setFiles] = useState<FilesState>({})
  const [keys, setKeys] = useState<KeysState>({})
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const ready = useMemo(() => slots.every((slot) => files[slot.key] || keys[slot.key]), [files, keys])

  function onFile(slot: UploadSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFiles((current) => ({ ...current, [slot]: file }))
    setKeys((current) => ({ ...current, [slot]: undefined }))
    setMessage("")
  }

  async function uploadOne(slot: UploadSlot, file: File) {
    const presign = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, dir_name: "kyc", visibility: "private" }),
    }).then((response) => response.json())
    if (!presign.success) throw new Error(presign.error || "Could not prepare upload")

    const put = await fetch(presign.upload_url, {
      method: "PUT",
      headers: { "Content-Type": presign.content_type },
      body: file,
    })
    if (!put.ok) throw new Error(`Upload failed for ${slot}`)

    const confirmed = await fetch("/api/storage/presign/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object_key: presign.object_key,
        public_url: null,
        content_type: presign.content_type,
        size_bytes: file.size,
        dir_name: "kyc",
        visibility: "private",
      }),
    }).then((response) => response.json())
    if (!confirmed.success) throw new Error(confirmed.error || "Could not confirm upload")
    return String(confirmed.object_key)
  }

  async function submit() {
    setBusy(true)
    setMessage("Uploading your documents securely…")
    try {
      const nextKeys: KeysState = { ...keys }
      for (const slot of slots) {
        const file = files[slot.key]
        if (file && !nextKeys[slot.key]) {
          setMessage(`Uploading ${slot.label.toLowerCase()}…`)
          nextKeys[slot.key] = await uploadOne(slot.key, file)
        }
      }
      setKeys(nextKeys)
      setMessage("Submitting for review…")
      const response = await fetch("/api/v1/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextKeys),
      }).then((res) => res.json())
      if (!response.success) throw new Error(response.message || "Could not submit KYC")
      setMessage("KYC submitted. Admin review is now pending.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-neutral-50 p-4">
      <div>
        <h3 className="font-black">Verify identity for payouts</h3>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Uploads go to private storage and are visible only to authorized review tools. Current status: <b>{currentStatus.replaceAll("_", " ")}</b>.
        </p>
      </div>

      <div className="grid gap-3">
        {slots.map((slot) => (
          <label key={slot.key} className="block rounded-2xl border border-dashed border-black/15 bg-white p-4">
            <span className="block text-sm font-black">{slot.label}</span>
            <span className="mt-1 block text-xs text-neutral-500">{files[slot.key]?.name || slot.hint}</span>
            <input type="file" accept={slot.accept} disabled={busy} onChange={(event) => onFile(slot.key, event)} className="mt-3 block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-neutral-950 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white" />
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={!ready || busy}
        onClick={submit}
        className="w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "Upload and submit KYC"}
      </button>
      {message ? <p className="rounded-2xl bg-white p-3 text-sm text-neutral-700">{message}</p> : null}
    </div>
  )
}
