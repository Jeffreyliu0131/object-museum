import {
  DurableCandidateSchema,
  PendingCandidateSchema,
  RejectedCandidateSchema,
  type AcceptedCandidate,
  type CandidateCategory,
  type CandidateOrigin,
  type CandidateSupportStatus,
  type DurableCandidate,
  type PendingCandidate,
  type SourceSpan,
  type TextSourceRevision,
} from "./types";
import { createSourceSpan } from "./provenance";

export type CandidateAction =
  | "confirm"
  | "rewrite"
  | "reject"
  | "mark_uncertain";

export type CandidateBeforeAction = PendingCandidate | AcceptedCandidate;

export interface SessionOnlyUndoPayload {
  readonly kind: "candidate_action";
  readonly sessionOnly: true;
  readonly action: CandidateAction;
  readonly candidateId: string;
  readonly previous: CandidateBeforeAction;
  readonly createdAt: string;
}

export interface CandidateTransition {
  candidate: DurableCandidate;
  undo: SessionOnlyUndoPayload;
}

export class CandidateTransitionError extends Error {
  constructor(
    readonly code:
      | "candidate_not_pending"
      | "candidate_already_rejected"
      | "unsupported_candidate_requires_manual_selection"
      | "rewrite_text_required"
      | "undo_candidate_mismatch"
      | "source_revision_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "CandidateTransitionError";
  }
}

export interface CreatePendingCandidateInput {
  id: string;
  category: CandidateCategory;
  text: string;
  sourceSpan: SourceSpan;
  supportStatus: CandidateSupportStatus;
  candidateOrigin: CandidateOrigin;
  ruleId: string;
  ruleVersion: string;
  reasonCode: string;
}

export function createPendingCandidate(
  input: CreatePendingCandidateInput,
): PendingCandidate {
  return PendingCandidateSchema.parse({
    ...input,
    reviewState: "pending",
    authorship: null,
    certainty: null,
  });
}

export function createUserSelectedCandidate(input: {
  id: string;
  category: CandidateCategory;
  source: TextSourceRevision;
  start: number;
  end: number;
}): PendingCandidate {
  const sourceSpan = createSourceSpan({
    source: input.source,
    start: input.start,
    end: input.end,
  });

  return createPendingCandidate({
    id: input.id,
    category: input.category,
    text: sourceSpan.exactExcerpt,
    sourceSpan,
    supportStatus: "exact",
    candidateOrigin: "user_selected",
    ruleId: "manual-selection",
    ruleVersion: "1",
    reasonCode: "user_selected_exact_span",
  });
}

function nowOrDefault(now?: string): string {
  return now ?? new Date().toISOString();
}

function ensurePending(candidate: DurableCandidate): PendingCandidate {
  if (candidate.reviewState !== "pending") {
    throw new CandidateTransitionError(
      "candidate_not_pending",
      "This action requires a pending candidate",
    );
  }
  return candidate;
}

function ensureSupported(candidate: PendingCandidate): void {
  if (candidate.supportStatus === "unsupported") {
    throw new CandidateTransitionError(
      "unsupported_candidate_requires_manual_selection",
      "Unsupported adapter output must fall back to manual exact-span selection",
    );
  }
}

function createUndo(
  previous: CandidateBeforeAction,
  action: CandidateAction,
  now?: string,
): SessionOnlyUndoPayload {
  return {
    kind: "candidate_action",
    sessionOnly: true,
    action,
    candidateId: previous.id,
    previous,
    createdAt: nowOrDefault(now),
  };
}

export function confirmCandidate(
  candidate: DurableCandidate,
  now?: string,
): CandidateTransition {
  const pending = ensurePending(candidate);
  ensureSupported(pending);
  const reviewedAt = nowOrDefault(now);
  return {
    candidate: DurableCandidateSchema.parse({
      ...pending,
      reviewState: "accepted",
      authorship: "source_exact",
      certainty: "asserted",
      reviewAction: "confirm",
      reviewedAt,
    }),
    undo: createUndo(pending, "confirm", reviewedAt),
  };
}

export function markCandidateUncertain(
  candidate: DurableCandidate,
  now?: string,
): CandidateTransition {
  const pending = ensurePending(candidate);
  ensureSupported(pending);
  const reviewedAt = nowOrDefault(now);
  return {
    candidate: DurableCandidateSchema.parse({
      ...pending,
      reviewState: "accepted",
      authorship: "source_exact",
      certainty: "uncertain",
      reviewAction: "mark_uncertain",
      reviewedAt,
    }),
    undo: createUndo(pending, "mark_uncertain", reviewedAt),
  };
}

export function rewriteCandidate(
  candidate: DurableCandidate,
  text: string,
  certainty: "asserted" | "uncertain",
  now?: string,
): CandidateTransition {
  if (candidate.reviewState === "rejected") {
    throw new CandidateTransitionError(
      "candidate_already_rejected",
      "A rejected candidate must be restored from session undo before editing",
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new CandidateTransitionError(
      "rewrite_text_required",
      "Narrator rewrite text is required",
    );
  }

  if (
    candidate.reviewState === "pending" &&
    candidate.supportStatus === "unsupported"
  ) {
    throw new CandidateTransitionError(
      "unsupported_candidate_requires_manual_selection",
      "Unsupported adapter output must fall back to manual exact-span selection",
    );
  }

  const reviewedAt = nowOrDefault(now);
  const previous = candidate;
  return {
    candidate: DurableCandidateSchema.parse({
      ...candidate,
      reviewState: "accepted",
      authorship: "narrator_edited",
      certainty,
      reviewAction: "rewrite",
      reviewedAt,
      text: trimmed,
    }),
    undo: createUndo(previous, "rewrite", reviewedAt),
  };
}

export function rejectCandidate(
  candidate: DurableCandidate,
  now?: string,
): CandidateTransition {
  if (candidate.reviewState === "rejected") {
    throw new CandidateTransitionError(
      "candidate_already_rejected",
      "Candidate is already rejected",
    );
  }

  const rejectedAt = nowOrDefault(now);
  const rejected = RejectedCandidateSchema.parse({
    id: candidate.id,
    category: candidate.category,
    supportStatus: candidate.supportStatus,
    candidateOrigin: candidate.candidateOrigin,
    ruleId: candidate.ruleId,
    ruleVersion: candidate.ruleVersion,
    reasonCode: candidate.reasonCode,
    reviewState: "rejected",
    authorship: null,
    certainty: null,
    rejectedAt,
    sourceLocator: {
      sourceRevisionId: candidate.sourceSpan.sourceRevisionId,
      sourceSha256: candidate.sourceSpan.sourceSha256,
      start: candidate.sourceSpan.start,
      end: candidate.sourceSpan.end,
    },
  });

  return {
    candidate: rejected,
    undo: createUndo(candidate, "reject", rejectedAt),
  };
}

export function reopenCandidate(
  candidate: DurableCandidate,
  source: TextSourceRevision,
): PendingCandidate {
  const locator = candidate.reviewState === "rejected"
    ? candidate.sourceLocator
    : candidate.sourceSpan;
  if (
    locator.sourceRevisionId !== source.id ||
    locator.sourceSha256 !== source.sha256
  ) {
    throw new CandidateTransitionError(
      "source_revision_mismatch",
      "The candidate belongs to a different source revision and cannot be reopened",
    );
  }
  const sourceSpan = createSourceSpan({
    source,
    start: locator.start,
    end: locator.end,
  });
  return createPendingCandidate({
    id: candidate.id,
    category: candidate.category,
    text: sourceSpan.exactExcerpt,
    sourceSpan,
    supportStatus: candidate.supportStatus,
    candidateOrigin: candidate.candidateOrigin,
    ruleId: candidate.ruleId,
    ruleVersion: candidate.ruleVersion,
    reasonCode: candidate.reasonCode,
  });
}

export function undoCandidateAction(
  current: DurableCandidate,
  undo: SessionOnlyUndoPayload,
): CandidateBeforeAction {
  if (current.id !== undo.candidateId) {
    throw new CandidateTransitionError(
      "undo_candidate_mismatch",
      "Undo payload does not belong to this candidate",
    );
  }

  return DurableCandidateSchema.parse(undo.previous) as CandidateBeforeAction;
}

export function replaceCandidate(
  candidates: readonly DurableCandidate[],
  next: DurableCandidate,
): DurableCandidate[] {
  let replaced = false;
  const result = candidates.map((candidate) => {
    if (candidate.id !== next.id) return candidate;
    replaced = true;
    return DurableCandidateSchema.parse(next);
  });

  return replaced ? result : [...result, DurableCandidateSchema.parse(next)];
}
