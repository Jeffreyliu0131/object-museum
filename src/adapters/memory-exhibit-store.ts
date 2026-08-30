import { parseCurrentExhibitEnvelope } from "../domain/types";
import type { CurrentExhibitEnvelope } from "../domain/types";
import type {
  CommitExhibitInput,
  ExhibitStore,
  LocalClearResult,
  MediaWrite,
  StoreControlInventory,
} from "../ports/exhibit-store";
import {
  StoreConflictError,
  StoreCorruptDataError,
  StoreInvalidCommitError,
} from "../ports/exhibit-store";

export interface MemoryExhibitStoreOptions {
  initial?: unknown;
  media?: Iterable<readonly [string, Blob]>;
}

export class MemoryExhibitStore implements ExhibitStore {
  private active: unknown = null;
  private readonly media = new Map<string, Blob>();

  constructor(options: MemoryExhibitStoreOptions = {}) {
    if ("initial" in options) this.active = options.initial;
    if (options.media) {
      for (const [id, blob] of options.media) this.media.set(id, blob);
    }
  }

  private readCurrent(): CurrentExhibitEnvelope | null {
    if (this.active === null || this.active === undefined) return null;
    try {
      return parseCurrentExhibitEnvelope(this.active);
    } catch (error) {
      throw new StoreCorruptDataError(
        error instanceof Error ? error.message : "Invalid working copy schema",
        this.active,
      );
    }
  }

  async load(): Promise<CurrentExhibitEnvelope | null> {
    return this.readCurrent();
  }

  async commit(input: CommitExhibitInput): Promise<CurrentExhibitEnvelope> {
    return this.commitWithMedia(input, []);
  }

  async commitWithMedia(
    input: CommitExhibitInput,
    mediaWrites: readonly MediaWrite[],
  ): Promise<CurrentExhibitEnvelope> {
    let next: CurrentExhibitEnvelope;
    try {
      next = parseCurrentExhibitEnvelope(input.next);
    } catch (error) {
      throw new StoreInvalidCommitError(
        error instanceof Error ? error.message : "Invalid next envelope",
      );
    }

    // Keep the compare-and-set section synchronous. Awaiting load() here would
    // yield between the revision check and assignment, allowing two concurrent
    // session-only commits to accept the same expected revision.
    const current = this.readCurrent();
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== input.expectedRevision) {
      throw new StoreConflictError(input.expectedRevision, actualRevision);
    }

    if (current === null) {
      if (next.revision !== 1) {
        throw new StoreInvalidCommitError(
          "The first committed envelope must use revision 1",
        );
      }
    } else {
      if (next.recordId !== current.recordId) {
        throw new StoreInvalidCommitError(
          "A working copy record id cannot change without local clear",
        );
      }
      if (next.revision !== current.revision + 1) {
        throw new StoreInvalidCommitError(
          "The next envelope revision must increment by exactly one",
        );
      }
    }

    const prospectiveMedia = new Map(this.media);
    for (const write of mediaWrites) {
      if (!write.id) throw new StoreInvalidCommitError("Media id is required");
      if (!next.mediaRefs.includes(write.id)) {
        throw new StoreInvalidCommitError(
          `Media write ${write.id} is not referenced by the next envelope`,
        );
      }
      prospectiveMedia.set(write.id, write.blob);
    }

    const missingMedia = next.mediaRefs.filter((id) => !prospectiveMedia.has(id));
    if (missingMedia.length > 0) {
      throw new StoreInvalidCommitError(
        `Local media is missing for: ${missingMedia.join(", ")}`,
      );
    }

    for (const write of mediaWrites) this.media.set(write.id, write.blob);
    this.active = next;
    return parseCurrentExhibitEnvelope(next);
  }

  async getMedia(id: string): Promise<Blob | undefined> {
    return this.media.get(id);
  }

  async inspectControlInventory(): Promise<StoreControlInventory> {
    return {
      workingCopies: this.active === null || this.active === undefined ? 0 : 1,
      media: this.media.size,
    };
  }

  async clear(): Promise<LocalClearResult> {
    try {
      this.active = null;
      this.media.clear();
      const inventory = await this.inspectControlInventory();
      if (inventory.workingCopies !== 0 || inventory.media !== 0) {
        return {
          status: "clear_incomplete",
          inventory,
          reason: "Controlled memory state remains after clear",
        };
      }

      return {
        status: "cleared",
        inventory: { workingCopies: 0, media: 0 },
      };
    } catch (error) {
      return {
        status: "clear_incomplete",
        inventory: null,
        reason: error instanceof Error ? error.message : "Memory clear failed",
      };
    }
  }

  async close(): Promise<void> {
    // No resource handle is held by the session-only adapter.
  }
}
