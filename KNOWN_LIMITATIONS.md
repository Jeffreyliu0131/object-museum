# Known limitations and non-claims

## Product evidence

- The evidence verdict remains **Validate first**.
- A completed synthetic exhibit does not prove value for preserving one object, starting a second object, or inviting a second narrator.
- The read-only sample collection is not evidence of repeat use, collaboration, retention, or a validated “Museum.”

## Scope

- No public/share view, recipient, second narrator, reconciliation, account, backup/sync, export, timeline, 3D, or community workflow.
- No production hosting, app-level encryption, jurisdiction-specific consent/deletion process, or long-term preservation guarantee.
- No ASR, diarization, translation, or model-generated prose. Optional user audio is playback-only.

## Extraction and language

The deterministic adapter recognizes a bounded set of exact English and Chinese phrases. It can miss names, places, events, and testimony. The fallback is source-only presentation or a narrator-selected exact span; the app does not fill missing memory content.

The domain layer tests CJK, emoji, and combining-code-point spans, but the UI is English and has not completed multilingual usability or localization review.

## Browser-local durability and media

IndexedDB availability and quota vary by browser and mode. Session-only fallback loses state on refresh. Multi-tab behavior detects stale writes but does not merge changes. Long-term readability across browser/database evolution is not established.

Audio metadata is not sanitized. Raster processing is browser-dependent and is not a general hostile-file sandbox. Local media references do not persist a separate content hash/byte-count contract, so post-commit IndexedDB blob tampering is not independently detected.

## Verification gaps

Automated tests cover accessibility rules, keyboard behavior, reflow-related invariants, media handling, storage, and security scope, but they are not a complete assistive-technology certification. The repository does not include Playwright or Cypress browser E2E. Public browser screenshots and the manual acceptance script document a point-in-time review, not continuous cross-browser proof.

The Vite production build currently emits a main-chunk size warning before gzip. Code splitting and theme CSS trimming remain optimization work.
