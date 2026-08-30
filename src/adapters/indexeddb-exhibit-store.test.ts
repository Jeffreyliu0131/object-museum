import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialEnvelope, reviseEnvelope } from "../domain/envelope";
import { createTextSourceRevision } from "../domain/provenance";
import type { ExhibitRecord } from "../domain/types";
import {
  StoreConflictError,
  StoreCorruptDataError,
  StoreInvalidCommitError,
} from "../ports/exhibit-store";
import { IndexedDbExhibitStore } from "./indexeddb-exhibit-store";

const databases = new Set<string>();

function databaseName(label: string): string {
  const name = `object-museum-test-${label}-${crypto.randomUUID()}`;
  databases.add(name);
  return name;
}

async function createRecord(title = "合成相机"): Promise<ExhibitRecord> {
  return {
    title,
    objectName: "红色胶片相机",
    provenance: { contentOrigin: "local_narrator", fixtureId: null },
    narrator: { id: "synthetic-narrator", label: "合成讲述者" },
    source: await createTextSourceRevision({
      id: "indexeddb-source",
      text: "about 1998, before the move",
    }),
    candidates: [],
    image: null,
    audio: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

async function putUnsafeWorkingCopy(
  databaseNameValue: string,
  value: unknown,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseNameValue);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("workingCopies", "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    transaction.objectStore("workingCopies").put(value, "active");
  });
  database.close();
}

async function putUnsafeMedia(
  databaseNameValue: string,
  id: string,
  blob: Blob,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseNameValue);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("media", "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    transaction.objectStore("media").put(blob, id);
  });
  database.close();
}

afterEach(async () => {
  for (const name of databases) await deleteDB(name);
  databases.clear();
});

describe("IndexedDbExhibitStore", () => {
  it("serializes CAS commits across two adapters and rejects stale revision", async () => {
    const name = databaseName("cas");
    const firstStore = new IndexedDbExhibitStore(name);
    const secondStore = new IndexedDbExhibitStore(name);
    const initial = createInitialEnvelope({
      recordId: "indexeddb-record",
      record: await createRecord(),
    });
    await firstStore.commit({ expectedRevision: null, next: initial });
    const staleSnapshot = await secondStore.load();
    expect(staleSnapshot).not.toBeNull();

    const committed = reviseEnvelope(
      initial,
      await createRecord("已提交相机"),
    );
    await firstStore.commit({ expectedRevision: 1, next: committed });

    const staleNext = reviseEnvelope(
      staleSnapshot!,
      await createRecord("陈旧相机"),
    );
    await expect(
      secondStore.commit({ expectedRevision: 1, next: staleNext }),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await expect(firstStore.load()).resolves.toMatchObject({
      revision: 2,
      record: { title: "已提交相机" },
    });

    await firstStore.close();
    await secondStore.close();
  });

  it("rejects an old tab after clear and recreation even when the revision number repeats", async () => {
    const name = databaseName("clear-recreate-aba");
    const currentStore = new IndexedDbExhibitStore(name);
    const staleStore = new IndexedDbExhibitStore(name);
    try {
      const original = createInitialEnvelope({
        recordId: "old-working-copy-incarnation",
        record: await createRecord("old copy"),
      });
      await currentStore.commit({ expectedRevision: null, next: original });
      const staleNext = reviseEnvelope(original, await createRecord("stale overwrite"));

      await expect(currentStore.clear()).resolves.toMatchObject({ status: "cleared" });
      const recreated = createInitialEnvelope({
        recordId: "new-working-copy-incarnation",
        record: await createRecord("new copy"),
      });
      await currentStore.commit({ expectedRevision: null, next: recreated });

      await expect(staleStore.commit({ expectedRevision: 1, next: staleNext }))
        .rejects.toBeInstanceOf(StoreInvalidCommitError);
      await expect(currentStore.load()).resolves.toMatchObject({
        recordId: "new-working-copy-incarnation",
        revision: 1,
        record: { title: "new copy" },
      });
    } finally {
      await currentStore.close();
      await staleStore.close();
    }
  });

  it("commits media and envelope in one CAS transaction so a stale tab cannot overwrite the active blob", async () => {
    const name = databaseName("media-cas");
    const firstStore = new IndexedDbExhibitStore(name);
    const secondStore = new IndexedDbExhibitStore(name);
    try {
      const initial = createInitialEnvelope({
        recordId: "media-record",
        record: await createRecord(),
      });
      await firstStore.commit({ expectedRevision: null, next: initial });
      const stale = await secondStore.load();

      const firstRecord = await createRecord("first media");
      firstRecord.image = {
        id: "media-record:local-image",
        kind: "image",
        storage: "local",
        mimeType: "image/jpeg",
      };
      const firstNext = reviseEnvelope(initial, firstRecord);
      await firstStore.commitWithMedia(
        { expectedRevision: 1, next: firstNext },
        [{ id: "media-record:local-image", blob: new Blob(["first-content"]) }],
      );

      const staleRecord = await createRecord("stale media");
      staleRecord.image = {
        id: "media-record:stale-image",
        kind: "image",
        storage: "local",
        mimeType: "image/jpeg",
      };
      const staleNext = reviseEnvelope(stale!, staleRecord);
      await expect(secondStore.commitWithMedia(
        { expectedRevision: 1, next: staleNext },
        [{ id: "media-record:stale-image", blob: new Blob(["x"]) }],
      )).rejects.toBeInstanceOf(StoreConflictError);

      await expect(firstStore.getMedia("media-record:stale-image")).resolves.toBeUndefined();
      await expect(firstStore.inspectControlInventory()).resolves.toEqual({ workingCopies: 1, media: 1 });
      await expect(firstStore.load()).resolves.toMatchObject({ revision: 2, record: { title: "first media" } });
    } finally {
      await firstStore.close();
      await secondStore.close();
    }
  });

  it("fails closed when the active row has corrupt schema", async () => {
    const name = databaseName("corrupt");
    const bootstrap = new IndexedDbExhibitStore(name);
    await bootstrap.inspectControlInventory();
    await bootstrap.close();
    await putUnsafeWorkingCopy(name, { schemaVersion: 1, recordId: "broken" });

    const store = new IndexedDbExhibitStore(name);
    await expect(store.load()).rejects.toBeInstanceOf(StoreCorruptDataError);
    await store.close();
  });

  it("fails closed when persisted fixture media points at a remote origin", async () => {
    const name = databaseName("remote-fixture-ref");
    const store = new IndexedDbExhibitStore(name);
    const valid = createInitialEnvelope({
      recordId: "remote-fixture-record",
      record: await createRecord(),
    });
    const hostile = structuredClone(valid) as unknown as {
      record: ExhibitRecord;
    };
    hostile.record.image = {
      id: "https://attacker.invalid/private.jpg",
      kind: "image",
      storage: "fixture",
      mimeType: "image/jpeg",
    };
    await store.inspectControlInventory();
    await putUnsafeWorkingCopy(name, hostile);
    await expect(store.load()).rejects.toBeInstanceOf(StoreCorruptDataError);
    await store.close();
  });

  it("clears the entire media store, including an orphan-media canary", async () => {
    const name = databaseName("clear");
    const store = new IndexedDbExhibitStore(name);
    const initial = createInitialEnvelope({
      recordId: "indexeddb-clear",
      record: await createRecord(),
    });
    await store.commit({ expectedRevision: null, next: initial });
    await putUnsafeMedia(name, "unreferenced-orphan", new Blob(["private bytes"]));

    await expect(store.inspectControlInventory()).resolves.toEqual({
      workingCopies: 1,
      media: 1,
    });
    await expect(store.clear()).resolves.toEqual({
      status: "cleared",
      inventory: { workingCopies: 0, media: 0 },
    });
    await expect(store.inspectControlInventory()).resolves.toEqual({
      workingCopies: 0,
      media: 0,
    });
    await expect(store.getMedia("unreferenced-orphan")).resolves.toBeUndefined();
    await store.close();
  });
});
