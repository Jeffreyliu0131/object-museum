# Experience acceptance

Scope: browser-local portfolio prototype

Suggested time: 10–15 minutes

Data rule: use only the bundled synthetic fixtures or newly invented, non-identifying text

Passing this script supports only the implemented local experience. It does not establish demand, repeat use, collaboration, production privacy, legal compliance, or long-term preservation.

## Start

```bash
npm ci
npm run build
npm run preview
```

Open the local URL printed by Vite.

## Main flow

### 1. Collection and boundary

- Confirm `Portfolio prototype` and `Synthetic fixture` remain visible.
- Confirm the page offers three synthetic samples and says they are not repeat-use evidence.
- Confirm there is no share, export, public exhibit, 3D, account, model, or second-narrator action.
- Select **Start with synthetic fixture**.

### 2. Object

- Confirm the heading is **Begin with the object itself** and receives keyboard focus.
- Confirm the image and labels are editable but not described as inferred facts.
- Confirm the page says local storage is not encrypted and has no backup.
- Continue to **Original words**.

### 3. Original words and no bundled audio

- Confirm the complete synthetic story is visible and the counter stays within 2,400 Unicode characters.
- Confirm the audio panel says **No audio attached. Text-only is a complete supported path.**
- Confirm there is no bundled audio player or audio download.
- Optional: attach a short synthetic/self-created audio file and verify the UI labels it local, playback-only, untranscribed, and metadata-unsanitized. Do not use a real voice or private recording.
- Continue to **Review exact-text candidates**.

### 4. Exact source and narrator decisions

- Open **Show exact source [21, 35)** for `my brother Sam`.
- Confirm the exact phrase is highlighted, its Unicode code-point range is visible, and focus moves to the excerpt.
- Use **Back to candidate** and confirm focus returns to the invoking control.
- Resolve all five candidates. Exercise each action at least once across the set: Confirm, Rewrite, Reject, and Uncertain.
- Confirm Rewrite remains labeled as narrator-authored, Reject does not enter the exhibit, and Uncertain remains distinct from adapter support.
- Confirm **Open local exhibit** remains unavailable until no candidate is pending.

### 5. Local exhibit

- Open the exhibit and confirm the title is **A local working exhibit in this prototype**.
- Confirm every included statement is exact source text or a visibly labeled narrator rewrite.
- Confirm “why it matters” remains attributed testimony.
- Expand at least one **Source excerpt and span** item and confirm excerpt, range, revision, and full SHA-256 are visible.
- Confirm there is no bundled audio player.

### 6. Persistence, correction, and clear boundary

- Refresh the page and confirm the current browser working copy remains available when IndexedDB is supported.
- Reopen candidate decisions and confirm corrections rematerialize the exhibit from the new committed revision.
- Open **Clear local working copy** and read the complete boundary before deciding whether to continue.
- If you perform clear, confirm success is shown only after the app verifies its controlled record and media stores are empty.
- Confirm the wording does not claim removal of original files, screenshots, downloads, backups, or other copies.

## Responsive and accessibility spot checks

- Complete the main path without a pointer using Tab, Shift+Tab, Enter, Space, and Escape.
- Check light and dark appearance.
- Check a narrow mobile viewport; there should be no horizontal page overflow or clipped primary action.
- Enable reduced motion and confirm non-essential animation is removed.
- At 200% browser text zoom, confirm the flow remains readable and actionable without horizontal page scrolling.

## Result record

Record:

- commit SHA;
- browser and operating system;
- Pass/Fail for each section;
- only synthetic reproduction details;
- console errors or warnings;
- accessibility technology used, if any;
- unresolved defects and whether they block the local prototype scope.

Never attach real personal/family data, voices, images, filenames, logs, or browser database contents to a public issue. Use the issue templates' synthetic-data boundary and report vulnerabilities privately through GitHub Security Advisories.
