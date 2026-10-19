import { defineConfig } from 'drizzle-kit';
import { loadEnvironment } from './src/config/env.js';
const env = loadEnvironment();
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.databaseUrl },
  strict: true,
});
