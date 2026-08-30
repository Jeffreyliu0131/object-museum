import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const sourceRoot = join(cwd(), "src");
const indexHtml = readFileSync(join(cwd(), "index.html"), "utf8");

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? filesUnder(child) : [child];
  });
}

describe("implementation scope contract", () => {
  const source = filesUnder(sourceRoot)
    .filter((file) => /\.(?:ts|tsx)$/u.test(file) && !/\.test\.[^.]+$/u.test(file) && !file.includes(`${join("src", "test")}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("has no rejected-spike import or runtime reference", () => {
    expect(source).not.toMatch(/spikes\/g5-provenance-portability/u);
  });

  it("has no export, download, share, service-worker or public-route API", () => {
    expect(source).not.toMatch(/<a[^>]+download\s*=|showSaveFilePicker|navigator\.share|serviceWorker\.register|createObjectURL\([^)]*export/iu);
  });

  it("contains no hard-coded remote HTTP resource", () => {
    expect(source).not.toMatch(/["'`]https?:\/\//iu);
  });

  it("locks runtime media, connection and object sources to self/data/blob", () => {
    expect(indexHtml).toMatch(/Content-Security-Policy/u);
    expect(indexHtml).toMatch(/connect-src 'self'/u);
    expect(indexHtml).toMatch(/img-src 'self' data: blob:/u);
    expect(indexHtml).toMatch(/media-src 'self' data: blob:/u);
    expect(indexHtml).toMatch(/object-src 'none'/u);
  });
});
