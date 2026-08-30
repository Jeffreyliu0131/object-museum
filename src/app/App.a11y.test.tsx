import axe from "axe-core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { OBJECT_MUSEUM_DB_NAME } from "../adapters/indexeddb-exhibit-store";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OBJECT_MUSEUM_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function expectNoSeriousAxeViolations() {
  const result = await axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({ id: violation.id, help: violation.help, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

describe("main-state accessibility", () => {
  beforeEach(async () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    await deleteDatabase();
  });

  afterEach(async () => {
    cleanup();
    await deleteDatabase();
  });

  it("has no serious or critical axe findings in collection, review and exhibit states", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "A local workbench for one object story" })).toBeVisible();
    await expectNoSeriousAxeViolations();

    await user.click(screen.getByRole("button", { name: "Start with synthetic fixture" }));
    await user.click(await screen.findByRole("button", { name: "Review candidates" }));
    expect(await screen.findByRole("heading", { name: "Decide what the exhibit may say" })).toBeVisible();
    await expectNoSeriousAxeViolations();

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Confirm" })[0]).toBeEnabled());
    for (let remaining = 5; remaining > 0; remaining -= 1) {
      await user.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
      await waitFor(() => expect(screen.getByText(`${remaining - 1} pending`)).toBeVisible());
    }
    await user.click(screen.getByRole("button", { name: "Open local exhibit" }));
    expect(await screen.findByRole("heading", { name: "A local working exhibit in this prototype" })).toBeVisible();
    await expectNoSeriousAxeViolations();
  });
});
