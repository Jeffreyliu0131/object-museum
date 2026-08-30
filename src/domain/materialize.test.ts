import { describe, expect, it } from "vitest";
import {
  confirmCandidate,
  createPendingCandidate,
  markCandidateUncertain,
  rejectCandidate,
  rewriteCandidate,
} from "./candidates";
import { createInitialEnvelope } from "./envelope";
import { materializePrivateExhibit } from "./materialize";
import {
  codePointLength,
  createSourceSpan,
  createTextSourceRevision,
} from "./provenance";
import type {
  DurableCandidate,
  ExhibitRecord,
  TextSourceRevision,
} from "./types";

function pendingFromSpan(
  source: TextSourceRevision,
  input: {
    id: string;
    category: "fuzzy_time" | "event" | "why_it_matters";
    start: number;
    end: number;
    supportStatus?: "exact" | "ambiguous";
  },
) {
  const span = createSourceSpan({
    source,
    start: input.start,
    end: input.end,
  });
  return createPendingCandidate({
    id: input.id,
    category: input.category,
    text: span.exactExcerpt,
    sourceSpan: span,
    supportStatus: input.supportStatus ?? "exact",
    candidateOrigin: "deterministic_rule",
    ruleId: `rule-${input.id}`,
    ruleVersion: "1",
    reasonCode: "test",
  });
}

async function recordWithCandidates(
  candidates: DurableCandidate[],
  source?: TextSourceRevision,
): Promise<ExhibitRecord> {
  const actualSource =
    source ??
    (await createTextSourceRevision({
      id: "source-materialize",
      text: "大约 1998 年搬家，因为这是妈妈留下的杯子",
    }));
  return {
    title: "蓝杯",
    objectName: "钴蓝釉杯",
    provenance: { contentOrigin: "local_narrator", fixtureId: null },
    narrator: { id: "narrator-1", label: "讲述者" },
    source: actualSource,
    candidates,
    image: null,
    audio: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("private exhibit materialization", () => {
  it("includes accepted candidates only and keeps testimony attributed", async () => {
    const source = await createTextSourceRevision({
      id: "source-materialize",
      text: "大约 1998 年搬家，因为这是妈妈留下的杯子",
    });
    const timeEnd = codePointLength("大约 1998 年");
    const eventStart = timeEnd;
    const whyStart = Array.from(source.text).indexOf("因");
    const time = confirmCandidate(
      pendingFromSpan(source, {
        id: "time",
        category: "fuzzy_time",
        start: 0,
        end: timeEnd,
      }),
    ).candidate;
    const eventPending = pendingFromSpan(source, {
      id: "event",
      category: "event",
      start: eventStart,
      end: eventStart + 2,
    });
    const why = markCandidateUncertain(
      pendingFromSpan(source, {
        id: "why",
        category: "why_it_matters",
        start: whyStart,
        end: codePointLength(source.text),
        supportStatus: "ambiguous",
      }),
    ).candidate;
    const rejected = rejectCandidate(
      pendingFromSpan(source, {
        id: "event-rejected",
        category: "event",
        start: eventStart,
        end: eventStart + 2,
      }),
    ).candidate;
    const envelope = createInitialEnvelope({
      recordId: "record-1",
      record: await recordWithCandidates(
        [time, eventPending, why, rejected],
        source,
      ),
    });

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;

    expect(result.exhibit.statements).toHaveLength(2);
    expect(result.exhibit.statements[0]).toMatchObject({
      candidateId: "time",
      text: "大约 1998 年",
      quoted: true,
    });
    expect(result.exhibit.statements[1]).toMatchObject({
      candidateId: "why",
      certainty: "uncertain",
      statementKind: "narrator_testimony",
      attribution: { id: "narrator-1", label: "讲述者" },
    });
  });

  it("labels a narrator rewrite and never quotes it as exact source", async () => {
    const source = await createTextSourceRevision({
      id: "source-rewrite",
      text: "搬家前妈妈给了我这个杯子",
    });
    const edited = rewriteCandidate(
      pendingFromSpan(source, {
        id: "event-edited",
        category: "event",
        start: 0,
        end: 3,
        supportStatus: "ambiguous",
      }),
      "讲述者记得是在搬家之前",
      "uncertain",
    ).candidate;
    const envelope = createInitialEnvelope({
      recordId: "record-rewrite",
      record: await recordWithCandidates([edited], source),
    });

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.exhibit.statements[0]).toMatchObject({
      authorship: "narrator_edited",
      quoted: false,
      source: { excerpt: "搬家前" },
    });
  });

  it("quarantines old accepted statements after a source edit", async () => {
    const oldSource = await createTextSourceRevision({
      id: "source-old",
      text: "大约 1998 年",
    });
    const accepted = confirmCandidate(
      pendingFromSpan(oldSource, {
        id: "old-time",
        category: "fuzzy_time",
        start: 0,
        end: codePointLength(oldSource.text),
      }),
    ).candidate;
    const newSource = await createTextSourceRevision({
      id: "source-new",
      text: "大约 1999 年",
    });
    const envelope = createInitialEnvelope({
      recordId: "record-edited-source",
      record: await recordWithCandidates([accepted], newSource),
    });

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.exhibit.statements).toEqual([]);
    expect(result.quarantined).toEqual([
      {
        candidateId: "old-time",
        reason: "source_revision_mismatch",
      },
    ]);
  });

  it("rejects materialization when the authoritative source bytes drift", async () => {
    const source = await createTextSourceRevision({
      id: "source-hash",
      text: "大约 1998 年",
    });
    const accepted = confirmCandidate(
      pendingFromSpan(source, {
        id: "hash-time",
        category: "fuzzy_time",
        start: 0,
        end: codePointLength(source.text),
      }),
    ).candidate;
    const driftedSource = { ...source, text: "大约 2001 年" };
    const envelope = {
      ...createInitialEnvelope({
        recordId: "record-hash",
        record: await recordWithCandidates([accepted], source),
      }),
      record: {
        ...(await recordWithCandidates([accepted], source)),
        source: driftedSource,
      },
    };

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("invalid_envelope");
    if (result.status !== "invalid_envelope") return;
    expect(result.issues[0]).toMatch(/stored source bytes/u);
  });

  it("quarantines a candidate whose span hash is tampered while the source remains valid", async () => {
    const source = await createTextSourceRevision({
      id: "source-span-hash",
      text: "大约 1998 年",
    });
    const accepted = confirmCandidate(
      pendingFromSpan(source, {
        id: "span-hash-time",
        category: "fuzzy_time",
        start: 0,
        end: codePointLength(source.text),
      }),
    ).candidate;
    if (accepted.reviewState !== "accepted") throw new Error("Expected accepted candidate");
    const tampered = {
      ...accepted,
      sourceSpan: { ...accepted.sourceSpan, sourceSha256: "0".repeat(64) },
    };
    const envelope = createInitialEnvelope({
      recordId: "record-span-hash",
      record: await recordWithCandidates([tampered], source),
    });

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.exhibit.statements).toEqual([]);
    expect(result.quarantined[0]).toEqual({
      candidateId: "span-hash-time",
      reason: "source_hash_mismatch",
    });
  });

  it("reports audio without a text equivalent as not accessibility complete", async () => {
    const source = await createTextSourceRevision({
      id: "source-audio",
      text: "这是讲述者提供的文字来源",
    });
    const record = await recordWithCandidates([], source);
    record.audio = {
      id: "audio-local-test",
      kind: "audio",
      storage: "local",
      mimeType: "audio/mpeg",
    };
    const envelope = createInitialEnvelope({
      recordId: "record-audio",
      record,
    });

    const result = await materializePrivateExhibit(envelope);
    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.exhibit.audioHasTextEquivalent).toBe(false);
    expect(result.exhibit.accessibilityComplete).toBe(false);
  });

  it("fails closed for a corrupt envelope", async () => {
    const result = await materializePrivateExhibit({ schemaVersion: 99 });
    expect(result.status).toBe("invalid_envelope");
  });
});
