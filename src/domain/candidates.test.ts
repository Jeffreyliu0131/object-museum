import { describe, expect, it } from "vitest";
import {
  CandidateTransitionError,
  confirmCandidate,
  createPendingCandidate,
  createUserSelectedCandidate,
  markCandidateUncertain,
  rejectCandidate,
  reopenCandidate,
  rewriteCandidate,
  undoCandidateAction,
} from "./candidates";
import {
  codePointLength,
  createSourceSpan,
  createTextSourceRevision,
} from "./provenance";
import { DurableCandidateSchema } from "./types";

async function pendingCandidate() {
  const source = await createTextSourceRevision({
    id: "source-actions",
    text: "大约 1998 年搬家",
  });
  const span = createSourceSpan({
    source,
    start: 0,
    end: codePointLength("大约 1998 年"),
  });
  return createPendingCandidate({
    id: "candidate-time",
    category: "fuzzy_time",
    text: span.exactExcerpt,
    sourceSpan: span,
    supportStatus: "ambiguous",
    candidateOrigin: "deterministic_rule",
    ruleId: "test-rule",
    ruleVersion: "1",
    reasonCode: "test_ambiguous",
  });
}

describe("candidate state machine", () => {
  it("confirms exact source and creates session-only undo", async () => {
    const pending = await pendingCandidate();
    const transition = confirmCandidate(
      pending,
      "2026-08-30T01:00:00.000Z",
    );

    expect(transition.candidate).toMatchObject({
      reviewState: "accepted",
      authorship: "source_exact",
      certainty: "asserted",
      reviewAction: "confirm",
    });
    expect(transition.undo).toMatchObject({
      sessionOnly: true,
      action: "confirm",
      previous: pending,
    });
    expect(undoCandidateAction(transition.candidate, transition.undo)).toEqual(
      pending,
    );
  });

  it("marks an exact source candidate uncertain", async () => {
    const transition = markCandidateUncertain(await pendingCandidate());
    expect(transition.candidate).toMatchObject({
      reviewState: "accepted",
      authorship: "source_exact",
      certainty: "uncertain",
      reviewAction: "mark_uncertain",
    });
  });

  it("creates narrator rewrite with an independent certainty", async () => {
    const asserted = rewriteCandidate(
      await pendingCandidate(),
      "讲述者记得是在九十年代末",
      "asserted",
    );
    expect(asserted.candidate).toMatchObject({
      reviewState: "accepted",
      authorship: "narrator_edited",
      certainty: "asserted",
      reviewAction: "rewrite",
    });

    const corrected = rewriteCandidate(
      asserted.candidate,
      "讲述者不确定，可能是九十年代末",
      "uncertain",
    );
    expect(corrected.candidate).toMatchObject({
      authorship: "narrator_edited",
      certainty: "uncertain",
    });
  });

  it("rejects without durable text or source span and can undo in session", async () => {
    const pending = await pendingCandidate();
    const transition = rejectCandidate(pending);

    expect(transition.candidate.reviewState).toBe("rejected");
    expect("text" in transition.candidate).toBe(false);
    expect("sourceSpan" in transition.candidate).toBe(false);
    expect(JSON.stringify(transition.candidate)).not.toContain("1998");
    expect(undoCandidateAction(transition.candidate, transition.undo)).toEqual(
      pending,
    );
  });

  it("reopens accepted and rejected decisions from the current source locator", async () => {
    const source = await createTextSourceRevision({
      id: "source-actions",
      text: "大约 1998 年搬家",
    });
    const accepted = confirmCandidate(await pendingCandidate()).candidate;
    expect(reopenCandidate(accepted, source)).toMatchObject({
      reviewState: "pending",
      text: "大约 1998 年",
      authorship: null,
      certainty: null,
    });
    const rejected = rejectCandidate(accepted).candidate;
    expect(reopenCandidate(rejected, source)).toMatchObject({
      reviewState: "pending",
      text: "大约 1998 年",
    });
  });

  it("rejects illegal combinations at runtime", async () => {
    const pending = await pendingCandidate();
    const invalid = {
      ...pending,
      reviewState: "accepted",
      authorship: "source_exact",
      certainty: "uncertain",
      reviewAction: "confirm",
      reviewedAt: "2026-08-30T00:00:00.000Z",
    };

    expect(DurableCandidateSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires unsupported adapter output to use manual selection", async () => {
    const pending = await pendingCandidate();
    const unsupported = DurableCandidateSchema.parse({
      ...pending,
      supportStatus: "unsupported",
    });

    expect(() => confirmCandidate(unsupported)).toThrowError(
      CandidateTransitionError,
    );
  });

  it("creates a manual exact-span candidate without inventing text", async () => {
    const source = await createTextSourceRevision({
      id: "source-manual",
      text: "她把杯子放在厨房",
    });
    const start = Array.from(source.text).indexOf("厨");
    const candidate = createUserSelectedCandidate({
      id: "manual-place",
      category: "place",
      source,
      start,
      end: start + 2,
    });

    expect(candidate).toMatchObject({
      text: "厨房",
      supportStatus: "exact",
      candidateOrigin: "user_selected",
      ruleId: "manual-selection",
    });
  });
});
