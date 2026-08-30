import type {
  PendingCandidate,
  TextSourceRevision,
} from "../domain/types";

export type CandidateAdapterResult =
  | {
      status: "ready";
      candidates: PendingCandidate[];
    }
  | {
      status: "unsupported";
      candidates: [];
      reasonCode: string;
    };

export interface CandidateAdapter {
  readonly id: string;
  readonly version: string;
  analyze(source: TextSourceRevision): Promise<CandidateAdapterResult>;
}
