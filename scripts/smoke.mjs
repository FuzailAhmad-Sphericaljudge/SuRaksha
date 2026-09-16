import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Exercise the actual compiled entrypoint and production static serving.
const child = spawn(process.execPath, ['dist/server.js'], {
  cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3197',
    LOG_LEVEL: 'info',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Production boot timed out.')),
      15_000,
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`Server exited before readiness (${code}).`)),
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes('Server listening at')) resolve();
    });
  });
  const origin = 'http://127.0.0.1:3197';
  const page = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /SafePG India/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)];
  assert.ok(assets.length >= 2, 'Expected compiled JavaScript and CSS.');
  for (const [, asset] of assets) {
    const response = await fetch(`${origin}${asset}`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 200);
  }
  for (const image of [
    '/images/hero-student-housing.webp',
    '/images/demo-hostel-courtyard.webp',
    '/images/demo-coaching-frontage.webp',
  ]) {
    const response = await fetch(`${origin}${image}`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^image\/webp/);
  }
  const health = await fetch(`${origin}/api/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'suraksha-api');
  const session = await fetch(`${origin}/api/session`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { authenticated: false });
  const privateRoute = await fetch(`${origin}/api/private/check`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(privateRoute.status, 401);
  assert.equal((await privateRoute.json()).error.code, 'UNAUTHORIZED');
  for (const route of ['/api/missing', '/.env', '/src/server.ts']) {
    const response = await fetch(`${origin}${route}`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 404, `${route} must not be public`);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
  console.log(
    'Production smoke passed: page, scripts, images, API and private-path rejection.',
  );
} finally {
  clearTimeout(timer);
  if (child.exitCode === null) child.kill();
  await exited;
}
