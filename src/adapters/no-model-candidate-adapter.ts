import type {
  CandidateAdapter,
  CandidateAdapterResult,
} from "../ports/candidate-adapter";
import type { TextSourceRevision } from "../domain/types";

export class NoModelCandidateAdapter implements CandidateAdapter {
  readonly id = "no-model";
  readonly version = "1";

  async analyze(source: TextSourceRevision): Promise<CandidateAdapterResult> {
    void source;
    return {
      status: "unsupported",
      candidates: [],
      reasonCode: "model_disabled_use_source_or_manual_span",
    };
  }
}
