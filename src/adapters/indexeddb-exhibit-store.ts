import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  parseCurrentExhibitEnvelope,
  type CurrentExhibitEnvelope,
} from "../domain/types";
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

export const OBJECT_MUSEUM_DB_NAME = "object-museum-local";
export const OBJECT_MUSEUM_DB_VERSION = 1;
const ACTIVE_KEY = "active" as const;

interface ObjectMuseumDatabase extends DBSchema {
  workingCopies: {
    key: typeof ACTIVE_KEY;
    value: unknown;
  };
  media: {
    key: string;
    value: Blob;
  };
}

export class IndexedDbExhibitStore implements ExhibitStore {
  private readonly database: Promise<IDBPDatabase<ObjectMuseumDatabase>>;

  constructor(readonly databaseName = OBJECT_MUSEUM_DB_NAME) {
    this.database = openDB<ObjectMuseumDatabase>(
      databaseName,
      OBJECT_MUSEUM_DB_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains("workingCopies")) {
            database.createObjectStore("workingCopies");
          }
          if (!database.objectStoreNames.contains("media")) {
            database.createObjectStore("media");
          }
        },
      },
    );
  }

  async load(): Promise<CurrentExhibitEnvelope | null> {
    const database = await this.database;
    const raw = await database.get("workingCopies", ACTIVE_KEY);
    if (raw === undefined) return null;

    try {
      return parseCurrentExhibitEnvelope(raw);
    } catch (error) {
      throw new StoreCorruptDataError(
        error instanceof Error ? error.message : "Invalid working copy schema",
        raw,
      );
    }
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

    const database = await this.database;
    const transaction = database.transaction(
      ["workingCopies", "media"],
      "readwrite",
    );
    const store = transaction.objectStore("workingCopies");
    const rawCurrent = await store.get(ACTIVE_KEY);

    let current: CurrentExhibitEnvelope | null = null;
    if (rawCurrent !== undefined) {
      try {
        current = parseCurrentExhibitEnvelope(rawCurrent);
      } catch (error) {
        await transaction.done;
        throw new StoreCorruptDataError(
          error instanceof Error ? error.message : "Invalid working copy schema",
          rawCurrent,
        );
      }
    }

    const actualRevision = current?.revision ?? null;
    if (actualRevision !== input.expectedRevision) {
      await transaction.done;
      throw new StoreConflictError(input.expectedRevision, actualRevision);
    }

    if (current === null) {
      if (next.revision !== 1) {
        await transaction.done;
        throw new StoreInvalidCommitError(
          "The first committed envelope must use revision 1",
        );
      }
    } else {
      if (next.recordId !== current.recordId) {
        await transaction.done;
        throw new StoreInvalidCommitError(
          "A working copy record id cannot change without local clear",
        );
      }
      if (next.revision !== current.revision + 1) {
        await transaction.done;
        throw new StoreInvalidCommitError(
          "The next envelope revision must increment by exactly one",
        );
      }
    }

    for (const write of mediaWrites) {
      if (!write.id) {
        transaction.abort();
        throw new StoreInvalidCommitError("Media id is required");
      }
      if (!next.mediaRefs.includes(write.id)) {
        transaction.abort();
        throw new StoreInvalidCommitError(
          `Media write ${write.id} is not referenced by the next envelope`,
        );
      }
    }

    for (const write of mediaWrites) {
      await transaction.objectStore("media").put(write.blob, write.id);
    }

    for (const mediaId of next.mediaRefs) {
      const mediaKey = await transaction.objectStore("media").getKey(mediaId);
      if (mediaKey === undefined) {
        transaction.abort();
        throw new StoreInvalidCommitError(
          `Local media is missing for: ${mediaId}`,
        );
      }
    }

    await store.put(next, ACTIVE_KEY);
    await transaction.done;
    return parseCurrentExhibitEnvelope(next);
  }

  async getMedia(id: string): Promise<Blob | undefined> {
    const database = await this.database;
    return database.get("media", id);
  }

  async inspectControlInventory(): Promise<StoreControlInventory> {
    const database = await this.database;
    const transaction = database.transaction(
      ["workingCopies", "media"],
      "readonly",
    );
    const workingCopies = await transaction.objectStore("workingCopies").count();
    const media = await transaction.objectStore("media").count();
    await transaction.done;
    return { workingCopies, media };
  }

  async clear(): Promise<LocalClearResult> {
    try {
      const database = await this.database;
      const transaction = database.transaction(
        ["workingCopies", "media"],
        "readwrite",
      );
      await transaction.objectStore("workingCopies").delete(ACTIVE_KEY);
      await transaction.objectStore("media").clear();
      await transaction.done;

      const inventory = await this.inspectControlInventory();
      if (inventory.workingCopies !== 0 || inventory.media !== 0) {
        return {
          status: "clear_incomplete",
          inventory,
          reason: "Controlled IndexedDB state remains after clear",
        };
      }

      return {
        status: "cleared",
        inventory: { workingCopies: 0, media: 0 },
      };
    } catch (error) {
      let inventory: StoreControlInventory | null = null;
      try {
        inventory = await this.inspectControlInventory();
      } catch {
        // If inspection itself fails, the adapter must stay failed closed.
      }
      return {
        status: "clear_incomplete",
        inventory,
        reason: error instanceof Error ? error.message : "IndexedDB clear failed",
      };
    }
  }

  async close(): Promise<void> {
    const database = await this.database;
    database.close();
  }
}
