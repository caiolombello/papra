import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import createBusboy from 'busboy';
import { createLogger } from '../shared/logger/logger';

const logger = createLogger({ namespace: 'intake-emails.parsing' });

export type ParsedAttachment = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type ParsedIntakeEmail = {
  email: {
    from: { address: string };
    to?: { address: string }[];
    originalTo?: { address: string }[];
    subject?: string;
  };
  attachments: ParsedAttachment[];
};

export async function parseMultipartIntakeEmail({ bodyBuffer, contentType }: { bodyBuffer: ArrayBuffer; contentType: string }): Promise<ParsedIntakeEmail> {
  const bodyBytes = Buffer.from(bodyBuffer);
  logger.info({ bodySize: bodyBytes.length, contentType }, 'Parsing intake email multipart body');

  return new Promise<ParsedIntakeEmail>((resolve, reject) => {
    let emailJson: any = null;
    const files: ParsedAttachment[] = [];

    const bb = createBusboy({
      headers: { 'content-type': contentType },
      limits: { files: 20 },
      defParamCharset: 'utf8',
    });

    bb.on('field', (name: string, value: string) => {
      if (name === 'email') {
        try { emailJson = JSON.parse(value); } catch { emailJson = null; }
      }
    });

    bb.on('file', (name: string, stream: any, info: any) => {
      if (!name.startsWith('attachments')) {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logger.info({ filename: info.filename, fileSize: buffer.length, mime: info.mimeType }, 'Parsed attachment');
        files.push({
          filename: info.filename || 'file',
          mimeType: info.mimeType || 'application/octet-stream',
          buffer,
        });
      });
    });

    bb.on('close', () => {
      logger.info({ emailParsed: !!emailJson, fileCount: files.length }, 'Multipart parsing complete');
      resolve({ email: emailJson, attachments: files });
    });

    bb.on('error', (err: Error) => {
      logger.error({ error: err }, 'Busboy parsing error');
      reject(err);
    });

    const readable = Readable.from(bodyBytes);
    readable.pipe(bb);
  });
}
