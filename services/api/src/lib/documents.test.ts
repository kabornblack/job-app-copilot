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
});
