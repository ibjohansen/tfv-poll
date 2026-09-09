import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = 'cms-assets';
let client;

function getCmsStorageConfig() {
  const netlifyConfiguration = {
    accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEON_STORAGE_SECRET_ACCESS_KEY,
    endpoint: process.env.NEON_STORAGE_ENDPOINT,
    region: process.env.NEON_STORAGE_REGION,
  };
  const netlifyValues = Object.values(netlifyConfiguration);
  if (netlifyValues.some(Boolean)) return netlifyValues.every(Boolean) ? netlifyConfiguration : null;

  const neonConfiguration = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION,
  };

  return Object.values(neonConfiguration).every(Boolean) ? neonConfiguration : null;
}

export function isCmsStorageConfigured() {
  return Boolean(getCmsStorageConfig());
}

function getClient() {
  const configuration = getCmsStorageConfig();
  if (!configuration) throw new Error('CMS storage is not configured');
  if (!client) {
    client = new S3Client({
      endpoint: configuration.endpoint,
      region: configuration.region,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
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
