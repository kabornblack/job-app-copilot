import { z } from "zod";
import type { ClaudeJobContext, ClaudeProfileContext } from "./claude";
import { captureProviderError } from "./sentry";

export const CLAUDE_SCORE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_SCORE_MODEL_VERSION = "claude-sonnet-4-6-v1";

const scoreToolName = "score_job_match";

const scoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  explanation: z.string().min(1).max(2000),
});

export type ClaudeScoreResult = z.infer<typeof scoreResultSchema>;

export function parseClaudeScoreToolInput(
  input: unknown,
): ClaudeScoreResult {
  return scoreResultSchema.parse(input);
}

export async function scoreJobMatchWithClaude(
  job: ClaudeJobContext,
  profile: ClaudeProfileContext,
): Promise<ClaudeScoreResult> {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new Error("CLAUDE_API_KEY is required for Claude scoring");
  }

  const prompt = `Score how well this candidate profile fits the job posting.

Use judgment, not keyword counting. Consider:
- skill relevance (transferable skills count; missing core stack hurts)
- seniority / level match
- role and career trajectory fit
- location / remote realism vs preference
- clear deal-breakers

Scoring scale (integer 0-100):
- 80-100 strong fit
- 60-79 solid / apply with minor gaps
- 40-59 partial fit
- 20-39 weak
- 0-19 poor / mismatch

Keep explanation to 2-4 short sentences (under 500 characters).
Return the score via the ${scoreToolName} tool only.

Profile:
- Skills: ${profile.skills.join(", ") || "None listed"}
- Target roles: ${profile.targetRoles.join(", ") || "None listed"}
- Locations: ${profile.locations.join(", ") || "None listed"}
- Remote preference: ${profile.remotePref}
- Summary: ${profile.resumeSummary ?? "No summary provided."}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location ?? "N/A"}
- Remote: ${job.remoteType ?? "N/A"}
- URL: ${job.url}
- Posted: ${job.postedAt ?? "N/A"}
- Description: ${job.description ?? "No description provided."}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CLAUDE_API_KEY,
      "Anthropic-Version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_SCORE_MODEL,
      max_tokens: 400,
      tools: [
        {
          name: scoreToolName,
          description:
            "Record the job-profile fit score and a short explanation.",
          input_schema: {
            type: "object",
            properties: {
              score: {
                type: "integer",
                minimum: 0,
                maximum: 100,
                description: "Fit score from 0 to 100",
              },
              explanation: {
                type: "string",
                description:
                  "2-4 sentences on why this score, covering fit and gaps",
              },
            },
            required: ["score", "explanation"],
          },
        },
      ],
      tool_choice: { type: "tool", name: scoreToolName },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Claude scoring raw response text:", responseText);
    const error = new Error(
      `Claude scoring failed: ${response.status} ${response.statusText} - ${responseText}`,
    );
    captureProviderError("claude", error, {
      status: response.status,
      operation: "score",
    });
    throw error;
  }

  let payload: {
    content?: Array<{ type?: string; name?: string; input?: unknown }>;
  };
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error(
      "Claude scoring response text was not valid JSON:",
      responseText,
    );
    captureProviderError("claude", error, {
      operation: "score",
      reason: "invalid_json",
    });
    throw error;
  }

  const toolBlock = payload.content?.find(
    (block) => block.type === "tool_use" && block.name === scoreToolName,
  );

  if (!toolBlock) {
    const rawPayload = JSON.stringify(payload, null, 2);
    console.error("Claude scoring raw response payload:", rawPayload);
    const error = new Error(
      `Claude scoring response did not include ${scoreToolName} tool use. Raw payload: ${rawPayload}`,
    );
    captureProviderError("claude", error, { operation: "score" });
    throw error;
  }

  try {
    return parseClaudeScoreToolInput(toolBlock.input);
  } catch (error) {
    captureProviderError("claude", error, {
      operation: "score",
      reason: "invalid_tool_input",
    });
    throw error;
  }
}
