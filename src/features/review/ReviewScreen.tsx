import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Callout, TextArea } from "@radix-ui/themes";
import {
  ArrowLeft,
  ArrowRight,
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  LinkSimple,
  PencilSimple,
  Prohibit,
  Question,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { codePointLength, sha256Utf8, sliceByCodePoint, validateSourceSpan } from "../../domain/provenance";
import type { CandidateCategory, DurableCandidate, ExhibitRecord, SourceSpan } from "../../domain/types";

export type ReviewAction =
  | { kind: "confirm" }
  | { kind: "mark_uncertain" }
  | { kind: "reject" }
  | { kind: "reopen" }
  | { kind: "rewrite"; text: string; certainty: "asserted" | "uncertain" };

export type ReviewActionOutcome = "committed" | "not_submitted" | "failed";

const categoryLabels: Record<DurableCandidate["category"], string> = {
  fuzzy_time: "Fuzzy time",
  person: "Person",
  place: "Place",
  event: "Event",
  why_it_matters: "Narrator testimony",
};

const supportCopy = {
  exact: { label: "Exact text match", detail: "The rule selected a literal source span.", icon: CheckCircle },
  ambiguous: { label: "Needs your judgment", detail: "The text is exact, but its category or boundary is ambiguous.", icon: WarningCircle },
  unsupported: { label: "Unsupported extraction", detail: "Keep the original source or select a text span manually.", icon: Prohibit },
} as const;

interface ReviewScreenProps {
  record: ExhibitRecord;
  unsupportedMode: boolean;
  busy: boolean;
  onAction: (candidateId: string, action: ReviewAction) => Promise<ReviewActionOutcome>;
  onAddManualCandidate: (excerpt: string, category: CandidateCategory) => Promise<string | null>;
  onReextract: () => Promise<void>;
  onBack: () => void;
  onContinue: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

function candidateSpan(candidate: DurableCandidate): SourceSpan | null {
  return candidate.reviewState === "rejected" ? null : candidate.sourceSpan;
}

function SourcePanel({ record, activeCandidate, onBackToCandidate, focusRequest }: {
  record: ExhibitRecord;
  activeCandidate: DurableCandidate | null;
  onBackToCandidate: () => void;
  focusRequest: number;
}) {
  const markRef = useRef<HTMLElement>(null);
  const handledFocusRequestRef = useRef(0);
  const span = activeCandidate ? candidateSpan(activeCandidate) : null;
  const source = record.source;
  const sourceParts = useMemo(() => {
    if (!span) return null;
    return {
      before: sliceByCodePoint(source.text, 0, span.start),
      excerpt: sliceByCodePoint(source.text, span.start, span.end),
      after: sliceByCodePoint(source.text, span.end, source.codePointLength),
    };
  }, [source, span]);

  useEffect(() => {
    if (focusRequest <= handledFocusRequestRef.current) return;
    handledFocusRequestRef.current = focusRequest;
    if (!span || !markRef.current) return;
    markRef.current.focus({ preventScroll: true });
    markRef.current.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }, [span, activeCandidate?.id, focusRequest]);

  return (
    <aside className="review-source source-panel" aria-labelledby="source-panel-title">
      <div className="source-panel__header">
        <div>
          <p className="eyebrow">Authoritative text revision</p>
          <h2 id="source-panel-title">Original words</h2>
        </div>
        <Badge
          className="status-label"
          variant="outline"
          title={`SHA-256 ${source.sha256}`}
          aria-label={`SHA-256 ${source.sha256}`}
        >
          SHA-256 · {source.sha256.slice(0, 10)}
        </Badge>
      </div>
      <blockquote className="source-panel__body source-excerpt">
        {sourceParts && span ? (
          <>
            {sourceParts.before}
            <mark
              id={`source-span-${activeCandidate?.id}`}
              className="source-mark"
              ref={markRef}
              tabIndex={-1}
              aria-label={`${categoryLabels[activeCandidate!.category]} source excerpt, code points ${span.start} to ${span.end}, end exclusive`}
            >
              {sourceParts.excerpt}
            </mark>
            {sourceParts.after}
          </>
        ) : source.text}
      </blockquote>
      <div className="source-meta">
        <span>Revision {source.id}</span>
        {span ? <span>Unicode code points [{span.start}, {span.end})</span> : <span>No candidate selected</span>}
      </div>
      {span ? (
        <Button className="button button--quiet" variant="ghost" onClick={onBackToCandidate}>
          <ArrowLeft size={17} /> Back to candidate
        </Button>
      ) : null}
    </aside>
  );
}

function CandidateRow({ candidate, onShowSource, onAction, sourceIssue, sourceChecking, busy }: {
  candidate: DurableCandidate;
  onShowSource: () => void;
  onAction: (action: ReviewAction) => Promise<ReviewActionOutcome>;
  sourceIssue?: string;
  sourceChecking: boolean;
  busy: boolean;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);
  const handledActionFocusRequestRef = useRef(0);
  const [editing, setEditing] = useState(false);
  const [actionFocusRequest, setActionFocusRequest] = useState(0);
  const [rewriteText, setRewriteText] = useState(candidate.reviewState === "rejected" ? "" : candidate.text);
  const [rewriteCertainty, setRewriteCertainty] = useState<"asserted" | "uncertain">(
    candidate.reviewState === "accepted" ? candidate.certainty : "asserted",
  );
  const support = supportCopy[candidate.supportStatus];
  const displayedSupport = sourceIssue
    ? { label: "Source mismatch · quarantined", icon: WarningCircle }
    : support;
  const SupportIcon = displayedSupport.icon;
  const rejected = candidate.reviewState === "rejected";
  const accepted = candidate.reviewState === "accepted";
  const focusLabel = sourceIssue
    ? `${categoryLabels[candidate.category]} candidate. Quarantined because its source no longer matches.`
    : rejected
      ? `${categoryLabels[candidate.category]} candidate. Rejected.`
      : accepted
        ? `${categoryLabels[candidate.category]} candidate. Reviewed${candidate.certainty === "uncertain" ? ", narrator marked uncertain" : ""}.`
        : `${categoryLabels[candidate.category]} candidate. Decision required.`;

  const requestFocusAfterAction = (outcome: ReviewActionOutcome, initiatingControl: HTMLElement) => {
    pendingFocusTargetRef.current = outcome === "committed" ? null : initiatingControl;
    setActionFocusRequest((value) => value + 1);
  };

  const submitAction = async (action: ReviewAction, initiatingControl: HTMLElement) => {
    const outcome = await onAction(action);
    requestFocusAfterAction(outcome, initiatingControl);
    return outcome;
  };

  useEffect(() => {
    if (busy || actionFocusRequest <= handledActionFocusRequestRef.current) return;
    handledActionFocusRequestRef.current = actionFocusRequest;
    const requestedTarget = pendingFocusTargetRef.current;
    const targetIsAvailable = requestedTarget?.isConnected
      && !(requestedTarget instanceof HTMLButtonElement && requestedTarget.disabled);
    const focusTarget = targetIsAvailable ? requestedTarget : rowRef.current;
    focusTarget?.focus({ preventScroll: true });
    pendingFocusTargetRef.current = null;
  }, [actionFocusRequest, busy]);

  return (
    <li
      ref={rowRef}
      id={`candidate-row-${candidate.id}`}
      className="candidate-row"
      tabIndex={-1}
      aria-label={focusLabel}
      data-support={sourceIssue ? "unsupported" : candidate.supportStatus}
      data-state={candidate.reviewState}
      data-certainty={accepted ? candidate.certainty : undefined}
    >
      <div className="candidate-row__main">
        <div className="candidate-meta-row">
          <span className="candidate-type">{categoryLabels[candidate.category]}</span>
          <span className={!sourceIssue && candidate.supportStatus === "exact" ? "support-status" : "support-status support-status--low"}>
            <SupportIcon className="support-status__icon" size={16} weight="bold" aria-hidden="true" />
            {displayedSupport.label}
          </span>
          {accepted && candidate.certainty === "uncertain" ? (
            <span className="certainty-status"><Question className="certainty-status__icon" size={16} /> Narrator marked uncertain</span>
          ) : null}
        </div>

        {sourceIssue ? (
          <div className="error-state" role="alert">
            <WarningCircle size={18} aria-hidden="true" />
            <div>
              <strong>Source contract failed</strong>
              <p>{sourceIssue}. This candidate is quarantined and cannot enter the exhibit.</p>
            </div>
          </div>
        ) : rejected ? (
          <p className="candidate-caption">Rejected. Its candidate text is absent from durable decision state.</p>
        ) : (
          <>
            <p className="candidate-text" data-authorship={accepted ? candidate.authorship : "source_exact"}>
              {accepted && candidate.authorship === "narrator_edited" ? candidate.text : `“${candidate.text}”`}
            </p>
            <p className="candidate-caption">
              {support.detail} {accepted && candidate.authorship === "narrator_edited" ? "Wording rewritten by the narrator." : ""}
            </p>
            <button
              id={`source-trigger-${candidate.id}`}
              type="button"
              className="button button--quiet source-link"
              disabled={sourceChecking || busy}
              onClick={onShowSource}
            >
              <LinkSimple size={17} /> Show exact source [{candidate.sourceSpan.start}, {candidate.sourceSpan.end})
            </button>
          </>
        )}

        {editing && !rejected ? (
          <div className="candidate-edit">
            <label className="field">
              <span className="field__label">Narrator rewrite</span>
              <TextArea value={rewriteText} rows={3} disabled={busy} onChange={(event) => setRewriteText(event.currentTarget.value)} />
              <span className="field__hint">This will be labeled as rewritten, not displayed as an exact quote.</span>
            </label>
            <fieldset className="field">
              <legend className="legend">Narrator certainty</legend>
              <label className="choice-row">
                <input type="radio" name={`certainty-${candidate.id}`} checked={rewriteCertainty === "asserted"} disabled={busy} onChange={() => setRewriteCertainty("asserted")} />
                Asserted by the narrator
              </label>
              <label className="choice-row">
                <input type="radio" name={`certainty-${candidate.id}`} checked={rewriteCertainty === "uncertain"} disabled={busy} onChange={() => setRewriteCertainty("uncertain")} />
                Narrator is uncertain
              </label>
            </fieldset>
            <div className="candidate-actions">
              <Button
                className="button button--primary"
                disabled={!rewriteText.trim() || busy}
                onClick={async (event) => {
                  const outcome = await submitAction(
                    { kind: "rewrite", text: rewriteText, certainty: rewriteCertainty },
                    event.currentTarget,
                  );
                  if (outcome === "committed") setEditing(false);
                }}
              >
                <Check size={17} /> {busy ? "Saving decision" : "Save rewrite"}
              </Button>
              <Button className="button button--quiet" variant="ghost" disabled={busy} onClick={() => setEditing(false)}><X size={17} /> Cancel</Button>
            </div>
          </div>
        ) : null}
      </div>

      {sourceIssue ? null : !rejected && !editing && !accepted ? (
        <div className="candidate-row__actions candidate-actions" aria-label={`Review ${categoryLabels[candidate.category]}`}>
          <Button className="button button--primary" disabled={busy || sourceChecking || candidate.supportStatus === "unsupported"} onClick={(event) => void submitAction({ kind: "confirm" }, event.currentTarget)}><Check size={17} /> Confirm</Button>
          <Button className="button button--secondary" variant="outline" disabled={busy || sourceChecking || candidate.supportStatus === "unsupported"} onClick={() => setEditing(true)}><PencilSimple size={17} /> Rewrite</Button>
          <Button className="button button--secondary" variant="outline" disabled={busy || sourceChecking || candidate.supportStatus === "unsupported"} onClick={(event) => void submitAction({ kind: "mark_uncertain" }, event.currentTarget)}><Question size={17} /> Uncertain</Button>
          <Button className="button button--quiet" variant="ghost" disabled={busy || sourceChecking} onClick={(event) => void submitAction({ kind: "reject" }, event.currentTarget)}><X size={17} /> Reject</Button>
        </div>
      ) : accepted && !editing ? (
        <div className="candidate-row__actions candidate-actions">
          <span className="status-label"><Check size={15} /> Reviewed</span>
          <Button className="button button--secondary" variant="outline" disabled={busy || sourceChecking} onClick={(event) => void submitAction({ kind: "reopen" }, event.currentTarget)}><ArrowCounterClockwise size={17} /> Change decision</Button>
          <Button className="button button--quiet" variant="ghost" disabled={busy || sourceChecking} onClick={() => { setRewriteText(candidate.text); setRewriteCertainty(candidate.certainty); setEditing(true); }}><PencilSimple size={17} /> Correct wording</Button>
        </div>
      ) : rejected ? (
        <div className="candidate-row__actions candidate-actions">
          <Button className="button button--secondary" variant="outline" disabled={busy || sourceChecking} onClick={(event) => void submitAction({ kind: "reopen" }, event.currentTarget)}><ArrowCounterClockwise size={17} /> Change decision</Button>
        </div>
      ) : null}
    </li>
  );
}

export function ReviewScreen({ record, unsupportedMode, busy, onAction, onAddManualCandidate, onReextract, onBack, onContinue, headingRef }: ReviewScreenProps) {
  const visibleCandidates = useMemo(() => unsupportedMode ? [] : record.candidates, [unsupportedMode, record.candidates]);
  const sourceCheckKey = useMemo(
    () => `${record.source.id}:${record.source.sha256}:${visibleCandidates.map((candidate) => `${candidate.id}:${candidate.reviewState}:${candidate.reviewState === "rejected" ? candidate.rejectedAt : candidate.text}`).join("|")}`,
    [record.source.id, record.source.sha256, visibleCandidates],
  );
  const [sourceCheck, setSourceCheck] = useState<{ key: string; issues: Record<string, string> }>({ key: "", issues: {} });
  const firstWithSpan = visibleCandidates.find((candidate) => candidate.reviewState !== "rejected") ?? null;
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(firstWithSpan?.id ?? null);
  const [sourceFocusRequest, setSourceFocusRequest] = useState(0);
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [manualCategory, setManualCategory] = useState<CandidateCategory>("event");
  const [manualError, setManualError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const issues: Record<string, string> = {};
      const actualHash = await sha256Utf8(record.source.text);
      if (actualHash !== record.source.sha256 || codePointLength(record.source.text) !== record.source.codePointLength) {
        issues.__source__ = "source_hash_or_length_mismatch";
      }
      const results = await Promise.all(visibleCandidates.map(async (candidate) => {
        if (candidate.reviewState === "rejected") return null;
        const validation = await validateSourceSpan(record.source, candidate.sourceSpan);
        if (!validation.valid) return [candidate.id, validation.reason] as const;
        if (candidate.reviewState === "accepted" && candidate.authorship === "source_exact" && candidate.text !== validation.excerpt) {
          return [candidate.id, "candidate_text_mismatch"] as const;
        }
        if (candidate.reviewState === "pending" && candidate.text !== validation.excerpt) {
          return [candidate.id, "candidate_text_mismatch"] as const;
        }
        return null;
      }));
      if (cancelled) return;
      for (const result of results) {
        if (result) issues[result[0]] = result[1];
      }
      setSourceCheck({
        key: sourceCheckKey,
        issues,
      });
    })();
    return () => { cancelled = true; };
  }, [record.source, sourceCheckKey, visibleCandidates]);

  const sourceCheckStatus = sourceCheck.key === sourceCheckKey ? "ready" : "checking";
  const sourceIntegrityIssue = Boolean(sourceCheck.issues.__source__);
  const candidateIssueCount = visibleCandidates.filter((candidate) => sourceCheck.issues[candidate.id]).length;
  const activeCandidateMatch = visibleCandidates.find((candidate) => candidate.id === activeCandidateId) ?? null;
  const activeCandidate = activeCandidateMatch && !sourceCheck.issues[activeCandidateMatch.id] ? activeCandidateMatch : null;
  const pendingCount = visibleCandidates.filter((candidate) => candidate.reviewState === "pending").length;
  const canContinue = !busy && sourceCheckStatus === "ready" && Object.keys(sourceCheck.issues).length === 0 && (unsupportedMode || pendingCount === 0 || visibleCandidates.length === 0);
  const adapterLabel = unsupportedMode
    ? "No supported extraction · no model"
    : visibleCandidates.length > 0 && visibleCandidates.every((candidate) => candidate.candidateOrigin === "user_selected")
      ? "Manual exact span · no model"
      : "Exact-text extraction · no model";

  const returnToCandidate = () => {
    if (!activeCandidateId) return;
    document.getElementById(`source-trigger-${activeCandidateId}`)?.focus();
  };

  return (
    <section className="page" aria-labelledby="review-title" aria-busy={busy}>
      <header className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Step 3 of 4 · Review</p>
          <h1 id="review-title" ref={headingRef} tabIndex={-1}>Decide what the exhibit may say</h1>
          <p className="lede">Each candidate is exact text plus a category suggestion. You remain the editor; the system does not add memory content.</p>
        </div>
        <div className="page-header__actions">
          <Badge className="status-label" variant="outline">
            {Object.keys(sourceCheck.issues).length ? `${candidateIssueCount} quarantined` : `${pendingCount} pending`}
          </Badge>
          <Badge className="local-label" variant="outline">{adapterLabel}</Badge>
        </div>
      </header>

      {unsupportedMode ? (
        <Callout.Root className="unsupported-state" color="amber" role="status">
          <Callout.Icon><Prohibit size={19} /></Callout.Icon>
          <Callout.Text>
            <strong>Unsupported extraction QA scenario.</strong> The adapter returned no candidates. The original words remain intact and can form a source-only local exhibit.
          </Callout.Text>
        </Callout.Root>
      ) : null}

      {busy ? (
        <Callout.Root className="alert" color="indigo" role="status">
          <Callout.Text><strong>Finishing this local review action.</strong> Review controls will be available again when it completes.</Callout.Text>
        </Callout.Root>
      ) : null}

      {sourceCheckStatus === "checking" ? (
        <Callout.Root className="alert" color="gray" role="status">
          <Callout.Text>Checking every candidate against the current source revision.</Callout.Text>
        </Callout.Root>
      ) : Object.keys(sourceCheck.issues).length ? (
        <Callout.Root className="error-state" color="red" role="alert">
          <Callout.Icon><WarningCircle size={19} /></Callout.Icon>
          <Callout.Text>
            <strong>{sourceIntegrityIssue ? "The current source revision failed its hash or length check." : `${candidateIssueCount} candidate source contract failed.`}</strong> Quarantined candidates cannot enter the exhibit. Re-extraction creates a fresh revision from the current visible text and resets every candidate decision.
            <Button className="button button--secondary" variant="outline" disabled={busy} onClick={() => void onReextract()}>Reset decisions and re-extract</Button>
          </Callout.Text>
        </Callout.Root>
      ) : null}

      <div className="review-layout">
        <SourcePanel record={record} activeCandidate={activeCandidate} focusRequest={sourceFocusRequest} onBackToCandidate={returnToCandidate} />
        <section className="candidate-panel" aria-labelledby="candidate-title">
          <div className="candidate-panel__header">
            <div>
              <p className="eyebrow">Narrator review</p>
              <h2 id="candidate-title">Candidate statements</h2>
            </div>
            <span className="status-label">{visibleCandidates.length} total</span>
          </div>
          {visibleCandidates.length ? (
            <ul className="candidate-list">
              {visibleCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  sourceIssue={sourceCheck.issues[candidate.id]}
                  sourceChecking={sourceCheckStatus === "checking"}
                  busy={busy}
                  onShowSource={() => {
                    setActiveCandidateId(candidate.id);
                    setSourceFocusRequest((value) => value + 1);
                  }}
                  onAction={(action) => onAction(candidate.id, action)}
                />
              ))}
            </ul>
          ) : (
            <div className="state-page unsupported-state">
              <div className="state-page__inner">
                <Prohibit className="state-icon" size={28} />
                <h3 className="state-title">No supported candidates</h3>
                <p className="state-description">Continue with the original source only. Nothing will be inferred or filled in.</p>
              </div>
            </div>
          )}
          <form
            className="manual-candidate panel__body"
            onSubmit={async (event) => {
              event.preventDefault();
              const error = await onAddManualCandidate(manualExcerpt, manualCategory);
              setManualError(error);
              if (!error) setManualExcerpt("");
            }}
          >
            <div>
              <p className="eyebrow">No-model fallback</p>
              <h3>Select an exact text span manually</h3>
              <p className="candidate-caption">Paste a unique exact phrase from the original words. It becomes one review candidate; nothing is rewritten.</p>
            </div>
            <label className="field">
              <span className="field__label">Exact source phrase</span>
              <TextArea value={manualExcerpt} rows={2} disabled={busy} onChange={(event) => setManualExcerpt(event.currentTarget.value)} aria-describedby={manualError ? "manual-candidate-error" : undefined} />
            </label>
            <label className="field">
              <span className="field__label">Category metadata</span>
              <select className="select" value={manualCategory} disabled={busy} onChange={(event) => setManualCategory(event.currentTarget.value as CandidateCategory)}>
                <option value="fuzzy_time">Fuzzy time</option>
                <option value="person">Person</option>
                <option value="place">Place</option>
                <option value="event">Event</option>
                <option value="why_it_matters">Narrator testimony</option>
              </select>
            </label>
            {manualError ? <p className="field__message field__message--error" id="manual-candidate-error" role="alert">{manualError}</p> : null}
            <Button className="button button--secondary" variant="outline" type="submit" disabled={!manualExcerpt.trim() || busy || sourceCheckStatus === "checking" || sourceIntegrityIssue}>Add exact-span candidate</Button>
          </form>
        </section>
      </div>

      <div className="mobile-sticky-actions page-actions">
        <Button className="button button--quiet" variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft size={18} /> Back to words</Button>
        <Button className="button button--primary" size="3" disabled={!canContinue} onClick={onContinue}>
          {unsupportedMode ? "Open source-only exhibit" : pendingCount ? `Review ${pendingCount} remaining` : "Open local exhibit"} <ArrowRight size={18} />
        </Button>
      </div>
    </section>
  );
}
