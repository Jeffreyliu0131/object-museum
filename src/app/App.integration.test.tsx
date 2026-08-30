import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function candidateRow(text: string): HTMLElement {
  const content = screen.getAllByText(text, { exact: false }).find((element) => element.closest(".candidate-row"));
  const row = content?.closest(".candidate-row");
  if (!(row instanceof HTMLElement)) throw new Error(`Candidate row not found for ${text}`);
  return row;
}

describe("single-user first exhibit integration", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    await deleteDatabase(OBJECT_MUSEUM_DB_NAME);
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase(OBJECT_MUSEUM_DB_NAME);
  });

  it("runs capture, four review actions, undo, materialization and verified local clear", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "A local workbench for one object story" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    const objectHeading = await screen.findByRole("heading", { name: "Begin with the object itself" });
    await waitFor(() => expect(objectHeading).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Continue to original words" }));
    expect(await screen.findByRole("heading", { name: "Keep the narrator's words authoritative" })).toBeVisible();
    expect(screen.getByText("No audio attached. Text-only is a complete supported path.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Review exact-text candidates" }));
    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();
    expect(screen.getByText("Needs your judgment")).toBeVisible();

    await waitFor(() => expect(screen.getByRole("button", { name: "Show exact source [3, 19)" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Show exact source [3, 19)" }));
    expect(screen.getByLabelText("Fuzzy time source excerpt, code points 3 to 19, end exclusive")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back to candidate" }));
    expect(screen.getByRole("button", { name: "Show exact source [3, 19)" })).toHaveFocus();

    await user.click(within(candidateRow("late spring 2006")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("4 pending")).toBeVisible());

    const person = candidateRow("my brother Sam");
    await user.click(within(person).getByRole("button", { name: "Rewrite" }));
    await user.clear(within(person).getByRole("textbox", { name: /Narrator rewrite/u }));
    await user.type(within(person).getByRole("textbox", { name: /Narrator rewrite/u }), "Sam, my brother");
    await user.click(within(person).getByRole("button", { name: "Save rewrite" }));
    await waitFor(() => expect(screen.getByText("3 pending")).toBeVisible());

    await user.click(within(candidateRow("Montreal")).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Rejected. Its candidate text is absent from durable decision state.")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(candidateRow("Montreal")).toHaveFocus());
    await user.click(within(candidateRow("Montreal")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByText("2 pending")).toBeVisible());

    await user.click(within(candidateRow("two winters later")).getByRole("button", { name: "Uncertain" }));
    await waitFor(() => expect(screen.getByText("1 pending")).toBeVisible());
    await user.click(within(candidateRow("useful things can carry their history")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("0 pending")).toBeVisible());

    await user.click(screen.getByRole("button", { name: "Open local exhibit" }));
    expect(await screen.findByRole("heading", { name: "A local working exhibit in this prototype" })).toBeVisible();
    expect(screen.getByText("4 included")).toBeVisible();
    expect(screen.getByText("Sam, my brother")).toBeVisible();
    expect(screen.getByText("Narrator uncertain")).toBeVisible();
    expect(screen.getAllByText(/SHA-256 [a-f0-9]{64}/u)).toHaveLength(4);
    expect(screen.queryByText("statement was excluded", { exact: false })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Correct candidates" }));
    const reviewedTime = candidateRow("late spring 2006");
    await user.click(within(reviewedTime).getByRole("button", { name: "Change decision" }));
    await waitFor(() => expect(within(candidateRow("late spring 2006")).getByRole("button", { name: "Uncertain" })).toBeEnabled());
    await user.click(within(candidateRow("late spring 2006")).getByRole("button", { name: "Uncertain" }));
    await waitFor(() => expect(screen.getByText("0 pending")).toBeVisible());
    const rejectedPlace = screen.getByText("Rejected. Its candidate text is absent from durable decision state.").closest(".candidate-row") as HTMLElement;
    await waitFor(() => expect(within(rejectedPlace).getByRole("button", { name: "Change decision" })).toBeEnabled());
    await user.click(within(rejectedPlace).getByRole("button", { name: "Change decision" }));
    await waitFor(() => expect(candidateRow("Montreal")).toBeVisible());
    await user.click(within(candidateRow("Montreal")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByText("0 pending")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Open local exhibit" }));
    expect(await screen.findByRole("heading", { name: "A local working exhibit in this prototype" })).toBeVisible();
    expect(screen.getAllByText("Narrator uncertain")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Clear local working copy" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/original files, screenshots, downloads, browser or device backups, other copies and the code-bundled synthetic fixtures/iu);
    await user.click(screen.getByRole("button", { name: "Clear from this browser prototype" }));
    expect(await screen.findByRole("heading", { name: "No local working copy" })).toBeVisible();
    expect(screen.getByText(/Bundled samples are code assets, not restored user data/u)).toBeVisible();
  });

  it("commits dirty object and story drafts before step-rail navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    const title = await screen.findByRole("textbox", { name: /Exhibit title/u });
    await user.clear(title);
    await user.type(title, "Corrected local title");
    await user.click(screen.getByRole("button", { name: "Review candidates" }));
    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Object" }));
    expect(await screen.findByRole("textbox", { name: /Exhibit title/u })).toHaveValue("Corrected local title");
    await user.click(screen.getByRole("button", { name: "Original words" }));
    const story = await screen.findByRole("textbox", { name: /Your original words/u });
    await user.type(story, " Corrected by the narrator.");
    await user.click(screen.getByRole("button", { name: "Review candidates" }));
    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Original words" }));
    expect((await screen.findByRole("textbox", { name: /Your original words/u }) as HTMLTextAreaElement).value).toMatch(/Corrected by the narrator\./u);
    expect(await screen.findByText("No audio attached. Text-only is a complete supported path.")).toBeVisible();
  });

  it("does not let step-rail navigation bypass the required readable source", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    await user.click(await screen.findByRole("button", { name: "Original words" }));
    const story = await screen.findByRole("textbox", { name: /Your original words/u });
    await user.clear(story);
    await user.click(screen.getByRole("button", { name: "Review candidates" }));
    expect(await screen.findByRole("heading", { name: "Keep the narrator's words authoritative" })).toBeVisible();
    expect(screen.getByText("Original words must contain 20 to 2,400 Unicode characters before leaving this step.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Decide what the exhibit may say" })).not.toBeInTheDocument();
  });
});
