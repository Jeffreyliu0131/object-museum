import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterializedPrivateExhibit } from "../../domain/materialize";
import { ExhibitScreen } from "./ExhibitScreen";

describe("stored text rendering", () => {
  afterEach(() => cleanup());
  it("renders hostile stored strings as text rather than executable markup", () => {
    const exhibit: MaterializedPrivateExhibit = {
      recordId: "xss-record",
      revision: 1,
      title: '<img src="x" onerror="alert(1)">',
      objectName: "Synthetic object",
      contentOrigin: "synthetic_fixture",
      fixtureId: "xss-fixture",
      narrator: { id: "narrator", label: "Synthetic narrator" },
      sourceText: '<script>document.body.dataset.compromised="true"</script>',
      image: {
        id: "/fixtures/cobalt-mug.jpg",
        kind: "image",
        storage: "fixture",
        mimeType: "image/jpeg",
        altText: "Synthetic cobalt mug",
      },
      audio: null,
      audioHasTextEquivalent: false,
      accessibilityComplete: true,
      statements: [],
    };

    render(
      <ExhibitScreen
        exhibit={exhibit}
        imageUrl="/fixtures/cobalt-mug.jpg"
        audioUrl={null}
        quarantined={[]}
        clearBusy={false}
        clearError={null}
        storageMode="indexeddb"
        onCorrect={vi.fn()}
        onCollection={vi.fn()}
        onClear={vi.fn()}
        headingRef={createRef<HTMLHeadingElement>()}
      />,
    );

    expect(screen.getByRole("heading", { name: '<img src="x" onerror="alert(1)">' })).toBeVisible();
    expect(screen.getByText('<script>document.body.dataset.compromised="true"</script>', { exact: false })).toBeVisible();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.dataset.compromised).toBeUndefined();
  });

  it("keeps the clear dialog open until the app can prove that clear succeeded", async () => {
    const exhibit: MaterializedPrivateExhibit = {
      recordId: "clear-record",
      revision: 1,
      title: "Synthetic clear fixture",
      objectName: "Synthetic object",
      contentOrigin: "synthetic_fixture",
      fixtureId: "clear-fixture",
      narrator: { id: "narrator", label: "Synthetic narrator" },
      sourceText: "Synthetic source text for clear behavior.",
      image: null,
      audio: null,
      audioHasTextEquivalent: false,
      accessibilityComplete: true,
      statements: [],
    };
    const onClear = vi.fn(async () => undefined);
    render(
      <ExhibitScreen
        exhibit={exhibit}
        imageUrl={null}
        audioUrl={null}
        quarantined={[]}
        clearBusy={false}
        clearError="Synthetic verification failure"
        storageMode="indexeddb"
        onCorrect={vi.fn()}
        onCollection={vi.fn()}
        onClear={onClear}
        headingRef={createRef<HTMLHeadingElement>()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear local working copy" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Synthetic verification failure");
    await userEvent.click(screen.getByRole("button", { name: "Clear from this browser prototype" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
});
