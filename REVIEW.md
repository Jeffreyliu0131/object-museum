# Verification summary

Date: 2026-08-30

Scope: source-only public GitHub baseline for the browser-local portfolio prototype

Evidence verdict: **Validate first**

## Current automated results

| Check | Result |
|---|---|
| `npm run lint` | Pass; zero warnings |
| `npm run typecheck` | Pass; strict TypeScript build graph |
| `npm test` | Pass; 22 test files, 93 tests |
| `npm run build` | Pass; JS 171.91 kB gzip, CSS 88.91 kB gzip |
| `npm audit --offline` | Pass; 0 known vulnerabilities in the available offline advisory data |

Vite reports that the main JavaScript chunk is larger than 500 kB before gzip. This remains a documented optimization limit, not a correctness failure for the local prototype.

The suite covers source hashing and Unicode code-point spans, legal candidate-state combinations, source mismatch quarantine, materialization gates, damaged storage, IndexedDB and memory-store compare-and-set behavior, cross-tab conflicts, clear verification, hostile media, session-only truthfulness, React integration, keyboard operation, automated axe checks, and absence of export/share/public/model paths.

## Current browser smoke review

The production build was exercised through the complete synthetic flow after removal of the bundled audio fixture:

- Collection → Object → Original words → Review → Local exhibit.
- Original words visibly reported **No audio attached. Text-only is a complete supported path.**
- The rendered story and exhibit contained no bundled audio player; Exhibit DOM audio count was zero.
- All five exact-text candidates were committed and the exhibit materialized from the current revision.
- Exact-source review remained visible with source revision, hash, and Unicode code-point span.
- Light desktop and dark mobile exhibit states rendered from the current build.
- The measured mobile document width equaled its scroll width, with zero horizontal page overflow.

Current public screenshots:

- [Collection, desktop light](screenshots/collection-desktop-light.jpg)
- [Original words with no bundled audio, desktop light](screenshots/story-no-audio-desktop-light.jpg)
- [Exact-source review, desktop light](screenshots/review-source-focus-desktop-light.jpg)
- [Local exhibit, desktop light](screenshots/exhibit-desktop-light.jpg)
- [Local exhibit, mobile dark](screenshots/exhibit-mobile-dark.jpg)

## Review disposition

- Prior independent code/security review: no open P0/P1 for the locked local-prototype scope.
- Prior product/IA/visual/accessibility review: no open P0/P1 for that same scope.
- Current fixture/rights review: public fixture directory contains exactly three real JPEG files plus the manifest; no audio binary, fixture-catalog/manifest entry, path, or executable fixture reference remains. The changelog retains the removal history.
- Current direct-dependency license review: 27 of 27 direct packages match the lockfile, installed metadata, and installed license files. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This repository does not include Playwright or Cypress browser E2E. CI continuously runs the current Vitest/jsdom suite and build, while responsive visual behavior and complete browser interaction remain a manual acceptance responsibility documented in [EXPERIENCE_ACCEPTANCE.md](EXPERIENCE_ACCEPTANCE.md).

Generated `dist/` output is intentionally excluded from the source-only baseline. Before distributing or hosting a compiled bundle, perform a distribution-specific transitive license/notice scan and retain all required third-party notices.

## Claims this does not support

These results do not prove product demand, repeat use, second-object initiation, second-narrator contribution, family collaboration, production privacy/security, global deletion, portability, ASR quality, multilingual usability, long-term preservation, 3D reconstruction, hosting reliability, or legal compliance. They do not convert the portfolio prototype into a production release.
