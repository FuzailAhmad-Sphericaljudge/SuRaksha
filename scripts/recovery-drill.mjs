import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const directory = await mkdtemp(join(tmpdir(), 'suraksha-recovery-'));
try {
  const sourcePath = join(directory, 'source.sqlite');
  const backupPath = join(directory, 'backup.sqlite');
  const source = new DatabaseSync(sourcePath);
  source.exec(
    'CREATE TABLE recovery_probe(id TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
  source
    .prepare('INSERT INTO recovery_probe VALUES (?, ?)')
    .run('probe-1', 'verified');
  source.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  source.close();
  const verification = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { DatabaseSync } from 'node:sqlite';
       const db = new DatabaseSync(process.argv[1], { readOnly: true });
       const row = db.prepare('SELECT * FROM recovery_probe').get();
       const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
       db.close();
       process.stdout.write(JSON.stringify({ row, integrity }));`,
      backupPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(verification.status, 0, verification.stderr);
  assert.deepEqual(JSON.parse(verification.stdout), {
    row: { id: 'probe-1', value: 'verified' },
    integrity: 'ok',
  });
  console.log(
    'Recovery drill passed: online backup restored with expected data and integrity_check=ok.',
  );
} finally {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
