import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'suraksha-staging-'));
const child = spawn(process.execPath, ['dist/server.js'], {
  cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_MODE: 'production',
    HOST: '127.0.0.1',
    PORT: '3198',
    LOG_LEVEL: 'info',
    DATABASE_PATH: join(directory, 'staging.sqlite'),
    UPLOAD_PATH: join(directory, 'uploads'),
    IDENTITY_GATEWAY_SECRET: 'staging-gateway-secret-at-least-32-characters',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Staging boot timed out.')),
      15_000,
    );
    child.once('error', reject);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Server listening at')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const origin = 'http://127.0.0.1:3198';
  const headers = {
    'content-type': 'application/json',
    'oai-authenticated-user-id': '70000000-0000-4000-8000-000000000001',
    'oai-authenticated-user-email': 'staging-student@example.test',
    'oai-authenticated-user-full-name': 'Staging%20Student',
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    'x-suraksha-gateway-secret':
      'staging-gateway-secret-at-least-32-characters',
  };
  assert.equal((await fetch(`${origin}/api/ready`)).status, 200);
  const bootstrap = await (await fetch(`${origin}/api/bootstrap`)).json();
  assert.equal(bootstrap.mode, 'production');
  assert.equal(
    (
      await fetch(`${origin}/api/onboarding`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'student' }),
      })
    ).status,
    200,
  );
  const candidate = await fetch(`${origin}/api/candidates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Staging RC Hostel',
      locality: 'Kota Rajasthan',
      propertyType: 'hostel',
    }),
  });
  assert.equal(candidate.status, 201);
  assert.equal(
    (await fetch(`${origin}/api/candidates/search?q=staging`)).status,
    200,
  );
  console.log(
    'Staging smoke passed: production mode, external identity, onboarding, persistence and search.',
  );
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
