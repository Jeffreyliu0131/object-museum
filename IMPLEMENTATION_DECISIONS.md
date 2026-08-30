# Implementation decisions

Status: public portfolio prototype

Evidence verdict: **Validate first**

These decisions define the repository's implemented scope. They do not claim product validation or production readiness.

## Locked vertical slice

`Sample collection → Object → Original words → Review → Local exhibit → Correct or clear`

- One active, single-user working copy.
- Three read-only synthetic fixtures; no real family or research data.
- One browser-local 2D exhibit; no “Museum” or repeat-use claim.
- Optional user photo and short audio, with readable text required for the complete path.
- Confirm, rewrite, reject, and uncertain decisions on exact source spans.
- No share, public exhibit, recipient, second narrator, sync, backup, export, timeline, 3D, model, or community route.

## Source before generated claims

The exact narrator text is the authority. Each source revision is hashed, and every candidate binds an exact Unicode code-point span. A mismatch quarantines the candidate. Source edits create a new revision and invalidate earlier candidates rather than silently rebasing them.

Only exact source text or a visibly labeled narrator rewrite can enter the exhibit. “Why it matters” remains attributed testimony. Adapter support and narrator uncertainty are separate states.

## Deterministic extraction and manual fallback

The bundled adapter uses declared rules and never invents memory prose. When text is unsupported, the user can keep a source-only exhibit or select an exact phrase manually. There is no model toggle, API key, network request, or coming-soon AI claim.

## Local state and conflict policy

The materialization authority is a validated, committed envelope containing the record, source revision, media references, and monotonic revision. IndexedDB writes use compare-and-set with a unique working-copy ID and atomic media/envelope transaction. A stale tab fails visibly; it is not merged or allowed to overwrite.

An IndexedDB failure activates a labeled session-only adapter. Clear verification is deliberately narrower in that mode and never implies inaccessible persistent storage was erased.

## Media and clear boundaries

Local raster images are signature-checked, dimension-bounded, decoded, and re-encoded. Optional audio is type/signature/size/duration checked, playback-only, and not transcribed; embedded audio metadata is not sanitized. The distributed fixture catalog contains no audio.

IndexedDB clear removes the active record and entire controlled media store, enumerates both stores to zero, then releases React state and object URLs. Success applies only to this app's current browser storage. Original files, screenshots, downloads, backups, and other copies remain outside that action.

## Accessibility and review

The flow uses semantic landmarks, heading focus on step change, visible focus, keyboard-operable dialogs and review actions, exact-source focus/return, live status, non-color state cues, reduced motion, and mobile reflow. Automated axe checks and manual browser evidence support the local prototype only; they are not a full assistive-technology certification.

## Open-source boundary

Public source includes the runtime, tests, configuration, synthetic fixtures, selected screenshots, public documentation, licenses, and GitHub community configuration. Internal research/governance ledgers, raw review artifacts, generated output, and rejected experimental work are deliberately excluded from version control.
