import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../apps/server/src/config/env.js";
import {
  issueDemoSession,
  verifyDemoSession,
} from "../../apps/server/src/modules/auth/session.js";
import { demoUserId } from "../../apps/server/src/modules/auth/demo.js";
const env = parseEnvironment({
  DATABASE_URL: "postgresql://localhost/test",
  DEMO_AUTH_ENABLED: "true",
  DEMO_BROWSER_ENABLED: "true",
  DEMO_USER_RU_TOKEN: "r".repeat(64),
  DEMO_USER_KY_TOKEN: "k".repeat(64),
  DEMO_SESSION_SECRET: "s".repeat(64),
});
describe("explicit local demo browser identity", () => {
  it("issues separate expiring profiles without exposing persistent bearer secrets", () => {
    const time = Date.now(),
      ru = issueDemoSession(env, "ru", time),
      ky = issueDemoSession(env, "ky", time);
    expect(verifyDemoSession(env, ru.token, time)).toBe("ru");
    expect(verifyDemoSession(env, ky.token, time)).toBe("ky");
    expect(demoUserId(env, `Bearer ${ru.token}`)).toBe(
      "20000000-0000-4000-8000-000000000001",
    );
    expect(ru.token).not.toContain(env.demoRuToken);
    expect(ru.token).not.toContain(env.demoSessionSecret);
    expect(
      verifyDemoSession(env, ru.token, Date.parse(ru.expiresAt)),
    ).toBeNull();
  });
  it("rejects forged identity, signature, disabled mode and a changed signing key", () => {
    const token = issueDemoSession(env, "ru").token;
    expect(verifyDemoSession(env, token.replace(".ru.", ".ky."))).toBeNull();
    expect(verifyDemoSession(env, token.slice(0, -1))).toBeNull();
    expect(
      verifyDemoSession({ ...env, demoBrowserEnabled: false }, token),
    ).toBeNull();
    expect(
      verifyDemoSession(
        { ...env, demoSessionSecret: "different".repeat(8) },
        token,
      ),
    ).toBeNull();
  });
});
