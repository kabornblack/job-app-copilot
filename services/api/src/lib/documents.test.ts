import { describe, expect, it } from "vitest";
import {
  plainTextToTipTapJson,
  tipTapJsonToPlainText,
} from "./documents";

describe("document TipTap conversion", () => {
  it("seeds headings, paragraphs, and bullets from plain text", () => {
    const doc = plainTextToTipTapJson(`# Title

## Summary

Hello **world**

- One
- Two
`);

    expect(doc.type).toBe("doc");
    expect(doc.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    expect(doc.content?.[1]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(doc.content?.some((block) => block.type === "bulletList")).toBe(
      true,
    );
  });

  it("round-trips plain text through TipTap JSON", () => {
    const original = "## Skills\n\nReact and TypeScript\n\n- Built UI\n";
    const json = plainTextToTipTapJson(original);
    const plain = tipTapJsonToPlainText(json);
    expect(plain).toContain("## Skills");
    expect(plain).toContain("React and TypeScript");
    expect(plain).toContain("- Built UI");
  });

  it("returns an empty doc for empty / whitespace-only input", () => {
    expect(plainTextToTipTapJson("")).toEqual({ type: "doc", content: [] });
    expect(plainTextToTipTapJson("   \n\t\n  ")).toEqual({
      type: "doc",
      content: [],
    });
  });

  it("seeds a paragraph when there are no headings", () => {
    const doc = plainTextToTipTapJson("Just a plain sentence.");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]).toMatchObject({ type: "paragraph" });
  });

  it("seeds only a bullet list when content is bullets", () => {
    const doc = plainTextToTipTapJson("- One\n- Two\n");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.type).toBe("bulletList");
  });

  it("handles a very long paragraph without dropping content", () => {
    const long = "a".repeat(12_000);
    const doc = plainTextToTipTapJson(long);
    const plain = tipTapJsonToPlainText(doc);
    expect(plain.length).toBeGreaterThanOrEqual(12_000);
  });

  it("mixed # / ## / bullets produce heading + list nodes", () => {
    const doc = plainTextToTipTapJson(`# Title
## Section
- Item A
- Item B
`);
    const types = doc.content?.map((b) => b.type) ?? [];
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(doc.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    expect(doc.content?.[1]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
  });
});
