import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export const chatPhotoPrefix = "private/web-chat-photos-v1"

export function isEncryptedChatPhoto(objectKey: string) {
  return objectKey.startsWith(`${chatPhotoPrefix}/`)
}

function photoKey(secret: string) {
  return createHash("sha256").update(`chat-photo-storage-v1:${secret}`).digest()
}

export function encryptChatPhoto(bytes: Buffer, objectKey: string, contentType: string, secret: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", photoKey(secret), nonce)
  cipher.setAAD(Buffer.from(`${objectKey}\n${contentType}`))
  const payload = Buffer.concat([cipher.update(bytes), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), payload])
}

export function decryptChatPhoto(bytes: Uint8Array, objectKey: string, contentType: string, secret: string) {
  const decipher = createDecipheriv("aes-256-gcm", photoKey(secret), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  decipher.setAAD(Buffer.from(`${objectKey}\n${contentType}`))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
}
