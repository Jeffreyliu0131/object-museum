import { z } from "zod";

export const CandidateCategorySchema = z.enum([
  "fuzzy_time",
  "person",
  "place",
  "event",
  "why_it_matters",
]);

export type CandidateCategory = z.infer<typeof CandidateCategorySchema>;

export const CandidateSupportStatusSchema = z.enum([
  "exact",
  "ambiguous",
  "unsupported",
]);

export type CandidateSupportStatus = z.infer<
  typeof CandidateSupportStatusSchema
>;

export const CandidateOriginSchema = z.enum([
  "deterministic_rule",
  "user_selected",
]);

export type CandidateOrigin = z.infer<typeof CandidateOriginSchema>;

export const NarratorAttributionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(60),
  })
  .strict();

export type NarratorAttribution = z.infer<typeof NarratorAttributionSchema>;

export const TextSourceRevisionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().max(2_400),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    codePointLength: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
  })
  .strict();

export type TextSourceRevision = z.infer<typeof TextSourceRevisionSchema>;

const sourceLocatorShape = {
  sourceRevisionId: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
} as const;

export const SourceLocatorSchema = z
  .object(sourceLocatorShape)
  .strict()
  .refine((span) => span.end > span.start, {
    message: "Source span end must be greater than start",
    path: ["end"],
  });
export type SourceLocator = z.infer<typeof SourceLocatorSchema>;

export const SourceSpanSchema = z
  .object({
    ...sourceLocatorShape,
    exactExcerpt: z.string().min(1).max(2_400),
  })
  .strict()
  .refine((span) => span.end > span.start, {
    message: "Source span end must be greater than start",
    path: ["end"],
  });

export type SourceSpan = z.infer<typeof SourceSpanSchema>;

const candidateCommonShape = {
  id: z.string().min(1),
  category: CandidateCategorySchema,
  supportStatus: CandidateSupportStatusSchema,
  candidateOrigin: CandidateOriginSchema,
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  reasonCode: z.string().min(1),
} as const;

export const PendingCandidateSchema = z
  .object({
    ...candidateCommonShape,
    reviewState: z.literal("pending"),
    authorship: z.null(),
    certainty: z.null(),
    text: z.string().min(1).max(2_400),
    sourceSpan: SourceSpanSchema,
  })
  .strict();

export type PendingCandidate = z.infer<typeof PendingCandidateSchema>;

export const AcceptedSourceCandidateSchema = z
  .object({
    ...candidateCommonShape,
    reviewState: z.literal("accepted"),
    authorship: z.literal("source_exact"),
    certainty: z.enum(["asserted", "uncertain"]),
    reviewAction: z.enum(["confirm", "mark_uncertain"]),
    reviewedAt: z.string().min(1),
    text: z.string().min(1).max(2_400),
    sourceSpan: SourceSpanSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.reviewAction === "confirm" &&
      candidate.certainty !== "asserted"
    ) {
      context.addIssue({
        code: "custom",
        message: "Confirm must create asserted certainty",
        path: ["certainty"],
      });
    }

    if (
      candidate.reviewAction === "mark_uncertain" &&
      candidate.certainty !== "uncertain"
    ) {
      context.addIssue({
        code: "custom",
        message: "Mark uncertain must create uncertain certainty",
        path: ["certainty"],
      });
    }
  });

export type AcceptedSourceCandidate = z.infer<
  typeof AcceptedSourceCandidateSchema
>;

export const AcceptedEditedCandidateSchema = z
  .object({
    ...candidateCommonShape,
    reviewState: z.literal("accepted"),
    authorship: z.literal("narrator_edited"),
    certainty: z.enum(["asserted", "uncertain"]),
    reviewAction: z.literal("rewrite"),
    reviewedAt: z.string().min(1),
    text: z.string().min(1).max(2_400),
    sourceSpan: SourceSpanSchema,
  })
  .strict();

export type AcceptedEditedCandidate = z.infer<
  typeof AcceptedEditedCandidateSchema
>;

export const RejectedCandidateSchema = z
  .object({
    ...candidateCommonShape,
    reviewState: z.literal("rejected"),
    authorship: z.null(),
    certainty: z.null(),
    rejectedAt: z.string().min(1),
    sourceLocator: SourceLocatorSchema,
  })
  .strict();

export type RejectedCandidate = z.infer<typeof RejectedCandidateSchema>;

export const DurableCandidateSchema = z.union([
  PendingCandidateSchema,
  AcceptedSourceCandidateSchema,
  AcceptedEditedCandidateSchema,
  RejectedCandidateSchema,
]);

export type DurableCandidate = z.infer<typeof DurableCandidateSchema>;
export type AcceptedCandidate =
  | AcceptedSourceCandidate
  | AcceptedEditedCandidate;

export const FixtureMediaIdSchema = z.enum([
  "/fixtures/cobalt-mug.jpg",
  "/fixtures/red-camera.jpg",
  "/fixtures/sea-glass-brooch.jpg",
]);

const fixtureMediaPolicy = {
  "/fixtures/cobalt-mug.jpg": { kind: "image", mimeType: "image/jpeg" },
  "/fixtures/red-camera.jpg": { kind: "image", mimeType: "image/jpeg" },
  "/fixtures/sea-glass-brooch.jpg": { kind: "image", mimeType: "image/jpeg" },
} as const;

export const MediaReferenceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["image", "audio"]),
    storage: z.enum(["fixture", "local"]),
    mimeType: z.string().min(1),
    altText: z.string().max(300).optional(),
    textEquivalent: z.string().max(2_400).optional(),
    textEquivalentSourceRevisionId: z.string().min(1).optional(),
    textEquivalentSourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict()
  .superRefine((media, context) => {
    if (media.storage === "fixture") {
      const parsedId = FixtureMediaIdSchema.safeParse(media.id);
      if (!parsedId.success) {
        context.addIssue({ code: "custom", message: "Fixture media id is not allowlisted", path: ["id"] });
      } else {
        const policy = fixtureMediaPolicy[parsedId.data];
        if (media.kind !== policy.kind || media.mimeType !== policy.mimeType) {
          context.addIssue({ code: "custom", message: "Fixture media kind/MIME does not match its allowlist entry", path: ["mimeType"] });
        }
      }
    } else if (!/^[a-z0-9][a-z0-9:_-]{0,127}$/iu.test(media.id)) {
      context.addIssue({ code: "custom", message: "Local media id must be an opaque local key", path: ["id"] });
    }

    const hasEquivalent = Boolean(media.textEquivalent?.trim());
    const hasBinding = Boolean(media.textEquivalentSourceRevisionId && media.textEquivalentSourceSha256);
    if (hasEquivalent !== hasBinding) {
      context.addIssue({ code: "custom", message: "Audio text equivalent and source binding must be present together", path: ["textEquivalent"] });
    }
  });

export type MediaReference = z.infer<typeof MediaReferenceSchema>;

export const ExhibitProvenanceSchema = z
  .object({
    contentOrigin: z.enum(["synthetic_fixture", "local_narrator"]),
    fixtureId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (provenance.contentOrigin === "synthetic_fixture" && !provenance.fixtureId) {
      context.addIssue({ code: "custom", message: "Synthetic fixture origin requires fixtureId", path: ["fixtureId"] });
    }
    if (provenance.contentOrigin === "local_narrator" && provenance.fixtureId) {
      context.addIssue({ code: "custom", message: "Local narrator origin cannot claim fixtureId", path: ["fixtureId"] });
    }
  });

export const ExhibitRecordSchema = z
  .object({
    title: z.string().min(1).max(80),
    objectName: z.string().min(1).max(60),
    provenance: ExhibitProvenanceSchema,
    narrator: NarratorAttributionSchema,
    source: TextSourceRevisionSchema,
    candidates: z.array(DurableCandidateSchema),
    image: MediaReferenceSchema.nullable(),
    audio: MediaReferenceSchema.nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.image && record.image.kind !== "image") {
      context.addIssue({
        code: "custom",
        message: "Image slot must reference image media",
        path: ["image", "kind"],
      });
    }

    if (record.audio && record.audio.kind !== "audio") {
      context.addIssue({
        code: "custom",
        message: "Audio slot must reference audio media",
        path: ["audio", "kind"],
      });
    }

    if (record.audio?.textEquivalent) {
      if (
        record.audio.textEquivalent !== record.source.text ||
        record.audio.textEquivalentSourceRevisionId !== record.source.id ||
        record.audio.textEquivalentSourceSha256 !== record.source.sha256
      ) {
        context.addIssue({
          code: "custom",
          message: "Audio text equivalent must bind exactly to the current source revision",
          path: ["audio", "textEquivalent"],
        });
      }
    }

    const candidateIds = record.candidates.map((candidate) => candidate.id);
    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: "custom",
        message: "Candidate ids must be unique within a record",
        path: ["candidates"],
      });
    }
  });

export type ExhibitRecord = z.infer<typeof ExhibitRecordSchema>;

export const CurrentExhibitEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordId: z.string().min(1),
    revision: z.number().int().positive(),
    record: ExhibitRecordSchema,
    mediaRefs: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((envelope, context) => {
    const expectedLocalMedia = [envelope.record.image, envelope.record.audio]
      .filter(
        (media): media is MediaReference =>
          media !== null && media.storage === "local",
      )
      .map((media) => media.id)
      .sort();
    const declaredMedia = [...envelope.mediaRefs].sort();

    if (new Set(declaredMedia).size !== declaredMedia.length) {
      context.addIssue({
        code: "custom",
        message: "mediaRefs must not contain duplicates",
        path: ["mediaRefs"],
      });
    }

    if (
      expectedLocalMedia.length !== declaredMedia.length ||
      expectedLocalMedia.some((id, index) => id !== declaredMedia[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "mediaRefs must exactly match locally stored record media",
        path: ["mediaRefs"],
      });
    }
  });

export type CurrentExhibitEnvelope = z.infer<
  typeof CurrentExhibitEnvelopeSchema
>;

export function parseCurrentExhibitEnvelope(
  value: unknown,
): CurrentExhibitEnvelope {
  return CurrentExhibitEnvelopeSchema.parse(value);
}

export function safeParseCurrentExhibitEnvelope(value: unknown) {
  return CurrentExhibitEnvelopeSchema.safeParse(value);
}
