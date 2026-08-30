import { codePointLength, sha256Utf8, validateSourceSpan, type SourceSpanFailureReason } from "./provenance";
import {
  safeParseCurrentExhibitEnvelope,
  type AcceptedCandidate,
  type CandidateCategory,
  type CurrentExhibitEnvelope,
  type MediaReference,
  type NarratorAttribution,
  type SourceSpan,
} from "./types";

export type CandidateQuarantineReason =
  | SourceSpanFailureReason
  | "support_unsupported"
  | "candidate_text_mismatch";

export interface QuarantinedCandidate {
  candidateId: string;
  reason: CandidateQuarantineReason;
}

export interface MaterializedStatement {
  candidateId: string;
  category: CandidateCategory;
  text: string;
  authorship: "source_exact" | "narrator_edited";
  certainty: "asserted" | "uncertain";
  quoted: boolean;
  statementKind: "narrator_testimony" | "source_linked_statement";
  attribution: NarratorAttribution;
  source: {
    span: SourceSpan;
    excerpt: string;
  };
}

export interface MaterializedPrivateExhibit {
  recordId: string;
  revision: number;
  title: string;
  objectName: string;
  contentOrigin: "synthetic_fixture" | "local_narrator";
  fixtureId: string | null;
  narrator: NarratorAttribution;
  sourceText: string;
  image: MediaReference | null;
  audio: MediaReference | null;
  audioHasTextEquivalent: boolean;
  accessibilityComplete: boolean;
  statements: MaterializedStatement[];
}

export type MaterializationResult =
  | {
      status: "materialized";
      envelope: CurrentExhibitEnvelope;
      exhibit: MaterializedPrivateExhibit;
      quarantined: QuarantinedCandidate[];
    }
  | {
      status: "invalid_envelope";
      issues: string[];
    };

async function materializeCandidate(
  envelope: CurrentExhibitEnvelope,
  candidate: AcceptedCandidate,
): Promise<
  | { statement: MaterializedStatement }
  | { quarantine: QuarantinedCandidate }
> {
  if (candidate.supportStatus === "unsupported") {
    return {
      quarantine: {
        candidateId: candidate.id,
        reason: "support_unsupported",
      },
    };
  }

  const sourceValidation = await validateSourceSpan(
    envelope.record.source,
    candidate.sourceSpan,
  );
  if (!sourceValidation.valid) {
    return {
      quarantine: {
        candidateId: candidate.id,
        reason: sourceValidation.reason,
      },
    };
  }

  if (
    candidate.authorship === "source_exact" &&
    candidate.text !== sourceValidation.excerpt
  ) {
    return {
      quarantine: {
        candidateId: candidate.id,
        reason: "candidate_text_mismatch",
      },
    };
  }

  return {
    statement: {
      candidateId: candidate.id,
      category: candidate.category,
      text: candidate.text,
      authorship: candidate.authorship,
      certainty: candidate.certainty,
      quoted: candidate.authorship === "source_exact",
      statementKind:
        candidate.category === "why_it_matters"
          ? "narrator_testimony"
          : "source_linked_statement",
      attribution: envelope.record.narrator,
      source: {
        span: candidate.sourceSpan,
        excerpt: sourceValidation.excerpt,
      },
    },
  };
}

export async function materializePrivateExhibit(
  value: unknown,
): Promise<MaterializationResult> {
  const parsed = safeParseCurrentExhibitEnvelope(value);
  if (!parsed.success) {
    return {
      status: "invalid_envelope",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  const envelope = parsed.data;
  const currentSourceHash = await sha256Utf8(envelope.record.source.text);
  if (
    currentSourceHash !== envelope.record.source.sha256 ||
    codePointLength(envelope.record.source.text) !== envelope.record.source.codePointLength
  ) {
    return {
      status: "invalid_envelope",
      issues: ["record.source: stored source bytes do not match the authoritative hash/length"],
    };
  }
  const statements: MaterializedStatement[] = [];
  const quarantined: QuarantinedCandidate[] = [];

  for (const candidate of envelope.record.candidates) {
    if (candidate.reviewState !== "accepted") continue;

    const result = await materializeCandidate(envelope, candidate);
    if ("statement" in result) {
      statements.push(result.statement);
    } else {
      quarantined.push(result.quarantine);
    }
  }

  const audioHasTextEquivalent = Boolean(
    envelope.record.audio?.textEquivalent?.trim() &&
      envelope.record.audio.textEquivalent === envelope.record.source.text &&
      envelope.record.audio.textEquivalentSourceRevisionId === envelope.record.source.id &&
      envelope.record.audio.textEquivalentSourceSha256 === envelope.record.source.sha256,
  );

  return {
    status: "materialized",
    envelope,
    exhibit: {
      recordId: envelope.recordId,
      revision: envelope.revision,
      title: envelope.record.title,
      objectName: envelope.record.objectName,
      contentOrigin: envelope.record.provenance.contentOrigin,
      fixtureId: envelope.record.provenance.fixtureId,
      narrator: envelope.record.narrator,
      sourceText: envelope.record.source.text,
      image: envelope.record.image,
      audio: envelope.record.audio,
      audioHasTextEquivalent,
      accessibilityComplete: envelope.record.audio
        ? audioHasTextEquivalent
        : true,
      statements,
    },
    quarantined,
  };
}
