import {
  SourceSpanSchema,
  TextSourceRevisionSchema,
  type SourceSpan,
  type TextSourceRevision,
} from "./types";

export type SourceSpanFailureReason =
  | "source_revision_mismatch"
  | "source_hash_mismatch"
  | "source_length_mismatch"
  | "source_range_invalid"
  | "source_excerpt_mismatch";

export type SourceSpanValidation =
  | {
      valid: true;
      excerpt: string;
    }
  | {
      valid: false;
      reason: SourceSpanFailureReason;
    };

export function canonicalizeSourceText(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

export function codePointLength(input: string): number {
  return Array.from(input).length;
}

export function sliceByCodePoint(
  input: string,
  start: number,
  end: number,
): string {
  return Array.from(input).slice(start, end).join("");
}

export function utf16IndexToCodePointIndex(
  input: string,
  utf16Index: number,
): number {
  return Array.from(input.slice(0, utf16Index)).length;
}

export async function sha256Utf8(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createTextSourceRevision(input: {
  id: string;
  text: string;
  createdAt?: string;
}): Promise<TextSourceRevision> {
  const text = canonicalizeSourceText(input.text);
  return TextSourceRevisionSchema.parse({
    id: input.id,
    text,
    sha256: await sha256Utf8(text),
    codePointLength: codePointLength(text),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createSourceSpan(input: {
  source: TextSourceRevision;
  start: number;
  end: number;
}): SourceSpan {
  const exactExcerpt = sliceByCodePoint(
    input.source.text,
    input.start,
    input.end,
  );

  return SourceSpanSchema.parse({
    sourceRevisionId: input.source.id,
    sourceSha256: input.source.sha256,
    start: input.start,
    end: input.end,
    exactExcerpt,
  });
}

export async function validateSourceSpan(
  source: TextSourceRevision,
  span: SourceSpan,
): Promise<SourceSpanValidation> {
  if (span.sourceRevisionId !== source.id) {
    return { valid: false, reason: "source_revision_mismatch" };
  }

  const currentHash = await sha256Utf8(source.text);
  if (currentHash !== source.sha256 || span.sourceSha256 !== source.sha256) {
    return { valid: false, reason: "source_hash_mismatch" };
  }

  const currentLength = codePointLength(source.text);
  if (currentLength !== source.codePointLength) {
    return { valid: false, reason: "source_length_mismatch" };
  }

  if (
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end <= span.start ||
    span.end > currentLength
  ) {
    return { valid: false, reason: "source_range_invalid" };
  }

  const excerpt = sliceByCodePoint(source.text, span.start, span.end);
  if (excerpt !== span.exactExcerpt) {
    return { valid: false, reason: "source_excerpt_mismatch" };
  }

  return { valid: true, excerpt };
}
