import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = 'cms-assets';
let client;

export function isCmsStorageConfigured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_REGION);
}
function getClient() {
  if (!isCmsStorageConfigured()) throw new Error('CMS storage is not configured');
  if (!client) {
    client = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export async function uploadCmsObject(key, bytes, mimeType) {
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bytes,
    ContentType: mimeType,
    CacheControl: 'private, max-age=0, no-store',
  }));
}

export async function downloadCmsObject(key) {
  return getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteCmsObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
