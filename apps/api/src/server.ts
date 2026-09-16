import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig(process.env);
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (config.NODE_ENV === 'production' && !existsSync(webRoot)) {
  throw new Error(
    'Web build missing. Run npm run build before production startup.',
  );
}
const app = createApp({
  logLevel: config.LOG_LEVEL,
  ...(existsSync(webRoot) ? { webRoot } : {}),
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
