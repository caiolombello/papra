import type { Config } from '../config/config.types';
import type { MeetingForApi } from './meetings.types';
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { createS3Client } from '../shared/s3/s3-client.factory';
import { posix as path } from 'node:path';

const MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV = 'MEETINGS_SOURCE_STORAGE_BUCKET_NAME';
const MEETINGS_TRANSCRIPTS_STORAGE_BUCKET_NAME_ENV = 'MEETINGS_TRANSCRIPTS_STORAGE_BUCKET_NAME';

type S3LikeClient = Pick<S3Client, 'send'>;

export type MeetingArtifactsStorageConfig = {
  sourceBucketName?: string;
  transcriptsBucketName?: string;
};

export function resolveMeetingArtifactsStorageConfig({
  environment = process.env,
}: {
  environment?: NodeJS.ProcessEnv;
} = {}): MeetingArtifactsStorageConfig {
  const sourceBucketName = environment[MEETINGS_SOURCE_STORAGE_BUCKET_NAME_ENV]?.trim() || undefined;
  const transcriptsBucketName = environment[MEETINGS_TRANSCRIPTS_STORAGE_BUCKET_NAME_ENV]?.trim() || undefined;

  return {
    sourceBucketName,
    transcriptsBucketName,
  };
}

export function getMeetingTranscriptPrefixes(meeting: Pick<MeetingForApi, 'transcriptStorageKey' | 'rawTranscriptStorageKey'>) {
  const prefixes = new Set<string>();

  [meeting.transcriptStorageKey, meeting.rawTranscriptStorageKey]
    .filter((storageKey): storageKey is string => Boolean(storageKey))
    .forEach((storageKey) => {
      const dirname = path.dirname(storageKey);
      if (dirname && dirname !== '.') {
        prefixes.add(`${dirname}/`);
      }
    });

  return [...prefixes];
}

export function isMeetingArtifactsDeletionEnabled({
  config,
  storageConfig,
}: {
  config: Config;
  storageConfig: MeetingArtifactsStorageConfig;
}) {
  return config.documentsStorage.driver === 's3'
    && Boolean(storageConfig.sourceBucketName)
    && Boolean(storageConfig.transcriptsBucketName);
}

export async function deleteMeetingArtifacts({
  config,
  meeting,
  storageConfig = resolveMeetingArtifactsStorageConfig(),
  s3Client,
}: {
  config: Config;
  meeting: Pick<MeetingForApi, 'sourceStorageKey' | 'transcriptStorageKey' | 'rawTranscriptStorageKey'>;
  storageConfig?: MeetingArtifactsStorageConfig;
  s3Client?: S3LikeClient;
}) {
  if (!isMeetingArtifactsDeletionEnabled({ config, storageConfig })) {
    return {
      enabled: false,
      skipped: true,
      deletedSourceObject: false,
      deletedTranscriptObjectsCount: 0,
    };
  }

  const client = s3Client ?? createS3ClientFromConfig({ config });
  const sourceBucketName = storageConfig.sourceBucketName!;
  const transcriptsBucketName = storageConfig.transcriptsBucketName!;

  let deletedSourceObject = false;
  if (meeting.sourceStorageKey) {
    deletedSourceObject = await deleteObjectIfExists({
      client,
      bucketName: sourceBucketName,
      storageKey: meeting.sourceStorageKey,
    });
  }

  let deletedTranscriptObjectsCount = 0;
  for (const prefix of getMeetingTranscriptPrefixes(meeting)) {
    deletedTranscriptObjectsCount += await deletePrefixIfExists({
      client,
      bucketName: transcriptsBucketName,
      prefix,
    });
  }

  return {
    enabled: true,
    skipped: false,
    deletedSourceObject,
    deletedTranscriptObjectsCount,
  };
}

function createS3ClientFromConfig({ config }: { config: Config }) {
  if (config.documentsStorage.driver !== 's3') {
    throw new Error('Meeting artifact deletion requires S3 document storage driver');
  }

  const s3 = config.documentsStorage.drivers.s3;

  return createS3Client({
    region: s3.region,
    endpoint: s3.endpoint,
    forcePathStyle: s3.forcePathStyle,
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
  });
}

async function deleteObjectIfExists({
  client,
  bucketName,
  storageKey,
}: {
  client: S3LikeClient;
  bucketName: string;
  storageKey: string;
}) {
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    }));
    return true;
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function deletePrefixIfExists({
  client,
  bucketName,
  prefix,
}: {
  client: S3LikeClient;
  bucketName: string;
  prefix: string;
}) {
  let continuationToken: string | undefined;
  let deletedObjectsCount = 0;

  do {
    const listResult = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    const keys = (listResult.Contents ?? [])
      .map(object => object.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: keys.map(Key => ({ Key })),
          Quiet: true,
        },
      }));
      deletedObjectsCount += keys.length;
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  return deletedObjectsCount;
}

function isS3NotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const codes = ['NoSuchKey', 'NotFound'];
  return codes.includes(error.name)
    || ('Code' in error && typeof error.Code === 'string' && codes.includes(error.Code));
}
