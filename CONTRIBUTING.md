# Contributing to Object Museum

Thank you for helping improve Object Museum. This repository is a browser-local
portfolio prototype for one synthetic first exhibit. It is not a validated
product, production service, research system, privacy guarantee, or approved
PRD.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Security vulnerabilities must be reported privately as described in
[SECURITY.md](SECURITY.md), not in a public issue or pull request.

## Non-negotiable data boundary

Never add real family, household, personal, confidential, or identifying data
to an issue, pull request, test, screenshot, recording, fixture, log, commit, or
repository file. This includes names, faces, voices, stories, contact details,
locations, credentials, metadata, and private documents.

Use invented text and project-approved synthetic fixtures only. Remove metadata
from any newly proposed media and document its origin, rights, hash, MIME type,
and byte count. If a defect cannot be demonstrated without private data, report
the code path and a synthetic minimal reproduction instead.

## Before proposing a change

- Read [README.md](README.md), [DATA_PRIVACY.md](DATA_PRIVACY.md), and
  [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
- Check existing issues before opening a duplicate.
- Use a feature request for material behavior or scope changes.
- Do not open a public issue for a suspected vulnerability.
Material claims must distinguish fact, inference, assumption, gap, and
validation target, with a link to originating evidence where one exists.
Passing tests does not establish user demand, repeat use, collaboration,
production readiness, or the value of a “Museum.”

## Local setup

Requirements:

- Node.js 22
- npm (the version bundled with Node.js 22 is supported)

Install and run:

    nvm use
    npm ci
    npm run dev

The development server binds to 127.0.0.1. No API key or external service is
required.

## Make a focused change

1. Create a short-lived branch from the current default branch.
2. Keep the change narrowly scoped and avoid unrelated formatting.
3. Add or update tests for behavior changes and important failure paths.
4. Preserve narrator attribution, exact source provenance, uncertainty, and
   conflicting accounts rather than silently reconciling them.
5. Update documentation when behavior, limitations, privacy boundaries, or
   verification steps change.
6. Record the source and license of any new dependency or synthetic fixture.

Technical spikes must be minimal, disposable, clearly labeled, and tied to a
falsifiable feasibility question.

## Verify before opening a pull request

Run the same commands as CI:

    npm run lint
    npm run typecheck
    npm run test
    npm run build

All four commands must pass on Node.js 22. Also inspect the changed experience
manually when the contribution affects interaction, accessibility, responsive
layout, persistence, provenance, correction, consent, or deletion behavior.

## Pull request expectations

A pull request should:

- explain the problem and the intentionally limited solution;
- link the relevant issue or source evidence;
- describe tests and manual checks actually run;
- call out assumptions, known gaps, scope impact, and follow-up work;
- contain only synthetic, non-identifying examples and media;
- identify new third-party code or assets and their licenses; and
- avoid claiming validation, security, privacy, or production readiness beyond
  the evidence provided.

Maintainers may ask for a smaller change, stronger evidence, fixture provenance,
accessibility coverage, or a security/privacy review before merging.
