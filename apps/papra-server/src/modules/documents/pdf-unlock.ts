import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../shared/logger/logger';

const logger = createLogger({ namespace: 'documents:pdf-unlock' });

/**
 * Checks whether a PDF buffer is encrypted/password-protected.
 */
export async function isPdfEncrypted(buffer: Buffer): Promise<boolean> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'papra-pdf-check-'));
  const inputPath = join(tmpDir, 'input.pdf');

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync('qpdf', ['--check', inputPath]);
    return false;
  } catch (error: any) {
    if (error?.code === 2) {
      return true;
    }
    logger.warn({ error: error?.message }, 'qpdf --check returned unexpected error');
    return false;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Attempts to decrypt a PDF using configured passwords, then progressively
 * brute-forces numeric combinations (3→4→5→6 digits).
 *
 * Order:
 * 1. Configured passwords (from pdf-password-rules)
 * 2. Brute-force 000–999 (3 digits, 1000 attempts)
 * 3. Brute-force 0000–9999 (4 digits, 10000 attempts)
 * 4. Brute-force 00000–99999 (5 digits, 100000 attempts)
 * 5. Brute-force 000000–999999 (6 digits, 1000000 attempts)
 */
export async function tryUnlockPdf(buffer: Buffer, configuredPasswords: string[]): Promise<{ unlocked: boolean; data: Buffer; method?: string; password?: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'papra-pdf-unlock-'));
  const inputPath = join(tmpDir, 'input.pdf');
  const outputPath = join(tmpDir, 'output.pdf');

  try {
    await writeFile(inputPath, buffer);

    // Phase 1: configured passwords
    if (configuredPasswords.length > 0) {
      const result = await tryPasswords(inputPath, outputPath, configuredPasswords);
      if (result) {
        const data = await readFile(outputPath);
        logger.info({ method: 'configured-rules', password: result }, 'PDF unlocked with configured password');
        return { unlocked: true, data, method: 'configured-rules', password: result };
      }
      logger.info({ triedCount: configuredPasswords.length }, 'Configured passwords failed, starting brute-force');
    }

    // Phase 2–5: progressive brute-force
    const phases = [
      { digits: 3, max: 1000 },
      { digits: 4, max: 10000 },
      { digits: 5, max: 100000 },
      { digits: 6, max: 1000000 },
    ];

    for (const phase of phases) {
      logger.info({ digits: phase.digits, attempts: phase.max }, 'Brute-force phase starting');

      const result = await bruteForceNumeric(inputPath, outputPath, phase.digits, phase.max);
      if (result !== null) {
        const data = await readFile(outputPath);
        logger.info({ method: `brute-force-${phase.digits}`, password: result }, 'PDF unlocked via brute-force');
        return { unlocked: true, data, method: `brute-force-${phase.digits}`, password: result };
      }
    }

    logger.warn('All unlock attempts exhausted (rules + brute-force 3-6 digits)');
    return { unlocked: false, data: buffer };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function tryPasswords(inputPath: string, outputPath: string, passwords: string[]): Promise<string | null> {
  for (const password of passwords) {
    if (await tryOnePassword(inputPath, outputPath, password)) {
      return password;
    }
  }
  return null;
}

async function bruteForceNumeric(inputPath: string, outputPath: string, digits: number, max: number): Promise<string | null> {
  // Run in batches to avoid overwhelming the system and to log progress
  const BATCH_LOG_INTERVAL = 10000;

  for (let n = 0; n < max; n++) {
    const password = String(n).padStart(digits, '0');

    if (await tryOnePassword(inputPath, outputPath, password)) {
      return password;
    }

    if (n > 0 && n % BATCH_LOG_INTERVAL === 0) {
      logger.debug({ digits, progress: `${n}/${max}` }, 'Brute-force progress');
    }
  }

  return null;
}

async function tryOnePassword(inputPath: string, outputPath: string, password: string): Promise<boolean> {
  try {
    await execFileAsync('qpdf', [
      `--password=${password}`,
      '--decrypt',
      inputPath,
      outputPath,
    ]);
    return true;
  } catch {
    return false;
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
