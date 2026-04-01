import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

export async function collectReadableStreamToBuffer({ stream }: { stream: ReadableStream | Readable }) {
  return Buffer.concat(await Array.fromAsync(stream));
}

export async function collectReadableStreamToString({ stream }: { stream: ReadableStream | Readable }) {
  const buffer = await collectReadableStreamToBuffer({ stream });

  return buffer.toString('utf-8');
}

export function fileToReadableStream(file: File) {
  // file.arrayBuffer() is more reliable than file.stream() for Node.js File objects
  // created from Buffers, which can return empty ReadableStreams in some cases
  const readable = new Readable({ read() {} });
  file.arrayBuffer().then((ab) => {
    readable.push(Buffer.from(ab));
    readable.push(null);
  }).catch((err) => {
    readable.destroy(err instanceof Error ? err : new Error(String(err)));
  });
  return readable;
}

export function createReadableStream({ content }: { content: string | Buffer }) {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  return stream;
}
