import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const root = new URL('../', import.meta.url);
const example = await readFile(new URL('.env.example', root), 'utf8');
const contents = example.replaceAll('replace-with-local-password', randomBytes(24).toString('hex'))
  .replace('replace-with-ru-token', randomBytes(32).toString('hex'))
  .replace('replace-with-ky-token', randomBytes(32).toString('hex'))
  .replace('replace-with-session-secret', randomBytes(32).toString('hex'))
  .replace('DEMO_BROWSER_ENABLED=false', 'DEMO_BROWSER_ENABLED=true')
  .replace('DEMO_AUTH_ENABLED=false', 'DEMO_AUTH_ENABLED=true');
try {
  await writeFile(new URL('.env', root), contents, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a generated local password. Do not commit this file.');
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    const existing = await readFile(new URL('.env', root), 'utf8');
    const defaults = contents.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line));
    const missing = defaults.filter(line => !new RegExp(`^${line.split('=')[0]}=`, 'm').test(existing));
    if (missing.length) await writeFile(new URL('.env', root), `${existing.trimEnd()}\n${missing.join('\n')}\n`, { mode: 0o600 });
    console.log(`Existing .env values preserved; added ${missing.length} missing settings. Local demo tokens are never printed.`);
  } else throw error;
}
