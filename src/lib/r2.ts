import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

// Upload de arquivo
export async function uploadR2(
  key: string,        // ex: asos/123456/periodico/2026-05-21.pdf
  body: Buffer | Uint8Array,
  contentType = 'application/pdf'
) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return key
}

// URL assinada para download (expira em 1 hora)
export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn }
  )
}

// Deletar arquivo
export async function deleteR2(key: string) {
  await r2.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  }))
}