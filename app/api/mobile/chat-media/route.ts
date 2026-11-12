import { GetObjectCommand } from "@aws-sdk/client-s3";
import { openChatMedia } from "@/lib/chat-media-token";
import { env } from "@/lib/env";
import { getR2Client } from "@/lib/r2";
import { decryptChatPhoto, isEncryptedChatPhoto } from "@/lib/chat-photo-storage";
import { isWebVaultMedia, vaultMediaEncryptionHeaders } from "@/lib/vault-media-storage";

export async function GET(request: Request) {
  try {
    // An encrypted, expiring capability, like a presigned URL, but without
    // publishing the storage key (which contains the uploader's account ID).
    const objectKey = await openChatMedia(new URL(request.url).searchParams.get("token") || "", env.JWT_SECRET);
    const range = request.headers.get("range");
    if (range && !/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416 });
    const { client, settings } = await getR2Client();
    const encryptedPhoto = isEncryptedChatPhoto(objectKey);
    const webVaultMedia = isWebVaultMedia(objectKey);
    const result = await client.send(new GetObjectCommand({
      Bucket: encryptedPhoto || webVaultMedia ? settings.bucketName : settings.privateBucketName,
      Key: objectKey,
      ...(webVaultMedia ? vaultMediaEncryptionHeaders(objectKey, env.JWT_SECRET) : {}),
      ...(range && !encryptedPhoto ? { Range: range } : {}),
    }));
    if (!result.Body) return new Response(null, { status: 404 });
    if (encryptedPhoto) {
      const contentType = result.Metadata?.["photo-content-type"];
      if (!contentType?.startsWith("image/")) return new Response(null, { status: 404 });
      const photo = decryptChatPhoto(await result.Body.transformToByteArray(), objectKey, contentType, env.JWT_SECRET);
      return new Response(new Uint8Array(photo), { headers: {
        "Content-Type": contentType,
        "Content-Length": String(photo.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    const headers = new Headers({
      "Content-Type": result.ContentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    });
    if (result.ContentLength != null) headers.set("Content-Length", String(result.ContentLength));
    if (result.ContentRange) headers.set("Content-Range", result.ContentRange);
    return new Response(result.Body.transformToWebStream(), { status: result.ContentRange ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
