import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedDbExhibitStore, OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";
import * as mediaModule from "./media";
import { App } from "./App";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OBJECT_MUSEUM_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("local media operation lifetime", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    await deleteDatabase();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await deleteDatabase();
  });

  it("discards a slow image result after another tab clears its source working copy", async () => {
    let releaseImage: ((value: mediaModule.StoredImageDerivative) => void) | undefined;
    const imageGate = new Promise<mediaModule.StoredImageDerivative>((resolve) => {
      releaseImage = resolve;
    });
    const ingestSpy = vi.spyOn(mediaModule, "ingestImage").mockImplementation(async () => imageGate);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    await screen.findByRole("heading", { name: "Begin with the object itself" });

    const input = screen.getByLabelText(/Choose a local image/iu);
    const upload = user.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff])], "synthetic.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(ingestSpy).toHaveBeenCalledOnce());

    const otherTabStore = new IndexedDbExhibitStore();
    await expect(otherTabStore.clear()).resolves.toMatchObject({ status: "cleared" });
    await otherTabStore.close();
    const channel = new BroadcastChannel("object-museum-local-revision");
    channel.postMessage({ type: "cleared" });
    channel.close();
    await screen.findByRole("heading", { name: "A local workbench for one object story" });
    expect(screen.getByRole("heading", { name: "No local working copy" })).toBeVisible();

    releaseImage?.({
      id: "stale-image",
      kind: "image",
      mime: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,/9j/",
      bytes: 3,
      width: 1,
      height: 1,
      sourceKind: "local_canvas_derivative",
    });
    await upload;

    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    await user.click(await screen.findByRole("button", { name: "Continue to original words" }));
    const inspector = new IndexedDbExhibitStore();
    await expect(inspector.load()).resolves.toMatchObject({
      revision: 2,
      record: { image: { storage: "fixture", id: "/fixtures/cobalt-mug.jpg" } },
    });
    await inspector.close();
  });
});
