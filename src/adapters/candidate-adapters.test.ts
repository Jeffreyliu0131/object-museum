import { describe, expect, it } from "vitest";
import { createTextSourceRevision } from "../domain/provenance";
import { DeterministicCandidateAdapter } from "./deterministic-candidate-adapter";
import { NoModelCandidateAdapter } from "./no-model-candidate-adapter";

describe("candidate adapters", () => {
  it("extracts only exact source phrases with rule provenance", async () => {
    const source = await createTextSourceRevision({
      id: "adapter-source",
      text: "🙂我的妈妈说，大约 1998 年搬家，因为这个杯子让我想起厨房",
    });
    const result = await new DeterministicCandidateAdapter().analyze(source);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "fuzzy_time",
          text: "大约 1998 年",
          supportStatus: "exact",
          ruleId: "fuzzy-year-zh",
          ruleVersion: "1",
          candidateOrigin: "deterministic_rule",
        }),
        expect.objectContaining({
          category: "person",
          text: "我的妈妈",
          supportStatus: "ambiguous",
        }),
      ]),
    );
    for (const candidate of result.candidates) {
      expect(candidate.sourceSpan.exactExcerpt).toBe(candidate.text);
      expect(
        Array.from(source.text)
          .slice(candidate.sourceSpan.start, candidate.sourceSpan.end)
          .join(""),
      ).toBe(candidate.text);
    }
  });

  it("abstains when no declared exact rule matches", async () => {
    const source = await createTextSourceRevision({
      id: "adapter-empty",
      text: "一段没有可声明规则的合成文字",
    });
    await expect(
      new DeterministicCandidateAdapter().analyze(source),
    ).resolves.toEqual({
      status: "unsupported",
      candidates: [],
      reasonCode: "deterministic_no_rule_match_use_manual_span",
    });
  });

  it("abstains when source bytes no longer match the stored hash", async () => {
    const source = await createTextSourceRevision({
      id: "adapter-drift",
      text: "大约 1998 年",
    });
    await expect(
      new DeterministicCandidateAdapter().analyze({
        ...source,
        text: "大约 2005 年",
      }),
    ).resolves.toEqual({
      status: "unsupported",
      candidates: [],
      reasonCode: "source_integrity_failed",
    });
  });

  it("keeps no-model mode complete without an API key", async () => {
    const source = await createTextSourceRevision({
      id: "no-model-source",
      text: "用户仍然可以直接使用原文",
    });
    await expect(new NoModelCandidateAdapter().analyze(source)).resolves.toEqual({
      status: "unsupported",
      candidates: [],
      reasonCode: "model_disabled_use_source_or_manual_span",
    });
  });
});
