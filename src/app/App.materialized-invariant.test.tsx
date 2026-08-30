import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmCandidate } from "../domain/candidates";
import { CurrentExhibitEnvelopeSchema } from "../domain/types";
import {
  IndexedDbExhibitStore,
  OBJECT_MUSEUM_DB_NAME,
} from "../adapters/indexeddb-exhibit-store";
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

async function seedReviewedWorkingCopy(): Promise<void> {
  const catalog = await loadSyntheticFixtureCatalog();
  const envelope = structuredClone(catalog.activeEnvelope);
  envelope.record.candidates = envelope.record.candidates.map((candidate) =>
    candidate.reviewState === "pending"
      ? confirmCandidate(candidate).candidate
      : candidate,
  );
  const store = new IndexedDbExhibitStore();
  await store.commit({
    expectedRevision: null,
    next: CurrentExhibitEnvelopeSchema.parse(envelope),
  });
  await store.close();
}

async function openReviewedExhibit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />);
  await screen.findByRole("heading", { name: "A local workbench for one object story" });
  await user.click(screen.getByRole("button", { name: "Open working copy" }));
  await screen.findByRole("heading", { name: "A local working exhibit in this prototype" });
}

describe("revision-bound materialized exhibit", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    await deleteDatabase();
    await seedReviewedWorkingCopy();
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase();
  });

  it("invalidates the cached exhibit after Object changes and rematerializes the committed revision", async () => {
    const user = userEvent.setup();
    await openReviewedExhibit(user);

    await user.click(screen.getByRole("button", { name: "Object" }));
    const title = await screen.findByRole("textbox", { name: /Exhibit title/u });
    await user.clear(title);
    await user.type(title, "Revision-bound cobalt mug");
    await user.click(screen.getByRole("button", { name: "Local exhibit" }));

    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();
    expect(await screen.findByText("Exhibit needs refreshing")).toBeVisible();
    expect(screen.getByRole("button", { name: "Local exhibit" })).toBeDisabled();
    expect(screen.getByText("0 pending")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open local exhibit" }));
    expect(await screen.findByText("Revision-bound cobalt mug")).toBeVisible();

    const inspector = new IndexedDbExhibitStore();
    await expect(inspector.load()).resolves.toMatchObject({
      revision: 2,
      record: { title: "Revision-bound cobalt mug" },
    });
    await inspector.close();
  });

  it("routes a changed Story through Review and never enables an older exhibit while candidates are pending", async () => {
    const user = userEvent.setup();
    await openReviewedExhibit(user);

    await user.click(screen.getByRole("button", { name: "Original words" }));
    const originalWords = await screen.findByRole("textbox", { name: /Your original words/u });
    await user.type(originalWords, " The narrator added this correction.");
    await user.click(screen.getByRole("button", { name: "Local exhibit" }));

    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();
    expect(await screen.findByText("Exhibit needs refreshing")).toBeVisible();
    expect(screen.getByRole("button", { name: "Local exhibit" })).toBeDisabled();
    const pendingBadge = screen.getByText(/^\d+ pending$/u);
    expect(pendingBadge).not.toHaveTextContent("0 pending");
    expect(screen.getByRole("button", { name: /Review \d+ remaining/u })).toBeDisabled();
  });

  it("invalidates an open exhibit when a manual exact-span candidate creates new pending work", async () => {
    const user = userEvent.setup();
    await openReviewedExhibit(user);
    await user.click(screen.getByRole("button", { name: "Correct candidates" }));
    await screen.findByRole("heading", { name: "Decide what the exhibit may say" });

    const excerpt = screen.getByRole("textbox", { name: "Exact source phrase" });
    await user.type(excerpt, "late spring 2006");
    const addCandidate = screen.getByRole("button", { name: "Add exact-span candidate" });
    await waitFor(() => expect(addCandidate).toBeEnabled());
    await user.click(addCandidate);

    expect(await screen.findByText("1 pending")).toBeVisible();
    expect(screen.getByRole("button", { name: "Local exhibit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review 1 remaining" })).toBeDisabled();

    const inspector = new IndexedDbExhibitStore();
    const stored = await inspector.load();
    expect(stored?.revision).toBe(2);
    expect(stored?.record.candidates.filter((candidate) => candidate.reviewState === "pending")).toHaveLength(1);
    await inspector.close();
  });
});
