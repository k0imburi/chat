import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
export const qrSecret = () => randomBytes(32).toString("base64url")
export const qrHash = (value: string) => createHash("sha256").update(value).digest("hex")
export function qrMatches(value: string, hash: string) {
  const a = Buffer.from(qrHash(value), "hex"), b = Buffer.from(hash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
