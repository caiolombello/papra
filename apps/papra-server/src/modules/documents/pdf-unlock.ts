import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../shared/logger/logger';

const logger = createLogger({ namespace: 'documents:pdf-unlock' });

/**
 * Checks whether a PDF buffer is encrypted/password-protected.
 * Runs `qpdf --check` on a temp file — exits with non-zero if encrypted.
 */
export async function isPdfEncrypted(buffer: Buffer): Promise<boolean> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'papra-pdf-check-'));
  const inputPath = join(tmpDir, 'input.pdf');

  try {
    await writeFile(inputPath, buffer);

    await execFileAsync('qpdf', ['--check', inputPath]);

    // Exit 0 with no password means not encrypted (or successfully readable)
    return false;
  } catch (error: any) {
    // qpdf exits 2 for encrypted PDFs that need a password
    if (error?.code === 2) {
      return true;
    }

    // Other errors (e.g. corrupted PDF): assume not actionably encrypted
    logger.warn({ error: error?.message }, 'qpdf --check returned unexpected error');

    return false;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Attempts to decrypt a PDF buffer using each of the provided passwords in order.
 * Returns `{ unlocked: true, data: Buffer }` on the first success.
 * Returns `{ unlocked: false, data: originalBuffer }` if no password worked.
 */
export async function tryUnlockPdf(buffer: Buffer, passwords: string[]): Promise<{ unlocked: boolean; data: Buffer }> {
  if (passwords.length === 0) {
    return { unlocked: false, data: buffer };
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'papra-pdf-unlock-'));
  const inputPath = join(tmpDir, 'input.pdf');
  const outputPath = join(tmpDir, 'output.pdf');

  try {
    await writeFile(inputPath, buffer);

    for (const password of passwords) {
      try {
        await execFileAsync('qpdf', [
          `--password=${password}`,
          '--decrypt',
          inputPath,
          outputPath,
        ]);

        const unlockedBuffer = await readFile(outputPath);

        logger.info('Successfully unlocked PDF with provided password');

        return { unlocked: true, data: unlockedBuffer };
      } catch {
        // This password didn't work; try the next
      }
    }

    logger.warn({ triedCount: passwords.length }, 'No password unlocked the PDF');

    return { unlocked: false, data: buffer };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function execFileAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        const err: any = error;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
