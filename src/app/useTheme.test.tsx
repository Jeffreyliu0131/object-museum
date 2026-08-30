import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThemePreference } from "./useTheme";

function ThemeHarness() {
  const { preference, resolved, setPreference } = useThemePreference();
  return (
    <div>
      <output>{preference}:{resolved}</output>
      <button type="button" onClick={() => setPreference("dark")}>Use dark</button>
    </div>
  );
}

describe("theme preference degradation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("keeps theme controls usable when localStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    render(<ThemeHarness />);
    expect(screen.getByText("system:light")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use dark" }));
    expect(screen.getByText("dark:dark")).toBeVisible();
  });
});
