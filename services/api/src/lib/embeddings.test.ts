import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildJobEmbeddingText,
  buildProfileEmbeddingText,
  EMBEDDING_DIMENSIONS,
  generateEmbeddings,
} from "./embeddings";

describe("embedding text builders", () => {
  it("builds profile text from summary, skills, and roles", () => {
    const text = buildProfileEmbeddingText({
      resumeSummary: "Full-stack engineer in Tallinn.",
      skills: ["TypeScript", "React"],
      targetRoles: ["Frontend Engineer"],
    });

    expect(text).toContain("Full-stack engineer in Tallinn.");
    expect(text).toContain("Skills: TypeScript, React");
    expect(text).toContain("Target roles: Frontend Engineer");
  });

  it("builds job text from title and truncated description", () => {
    const longDescription = "x".repeat(9000);
    const text = buildJobEmbeddingText({
      title: "Frontend Engineer",
      description: longDescription,
    });

    expect(text.startsWith("Frontend Engineer\n")).toBe(true);
    expect(text.length).toBeLessThan(9000);
  });
});

describe("generateEmbeddings failure contracts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws on OpenAI non-OK response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream boom", { status: 500 })),
    );

    await expect(generateEmbeddings(["hello"])).rejects.toThrow(
      /OpenAI embedding failed: 500/,
    );
  });

  it("throws when embedding vector has wrong dimensions", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [{ index: 0, embedding: [0.1, 0.2] }],
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(generateEmbeddings(["hello"])).rejects.toThrow(
      /invalid dimensions/,
    );
  });

  it("throws when embedding field is missing", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ index: 0 }] }), {
            status: 200,
          }),
      ),
    );

    await expect(generateEmbeddings(["hello"])).rejects.toThrow(
      /invalid dimensions/,
    );
  });

  it("never returns a silent null vector on success shape", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const embedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, i) => (i === 0 ? 0.5 : 0),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [{ index: 0, embedding }] }),
            { status: 200 },
          ),
      ),
    );

    const [vector] = await generateEmbeddings(["hello"]);
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.every((n) => typeof n === "number")).toBe(true);
  });
});
