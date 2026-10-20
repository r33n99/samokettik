import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const token = process.env.DEMO_USER_RU_TOKEN;
if (process.env.DEMO_AUTH_ENABLED !== 'true' || !token || token.startsWith('replace-')) throw new Error('Enable local demo auth first');
const response = await fetch(`http://127.0.0.1:${process.env.WEB_PORT ?? '5173'}/api/v1/mailbox`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error(`Mailbox HTTP ${response.status}`);
console.log(JSON.stringify(await response.json(), null, 2));
