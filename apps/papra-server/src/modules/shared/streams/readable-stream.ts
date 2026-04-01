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
  // Read the entire file into memory first, then create a Readable from it.
  // This avoids issues with File.stream() returning empty ReadableStreams
  // when File objects are created from Node.js Buffers.
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  const readable = new Readable();
  readable.push(buf);
  readable.push(null);
  return readable;
}

export function createReadableStream({ content }: { content: string | Buffer }) {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  return stream;
}
