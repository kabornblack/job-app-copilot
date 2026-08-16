import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { acceptInvite, computeInviteStatus, getInviteByToken } from "../lib/invites";

const tokenParamSchema = z.object({ token: z.string().min(1) });

/**
 * ADR-0006: invite accept-flow routes. Any authenticated user can reach
 * these (no requireAdmin) - that's the point, this is how an invited
 * person previews and accepts their own invite. Split into a read-only
 * status GET and a mutating accept POST deliberately: an auto-accepting
 * GET would let email link-scanners/prefetchers silently burn the invite
 * before the real recipient ever opens it.
 */
export default async function inviteRoutes(fastify: FastifyInstance) {
  fastify.get("/invites/:token", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { token } = tokenParamSchema.parse(request.params);
    const invite = await getInviteByToken(token);
    const status = computeInviteStatus(invite);
    return {
      status,
      email: invite?.email ?? null,
      expiresAt: invite?.expiresAt ?? null,
    };
  });

  fastify.post("/invites/:token/accept", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { token } = tokenParamSchema.parse(request.params);
    const result = await acceptInvite(token, userId, request.user?.email);
    if (!result.ok) {
      const statusCode = result.reason === "not_found" ? 404 : 400;
      return reply.status(statusCode).send(result);
    }
    return result;
  });
}
