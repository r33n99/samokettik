import { createHmac, timingSafeEqual } from "node:crypto";
import type { DemoProfile, DemoSession } from "@samokettik/contracts";
import type { Environment } from "../../config/env.js";
const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");
export function issueDemoSession(
  env: Environment,
  profile: DemoProfile,
  time = Date.now(),
): DemoSession {
  if (
    !env.demoAuthEnabled ||
    !env.demoBrowserEnabled ||
    env.demoSessionSecret.length < 32
  )
    throw new Error("Demo sessions disabled");
  const expires = Math.floor(time / 1000) + env.demoSessionSeconds,
    payload = `demo.v1.${profile}.${expires}`;
  return {
    profile,
    token: `${payload}.${sign(env.demoSessionSecret, payload)}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}
export function verifyDemoSession(
  env: Environment,
  token: string,
  time = Date.now(),
): DemoProfile | null {
  if (
    !env.demoAuthEnabled ||
    !env.demoBrowserEnabled ||
    env.demoSessionSecret.length < 32
  )
    return null;
  const match = /^demo\.v1\.(ru|ky)\.([0-9]{10,12})\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  );
  if (!match) return null;
  const profile = match[1],
    expires = Number(match[2]);
  if (
    (profile !== "ru" && profile !== "ky") ||
    expires <= Math.floor(time / 1000) ||
    expires > Math.floor(time / 1000) + env.demoSessionSeconds
  )
    return null;
  const received = Buffer.from(match[3] ?? ""),
    expected = Buffer.from(
      sign(env.demoSessionSecret, token.slice(0, token.lastIndexOf("."))),
    );
  return received.length === expected.length &&
    timingSafeEqual(received, expected)
    ? profile
    : null;
}
