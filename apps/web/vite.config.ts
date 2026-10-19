import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const port = Number(env['WEB_PORT'] ?? '5173');
  const target = env['VITE_PROXY_TARGET'] ?? 'http://127.0.0.1:3001';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEB_PORT');
  if (!/^https?:\/\//.test(target)) throw new Error('Invalid VITE_PROXY_TARGET');
  return {
    plugins: [react()],
    // Backend secrets are not exposed: browser code has no import.meta.env usage.
    envDir: root,
    server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/api': { target }, '/health': { target } } },
    preview: { host: '127.0.0.1', port, strictPort: true },
  };
});
