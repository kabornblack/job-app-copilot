export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export function buildProfileEmbeddingText(profile: {
  skills: string[];
  targetRoles: string[];
  resumeSummary?: string | null;
}): string {
  const parts = [
    profile.resumeSummary?.trim(),
    profile.skills.length ? `Skills: ${profile.skills.join(", ")}` : null,
    profile.targetRoles.length
      ? `Target roles: ${profile.targetRoles.join(", ")}`
      : null,
  ].filter(Boolean);

  return parts.join("\n");
}

export function buildJobEmbeddingText(job: {
  title: string;
  description?: string | null;
}): string {
  const description = job.description?.trim() ?? "";
  // Keep well under the model context limit while preserving signal.
  const truncated =
    description.length > 8000 ? description.slice(0, 8000) : description;
  return [job.title.trim(), truncated].filter(Boolean).join("\n");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embedding generation");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("OpenAI embeddings raw response text:", responseText);
    throw new Error(
      `OpenAI embedding failed: ${response.status} ${response.statusText} - ${responseText}`,
    );
  }

  let payload: {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error(
      "OpenAI embeddings response text was not valid JSON:",
      responseText,
    );
    throw error;
  }

  const rows = payload.data ?? [];
  if (rows.length !== texts.length) {
    throw new Error(
      `OpenAI embedding count mismatch: expected ${texts.length}, got ${rows.length}`,
    );
  }

  const ordered = [...rows].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );

  return ordered.map((row, index) => {
    const embedding = row.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `OpenAI embedding at index ${index} has invalid dimensions: ${embedding?.length ?? 0}`,
      );
    }
    return embedding;
  });
}
