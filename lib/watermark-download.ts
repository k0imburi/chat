import sharp from "sharp"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const execute = promisify(execFile)
const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;"})[c]!)

async function overlay(width: number, height: number, username: string) {
  if (!width || !height || width > 8192 || height > 8192) throw new Error("Unsupported media dimensions")
  // Match the app: handle left, logo and brand right, above player controls.
  const band = Math.max(1, Math.round(height * 0.16))
  const brandFont = Math.max(10, Math.min(384, Math.round(width * 0.045)))
  const handleFont = Math.max(9, Math.round(brandFont * 0.667))
  const margin = Math.max(1, Math.round(width * 0.035))
  const name = escapeXml(username.replace(/^@/, "").slice(0, 40) || "creator")
  const renderText = (text: string, size: number) => sharp({ text: {
    text: `<span foreground="white">${text}</span>`,
    font: `Roboto Medium ${size}`,
    fontfile: join(process.cwd(), "assets/fonts/Roboto-Medium.ttf"),
    rgba: true,
  } }).png().toBuffer({ resolveWithObject: true })
  const [handle, brand] = await Promise.all([renderText(`@${name}`, handleFont), renderText("ChatAndTip", brandFont)])
  const logoSize = Math.max(1, Math.min(band, Math.round(brandFont * 1.4)))
  const logo = await sharp(join(process.cwd(), "public/flutter/assets/assets/icons/chatandtiplogo.png"))
    .resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer()
  const gap = Math.max(2, Math.round(brandFont * 0.3))
  const brandX = Math.max(margin, width - margin - brand.info.width)
  const logoX = Math.max(margin, brandX - gap - logoSize)
  const bottom = Math.max(0, Math.round(band * 0.12))
  const brandY = Math.max(0, band - bottom - brand.info.height)
  const logoY = Math.max(0, band - bottom - logoSize)
  const handleY = Math.max(0, band - bottom - handle.info.height)
  const availableHandleWidth = Math.max(1, logoX - gap - margin)
  const handleImage = handle.info.width > availableHandleWidth
    ? await sharp(handle.data).resize({ width: availableHandleWidth, withoutEnlargement: true }).png().toBuffer()
    : handle.data
  const handleShadow = await sharp(handleImage).recomb([[0,0,0],[0,0,0],[0,0,0]]).png().toBuffer()
  const brandShadow = await sharp(brand.data).recomb([[0,0,0],[0,0,0],[0,0,0]]).png().toBuffer()
  const shadowOffset = Math.max(1, Math.round(width * 0.0015))
  const png = await sharp({ create: { width, height: band, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    {input: handleShadow, left: margin + shadowOffset, top: handleY + shadowOffset},
    {input: brandShadow, left: brandX + shadowOffset, top: brandY + shadowOffset},
    {input: handleImage, left: margin, top: handleY},
    {input: logo, left: logoX, top: logoY},
    {input: brand.data, left: brandX, top: brandY},
  ]).png().toBuffer()
  return { png, band }
}

export async function watermarkImage(input: Buffer, username: string) {
  const image = sharp(input, { limitInputPixels: 67_108_864 })
  const meta = await image.metadata()
  if ((meta.pages || 1) > 1) throw new Error("Animated images are not supported")
  const rotated = (meta.orientation || 0) >= 5 && (meta.orientation || 0) <= 8
  const width = (rotated ? meta.height : meta.width) || 0
  const height = (rotated ? meta.width : meta.height) || 0
  const mark = await overlay(width, height, username)
  return image.rotate().composite([{ input: mark.png, left: 0, top: Math.max(0, height - mark.band - Math.round(height * 0.07)) }]).jpeg({ quality: 90 }).toBuffer()
}

export async function watermarkVideo(input: Buffer, username: string) {
  const dir = await mkdtemp(join(tmpdir(), "chatandtip-watermark-"))
  try {
    const source = join(dir, "source"), stamp = join(dir, "stamp.png"), result = join(dir, "result.mp4")
    await writeFile(source, input)
    const probe = await execute("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", source], { timeout: 30000 })
    const stream = JSON.parse(probe.stdout).streams?.[0]
    const rotation = Math.abs(Number(stream?.side_data_list?.[0]?.rotation || 0))
    const width = rotation === 90 || rotation === 270 ? stream?.height : stream?.width
    const height = rotation === 90 || rotation === 270 ? stream?.width : stream?.height
    const mark = await overlay(width, height, username)
    await writeFile(stamp, mark.png)
    await execute("ffmpeg", ["-y", "-i", source, "-i", stamp, "-filter_complex", "[0:v][1:v]overlay=0:main_h-overlay_h-main_h*0.07[v]", "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", result], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
    return await readFile(result)
  } finally { await rm(dir, { recursive: true, force: true }) }
}
