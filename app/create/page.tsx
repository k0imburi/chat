import { redirect } from "next/navigation"
import { MediaKind } from "@prisma/client"
import { ImagePlus, Video } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { uploadBufferToR2 } from "@/lib/r2"
import { prisma } from "@/lib/prisma"

const MAX_BYTES = 200 * 1024 * 1024
const ALLOWED_MEDIA_KINDS = [MediaKind.IMAGE, MediaKind.GALLERY_VIDEO, MediaKind.PROFILE_VIDEO] as const

export default async function CreatePage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/create" signedIn={false}><SignInRequired title="Sign in to create a post" /></CustomerShell>

  return (
    <CustomerShell active="/create" signedIn>
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="bg-neutral-950 p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">Create</p>
          <h1 className="mt-2 text-3xl font-black">Share a post</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Upload an image or video, add a caption, and publish to Discover. Public posts remain free.</p>
        </div>

        <form action={createPost} className="space-y-5 p-5">
          <input type="hidden" name="userId" value={user.userId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="rounded-3xl bg-emerald-50 p-4">
              <input type="radio" name="kind" value="IMAGE" defaultChecked className="accent-emerald-500" />
              <ImagePlus className="mt-4 h-7 w-7 text-emerald-700" />
              <p className="mt-2 font-black">Image post</p>
              <p className="mt-1 text-xs text-neutral-500">Single image for the feed.</p>
            </label>
            <label className="rounded-3xl bg-purple-50 p-4">
              <input type="radio" name="kind" value="GALLERY_VIDEO" className="accent-purple-500" />
              <Video className="mt-4 h-7 w-7 text-purple-700" />
              <p className="mt-2 font-black">Video post</p>
              <p className="mt-1 text-xs text-neutral-500">Video reel for the feed.</p>
            </label>
            <label className="rounded-3xl bg-blue-50 p-4">
              <input type="radio" name="kind" value="PROFILE_VIDEO" className="accent-blue-500" />
              <Video className="mt-4 h-7 w-7 text-blue-700" />
              <p className="mt-2 font-black">Profile video</p>
              <p className="mt-1 text-xs text-neutral-500">Replace your profile video.</p>
            </label>
          </div>

          <label className="block rounded-[2rem] border-2 border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
            <span className="block text-lg font-black">Choose media file</span>
            <span className="mt-1 block text-sm text-neutral-500">Up to 200MB. Images and videos are uploaded to R2.</span>
            <Input name="file" type="file" accept="image/*,video/*" required className="mx-auto mt-4 max-w-md rounded-2xl bg-white" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutral-500">Title</span>
              <Input name="title" placeholder="Optional title" className="h-11 rounded-2xl" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutral-500">Thumbnail URL</span>
              <Input name="thumbnailUrl" placeholder="Optional thumbnail URL" className="h-11 rounded-2xl" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutral-500">Caption</span>
            <Textarea name="caption" placeholder="Write a caption…" className="min-h-32 rounded-3xl" />
          </label>

          <Button type="submit" className="rounded-full px-7">Publish</Button>
        </form>
      </section>
    </CustomerShell>
  )
}

async function createPost(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer || viewer.userId !== String(formData.get("userId") || "")) throw new Error("Sign in required")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a media file")
  if (file.size > MAX_BYTES) throw new Error("File exceeds the 200MB limit")
  const requestedKind = String(formData.get("kind") || "IMAGE") as MediaKind
  if (!(ALLOWED_MEDIA_KINDS as readonly MediaKind[]).includes(requestedKind)) throw new Error("Unsupported post type")
  const kind = requestedKind as (typeof ALLOWED_MEDIA_KINDS)[number]
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()))
  const uploaded = await uploadBufferToR2(buffer, file.name, {
    prefix: `uploads/${viewer.userId}/posts`,
    contentType: file.type || undefined,
    metadata: { userId: viewer.userId, source: "customer-web-create" },
  })
  if (!uploaded.url) throw new Error("R2 public URL is not configured")
  const media = await prisma.userMedia.create({
    data: {
      userId: viewer.userId,
      kind,
      url: uploaded.url,
      objectKey: uploaded.objectKey,
      thumbnailUrl: String(formData.get("thumbnailUrl") || "") || uploaded.url,
      title: String(formData.get("title") || "") || null,
      caption: String(formData.get("caption") || "") || null,
      mimeType: file.type || null,
      sizeBytes: file.size,
    },
  })
  redirect(`/reels/${media.id}`)
}
