# Data and privacy boundary

## What is stored

The prototype may store one current working record and its local raster/audio attachments in the browser profile's IndexedDB database `object-museum-local`. Theme preference is the only `localStorage` value. There is no cookie, account, telemetry, remote database, service worker, or application-managed backup.

The three bundled JPEG images and synthetic text records are code assets, not user records. They are not removed when a working copy is cleared. The repository distributes no audio fixture.

## What is not promised

- IndexedDB is not encrypted by this app.
- Anyone with access to the device or browser profile may be able to inspect local data.
- Browser clearing, private-mode policy, quota pressure, profile changes, or device failure may remove data.
- There is no sync, retention service, consent workflow, incident-response operation, or jurisdiction-specific legal assessment.
- Clear does not propagate to original files, screenshots, downloads, backups, or other copies.
- This prototype is not approved for real family, interview, or other private material.

Use only synthetic data in demonstrations, tests, issues, and screenshots.

## Media handling

Local images are raster-decoded, dimension-bounded, and canvas re-encoded before storage. SVG, PDF, HTML, false-MIME, oversized, and failed-decode inputs are rejected.

Optional local audio is restricted by allowlisted type/signature, size, and finite duration. It is not re-encoded, so embedded metadata may remain. Audio never becomes a transcript or source span; readable narrator text remains authoritative.

## Network boundary

The application contains no API key, telemetry, model call, remote font, share route, or external upload. A Content Security Policy restricts application resources to the local origin plus the data/blob forms required for local media.

## Clear semantics

“Clear local working copy” means the app attempts to delete the active record, clear its complete media store, verify both stores are empty, clear in-memory state, and revoke object URLs. A failed verification reports `clear_incomplete` and makes no success claim.

When IndexedDB is unavailable, the session-only adapter can verify only its current in-memory state. Older persistent browser data, if any, remains uninspected.
