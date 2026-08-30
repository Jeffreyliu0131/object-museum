import type { CurrentExhibitEnvelope } from "../domain/types";

export interface CommitExhibitInput {
  expectedRevision: number | null;
  next: CurrentExhibitEnvelope;
}

export interface MediaWrite {
  id: string;
  blob: Blob;
}

export interface StoreControlInventory {
  workingCopies: number;
  media: number;
}

export type LocalClearResult =
  | {
      status: "cleared";
      inventory: {
        workingCopies: 0;
        media: 0;
      };
    }
  | {
      status: "clear_incomplete";
      inventory: StoreControlInventory | null;
      reason: string;
    };

export interface ExhibitStore {
  load(): Promise<CurrentExhibitEnvelope | null>;
  commit(input: CommitExhibitInput): Promise<CurrentExhibitEnvelope>;
  commitWithMedia(input: CommitExhibitInput, mediaWrites: readonly MediaWrite[]): Promise<CurrentExhibitEnvelope>;
  getMedia(id: string): Promise<Blob | undefined>;
  inspectControlInventory(): Promise<StoreControlInventory>;
  clear(): Promise<LocalClearResult>;
  close(): Promise<void>;
}

export class StoreConflictError extends Error {
  constructor(
    readonly expectedRevision: number | null,
    readonly actualRevision: number | null,
  ) {
    super(
      `Stale exhibit revision: expected ${String(expectedRevision)}, actual ${String(actualRevision)}`,
    );
    this.name = "StoreConflictError";
  }
}

export class StoreCorruptDataError extends Error {
  constructor(
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "StoreCorruptDataError";
  }
}

export class StoreInvalidCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreInvalidCommitError";
  }
}
