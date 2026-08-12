import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./error-message";

describe("extractErrorMessage", () => {
  it("renders a Zod formErrors-only body readably (the reported Education bug)", () => {
    // Exact payload reported for Education: End Month blank, End Year filled.
    const body = JSON.stringify({
      error: {
        formErrors: [
          "endMonth and endYear must both be set or both be omitted",
        ],
        fieldErrors: {},
      },
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      "endMonth and endYear must both be set or both be omitted",
    );
  });

  it("never renders the literal string '[object Object]' for the reported bug's payload", () => {
    const body = JSON.stringify({
      error: {
        formErrors: [
          "endMonth and endYear must both be set or both be omitted",
        ],
        fieldErrors: {},
      },
    });
    expect(extractErrorMessage(body, "fallback")).not.toContain(
      "[object Object]",
    );
  });

  it("joins multiple formErrors — Certifications' issue + expiration pairs both invalid at once", () => {
    // Real shape confirmed by empirically running the actual zod refine
    // chain from certificationCreateSchema (two chained .refine() calls,
    // both violated simultaneously): both messages land in formErrors.
    const body = JSON.stringify({
      error: {
        formErrors: [
          "issueMonth and issueYear must both be set or both be omitted",
          "expirationMonth and expirationYear must both be set or both be omitted",
        ],
        fieldErrors: {},
      },
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      "issueMonth and issueYear must both be set or both be omitted; " +
        "expirationMonth and expirationYear must both be set or both be omitted",
    );
  });

  it("renders Achievements' single both-or-neither refine the same way", () => {
    const body = JSON.stringify({
      error: {
        formErrors: ["month and year must both be set or both be omitted"],
        fieldErrors: {},
      },
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      "month and year must both be set or both be omitted",
    );
  });

  it("renders fieldErrors (per-field zod issues) with the field name attached", () => {
    const body = JSON.stringify({
      error: {
        formErrors: [],
        fieldErrors: { name: ["String must contain at least 1 character(s)"] },
      },
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      "name: String must contain at least 1 character(s)",
    );
  });

  it("combines formErrors and fieldErrors when both are present", () => {
    const body = JSON.stringify({
      error: {
        formErrors: ["Cross-field problem"],
        fieldErrors: { title: ["Required"] },
      },
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      "Cross-field problem; title: Required",
    );
  });

  it("passes through a plain string error unchanged (e.g. duplicate-skill 400s)", () => {
    const body = JSON.stringify({
      error: 'You already have a skill named "React".',
    });
    expect(extractErrorMessage(body, "fallback")).toBe(
      'You already have a skill named "React".',
    );
  });

  it("falls back for an error shape it doesn't recognize, instead of stringifying it raw", () => {
    const body = JSON.stringify({ error: { somethingUnexpected: true } });
    expect(extractErrorMessage(body, "fallback")).toBe("fallback");
  });

  it("returns a short non-JSON body as-is", () => {
    expect(extractErrorMessage("Unauthorized", "fallback")).toBe(
      "Unauthorized",
    );
  });

  it("falls back for a long non-JSON body (e.g. an HTML error page)", () => {
    const html = `<html><body>${"x".repeat(400)}</body></html>`;
    expect(extractErrorMessage(html, "fallback")).toBe("fallback");
  });

  it("falls back for an empty body", () => {
    expect(extractErrorMessage("", "fallback")).toBe("fallback");
  });
});
