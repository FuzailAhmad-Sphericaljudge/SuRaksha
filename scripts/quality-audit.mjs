import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(`${root}/apps/web/src/main.tsx`, 'utf8');
const styles = await readFile(`${root}/apps/web/src/styles.css`, 'utf8');
assert.match(source, /className="skip-link"/);
assert.match(source, /<main id="top"/);
assert.match(source, /aria-live="polite"/);
assert.match(styles, /:focus-visible/);
assert.match(styles, /prefers-reduced-motion/);

const assetsRoot = `${root}/apps/web/dist/assets`;
const assets = await readdir(assetsRoot);
let javascriptBytes = 0;
let cssBytes = 0;
for (const asset of assets) {
  const bytes = (await stat(`${assetsRoot}/${asset}`)).size;
  if (asset.endsWith('.js')) javascriptBytes += bytes;
  if (asset.endsWith('.css')) cssBytes += bytes;
}
assert.ok(
  javascriptBytes <= 450_000,
  `JavaScript budget exceeded: ${javascriptBytes}`,
);
assert.ok(cssBytes <= 30_000, `CSS budget exceeded: ${cssBytes}`);
console.log(
  `Quality audit passed: keyboard landmarks, motion fallback, JS ${javascriptBytes}B, CSS ${cssBytes}B.`,
);
