import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { describe, expect, test, vi } from 'vitest';
import { overrideConfig } from '../config/config.test-utils';
import { deleteMeetingArtifacts, getMeetingTranscriptPrefixes, resolveMeetingArtifactsStorageConfig } from './meetings-artifacts.storage';

describe('meetings artifacts storage', () => {
  test('resolves transcript prefixes from meeting storage keys without duplicates', () => {
    const prefixes = getMeetingTranscriptPrefixes({
      transcriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/transcript.txt',
      rawTranscriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/openai_response.json',
    });

    expect(prefixes).toEqual([
      'transcripts/uploads/2026-03-29/meeting-1/',
    ]);
  });

  test('skips deletion when meeting artifact storage is not configured', async () => {
    const result = await deleteMeetingArtifacts({
      config: overrideConfig({ env: 'test' }),
      meeting: {
        sourceStorageKey: 'uploads/2026-03-29/meeting-1.flac',
        transcriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/transcript.txt',
        rawTranscriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/openai_response.json',
      },
    });

    expect(result).toEqual({
      enabled: false,
      skipped: true,
      deletedSourceObject: false,
      deletedTranscriptObjectsCount: 0,
    });
  });

  test('deletes source object and transcript prefix objects when configured', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DeleteObjectCommand) {
        return {};
      }

      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: 'transcripts/uploads/2026-03-29/meeting-1/transcript.txt' },
            { Key: 'transcripts/uploads/2026-03-29/meeting-1/manifest.json' },
          ],
          IsTruncated: false,
        };
      }

      if (command instanceof DeleteObjectsCommand) {
        return {};
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });

    const result = await deleteMeetingArtifacts({
      config: overrideConfig({
        env: 'test',
        documentsStorage: {
          driver: 's3',
        },
      }),
      storageConfig: {
        sourceBucketName: 'meeting-recordings',
        transcriptsBucketName: 'meeting-transcripts',
      },
      meeting: {
        sourceStorageKey: 'uploads/2026-03-29/meeting-1.flac',
        transcriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/transcript.txt',
        rawTranscriptStorageKey: 'transcripts/uploads/2026-03-29/meeting-1/openai_response.json',
      },
      s3Client: { send },
    });

    expect(result).toEqual({
      enabled: true,
      skipped: false,
      deletedSourceObject: true,
      deletedTranscriptObjectsCount: 2,
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  test('reads bucket names from environment variables', () => {
    const config = resolveMeetingArtifactsStorageConfig({
      environment: {
        MEETINGS_SOURCE_STORAGE_BUCKET_NAME: 'recordings-bucket',
        MEETINGS_TRANSCRIPTS_STORAGE_BUCKET_NAME: 'transcripts-bucket',
      } as NodeJS.ProcessEnv,
    });

    expect(config).toEqual({
      sourceBucketName: 'recordings-bucket',
      transcriptsBucketName: 'transcripts-bucket',
    });
  });
});
