import {
  confirmCandidate,
  createPendingCandidate,
  markCandidateUncertain,
} from "../domain/candidates";
import {
  createSourceSpan,
  createTextSourceRevision,
  utf16IndexToCodePointIndex,
} from "../domain/provenance";
import {
  CurrentExhibitEnvelopeSchema,
  ExhibitRecordSchema,
  type CandidateCategory,
  type CurrentExhibitEnvelope,
  type DurableCandidate,
  type ExhibitRecord,
  type TextSourceRevision,
} from "../domain/types";

export const PORTFOLIO_PROTOTYPE_LABEL = "Portfolio prototype";
export const SYNTHETIC_FIXTURE_LABEL = "Synthetic fixture";
export const PROVENANCE_MANIFEST_URL =
  "/fixtures/provenance-manifest.json";

export const COBALT_MUG_SOURCE_TEXT =
  "In late spring 2006, my brother Sam found this mug at a school market in Montreal. The handle broke during our move two winters later. I kept using it because that crooked repair reminds me that useful things can carry their history.";

export const RED_CAMERA_SOURCE_TEXT =
  "This is a synthetic story for a portfolio fixture. In autumn 2012, I found this red camera at a charity shop in Bristol for an imagined student photography project. I kept it because its scuffed casing stands for learning through repeated attempts.";

export const SEA_GLASS_BROOCH_SOURCE_TEXT =
  "This is a synthetic story for a portfolio fixture. One summer in the early 1990s, I assembled this sea-glass brooch in an imagined coastal workshop near Oban. I kept it because its uneven surface stands for making something useful from fragments.";

const CREATED_AT = "2026-08-30T00:00:00.000Z";
const FIXTURE_NOTICE =
  "Entirely synthetic portfolio fixture. It is not a real family account, a demand signal, or evidence of repeat use or collaboration.";

type SeedDisposition = "pending" | "confirm" | "mark_uncertain";

interface CandidateSeed {
  id: string;
  category: CandidateCategory;
  excerpt: string;
  ruleId: string;
  reasonCode: string;
  supportStatus?: "exact" | "ambiguous";
  disposition: SeedDisposition;
}

interface FixtureRecordInput {
  fixtureId: string;
  sourceId: string;
  sourceText: string;
  title: string;
  objectName: string;
  narratorId: string;
  narratorLabel: string;
  imagePath: string;
  imageAltText: string;
  candidates: readonly CandidateSeed[];
}

export interface SyntheticFixtureRecord {
  id: "cobalt-mug" | "red-camera" | "sea-glass-brooch";
  presentation: "interactive_active" | "reviewed_static";
  notice: string;
  record: ExhibitRecord;
}

export interface SyntheticFixtureCatalog {
  activeEnvelope: CurrentExhibitEnvelope;
  fixtures: readonly SyntheticFixtureRecord[];
}

function exactSpan(source: TextSourceRevision, excerpt: string) {
  const utf16Start = source.text.indexOf(excerpt);
  if (utf16Start < 0) {
    throw new Error(`Fixture excerpt is absent from source: ${excerpt}`);
  }

  const start = utf16IndexToCodePointIndex(source.text, utf16Start);
  const end = start + Array.from(excerpt).length;
  return createSourceSpan({ source, start, end });
}

function reviewSeed(
  source: TextSourceRevision,
  seed: CandidateSeed,
): DurableCandidate {
  const pending = createPendingCandidate({
    id: seed.id,
    category: seed.category,
    text: seed.excerpt,
    sourceSpan: exactSpan(source, seed.excerpt),
    supportStatus: seed.supportStatus ?? "exact",
    candidateOrigin: "deterministic_rule",
    ruleId: seed.ruleId,
    ruleVersion: "fixture-rules-1",
    reasonCode: seed.reasonCode,
  });

  if (seed.disposition === "confirm") {
    return confirmCandidate(pending, CREATED_AT).candidate;
  }

  if (seed.disposition === "mark_uncertain") {
    return markCandidateUncertain(pending, CREATED_AT).candidate;
  }

  return pending;
}

async function createFixtureRecord(
  input: FixtureRecordInput,
): Promise<ExhibitRecord> {
  const source = await createTextSourceRevision({
    id: input.sourceId,
    text: input.sourceText,
    createdAt: CREATED_AT,
  });

  return ExhibitRecordSchema.parse({
    title: input.title,
    objectName: input.objectName,
    provenance: {
      contentOrigin: "synthetic_fixture",
      fixtureId: input.fixtureId,
    },
    narrator: {
      id: input.narratorId,
      label: input.narratorLabel,
    },
    source,
    candidates: input.candidates.map((seed) => reviewSeed(source, seed)),
    image: {
      id: input.imagePath,
      kind: "image",
      storage: "fixture",
      mimeType: "image/jpeg",
      altText: input.imageAltText,
    },
    audio: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

async function buildSyntheticFixtureCatalog(): Promise<SyntheticFixtureCatalog> {
  const [cobaltMug, redCamera, seaGlassBrooch] = await Promise.all([
    createFixtureRecord({
      fixtureId: "cobalt-mug",
      sourceId: "fixture-source-cobalt-mug-v1",
      sourceText: COBALT_MUG_SOURCE_TEXT,
      title: "The repaired cobalt mug",
      objectName: "Cobalt mug",
      narratorId: "synthetic-narrator-rowan",
      narratorLabel: "Synthetic narrator: Rowan",
      imagePath: "/fixtures/cobalt-mug.jpg",
      imageAltText:
        "Cobalt-blue ceramic mug with a dark repaired handle on a grey surface.",
      candidates: [
        {
          id: "cobalt-mug-time",
          category: "fuzzy_time",
          excerpt: "late spring 2006",
          ruleId: "fixture-fuzzy-time",
          reasonCode: "literal_fuzzy_season_year",
          disposition: "pending",
        },
        {
          id: "cobalt-mug-person",
          category: "person",
          excerpt: "my brother Sam",
          ruleId: "fixture-person-phrase",
          reasonCode: "literal_named_person_phrase",
          disposition: "pending",
        },
        {
          id: "cobalt-mug-place",
          category: "place",
          excerpt: "Montreal",
          ruleId: "fixture-place-token",
          reasonCode: "literal_declared_place",
          disposition: "pending",
        },
        {
          id: "cobalt-mug-event",
          category: "event",
          excerpt: "The handle broke during our move two winters later.",
          ruleId: "fixture-event-sentence",
          reasonCode: "event_boundary_and_category_need_narrator_judgment",
          supportStatus: "ambiguous",
          disposition: "pending",
        },
        {
          id: "cobalt-mug-testimony",
          category: "why_it_matters",
          excerpt:
            "I kept using it because that crooked repair reminds me that useful things can carry their history.",
          ruleId: "fixture-testimony-sentence",
          reasonCode: "literal_first_person_testimony",
          disposition: "pending",
        },
      ],
    }),
    createFixtureRecord({
      fixtureId: "red-camera",
      sourceId: "fixture-source-red-camera-v1",
      sourceText: RED_CAMERA_SOURCE_TEXT,
      title: "The scuffed red camera",
      objectName: "Red camera",
      narratorId: "synthetic-narrator-avery",
      narratorLabel: "Synthetic narrator: Avery",
      imagePath: "/fixtures/red-camera.jpg",
      imageAltText:
        "Compact red plastic camera with visible scuffs on a grey surface.",
      candidates: [
        {
          id: "red-camera-time",
          category: "fuzzy_time",
          excerpt: "autumn 2012",
          ruleId: "fixture-fuzzy-time",
          reasonCode: "literal_fuzzy_season_year",
          disposition: "mark_uncertain",
        },
        {
          id: "red-camera-place",
          category: "place",
          excerpt: "Bristol",
          ruleId: "fixture-place-token",
          reasonCode: "literal_declared_place",
          disposition: "confirm",
        },
        {
          id: "red-camera-event",
          category: "event",
          excerpt: "an imagined student photography project",
          ruleId: "fixture-event-phrase",
          reasonCode: "literal_synthetic_event_phrase",
          disposition: "confirm",
        },
        {
          id: "red-camera-testimony",
          category: "why_it_matters",
          excerpt:
            "I kept it because its scuffed casing stands for learning through repeated attempts.",
          ruleId: "fixture-testimony-sentence",
          reasonCode: "literal_first_person_testimony",
          disposition: "confirm",
        },
      ],
    }),
    createFixtureRecord({
      fixtureId: "sea-glass-brooch",
      sourceId: "fixture-source-sea-glass-brooch-v1",
      sourceText: SEA_GLASS_BROOCH_SOURCE_TEXT,
      title: "The sea-glass brooch",
      objectName: "Sea-glass brooch",
      narratorId: "synthetic-narrator-morgan",
      narratorLabel: "Synthetic narrator: Morgan",
      imagePath: "/fixtures/sea-glass-brooch.jpg",
      imageAltText:
        "Sea-green glass brooch shown from the back with a silver pin on a grey surface.",
      candidates: [
        {
          id: "sea-glass-brooch-time",
          category: "fuzzy_time",
          excerpt: "One summer in the early 1990s",
          ruleId: "fixture-fuzzy-time",
          reasonCode: "literal_fuzzy_season_decade",
          disposition: "mark_uncertain",
        },
        {
          id: "sea-glass-brooch-place",
          category: "place",
          excerpt: "Oban",
          ruleId: "fixture-place-token",
          reasonCode: "literal_declared_place",
          disposition: "confirm",
        },
        {
          id: "sea-glass-brooch-event",
          category: "event",
          excerpt:
            "I assembled this sea-glass brooch in an imagined coastal workshop near Oban.",
          ruleId: "fixture-event-sentence",
          reasonCode: "literal_synthetic_event_sentence",
          disposition: "confirm",
        },
        {
          id: "sea-glass-brooch-testimony",
          category: "why_it_matters",
          excerpt:
            "I kept it because its uneven surface stands for making something useful from fragments.",
          ruleId: "fixture-testimony-sentence",
          reasonCode: "literal_first_person_testimony",
          disposition: "confirm",
        },
      ],
    }),
  ]);

  const activeEnvelope = CurrentExhibitEnvelopeSchema.parse({
    schemaVersion: 1,
    recordId: "cobalt-mug",
    revision: 1,
    record: cobaltMug,
    mediaRefs: [],
  });

  return {
    activeEnvelope,
    fixtures: [
      {
        id: "cobalt-mug",
        presentation: "interactive_active",
        notice: FIXTURE_NOTICE,
        record: cobaltMug,
      },
      {
        id: "red-camera",
        presentation: "reviewed_static",
        notice: FIXTURE_NOTICE,
        record: redCamera,
      },
      {
        id: "sea-glass-brooch",
        presentation: "reviewed_static",
        notice: FIXTURE_NOTICE,
        record: seaGlassBrooch,
      },
    ],
  };
}

let catalogPromise: Promise<SyntheticFixtureCatalog> | undefined;

export function loadSyntheticFixtureCatalog(): Promise<SyntheticFixtureCatalog> {
  catalogPromise ??= buildSyntheticFixtureCatalog();
  return catalogPromise;
}
