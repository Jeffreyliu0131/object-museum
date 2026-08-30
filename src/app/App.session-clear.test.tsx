import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { IndexedDbExhibitStore, OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";
import { loadSyntheticFixtureCatalog } from "../fixtures/records";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OBJECT_MUSEUM_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("session-only clear boundary", () => {
  afterEach(async () => {
    cleanup();
    window.history.replaceState({}, "", "/");
    await deleteDatabase();
  });

  it("clears only the in-memory session and never claims inaccessible IndexedDB was deleted", async () => {
    await deleteDatabase();
    const catalog = await loadSyntheticFixtureCatalog();
    const persistedStore = new IndexedDbExhibitStore();
    await persistedStore.commit({ expectedRevision: null, next: structuredClone(catalog.activeEnvelope) });
    await persistedStore.close();

    window.history.replaceState({}, "", "/?storage=session");
    const { App } = await import("./App");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    expect(screen.getByText(/Clear can verify only this in-memory session/iu)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    await user.click(await screen.findByRole("button", { name: "Review candidates" }));
    await screen.findByRole("heading", { name: "Decide what the exhibit may say" });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Confirm" })[0]).toBeEnabled());
    for (let remaining = 5; remaining > 0; remaining -= 1) {
      await user.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
      await waitFor(() => expect(screen.getByText(`${remaining - 1} pending`)).toBeVisible());
    }
    await user.click(screen.getByRole("button", { name: "Open local exhibit" }));
    await screen.findByRole("heading", { name: "A local working exhibit in this prototype" });
    expect(screen.getByText(/Unavailable persistent browser storage is not inspected or claimed cleared/iu)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear local working copy" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Not removed or inspected.*unavailable persistent browser storage/iu);
    await user.click(screen.getByRole("button", { name: "Clear this session copy" }));
    await screen.findByRole("heading", { name: "No local working copy" });

    const inspector = new IndexedDbExhibitStore();
    await expect(inspector.load()).resolves.toMatchObject({ revision: 1, recordId: catalog.activeEnvelope.recordId });
    await inspector.close();
  }, 15_000);
});
