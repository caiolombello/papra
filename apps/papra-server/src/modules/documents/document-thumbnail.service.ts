import type { Readable } from 'node:stream';
import type { DocumentStorageService } from './storage/documents.storage.services';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { createLogger } from '../shared/logger/logger';

const logger = createLogger({ namespace: 'documents:thumbnail' });

const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 200;

function thumbnailKeyFromStorageKey(storageKey: string): string {
  return `thumbnails/${storageKey}.jpg`;
}

export async function getOrCreateThumbnail({
  storageKey,
  mimeType,
  documentsStorageService,
  fileEncryptionAlgorithm,
  fileEncryptionKekVersion,
  fileEncryptionKeyWrapped,
}: {
  storageKey: string;
  mimeType: string;
  documentsStorageService: DocumentStorageService;
  fileEncryptionAlgorithm?: string | null;
  fileEncryptionKekVersion?: string | null;
  fileEncryptionKeyWrapped?: string | null;
}): Promise<{ thumbnailStream: Readable; contentType: string } | null> {
  const thumbnailKey = thumbnailKeyFromStorageKey(storageKey);

  // Check if thumbnail already exists in storage
  const exists = await documentsStorageService.fileExists({ storageKey: thumbnailKey });

  if (exists) {
    const { fileStream } = await documentsStorageService.getFileStream({ storageKey: thumbnailKey });
    return { thumbnailStream: fileStream, contentType: 'image/jpeg' };
  }

  // Only generate thumbnails for images
  if (!mimeType.startsWith('image/')) {
    return null;
  }

  try {
    // Get original file
    const { fileStream } = await documentsStorageService.getFileStream({
      storageKey,
      fileEncryptionAlgorithm,
      fileEncryptionKekVersion,
      fileEncryptionKeyWrapped,
    });

    // Collect stream to buffer for sharp
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const buffer = Buffer.concat(chunks);

    // Generate thumbnail
    const thumbnailBuffer = await sharp(buffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    // Save thumbnail to storage (no encryption — thumbnails are low-res)
    const thumbnailStream = new PassThrough();
    thumbnailStream.end(thumbnailBuffer);

    await documentsStorageService.saveFile({
      fileStream: thumbnailStream,
      storageKey: thumbnailKey,
      mimeType: 'image/jpeg',
      fileName: 'thumbnail.jpg',
    });

    // Return a fresh stream from the buffer
    const outputStream = new PassThrough();
    outputStream.end(thumbnailBuffer);

    return { thumbnailStream: outputStream, contentType: 'image/jpeg' };
  } catch (error) {
    logger.warn({ error, storageKey }, 'Failed to generate thumbnail');
    return null;
  }
}
