import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAudioMime, detectImageMime, IMAGE_DECODE_TIMEOUT_MS, ingestAudio, ingestImage, MediaValidationError, validateAudioDuration } from "./media";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("media signatures", () => {
  it("recognizes supported raster signatures", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
  });

  it("recognizes MP3 and rejects HTML bytes", () => {
    expect(detectAudioMime(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe("audio/mpeg");
    expect(detectAudioMime(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBeNull();
  });
});

describe("media ingress", () => {
  it("rejects SVG before decoding", async () => {
    const file = new File(["<svg><script>alert(1)</script></svg>"], "object.svg", { type: "image/svg+xml" });
    await expect(ingestImage(file)).rejects.toMatchObject({ code: "unsupported_type" } satisfies Partial<MediaValidationError>);
  });

  it("rejects an oversized raster before decode", async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
    await expect(ingestImage(file)).rejects.toMatchObject({ code: "too_large" } satisfies Partial<MediaValidationError>);
  });

  it("rejects a raster whose declared MIME and magic bytes disagree", async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([pngHeader], "spoof.jpg", { type: "image/jpeg" });
    await expect(ingestImage(file)).rejects.toMatchObject({ code: "signature_mismatch" } satisfies Partial<MediaValidationError>);
  });

  it("rejects an image whose decoded pixel count exceeds the limit", async () => {
    class HugeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 8_000;
      naturalHeight = 8_000;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
      removeAttribute() {}
    }
    vi.stubGlobal("Image", HugeImage);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "huge.jpg", { type: "image/jpeg" });
    await expect(ingestImage(file)).rejects.toMatchObject({ code: "too_many_pixels" } satisfies Partial<MediaValidationError>);
  });

  it("times out a decoder that never settles and revokes its object URL", async () => {
    vi.useFakeTimers();
    class HangingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {}
      removeAttribute() {}
    }
    vi.stubGlobal("Image", HangingImage);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "hang.jpg", { type: "image/jpeg" });
    const result = ingestImage(file);
    const assertion = expect(result).rejects.toMatchObject({ code: "decode_failed", message: "The image decode timed out." });
    await vi.advanceTimersByTimeAsync(IMAGE_DECODE_TIMEOUT_MS + 1);
    await assertion;
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("rejects spoofed MP3 content before metadata parsing", async () => {
    const file = new File(["<html>not audio</html>"], "story.mp3", { type: "audio/mpeg" });
    await expect(ingestAudio(file)).rejects.toMatchObject({ code: "signature_mismatch" } satisfies Partial<MediaValidationError>);
  });

  it("rejects invalid, infinite and over-limit audio durations", () => {
    expect(() => validateAudioDuration(0)).toThrow(/could not be verified/u);
    expect(() => validateAudioDuration(Number.POSITIVE_INFINITY)).toThrow(/could not be verified/u);
    expect(() => validateAudioDuration(60.01)).toThrow(/60 seconds or shorter/u);
    expect(() => validateAudioDuration(60)).not.toThrow();
  });
});
