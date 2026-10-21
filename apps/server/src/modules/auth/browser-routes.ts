import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  ClientConfigSchema,
  DemoProfileSchema,
  DemoSessionSchema,
  ErrorResponseSchema,
  type DemoProfile,
} from "@samokettik/contracts";
import type { Environment } from "../../config/env.js";
import type { BusinessConfig } from "../../config/business.js";
import { issueDemoSession } from "./session.js";
import { DEMO_BROWSER_PROFILES } from "../../config/demo-identities.js";

export function registerBrowserRoutes(
  app: FastifyInstance,
  env: Environment,
  config: BusinessConfig,
) {
  app.get(
    "/api/v1/client-config",
    { schema: { response: { 200: ClientConfigSchema } } },
    () => ({
      name: config.productName,
      city: config.city,
      timezone: config.timezone,
      currency: config.currency,
      rideRateMinorPerMinute: config.rideRateMinorPerMinute,
      pauseRateMinorPerMinute: config.pauseRateMinorPerMinute,
      reservationDurationSeconds: config.reservationDurationSeconds,
      minRentalBatteryBp: config.minRentalBatteryBp,
      demoBrowserEnabled: env.demoBrowserEnabled && env.demoAuthEnabled,
      profiles:
        env.demoBrowserEnabled && env.demoAuthEnabled
          ? DEMO_BROWSER_PROFILES
          : [],
      tileUrl: env.mapTileUrl,
    }),
  );
  app.post<{ Body: { profile: DemoProfile } }>(
    "/api/v1/demo/session",
    {
      schema: {
        body: Type.Object(
          { profile: DemoProfileSchema },
          { additionalProperties: false },
        ),
        response: {
          200: DemoSessionSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          503: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (!env.demoBrowserEnabled || !env.demoAuthEnabled)
        return reply.status(503).send({
          code: "DEMO_DISABLED",
          message: "Вход в демо-профили отключён",
          requestId: request.id,
        });
      if (
        !request.headers.origin ||
        !env.wsAllowedOrigins.includes(request.headers.origin)
      )
        return reply.status(403).send({
          code: "ORIGIN_REJECTED",
          message: "Вход с этого адреса запрещён",
          requestId: request.id,
        });
      return issueDemoSession(env, request.body.profile);
    },
  );
}
