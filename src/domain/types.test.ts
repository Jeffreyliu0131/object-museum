import { describe, expect, it } from "vitest";
import { createTextSourceRevision } from "./provenance";
import { ExhibitRecordSchema, MediaReferenceSchema } from "./types";

describe("runtime media and provenance schema", () => {
  it("rejects persisted remote or unregistered fixture media references", () => {
    expect(() => MediaReferenceSchema.parse({
      id: "https://example.com/private.jpg",
      kind: "image",
      storage: "fixture",
      mimeType: "image/jpeg",
    })).toThrow(/allowlisted/u);
    expect(() => MediaReferenceSchema.parse({
      id: "//example.com/private.jpg",
      kind: "image",
      storage: "local",
      mimeType: "image/jpeg",
    })).toThrow(/opaque local key/u);
  });

  it("accepts only the exact fixture path/kind/MIME policy", () => {
    expect(MediaReferenceSchema.parse({
      id: "/fixtures/cobalt-mug.jpg",
      kind: "image",
      storage: "fixture",
      mimeType: "image/jpeg",
    })).toMatchObject({ id: "/fixtures/cobalt-mug.jpg" });
    expect(() => MediaReferenceSchema.parse({
      id: "/fixtures/cobalt-mug.jpg",
      kind: "audio",
      storage: "fixture",
      mimeType: "audio/mpeg",
    })).toThrow(/kind\/MIME/u);
  });

  it("rejects an audio text equivalent that drifts from its source revision", async () => {
    const source = await createTextSourceRevision({ id: "source-a", text: "Exact visible transcript" });
    expect(() => ExhibitRecordSchema.parse({
      title: "Local record",
      objectName: "Object",
      provenance: { contentOrigin: "local_narrator", fixtureId: null },
      narrator: { id: "narrator", label: "Narrator" },
      source,
      candidates: [],
      image: null,
      audio: {
        id: "record:local-audio",
        kind: "audio",
        storage: "local",
        mimeType: "audio/mpeg",
        textEquivalent: "Old transcript",
        textEquivalentSourceRevisionId: source.id,
        textEquivalentSourceSha256: source.sha256,
      },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    })).toThrow(/bind exactly/u);
  });
});
