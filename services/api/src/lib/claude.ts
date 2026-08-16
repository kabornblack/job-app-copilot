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
 * Format instruction, distinct per document type. Previously both types
 * shared one closing line ("...using resume-style sections such as
 * Summary, Skills, and Experience"), which meant cover letters came out
 * resume-shaped: section headers, a redundant "Cover Letter" heading, and
 * a near-full restatement of work history instead of a narrative letter.
 * Only the FORMAT/shape instruction differs here - the two-source
 * priority rule (CV authoritative, profile gap-fills) is identical for
 * both types and lives in the caller, not in this function.
 */
function formatInstruction(type: "cv" | "cover_letter"): string {
  if (type === "cv") {
    return "Please return a concise plain-text CV/resume only, using resume-style sections such as Summary, Skills, and Experience.";
  }
  return `Write this as an actual cover letter, not a resume - follow this shape exactly:
- Plain letter paragraphs only. NO section headers of any kind (no "Summary", "Experience", "Skills"), and no document-type heading anywhere in the body (do not write "Cover Letter" as a heading).
- A standard salutation (e.g. "Dear Hiring Team,") and sign-off (e.g. "Sincerely, [name]").
- 3-4 short paragraphs total: (1) an opening naming the role and why this company specifically, drawing on something real from the job description below - not a generic statement; (2) one to two paragraphs making the case using ONE OR TWO of the candidate's most relevant real achievements from the sources above - not a recitation of the full work history; (3) a closing paragraph with genuine enthusiasm and a clear call to action.
- Target length: roughly 250-350 words total. This is a letter, not a resume - do not list skills, do not restate every job, do not use bullet points.`;
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

${formatInstruction(type)} Tailor emphasis and phrasing to the job above using only real information from the two sources - never fabricate experience, skills, or accomplishments beyond what's stated there.`;
  }

  return `Generate a concise ${docLabel} draft for the following job, using the candidate's real background below. Every fact (dates, employers, titles, achievements) must come from the candidate background section - do not invent or infer any factual detail not stated there.

Candidate background:
${structured}

${searchPrefsSection(profile)}

${jobSection(job)}

${formatInstruction(type)} Tailor emphasis and phrasing to the job above, but do not fabricate experience, skills, or accomplishments beyond what's listed in the candidate background.`;
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
      // 450 was sized for the old resumeSummary-only prompt and never
      // revisited when the Phase 7 Stage 3 / ADR-0005 redesign made both
      // the input AND expected output meaningfully larger - confirmed via
      // a real generation call returning stop_reason: "max_tokens" (see
      // git history / investigation notes for this change). 4096 is a
      // generous ceiling for a full tailored CV/cover letter from someone
      // with several work-experience entries, while staying well under
      // the point where non-streaming requests risk HTTP timeouts.
      max_tokens: 4096,
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

  // Transparency over silent failure (same pattern as search_runs.stats.
  // sourceErrors elsewhere in this codebase): stop_reason "max_tokens"
  // means the response was cut off mid-generation, not that it finished
  // naturally ("end_turn"). Log it so truncation is visible instead of
  // only showing up later as a cut-off document with no diagnostic trail.
  const stopReason =
    payload?.stop_reason ?? payload?.response?.stop_reason ?? null;
  if (stopReason === "max_tokens") {
    console.warn(
      JSON.stringify({
        event: "claude.generation_truncated",
        type,
        stopReason,
      }),
    );
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
