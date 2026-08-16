import { captureProviderError } from "./sentry";
import { serializeProfileKnowledge, type ProfileKnowledgeBundle } from "./profile-serialization";

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

function jobSection(job: ClaudeJobContext): string {
  return `Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location ?? "N/A"}
- Remote: ${job.remoteType ?? "N/A"}
- URL: ${job.url}
- Posted: ${job.postedAt ?? "N/A"}
- Description: ${job.description ?? "No description provided."}`;
}

function searchPrefsSection(profile: ClaudeProfileContext): string {
  return `Target roles: ${profile.targetRoles.join(", ")}
Locations: ${profile.locations.join(", ")}
Remote preference: ${profile.remotePref}`;
}

/**
 * Phase 7 Stage 3 / ADR-0005: builds the generation prompt. Two paths,
 * chosen automatically by whether the user has an uploaded CV - never a
 * per-job toggle:
 *
 * - CV present: the uploaded CV's extracted text is the AUTHORITATIVE fact
 *   source; the structured profile-knowledge serialization is secondary,
 *   used only to fill genuine gaps the CV doesn't cover. Explicit priority
 *   instruction below - never let profile data override/contradict the CV.
 * - CV absent (original ADR-0004 Stage 3 scope): the structured
 *   serialization IS the fact source. resumeSummary is demoted to a
 *   framing/tone input only (see profile-serialization.ts), not a fact.
 */
export function buildPrompt(
  job: ClaudeJobContext,
  profile: ClaudeProfileContext,
  type: "cv" | "cover_letter",
  knowledge: ProfileKnowledgeBundle,
  cvText: string | null,
): string {
  const docLabel = type === "cv" ? "CV/resume" : "cover letter";
  const structured = serializeProfileKnowledge(knowledge, profile.resumeSummary ?? null);

  if (cvText) {
    return `Generate a concise ${docLabel} draft for the following job.

You have two sources of information about the candidate:

1. UPLOADED CV (authoritative) - the candidate's actual, existing CV. Every
   factual detail here (dates, job titles, employers, specific
   accomplishments) is ground truth. Never contradict, alter, or override
   anything stated in this CV text.

2. PROFILE DATA (gap-filling only) - structured details the candidate has
   entered separately. Use this ONLY to fill in genuine gaps the uploaded
   CV does not cover (e.g. a certification or skill mentioned in profile
   data but absent from the CV). If profile data conflicts with the
   uploaded CV in any way, the uploaded CV always wins - ignore the
   conflicting profile data entirely.

=== UPLOADED CV (authoritative) ===
${cvText}

=== PROFILE DATA (gap-filling only) ===
${structured}

${searchPrefsSection(profile)}

${jobSection(job)}

Please return a concise plain-text ${docLabel} only, using resume-style sections such as Summary, Skills, and Experience. Tailor emphasis and phrasing to the job above using only real information from the two sources - never fabricate experience, skills, or accomplishments beyond what's stated there.`;
  }

  return `Generate a concise ${docLabel} draft for the following job, using the candidate's real background below. Every fact (dates, employers, titles, achievements) must come from the candidate background section - do not invent or infer any factual detail not stated there.

Candidate background:
${structured}

${searchPrefsSection(profile)}

${jobSection(job)}

Please return a concise plain-text ${docLabel} only, using resume-style sections such as Summary, Skills, and Experience. Tailor emphasis and phrasing to the job above, but do not fabricate experience, skills, or accomplishments beyond what's listed in the candidate background.`;
}

export async function generateClaudeText(
  job: ClaudeJobContext,
  profile: ClaudeProfileContext,
  type: "cv" | "cover_letter",
  knowledge: ProfileKnowledgeBundle,
  cvText: string | null,
) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new Error("CLAUDE_API_KEY is required for Claude generation");
  }
  const prompt = buildPrompt(job, profile, type, knowledge, cvText);

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
