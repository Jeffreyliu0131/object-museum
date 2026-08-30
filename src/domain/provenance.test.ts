import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceText,
  codePointLength,
  createSourceSpan,
  createTextSourceRevision,
  sha256Utf8,
  sliceByCodePoint,
  validateSourceSpan,
} from "./provenance";

describe("text provenance", () => {
  it("canonicalizes CRLF once and hashes the exact stored string", async () => {
    const revision = await createTextSourceRevision({
      id: "source-1",
      text: "第一行\r\nsecond e\u0301\rthird",
      createdAt: "2026-08-30T00:00:00.000Z",
    });

    expect(revision.text).toBe("第一行\nsecond e\u0301\rthird");
    expect(canonicalizeSourceText(revision.text)).toBe(revision.text);
    expect(revision.sha256).toBe(await sha256Utf8(revision.text));
  });

  it("uses Unicode code points for CJK, emoji and combining marks", async () => {
    const revision = await createTextSourceRevision({
      id: "source-unicode",
      text: "旧杯🙂e\u0301在上海",
    });
    const points = Array.from(revision.text);
    const start = points.indexOf("🙂");
    const end = points.indexOf("在");
    const span = createSourceSpan({ source: revision, start, end });

    expect(codePointLength(revision.text)).toBe(points.length);
    expect(span.exactExcerpt).toBe("🙂e\u0301");
    expect(sliceByCodePoint(revision.text, start, end)).toBe("🙂e\u0301");
    await expect(validateSourceSpan(revision, span)).resolves.toEqual({
      valid: true,
      excerpt: "🙂e\u0301",
    });
  });

  it("fails closed when source text drifts after hashing", async () => {
    const revision = await createTextSourceRevision({
      id: "source-drift",
      text: "大约 1998 年",
    });
    const span = createSourceSpan({
      source: revision,
      start: 0,
      end: codePointLength(revision.text),
    });
    const drifted = { ...revision, text: "大约 1999 年" };

    await expect(validateSourceSpan(drifted, span)).resolves.toEqual({
      valid: false,
      reason: "source_hash_mismatch",
    });
  });

  it("detects excerpt and range tampering", async () => {
    const revision = await createTextSourceRevision({
      id: "source-tamper",
      text: "在上海的厨房",
    });
    const span = createSourceSpan({ source: revision, start: 1, end: 3 });

    await expect(
      validateSourceSpan(revision, { ...span, exactExcerpt: "北京" }),
    ).resolves.toEqual({
      valid: false,
      reason: "source_excerpt_mismatch",
    });
    await expect(
      validateSourceSpan(revision, { ...span, end: 999 }),
    ).resolves.toEqual({
      valid: false,
      reason: "source_range_invalid",
    });
  });
});
