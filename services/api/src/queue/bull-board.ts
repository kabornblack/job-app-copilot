import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPipelineQueue } from "./queues";

const BOARD_BASE_PATH = "/admin/queues";

function isLoopback(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

function parseBasicAuth(
  header: string | undefined,
): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }
    return {
      user: decoded.slice(0, separator),
      pass: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

/**
 * Mount Bull Board at /admin/queues when BULL_BOARD_USER + BULL_BOARD_PASSWORD
 * are set. Rejects non-loopback clients even with valid credentials.
 */
export async function registerBullBoard(
  server: FastifyInstance,
): Promise<boolean> {
  const user = process.env.BULL_BOARD_USER?.trim();
  const password = process.env.BULL_BOARD_PASSWORD?.trim();

  if (!user || !password) {
    server.log.info(
      "Bull Board disabled (set BULL_BOARD_USER and BULL_BOARD_PASSWORD to enable)",
    );
    return false;
  }

  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BOARD_BASE_PATH);

  createBullBoard({
    queues: [new BullMQAdapter(getPipelineQueue())],
    serverAdapter,
  });

  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith(BOARD_BASE_PATH)) {
      return;
    }

    if (!isLoopback(request.ip)) {
      return reply.status(403).send({
        error: "Bull Board is only reachable from localhost",
      });
    }

    const creds = parseBasicAuth(request.headers.authorization);
    if (!creds || creds.user !== user || creds.pass !== password) {
      reply.header("WWW-Authenticate", 'Basic realm="Bull Board"');
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  await server.register(serverAdapter.registerPlugin(), {
    prefix: BOARD_BASE_PATH,
    basePath: BOARD_BASE_PATH,
  });

  server.log.info(
    `Bull Board enabled at http://127.0.0.1:3001${BOARD_BASE_PATH} (localhost + basic auth)`,
  );
  return true;
}

/** Exported for tests / proofs — not used at runtime beyond register. */
export function assertBoardAccess(
  request: Pick<FastifyRequest, "ip" | "headers">,
  reply: FastifyReply,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  if (!isLoopback(request.ip)) {
    void reply.status(403).send({ error: "localhost only" });
    return false;
  }
  const creds = parseBasicAuth(request.headers.authorization);
  if (
    !creds ||
    creds.user !== expectedUser ||
    creds.pass !== expectedPassword
  ) {
    reply.header("WWW-Authenticate", 'Basic realm="Bull Board"');
    void reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}
