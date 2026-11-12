import { createHash, createHmac } from "node:crypto"

export const vaultWebMediaPrefix = "private/web-vault-media-v1"

export function isWebVaultMedia(key: string) {
  return key.startsWith(`${vaultWebMediaPrefix}/`)
}

export function vaultMediaEncryptionHeaders(objectKey: string, secret: string) {
  const key = createHmac("sha256", secret).update(`vault-media-v1:${objectKey}`).digest()
  return {
    SSECustomerAlgorithm: "AES256",
    SSECustomerKey: key.toString("base64"),
    SSECustomerKeyMD5: createHash("md5").update(key).digest("base64"),
  }
}
