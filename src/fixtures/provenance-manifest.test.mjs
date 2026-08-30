import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, "..", "..");
const fixtureDirectory = join(projectRoot, "public", "fixtures");
const manifestPath = join(fixtureDirectory, "provenance-manifest.json");

async function readManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

describe("fixture provenance manifest", () => {
  it("registers every fixture media file and no missing file", async () => {
    const manifest = await readManifest();
    const registeredNames = manifest.media
      .map((entry) => entry.path.replace(/^\/fixtures\//, ""))
      .sort();
    const mediaNames = (await readdir(fixtureDirectory))
      .filter((name) => name !== "provenance-manifest.json")
      .sort();

    expect(registeredNames).toEqual(mediaNames);
    expect(new Set(registeredNames).size).toBe(registeredNames.length);
  });

  it("matches exact bytes and sha256 for every registered medium", async () => {
    const manifest = await readManifest();

    for (const entry of manifest.media) {
      const fixturePath = join(
        fixtureDirectory,
        entry.path.replace(/^\/fixtures\//, ""),
      );
      const [contents, metadata] = await Promise.all([
        readFile(fixturePath),
        stat(fixturePath),
      ]);
      const digest = createHash("sha256").update(contents).digest("hex");

      expect(metadata.isFile(), entry.path).toBe(true);
      expect(metadata.size, entry.path).toBe(entry.bytes);
      expect(digest, entry.path).toBe(entry.sha256);
    }
  });

  it("keeps an explicit synthetic source and CC0 rights boundary", async () => {
    const manifest = await readManifest();

    expect(manifest.license).toBe("CC0-1.0");
    for (const entry of manifest.media) {
      expect(entry.sourceKind, entry.path).toBe("imagegen_synthetic");
      expect(entry.license, entry.path).toBe("CC0-1.0");
      expect(entry.generation, entry.path).toEqual(expect.any(String));
      expect(entry.ownership, entry.path).toEqual(expect.any(String));
      expect(entry.aiDisclosure, entry.path).toMatch(/AI-generated/u);
      expect(entry.allowedUse.length, entry.path).toBeGreaterThan(0);
    }
  });
});
