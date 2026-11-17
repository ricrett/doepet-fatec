import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let cachedDataDir: string | null = null;

export function getWritableDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const candidates = [
    process.env.DOEPET_DATA_DIR,
    path.resolve(process.cwd(), '.data'),
    path.join(os.tmpdir(), 'doepet-data'),
  ].filter((v): v is string => Boolean(v && v.trim()));

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
      fs.writeFileSync(probe, 'ok', 'utf8');
      fs.unlinkSync(probe);
      cachedDataDir = dir;
      return dir;
    } catch {
      // Read-only or non-writable directory — fall back to next candidate
    }
  }

  cachedDataDir = path.join(os.tmpdir(), 'doepet-data');
  return cachedDataDir;
}
