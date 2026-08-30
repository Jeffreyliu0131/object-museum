import { describe, expect, it } from "vitest";
import { createInitialEnvelope, reviseEnvelope } from "../domain/envelope";
import { createTextSourceRevision } from "../domain/provenance";
import type { ExhibitRecord } from "../domain/types";
import {
  StoreConflictError,
  StoreCorruptDataError,
  StoreInvalidCommitError,
} from "../ports/exhibit-store";
import { MemoryExhibitStore } from "./memory-exhibit-store";

async function createRecord(title = "合成蓝杯"): Promise<ExhibitRecord> {
  return {
    title,
    objectName: "钴蓝釉杯",
    provenance: { contentOrigin: "local_narrator", fixtureId: null },
    narrator: { id: "synthetic-narrator", label: "合成讲述者" },
    source: await createTextSourceRevision({
      id: "memory-source",
      text: "大约 1998 年搬家",
    }),
    candidates: [],
    image: null,
    audio: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("MemoryExhibitStore", () => {
  it("uses compare-and-swap revisions rather than last-write-wins", async () => {
    const store = new MemoryExhibitStore();
    const initial = createInitialEnvelope({
      recordId: "memory-record",
      record: await createRecord(),
    });
    await store.commit({ expectedRevision: null, next: initial });

    const second = reviseEnvelope(initial, await createRecord("修订蓝杯"));
    await store.commit({ expectedRevision: 1, next: second });

    const stale = reviseEnvelope(initial, await createRecord("陈旧覆盖"));
    await expect(
      store.commit({ expectedRevision: 1, next: stale }),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await expect(store.load()).resolves.toMatchObject({
      revision: 2,
      record: { title: "修订蓝杯" },
    });
  });

  it("linearizes concurrent commits that use the same expected revision", async () => {
    const store = new MemoryExhibitStore();
    const initial = createInitialEnvelope({
      recordId: "memory-concurrent-record",
      record: await createRecord(),
    });
    await store.commit({ expectedRevision: null, next: initial });

    const first = reviseEnvelope(initial, await createRecord("first concurrent decision"));
    const second = reviseEnvelope(initial, await createRecord("second concurrent decision"));
    const results = await Promise.allSettled([
      store.commit({ expectedRevision: 1, next: first }),
      store.commit({ expectedRevision: 1, next: second }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected" });
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(StoreConflictError);
    }
    await expect(store.load()).resolves.toMatchObject({
      revision: 2,
      record: { title: "first concurrent decision" },
    });
  });

  it("fails closed on corrupt persisted schema", async () => {
    const store = new MemoryExhibitStore({
      initial: { schemaVersion: 1, recordId: "broken" },
    });
    await expect(store.load()).rejects.toBeInstanceOf(StoreCorruptDataError);
  });

  it("does not commit a working copy that references missing local media", async () => {
    const record = await createRecord();
    record.image = {
      id: "missing-image",
      kind: "image",
      storage: "local",
      mimeType: "image/webp",
      altText: "合成测试图片",
    };
    const envelope = createInitialEnvelope({
      recordId: "memory-missing-media",
      record,
    });
    const store = new MemoryExhibitStore();

    await expect(
      store.commit({ expectedRevision: null, next: envelope }),
    ).rejects.toBeInstanceOf(StoreInvalidCommitError);
    await expect(store.load()).resolves.toBeNull();
  });

  it("does not stage an unreferenced media write when the envelope commit is rejected", async () => {
    const envelope = createInitialEnvelope({
      recordId: "memory-unreferenced-media",
      record: await createRecord(),
    });
    const store = new MemoryExhibitStore();
    await expect(store.commitWithMedia(
      { expectedRevision: null, next: envelope },
      [{ id: "unreferenced", blob: new Blob(["private"]) }],
    )).rejects.toBeInstanceOf(StoreInvalidCommitError);
    await expect(store.getMedia("unreferenced")).resolves.toBeUndefined();
    await expect(store.load()).resolves.toBeNull();
  });

  it("clears active state and every media item including orphans", async () => {
    const initial = createInitialEnvelope({
      recordId: "memory-clear",
      record: await createRecord(),
    });
    const store = new MemoryExhibitStore({
      media: [["unreferenced-orphan", new Blob(["private bytes"])]],
    });
    await store.commit({ expectedRevision: null, next: initial });

    await expect(store.inspectControlInventory()).resolves.toEqual({
      workingCopies: 1,
      media: 1,
    });
    await expect(store.clear()).resolves.toEqual({
      status: "cleared",
      inventory: { workingCopies: 0, media: 0 },
    });
    await expect(store.load()).resolves.toBeNull();
  });
});
