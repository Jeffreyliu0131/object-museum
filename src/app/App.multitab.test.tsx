import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmCandidate } from "../domain/candidates";
import { CurrentExhibitEnvelopeSchema } from "../domain/types";
import { IndexedDbExhibitStore, OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";
import { loadSyntheticFixtureCatalog } from "../fixtures/records";
import { App } from "./App";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OBJECT_MUSEUM_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function seedReviewedWorkingCopy() {
  const catalog = await loadSyntheticFixtureCatalog();
  const envelope = structuredClone(catalog.activeEnvelope);
  envelope.record.candidates = envelope.record.candidates.map((candidate) =>
    candidate.reviewState === "pending" ? confirmCandidate(candidate).candidate : candidate,
  );
  const parsed = CurrentExhibitEnvelopeSchema.parse(envelope);
  const store = new IndexedDbExhibitStore();
  await store.commit({ expectedRevision: null, next: parsed });
  await store.close();
}

async function overwriteWithCorruptState() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OBJECT_MUSEUM_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["workingCopies", "media"], "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    transaction.objectStore("workingCopies").put({ schemaVersion: 1, recordId: "corrupt" }, "active");
    transaction.objectStore("media").put(new Blob(["orphan private bytes"]), "orphan");
  });
  database.close();
}

describe("multi-tab local clear propagation", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    await deleteDatabase();
    await seedReviewedWorkingCopy();
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase();
  });

  it("clears another open tab's React view when the current local working copy is cleared", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <section data-testid="tab-a"><App /></section>
        <section data-testid="tab-b"><App /></section>
      </div>,
    );
    const tabA = within(await screen.findByTestId("tab-a"));
    const tabB = within(await screen.findByTestId("tab-b"));
    await user.click(await tabA.findByRole("button", { name: "Open working copy" }));
    await user.click(await tabB.findByRole("button", { name: "Open working copy" }));
    await tabA.findByRole("heading", { name: "A local working exhibit in this prototype" });
    await tabB.findByRole("heading", { name: "A local working exhibit in this prototype" });

    await user.click(tabA.getByRole("button", { name: "Clear local working copy" }));
    await user.click(screen.getByRole("button", { name: "Clear from this browser prototype" }));
    expect(await tabA.findByRole("heading", { name: "No local working copy" })).toBeVisible();
    expect(await tabB.findByRole("heading", { name: "No local working copy" })).toBeVisible();
  });

  it("broadcasts corrupt-state recovery and verifies both stores are empty", async () => {
    const user = userEvent.setup();
    const cached = render(<section data-testid="cached-tab"><App /></section>);
    const cachedTab = within(await screen.findByTestId("cached-tab"));
    await user.click(await cachedTab.findByRole("button", { name: "Open working copy" }));
    await cachedTab.findByRole("heading", { name: "A local working exhibit in this prototype" });

    await overwriteWithCorruptState();
    const recovery = render(<section data-testid="recovery-tab"><App /></section>);
    const recoveryTab = within(await screen.findByTestId("recovery-tab"));
    expect(await recoveryTab.findByRole("heading", { name: "The local working copy is unavailable" })).toBeVisible();
    await user.click(recoveryTab.getByRole("button", { name: "Clear corrupt local prototype state" }));
    await user.click(screen.getByRole("button", { name: "Clear corrupt prototype state" }));

    expect(await recoveryTab.findByRole("heading", { name: "No local working copy" })).toBeVisible();
    expect(await cachedTab.findByRole("heading", { name: "No local working copy" })).toBeVisible();
    const inspector = new IndexedDbExhibitStore();
    await waitFor(async () => expect(await inspector.inspectControlInventory()).toEqual({ workingCopies: 0, media: 0 }));
    await inspector.close();
    cached.unmount();
    recovery.unmount();
  });
});

describe("multi-tab working-copy creation", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    await deleteDatabase();
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase();
  });

  it("asks an empty tab to reload as soon as another tab creates the working copy", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <section data-testid="creator-tab"><App /></section>
        <section data-testid="empty-tab"><App /></section>
      </div>,
    );
    const creator = within(await screen.findByTestId("creator-tab"));
    const empty = within(await screen.findByTestId("empty-tab"));
    await creator.findByRole("heading", { name: "A local workbench for one object story" });
    await empty.findByRole("heading", { name: "A local workbench for one object story" });

    await user.click(creator.getByRole("button", { name: "Start with synthetic fixture" }));
    expect(await empty.findByRole("heading", { name: "The local working copy is unavailable" })).toHaveFocus();
    expect(empty.getByText(/working copy was created in another tab/iu)).toBeVisible();

    await user.click(empty.getByRole("button", { name: "Reload working copy" }));
    await empty.findByRole("heading", { name: "A local workbench for one object story" });
    expect(empty.getByRole("button", { name: "Open working copy" })).toBeEnabled();
  });
});
