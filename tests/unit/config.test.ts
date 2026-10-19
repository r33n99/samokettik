import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../apps/server/src/config/env.js';
import { loadBusinessConfig, parseBusinessConfig } from '../../apps/server/src/config/business.js';

describe('configuration boundaries', () => {
  it('rejects missing/invalid database URL without disclosing its value', () => {
    expect(() => parseEnvironment({})).toThrow('Invalid environment');
    expect(() => parseEnvironment({ DATABASE_URL: 'https://secret-password@example.test/db' })).toThrow('DATABASE_URL must name');
    try { parseEnvironment({ DATABASE_URL: 'not-a-url-secret' }); }
    catch (error) { expect(String(error)).not.toContain('not-a-url-secret'); }
  });
  it('rejects invalid port and non-boolean seed flag', () => {
    const values = { DATABASE_URL: 'postgresql://user:password@localhost/test' };
    expect(() => parseEnvironment({ ...values, API_PORT: '0' })).toThrow();
    expect(() => parseEnvironment({ ...values, DEMO_SEED_ENABLED: 'yes' })).toThrow();
    expect(parseEnvironment(values).demoSeedEnabled).toBe(false);
  });
  it('rejects warning after expiry and unknown business config fields', () => {
    const config = loadBusinessConfig();
    expect(() => parseBusinessConfig({ ...config, reservationWarningBeforeSeconds: config.reservationDurationSeconds })).toThrow('warning');
    expect(() => parseBusinessConfig({ ...config, unknownSetting: true })).toThrow();
    expect(() => parseBusinessConfig({ ...config, minRentalBatteryBp: 10001 })).toThrow();
  });
  it('demo identity is disabled by default and requires two different sufficiently long secrets', () => {
    const base = { DATABASE_URL: 'postgresql://user:password@localhost/test' };
    expect(parseEnvironment(base).demoAuthEnabled).toBe(false);
    expect(() => parseEnvironment({ ...base, DEMO_AUTH_ENABLED: 'true' })).toThrow('two different secret tokens');
    expect(() => parseEnvironment({ ...base, DEMO_AUTH_ENABLED: 'true', DEMO_USER_RU_TOKEN: 'x'.repeat(64), DEMO_USER_KY_TOKEN: 'x'.repeat(64) })).toThrow();
    expect(() => parseEnvironment({ ...base, BOOKING_JOB_POLL_MS: '10000', BOOKING_WORKER_STALE_MS: '1000' })).toThrow('two polling intervals');
  });
});
