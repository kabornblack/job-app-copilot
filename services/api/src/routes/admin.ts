import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isUserAdmin, requireAdmin } from "../lib/auth";
import { listUsersForAdmin } from "../lib/admin";
import { createTrustedInvite, listInvites, revokeInvite } from "../lib/invites";

const idParamSchema = z.object({ id: z.string().uuid() });
const createInviteBodySchema = z.object({
  email: z.string().trim().email(),
});

/**
 * ADR-0006: admin routes. requireAdmin (lib/auth.ts) is applied per-route
 * via the Fastify route option { onRequest: requireAdmin } - deliberately
 * NOT a plugin-wide hook, because GET /admin/me must be callable by any
 * authenticated user (it's how a non-admin finds out they're not one, and
 * what gates the nav link in the frontend).
 */
export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.get("/admin/me", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const isAdmin = await isUserAdmin(userId);
    return { isAdmin };
  });

  fastify.get(
    "/admin/users",
    { onRequest: requireAdmin },
    async () => {
      const users = await listUsersForAdmin();
      return { items: users };
    },
  );

  fastify.get(
    "/admin/invites",
    { onRequest: requireAdmin },
    async () => {
      const invites = await listInvites();
      return { items: invites };
    },
  );

  fastify.post(
    "/admin/invites",
    { onRequest: requireAdmin },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const body = createInviteBodySchema.parse(request.body);
      const invite = await createTrustedInvite(body.email, userId);
      return reply.status(201).send(invite);
    },
  );

  fastify.post(
    "/admin/invites/:id/revoke",
    { onRequest: requireAdmin },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const invite = await revokeInvite(id);
      if (!invite) {
        return reply
          .status(404)
          .send({ error: "Invite not found, already accepted, or already revoked" });
      }
      return invite;
    },
  );
}
