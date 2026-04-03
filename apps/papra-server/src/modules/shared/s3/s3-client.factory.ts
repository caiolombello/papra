import { S3Client } from '@aws-sdk/client-s3';

export function createS3Client({ region, endpoint, forcePathStyle, accessKeyId, secretAccessKey }: {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}) {
  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}
