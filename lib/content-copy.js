import { randomUUID } from 'node:crypto';
import { downloadCmsObject, uploadCmsObject, deleteCmsObject } from './cms-storage.js';

// New object keys ensure deleting/replacing a file on a copy never affects its source.
export async function copyContentFiles(files, prefix, persist, storage = { downloadCmsObject, uploadCmsObject, deleteCmsObject }) {
  const copied = [];
  const uploadedKeys = [];
  let persistenceStarted = false;
  try {
    for (const file of files) {
      const id = randomUUID().replaceAll('-', '');
      const key = `${prefix}/${id}`;
      const object = await storage.downloadCmsObject(file.storage_key);
      const bytes = await object.Body.transformToByteArray();
      uploadedKeys.push(key);
      await storage.uploadCmsObject(key, bytes, file.mime_type);
      let thumbnailKey = null;
      if (file.thumbnail_storage_key) {
        thumbnailKey = `${prefix}/thumbnail-${id}.webp`;
        const thumbnail = await storage.downloadCmsObject(file.thumbnail_storage_key);
        uploadedKeys.push(thumbnailKey);
        await storage.uploadCmsObject(thumbnailKey, await thumbnail.Body.transformToByteArray(), 'image/webp');
      }
      copied.push({ ...file, id, storage_key: key, thumbnail_storage_key: thumbnailKey });
    }
    persistenceStarted = true;
    return await persist(copied);
  } catch (error) {
    // A lost DB connection can hide a successful COMMIT. Retain private copies
    // for reconciliation rather than deleting files now referenced by a draft.
    if (!persistenceStarted) await Promise.all(uploadedKeys.map((key) => storage.deleteCmsObject(key).catch(() => {})));
    throw error;
  }
}
