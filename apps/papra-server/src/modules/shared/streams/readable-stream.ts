import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

export async function collectReadableStreamToBuffer({ stream }: { stream: ReadableStream | Readable }) {
  return Buffer.concat(await Array.fromAsync(stream));
}

export async function collectReadableStreamToString({ stream }: { stream: ReadableStream | Readable }) {
  const buffer = await collectReadableStreamToBuffer({ stream });

  return buffer.toString('utf-8');
}

export async function fileToReadableStream(file: File) {
  const ab = await file.arrayBuffer();
  return Readable.from(Buffer.from(ab));
}

export function createReadableStream({ content }: { content: string | Buffer }) {
  return Readable.from(typeof content === 'string' ? Buffer.from(content) : content);
}
