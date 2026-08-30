import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";
import { App } from "./App";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OBJECT_MUSEUM_DB_NAME);
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

async function tabTo(user: UserEvent, target: HTMLElement, maxTabs = 80): Promise<void> {
  for (let index = 0; index < maxTabs && document.activeElement !== target; index += 1) {
    await user.tab();
  }
  expect(target).toHaveFocus();
}

describe("complete keyboard path", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    await deleteDatabase();
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase();
  });

  it("completes one reviewed exhibit and returns dialog focus without pointer input", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "A local workbench for one object story" });

    const start = screen.getByRole("button", { name: "Start with synthetic fixture" });
    await tabTo(user, start);
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Begin with the object itself" });

    const continueObject = screen.getByRole("button", { name: "Continue to original words" });
    await tabTo(user, continueObject);
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Keep the narrator's words authoritative" });

    const continueStory = screen.getByRole("button", { name: "Review exact-text candidates" });
    await tabTo(user, continueStory);
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Decide what the exhibit may say" });
    const firstSource = await screen.findByRole("button", { name: "Show exact source [3, 19)" });
    await waitFor(() => expect(firstSource).toBeEnabled());

    await tabTo(user, firstSource);
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Fuzzy time source excerpt, code points 3 to 19, end exclusive")).toHaveFocus();
    const backToCandidate = screen.getByRole("button", { name: "Back to candidate" });
    await tabTo(user, backToCandidate);
    await user.keyboard("{Enter}");
    expect(firstSource).toHaveFocus();

    const confirmTime = within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" });
    await tabTo(user, confirmTime);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());

    let person = candidateRow("my brother Sam");
    const rewritePerson = within(person).getByRole("button", { name: "Rewrite" });
    await tabTo(user, rewritePerson);
    await user.keyboard("{Enter}");
    person = candidateRow("my brother Sam");
    const rewriteText = within(person).getByRole("textbox", { name: /Narrator rewrite/u });
    await tabTo(user, rewriteText);
    await user.keyboard("{Control>}a{/Control}Sam, my brother");
    const saveRewrite = within(person).getByRole("button", { name: "Save rewrite" });
    await tabTo(user, saveRewrite);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("3 pending")).toBeVisible());

    const rejectPlace = within(candidateRow("Montreal")).getByRole("button", { name: "Reject" });
    await tabTo(user, rejectPlace);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("2 pending")).toBeVisible());

    const uncertainEvent = within(candidateRow("two winters later")).getByRole("button", { name: "Uncertain" });
    await tabTo(user, uncertainEvent);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("1 pending")).toBeVisible());

    const confirmTestimony = within(candidateRow("useful things can carry their history")).getByRole("button", { name: "Confirm" });
    await tabTo(user, confirmTestimony);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("0 pending")).toBeVisible());

    const openExhibit = screen.getByRole("button", { name: "Open local exhibit" });
    await tabTo(user, openExhibit);
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "A local working exhibit in this prototype" });

    const clearTrigger = screen.getByRole("button", { name: "Clear local working copy" });
    await tabTo(user, clearTrigger);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(clearTrigger).toHaveFocus());
  }, 15_000);
});
