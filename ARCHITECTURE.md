# Architecture

## Runtime shape

Object Museum is a single-page Vite, React, and strict TypeScript application. Radix provides accessible UI primitives, Phosphor provides icons, Zod validates runtime state, and `idb` wraps IndexedDB. All application resources are same-origin; the runtime has no account, telemetry, model, remote font, API key, or external request.

```text
synthetic fixture or local input
            ↓
hashed TextSourceRevision + local media reference
            ↓
deterministic rules or narrator-selected exact span
            ↓
narrator review state transition
            ↓
committed CurrentExhibitEnvelope
            ↓
pure materializePrivateExhibit()
            ↓
browser-local 2D exhibit
```

## Authority and provenance

Only a runtime-validated, committed `CurrentExhibitEnvelope` can be materialized. Each text revision stores the exact UTF-8 hash, Unicode code-point length, revision ID, and normalized line endings. Each source span binds the revision ID, source hash, `[start, end)` code-point range, and exact excerpt.

If a hash, revision, range, or excerpt no longer matches, the statement is quarantined and excluded from the exhibit. Editing source text creates a new revision and invalidates previous candidates. Rewrites are labeled as narrator edits; “why it matters” remains attributed testimony, never an objective system claim.

## Candidate state model

Review state, authorship, narrator certainty, adapter support, and candidate origin are separate dimensions. Runtime schemas reject illegal combinations. Rejected text is absent from durable decision state; only the current session may hold it temporarily for Undo.

The deterministic adapter extracts only declared exact phrases. Unsupported text can remain source-only or use a narrator-selected exact span. Category labels are metadata and never become invented memory prose.

## Storage and concurrency

The IndexedDB database `object-museum-local` has two stores:

- `workingCopies`, with one active envelope;
- `media`, with only the current local media blobs.

Expected revision plus unique working-copy ID form the compare-and-set boundary. Media and envelope writes share one transaction. Stale tabs fail with an explicit conflict instead of silently overwriting state. A `BroadcastChannel` tells other same-origin tabs to reload or release cleared state.

If IndexedDB cannot open, an explicit session-only memory adapter keeps the flow usable and warns that refresh loses data. It never claims that inaccessible persistent storage was inspected or erased.

## Media boundary

JPEG, PNG, and WebP inputs are checked by declared MIME, magic bytes, byte count, decoded pixels, and decode success. A bounded canvas re-encode removes the original filename/path and container metadata from the stored raster derivative.

Optional local MP3, WAV, and M4A files are checked by allowlisted MIME/signature, byte count, finite duration, and a 60-second limit. Audio is playback-only, is not transcribed, and creates no source span. Embedded audio metadata is not sanitized. The public fixture catalog contains only JPEG images and synthetic text.

## Local clear

In IndexedDB mode, clear deletes the active record and clears the complete media store in one transaction, then enumerates both stores and requires zero records before reporting success. In session-only mode, it verifies only the in-memory adapter. Object URLs and React state are released in both cases.

This is not global deletion: original files, screenshots, downloads, browser/device backups, and other copies remain outside the app's control.

## Explicitly absent

There is no service worker, public route, share/recipient projection, export/download package, File System Access path, backup/restore, second narrator, model connector, timeline, WebGL, or 3D implementation. The sample collection is a read-only fixture index, not repeat-use or collaboration evidence.
