import { randomUUID } from 'node:crypto';
import { downloadCmsObject, uploadCmsObject, deleteCmsObject } from './cms-storage.js';

// New object keys ensure deleting/replacing a file on a copy never affects its source.
export async function copyContentFiles(files, prefix, persist, storage = { downloadCmsObject, uploadCmsObject, deleteCmsObject }) {
  const copied = [];
  let persistenceStarted = false;
  try {
    for (const file of files) {
      const id = randomUUID().replaceAll('-', '');
      const key = `${prefix}/${id}`;
      const object = await storage.downloadCmsObject(file.storage_key);
      const bytes = await object.Body.transformToByteArray();
      copied.push({ ...file, id, storage_key: key });
      await storage.uploadCmsObject(key, bytes, file.mime_type);
    }
    persistenceStarted = true;
    return await persist(copied);
  } catch (error) {
    // A lost DB connection can hide a successful COMMIT. Retain private copies
    // for reconciliation rather than deleting files now referenced by a draft.
    if (!persistenceStarted) await Promise.all(copied.map((file) => storage.deleteCmsObject(file.storage_key).catch(() => {})));
    throw error;
  }
}
