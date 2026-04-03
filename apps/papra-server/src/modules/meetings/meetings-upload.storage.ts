import type { Config } from '../config/config.types';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../shared/s3/s3-client.factory';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { posix as path } from 'node:path';
import { createError } from '../shared/errors/errors';

const MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV = 'MEETINGS_SOURCE_STORAGE_BUCKET_NAME';

const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

export const SUPPORTED_MEETING_EXTENSIONS = new Set([
  '.mp3',
  '.mp4',
  '.m4a',
  '.wav',
  '.webm',
  '.ogg',
  '.oga',
  '.flac',
  '.aac',
  '.mov',
  '.mkv',
  '.mpeg',
  '.mpga',
]);

export function isMeetingUploadEnabled({ config }: { config: Config }) {
  return config.documentsStorage.driver === 's3'
    && Boolean(resolveBucketName());
}

function resolveBucketName(environment: NodeJS.ProcessEnv = process.env) {
  return environment[MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV]?.trim() || undefined;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

export async function createMeetingUploadPresignedUrl({
  config,
  fileName,
}: {
  config: Config;
  fileName: string;
}) {
  if (!isMeetingUploadEnabled({ config })) {
    throw createError({
      message: 'Meeting upload is not configured',
      code: 'meetings.upload-not-configured',
      statusCode: 503,
    });
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_MEETING_EXTENSIONS.has(ext)) {
    throw createError({
      message: `Unsupported file type: ${ext}`,
      code: 'meetings.unsupported-file-type',
      statusCode: 400,
    });
  }

  const bucketName = resolveBucketName()!;
  const s3Config = config.documentsStorage.drivers.s3;

  const s3Client = createS3Client({
    region: s3Config.region, endpoint: s3Config.endpoint,
    forcePathStyle: s3Config.forcePathStyle,
    accessKeyId: s3Config.accessKeyId, secretAccessKey: s3Config.secretAccessKey,
  });

  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10);
  const timestamp = now.getTime();
  const sanitized = sanitizeFileName(fileName);
  const storageKey = `uploads/${datePrefix}/${timestamp}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });

  return { uploadUrl, storageKey, fileName: sanitized };
}
