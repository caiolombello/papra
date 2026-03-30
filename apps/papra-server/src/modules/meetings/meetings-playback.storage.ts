import type { Config } from '../config/config.types';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV = 'MEETINGS_SOURCE_STORAGE_BUCKET_NAME';
const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

function resolveBucketName(environment: NodeJS.ProcessEnv = process.env) {
  return environment[MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV]?.trim() || undefined;
}

export function isMeetingPlaybackEnabled({ config }: { config: Config }) {
  return config.documentsStorage.driver === 's3'
    && Boolean(resolveBucketName());
}

export async function createMeetingPlaybackPresignedUrl({
  config,
  sourceStorageKey,
}: {
  config: Config;
  sourceStorageKey: string;
}) {
  const bucketName = resolveBucketName();

  if (!bucketName) {
    throw new Error('Meeting source storage bucket not configured');
  }

  const s3Config = config.documentsStorage.drivers.s3;

  const s3Client = new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    forcePathStyle: s3Config.forcePathStyle,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: sourceStorageKey,
  });

  const playbackUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });

  return { playbackUrl, expiresInSeconds: PRESIGNED_URL_EXPIRY_SECONDS };
}
