import { createRef } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmCandidate } from "../../domain/candidates";
import type { ExhibitRecord } from "../../domain/types";
import { loadSyntheticFixtureCatalog } from "../../fixtures/records";
import { ReviewScreen, type ReviewAction, type ReviewActionOutcome } from "./ReviewScreen";

afterEach(() => cleanup());

function reviewProps(
  record: ExhibitRecord,
  onAction: (candidateId: string, action: ReviewAction) => Promise<ReviewActionOutcome>,
  busy = false,
) {
  return {
    record,
    unsupportedMode: false,
    busy,
    onAction,
    onAddManualCandidate: vi.fn(async () => null),
    onReextract: vi.fn(async () => undefined),
    onBack: vi.fn(),
    onContinue: vi.fn(),
    headingRef: createRef<HTMLHeadingElement>(),
  };
}

async function oneCandidateRecord(disposition: "pending" | "accepted" = "pending") {
  const catalog = await loadSyntheticFixtureCatalog();
  const record = structuredClone(catalog.activeEnvelope.record);
  const candidate = record.candidates[0];
  record.candidates = [
    disposition === "accepted"
      ? confirmCandidate(candidate, "2026-08-30T01:00:00.000Z").candidate
      : candidate,
  ];
  return record;
}

async function waitForReviewControl(name: string) {
  const control = screen.getByRole("button", { name });
  await waitFor(() => expect(control).toBeEnabled());
  return control;
}

describe("Review source quarantine", () => {
  it("blocks exhibit materialization and offers re-extraction when current source bytes drift", async () => {
    const catalog = await loadSyntheticFixtureCatalog();
    const record = structuredClone(catalog.activeEnvelope.record);
    record.source.text += " tampered";
    const onReextract = vi.fn(async () => undefined);
    render(
      <ReviewScreen
        record={record}
        unsupportedMode={false}
        busy={false}
        onAction={vi.fn(async () => "committed" as const)}
        onAddManualCandidate={vi.fn(async () => null)}
        onReextract={onReextract}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        headingRef={createRef<HTMLHeadingElement>()}
      />,
    );

    await waitFor(() => expect(screen.getByText(/current source revision failed/iu)).toBeVisible());
    expect(screen.getAllByText("Source contract failed")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Review 5 remaining" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reset decisions and re-extract" }));
    expect(onReextract).toHaveBeenCalledOnce();
  });
});

describe("Review focus recovery", () => {
  it("focuses an exact source mark only for a newly requested source jump", async () => {
    const user = userEvent.setup();
    const record = await oneCandidateRecord();
    const onAction = vi.fn(async () => "committed" as const);
    const props = reviewProps(record, onAction);
    const { rerender } = render(<ReviewScreen {...props} />);

    const sourceTrigger = await waitForReviewControl("Show exact source [3, 19)");
    await user.click(sourceTrigger);
    const sourceMark = screen.getByLabelText("Fuzzy time source excerpt, code points 3 to 19, end exclusive");
    expect(sourceMark).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Back to candidate" }));
    expect(sourceTrigger).toHaveFocus();

    rerender(<ReviewScreen {...props} record={structuredClone(record)} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Show exact source [3, 19)" })).toHaveFocus());
    expect(sourceMark).not.toHaveFocus();
  });

  it.each([
    { control: "Confirm", disposition: "pending" as const },
    { control: "Uncertain", disposition: "pending" as const },
    { control: "Reject", disposition: "pending" as const },
    { control: "Change decision", disposition: "accepted" as const },
  ])("moves focus to the candidate result after committed $control", async ({ control, disposition }) => {
    const user = userEvent.setup();
    const record = await oneCandidateRecord(disposition);
    const onAction = vi.fn(async () => "committed" as const);
    render(<ReviewScreen {...reviewProps(record, onAction)} />);

    const action = await waitForReviewControl(control);
    await user.click(action);

    await waitFor(() => expect(screen.getByRole("listitem", { name: /Fuzzy time candidate/iu })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("moves focus to the candidate result after a committed rewrite removes its editor", async () => {
    const user = userEvent.setup();
    const record = await oneCandidateRecord();
    const onAction = vi.fn(async () => "committed" as const);
    render(<ReviewScreen {...reviewProps(record, onAction)} />);

    await user.click(await waitForReviewControl("Rewrite"));
    const editor = screen.getByRole("textbox", { name: /^Narrator rewrite/iu });
    await user.clear(editor);
    await user.type(editor, "Late spring, probably 2006");
    await user.click(screen.getByRole("button", { name: "Save rewrite" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: /^Narrator rewrite/iu })).not.toBeInTheDocument());
    expect(screen.getByRole("listitem", { name: /Fuzzy time candidate/iu })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it.each([
    { control: "Confirm", disposition: "pending" as const },
    { control: "Uncertain", disposition: "pending" as const },
    { control: "Reject", disposition: "pending" as const },
    { control: "Change decision", disposition: "accepted" as const },
  ])("returns focus to $control after a failed save and a busy interval", async ({ control, disposition }) => {
    const user = userEvent.setup();
    const record = await oneCandidateRecord(disposition);
    let settle: ((outcome: ReviewActionOutcome) => void) | undefined;
    const onAction = vi.fn(() => new Promise<ReviewActionOutcome>((resolve) => { settle = resolve; }));
    const props = reviewProps(record, onAction);
    const { rerender } = render(<ReviewScreen {...props} />);

    const action = await waitForReviewControl(control);
    await user.click(action);
    rerender(<ReviewScreen {...props} busy />);
    screen.getByRole("heading", { name: "Decide what the exhibit may say" }).focus();

    await act(async () => settle?.("failed"));
    rerender(<ReviewScreen {...props} busy={false} />);

    await waitFor(() => expect(screen.getByRole("button", { name: control })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps a rewrite draft through busy and failure, then restores focus to Save rewrite", async () => {
    const user = userEvent.setup();
    const record = await oneCandidateRecord();
    let settle: ((outcome: ReviewActionOutcome) => void) | undefined;
    const onAction = vi.fn(() => new Promise<ReviewActionOutcome>((resolve) => { settle = resolve; }));
    const props = reviewProps(record, onAction);
    const { rerender } = render(<ReviewScreen {...props} />);

    await user.click(await waitForReviewControl("Rewrite"));
    const editor = screen.getByRole("textbox", { name: /^Narrator rewrite/iu });
    await user.clear(editor);
    await user.type(editor, "Late spring, probably 2006");
    await user.click(screen.getByRole("button", { name: "Save rewrite" }));

    rerender(<ReviewScreen {...props} busy />);
    expect(screen.getByRole("textbox", { name: /^Narrator rewrite/iu })).toHaveValue("Late spring, probably 2006");
    expect(screen.getByRole("textbox", { name: /^Narrator rewrite/iu })).toBeDisabled();
    screen.getByRole("heading", { name: "Decide what the exhibit may say" }).focus();

    await act(async () => settle?.("failed"));
    rerender(<ReviewScreen {...props} busy={false} />);

    const row = screen.getByRole("listitem", { name: /Fuzzy time candidate/iu });
    expect(within(row).getByRole("textbox", { name: /^Narrator rewrite/iu })).toHaveValue("Late spring, probably 2006");
    await waitFor(() => expect(within(row).getByRole("button", { name: "Save rewrite" })).toHaveFocus());
  });
});
