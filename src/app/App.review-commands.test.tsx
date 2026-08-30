import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IndexedDbExhibitStore,
  OBJECT_MUSEUM_DB_NAME,
} from "../adapters/indexeddb-exhibit-store";
import { StoreConflictError } from "../ports/exhibit-store";
import { App } from "./App";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function candidateRow(text: string): HTMLElement {
  const content = screen
    .getAllByText(text, { exact: false })
    .find((element) => element.closest(".candidate-row"));
  const row = content?.closest(".candidate-row");
  if (!(row instanceof HTMLElement)) throw new Error(`Candidate row not found for ${text}`);
  return row;
}

async function openReview(): Promise<void> {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "A local workbench for one object story" });
  await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
  await user.click(await screen.findByRole("button", { name: "Continue to original words" }));
  await user.click(await screen.findByRole("button", { name: "Review exact-text candidates" }));
  await screen.findByRole("heading", { name: "Decide what the exhibit may say" });
  await waitFor(() => {
    expect(within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" })).toBeEnabled();
  });
}

describe("Review command submission contract", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    await deleteDatabase(OBJECT_MUSEUM_DB_NAME);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await deleteDatabase(OBJECT_MUSEUM_DB_NAME);
  });

  it("does not start a second candidate commit while a slow decision is still saving", async () => {
    await openReview();

    const originalCommit = IndexedDbExhibitStore.prototype.commitWithMedia;
    let releaseFirstCommit: (() => void) | undefined;
    const firstCommitGate = new Promise<void>((resolve) => {
      releaseFirstCommit = resolve;
    });
    let candidateCommitCount = 0;
    const commitSpy = vi
      .spyOn(IndexedDbExhibitStore.prototype, "commitWithMedia")
      .mockImplementation(async function (this: IndexedDbExhibitStore, input, mediaWrites) {
        candidateCommitCount += 1;
        if (candidateCommitCount === 1) await firstCommitGate;
        return originalCommit.call(this, input, mediaWrites);
      });

    try {
      const firstDecision = within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" });
      const secondDecision = within(candidateRow("my brother Sam")).getByRole("button", { name: "Reject" });
      act(() => {
        firstDecision.click();
        secondDecision.click();
      });

      await waitFor(() => expect(commitSpy).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/was not submitted because another local decision is still saving/iu)).toBeVisible();
    } finally {
      releaseFirstCommit?.();
    }

    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());
    expect(candidateRow("late spring 2006")).toHaveAttribute("data-state", "accepted");
    expect(candidateRow("my brother Sam")).toHaveAttribute("data-state", "pending");
    expect(screen.getByRole("button", { name: "Review 4 remaining" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "The local working copy is unavailable" })).not.toBeInTheDocument();
  });

  it("commits a same-button double click only once", async () => {
    await openReview();

    const originalCommit = IndexedDbExhibitStore.prototype.commitWithMedia;
    let releaseCommit: (() => void) | undefined;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commitSpy = vi
      .spyOn(IndexedDbExhibitStore.prototype, "commitWithMedia")
      .mockImplementation(async function (this: IndexedDbExhibitStore, input, mediaWrites) {
        await commitGate;
        return originalCommit.call(this, input, mediaWrites);
      });

    const confirm = within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" });
    try {
      act(() => {
        confirm.click();
        confirm.click();
      });
      await waitFor(() => expect(commitSpy).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/was not submitted because another local decision is still saving/iu)).toBeVisible();
    } finally {
      releaseCommit?.();
    }

    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());
    const inspector = new IndexedDbExhibitStore();
    await expect(inspector.load()).resolves.toMatchObject({ revision: 4 });
    await inspector.close();
  });

  it("disables decisions, re-open, undo, continue, back and step navigation during a slow save", async () => {
    await openReview();
    const user = userEvent.setup();
    await user.click(within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());
    await screen.findByRole("button", { name: "Undo" });

    const originalCommit = IndexedDbExhibitStore.prototype.commitWithMedia;
    let releaseCommit: (() => void) | undefined;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    vi.spyOn(IndexedDbExhibitStore.prototype, "commitWithMedia")
      .mockImplementation(async function (this: IndexedDbExhibitStore, input, mediaWrites) {
        await commitGate;
        return originalCommit.call(this, input, mediaWrites);
      });

    act(() => {
      within(candidateRow("my brother Sam")).getByRole("button", { name: "Confirm" }).click();
    });
    expect(await screen.findByText("Finishing this local review action.", {}, { timeout: 5_000 })).toBeVisible();

    for (const button of screen.getAllByRole("button", { name: /Confirm|Rewrite|Uncertain|Reject|Change decision|Correct wording/iu })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to words" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review 4 remaining" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Object" })).toBeDisabled();

    releaseCommit?.();
    await waitFor(() => expect(screen.getByText("3 pending")).toBeVisible());
  });

  it("keeps a rewrite draft visible after a storage failure and allows a successful retry", async () => {
    await openReview();
    const user = userEvent.setup();
    const row = candidateRow("my brother Sam");
    await user.click(within(row).getByRole("button", { name: "Rewrite" }));
    const rewrite = within(row).getByRole("textbox", { name: /Narrator rewrite/u });
    await user.clear(rewrite);
    await user.type(rewrite, "Sam, my brother, repaired it");

    vi.spyOn(IndexedDbExhibitStore.prototype, "commitWithMedia")
      .mockRejectedValueOnce(new Error("Synthetic storage write failed"));
    await user.click(within(row).getByRole("button", { name: "Save rewrite" }));

    expect(await screen.findByText("Synthetic storage write failed")).toBeVisible();
    expect(within(candidateRow("my brother Sam")).getByRole("textbox", { name: /Narrator rewrite/u })).toHaveValue("Sam, my brother, repaired it");
    expect(screen.getByText("5 pending")).toBeVisible();
    expect(within(candidateRow("my brother Sam")).getByRole("button", { name: "Save rewrite" })).toBeEnabled();

    await user.click(within(candidateRow("my brother Sam")).getByRole("button", { name: "Save rewrite" }));
    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());
    expect(candidateRow("Sam, my brother, repaired it")).toHaveAttribute("data-state", "accepted");
  });

  it("explains a CAS conflict, reloads the latest copy and permits a new decision", async () => {
    await openReview();
    const user = userEvent.setup();
    vi.spyOn(IndexedDbExhibitStore.prototype, "commitWithMedia")
      .mockRejectedValueOnce(new StoreConflictError(3, 4));

    await user.click(within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("heading", { name: "The local working copy is unavailable" })).toBeVisible();
    expect(screen.getByText(/action was not saved because the working copy changed or was recreated in another tab/iu)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reload working copy" }));
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    await user.click(screen.getByRole("button", { name: "Open working copy" }));
    await screen.findByRole("heading", { name: "Decide what the exhibit may say" });
    expect(screen.getByText("5 pending")).toBeVisible();

    await user.click(within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());
  });
});
