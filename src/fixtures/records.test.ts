import { describe, expect, it } from "vitest";
import { validateSourceSpan } from "../domain/provenance";
import {
  COBALT_MUG_SOURCE_TEXT,
  RED_CAMERA_SOURCE_TEXT,
  SEA_GLASS_BROOCH_SOURCE_TEXT,
  loadSyntheticFixtureCatalog,
} from "./records";

describe("synthetic fixture records", () => {
  it("keeps the cobalt mug as the only interactive active fixture", async () => {
    const catalog = await loadSyntheticFixtureCatalog();

    expect(catalog.activeEnvelope.recordId).toBe("cobalt-mug");
    expect(catalog.activeEnvelope.mediaRefs).toEqual([]);
    expect(
      catalog.fixtures.filter(
        (fixture) => fixture.presentation === "interactive_active",
      ),
    ).toHaveLength(1);
    expect(catalog.fixtures.map((fixture) => fixture.id)).toEqual([
      "cobalt-mug",
      "red-camera",
      "sea-glass-brooch",
    ]);
  });

  it("uses the exact required cobalt source without bundled audio", async () => {
    const catalog = await loadSyntheticFixtureCatalog();
    const cobalt = catalog.fixtures[0].record;

    expect(cobalt.source.text).toBe(COBALT_MUG_SOURCE_TEXT);
    expect(cobalt.audio).toBeNull();
    expect(cobalt.candidates.every((candidate) => candidate.reviewState === "pending"))
      .toBe(true);
  });

  it("keeps camera and brooch explicitly synthetic and statically reviewed", async () => {
    const catalog = await loadSyntheticFixtureCatalog();
    const camera = catalog.fixtures[1];
    const brooch = catalog.fixtures[2];

    expect(camera.record.source.text).toBe(RED_CAMERA_SOURCE_TEXT);
    expect(brooch.record.source.text).toBe(SEA_GLASS_BROOCH_SOURCE_TEXT);

    for (const fixture of [camera, brooch]) {
      expect(fixture.presentation).toBe("reviewed_static");
      expect(fixture.notice.toLowerCase()).toContain("entirely synthetic");
      expect(fixture.record.source.text.toLowerCase()).toContain(
        "synthetic story for a portfolio fixture",
      );
      expect(
        fixture.record.candidates.every(
          (candidate) => candidate.reviewState === "accepted",
        ),
      ).toBe(true);
    }
  });

  it("binds every durable fixture candidate to its exact immutable source span", async () => {
    const catalog = await loadSyntheticFixtureCatalog();

    for (const fixture of catalog.fixtures) {
      for (const candidate of fixture.record.candidates) {
        expect(candidate.reviewState, candidate.id).not.toBe("rejected");
        if (candidate.reviewState === "rejected") continue;

        const validation = await validateSourceSpan(
          fixture.record.source,
          candidate.sourceSpan,
        );
        expect(validation, candidate.id).toEqual({
          valid: true,
          excerpt: candidate.sourceSpan.exactExcerpt,
        });
        expect(candidate.text, candidate.id).toBe(
          candidate.sourceSpan.exactExcerpt,
        );
      }
    }
  });

  it("preserves fuzzy time as uncertainty in reviewed static fixtures", async () => {
    const catalog = await loadSyntheticFixtureCatalog();
    const staticFixtures = catalog.fixtures.filter(
      (fixture) => fixture.presentation === "reviewed_static",
    );

    for (const fixture of staticFixtures) {
      const fuzzyTime = fixture.record.candidates.find(
        (candidate) => candidate.category === "fuzzy_time",
      );
      expect(fuzzyTime?.reviewState).toBe("accepted");
      if (fuzzyTime?.reviewState !== "accepted") continue;
      expect(fuzzyTime.certainty).toBe("uncertain");
    }
  });

  it("keeps adapter support separate from narrator uncertainty", async () => {
    const catalog = await loadSyntheticFixtureCatalog();
    const cobaltEvent = catalog.fixtures[0].record.candidates.find(
      (candidate) => candidate.id === "cobalt-mug-event",
    );
    const reviewedFuzzyTime = catalog.fixtures[1].record.candidates.find(
      (candidate) => candidate.category === "fuzzy_time",
    );

    expect(cobaltEvent?.supportStatus).toBe("ambiguous");
    expect(cobaltEvent?.reasonCode).toBe(
      "event_boundary_and_category_need_narrator_judgment",
    );
    expect(cobaltEvent?.reviewState).toBe("pending");
    expect(cobaltEvent?.certainty).toBeNull();

    expect(reviewedFuzzyTime?.supportStatus).toBe("exact");
    expect(reviewedFuzzyTime?.reviewState).toBe("accepted");
    if (reviewedFuzzyTime?.reviewState !== "accepted") return;
    expect(reviewedFuzzyTime.certainty).toBe("uncertain");
  });
});
