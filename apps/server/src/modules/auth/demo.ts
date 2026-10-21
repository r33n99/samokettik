import { createHash, timingSafeEqual } from "node:crypto";
import type { Environment } from "../../config/env.js";
import { DEMO_USER_IDS } from "../../config/demo-identities.js";
import { verifyDemoSession } from "./session.js";
const digest = (value: string) => createHash("sha256").update(value).digest();

// Local demo adapter only; replaces neither password login nor Google OIDC.
export function demoUserId(
  env: Environment,
  authorization: string | undefined,
): string | null {
  if (
    !env.demoAuthEnabled ||
    !authorization?.startsWith("Bearer ") ||
    authorization.length > 1024
  )
    return null;
  const session = verifyDemoSession(env, authorization.slice(7));
  if (session) return DEMO_USER_IDS[session];
  const received = digest(authorization.slice(7));
  const ru = timingSafeEqual(received, digest(env.demoRuToken));
  const ky = timingSafeEqual(received, digest(env.demoKyToken));
  return ru ? DEMO_USER_IDS.ru : ky ? DEMO_USER_IDS.ky : null;
}
