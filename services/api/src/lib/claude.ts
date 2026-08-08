import { captureProviderError } from "./sentry";

export interface ClaudeJobContext {
  title: string;
  company: string;
  location: string | null;
  remoteType: string | null;
  description: string | null;
  url: string;
  postedAt: string | null;
}

export interface ClaudeProfileContext {
  skills: string[];
  targetRoles: string[];
  locations: string[];
  remotePref: string;
  resumeSummary?: string;
}

export async function generateClaudeText(
  job: ClaudeJobContext,
  profile: ClaudeProfileContext,
  type: "cv" | "cover_letter",
) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new Error("CLAUDE_API_KEY is required for Claude generation");
  }
  const prompt =
    type === "cv"
      ? `Generate a concise CV/resume draft for the following job and profile.

Profile:
- Skills: ${profile.skills.join(", ")}
- Target roles: ${profile.targetRoles.join(", ")}
- Locations: ${profile.locations.join(", ")}
- Remote preference: ${profile.remotePref}
- Summary: ${profile.resumeSummary ?? "No summary provided."}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location ?? "N/A"}
- Remote: ${job.remoteType ?? "N/A"}
- URL: ${job.url}
- Posted: ${job.postedAt ?? "N/A"}
- Description: ${job.description ?? "No description provided."}

Please return a concise plain-text CV/resume only, using resume-style sections such as Summary, Skills, and Experience.`
      : `Generate a short ${type} draft for the following job and profile.

Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location ?? "N/A"}
- Remote: ${job.remoteType ?? "N/A"}
- URL: ${job.url}
- Posted: ${job.postedAt ?? "N/A"}
- Description: ${job.description ?? "No description provided."}

Profile:
- Skills: ${profile.skills.join(", ")}
- Target roles: ${profile.targetRoles.join(", ")}
- Locations: ${profile.locations.join(", ")}
- Remote preference: ${profile.remotePref}
- Summary: ${profile.resumeSummary ?? "No summary provided."}

Please return a concise plain-text ${type} draft only.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CLAUDE_API_KEY,
      "Anthropic-Version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 450,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Claude raw response text:", responseText);
    const error = new Error(
      `Claude generation failed: ${response.status} ${response.statusText} - ${responseText}`,
    );
    captureProviderError("claude", error, {
      status: response.status,
      operation: "generate",
    });
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error("Claude response text was not valid JSON:", responseText);
    captureProviderError("claude", error, {
      operation: "generate",
      reason: "invalid_json",
    });
    throw error;
  }

  const text =
    payload?.content?.[0]?.text ??
    payload?.response?.content?.[0]?.text ??
    payload?.response?.output?.[0]?.content?.[0]?.text;

  if (!text || typeof text !== "string") {
    const rawPayload = JSON.stringify(payload, null, 2);
    console.error("Claude raw response payload:", rawPayload);
    const error = new Error(
      `Claude API response did not include generated text. Raw payload: ${rawPayload}`,
    );
    captureProviderError("claude", error, { operation: "generate" });
    throw error;
  }

  return text.trim();
}
