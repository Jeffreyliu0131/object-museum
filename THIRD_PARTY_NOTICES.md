# Third-party notices

Object Museum depends on third-party packages. Their licenses apply to their respective packages; they do not replace this project's MIT license.

This repository does not vendor `node_modules/` or commit generated `dist/` bundles. The inventory below covers direct dependencies locked by `package-lock.json` at the public baseline. It was cross-checked against each installed package's `package.json` and license file on 2026-08-30. Every listed direct dependency included license text in its installed package.

## Runtime dependencies

| Package | Locked version | License |
|---|---:|---|
| `@phosphor-icons/react` | 2.1.10 | MIT |
| `@radix-ui/react-toast` | 1.2.23 | MIT |
| `@radix-ui/themes` | 3.3.0 | MIT |
| `idb` | 8.0.3 | ISC |
| `react` | 19.2.8 | MIT |
| `react-dom` | 19.2.8 | MIT |
| `zod` | 4.5.4 | MIT |

## Development and verification dependencies

| Package | Locked version | License |
|---|---:|---|
| `@eslint/js` | 10.0.1 | MIT |
| `@testing-library/jest-dom` | 7.0.1 | MIT |
| `@testing-library/react` | 16.3.3 | MIT |
| `@testing-library/user-event` | 14.6.6 | MIT |
| `@types/node` | 26.4.0 | MIT |
| `@types/react` | 19.2.18 | MIT |
| `@types/react-dom` | 19.2.5 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `@vitest/coverage-v8` | 4.1.11 | MIT |
| `axe-core` | 4.13.0 | MPL-2.0 |
| `eslint` | 10.9.1 | MIT |
| `eslint-plugin-react-hooks` | 7.1.1 | MIT |
| `eslint-plugin-react-refresh` | 0.5.5 | MIT |
| `fake-indexeddb` | 6.2.5 | Apache-2.0 |
| `globals` | 17.11.0 | MIT |
| `jsdom` | 30.0.1 | MIT |
| `typescript` | 6.0.3 | Apache-2.0 |
| `typescript-eslint` | 8.68.0 | MIT |
| `vite` | 8.2.2 | MIT |
| `vitest` | 4.1.11 | MIT |

Canonical license texts: [MIT](https://spdx.org/licenses/MIT.html), [ISC](https://spdx.org/licenses/ISC.html), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), and [MPL-2.0](https://www.mozilla.org/MPL/2.0/).

`package-lock.json` is the source of truth for the complete transitive graph. Installed packages may contain additional bundled-component notices, including Vite/Vitest license inventories, TypeScript's `ThirdPartyNoticeText.txt`, and axe-core's `LICENSE-3RD-PARTY.txt`. Anyone distributing `node_modules`, a compiled bundle, or another package form must preserve all notices and license texts required by the exact transitive contents of that distribution; this direct-dependency inventory is not a substitute for a distribution-specific license scan.
