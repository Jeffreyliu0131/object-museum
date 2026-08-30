export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 16_000_000;
export const IMAGE_MAX_DIMENSION = 1_600;
export const IMAGE_DECODE_TIMEOUT_MS = 5_000;
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 60;

export type MediaErrorCode =
  | "unsupported_type"
  | "signature_mismatch"
  | "too_large"
  | "too_many_pixels"
  | "decode_failed"
  | "duration_invalid"
  | "duration_too_long";

export class MediaValidationError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export interface StoredImageDerivative {
  id: string;
  kind: "image";
  mime: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  sourceKind: "local_canvas_derivative";
}

export interface StoredAudioAttachment {
  id: string;
  kind: "audio";
  mime: "audio/mpeg" | "audio/wav" | "audio/mp4";
  dataUrl: string;
  bytes: number;
  durationSeconds: number;
  metadataSanitized: false;
  sourceKind: "local_unsanitized_attachment";
}

const supportedImageMimes = new Set(["image/jpeg", "image/png", "image/webp"]);
const supportedAudioMimes = new Map([
  ["audio/mpeg", "audio/mpeg"],
  ["audio/mp3", "audio/mpeg"],
  ["audio/wav", "audio/wav"],
  ["audio/x-wav", "audio/wav"],
  ["audio/mp4", "audio/mp4"],
  ["audio/x-m4a", "audio/mp4"],
] as const);

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function detectAudioMime(bytes: Uint8Array): string | null {
  if (hasPrefix(bytes, [0x49, 0x44, 0x33])) return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return "audio/wav";
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "audio/mp4";
  }
  return null;
}

async function readHeader(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 24).arrayBuffer());
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new MediaValidationError("decode_failed", "The media could not be read."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
      reject(new MediaValidationError("decode_failed", message));
    };
    const timer = window.setTimeout(
      () => fail("The image decode timed out."),
      IMAGE_DECODE_TIMEOUT_MS,
    );
    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({ image, url });
    };
    image.onerror = () => fail("The image could not be decoded.");
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new MediaValidationError("decode_failed", "The image derivative could not be created."));
      },
      mime,
      0.86,
    );
  });
}

export async function ingestImage(file: File): Promise<StoredImageDerivative> {
  if (!supportedImageMimes.has(file.type)) {
    throw new MediaValidationError("unsupported_type", "Use a JPEG, PNG or WebP image.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new MediaValidationError("too_large", "The image must be 5 MB or smaller.");
  }

  const detected = detectImageMime(await readHeader(file));
  if (detected !== file.type) {
    throw new MediaValidationError("signature_mismatch", "The image contents do not match its declared file type.");
  }

  const { image, url } = await loadImage(file);
  try {
    const pixels = image.naturalWidth * image.naturalHeight;
    if (!pixels || pixels > IMAGE_MAX_PIXELS) {
      throw new MediaValidationError("too_many_pixels", "The decoded image is too large for this local prototype.");
    }

    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) {
      throw new MediaValidationError("decode_failed", "The browser cannot create a safe image derivative.");
    }
    context.drawImage(image, 0, 0, width, height);
    const outputMime = file.type as StoredImageDerivative["mime"];
    const derivative = await canvasToBlob(canvas, outputMime);
    return {
      id: crypto.randomUUID(),
      kind: "image",
      mime: outputMime,
      dataUrl: await blobToDataUrl(derivative),
      bytes: derivative.size,
      width,
      height,
      sourceKind: "local_canvas_derivative",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value?: number, error?: MediaValidationError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(value ?? Number.NaN);
    };
    const timer = window.setTimeout(
      () => finish(undefined, new MediaValidationError("decode_failed", "The audio metadata timed out.")),
      5_000,
    );
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(undefined, new MediaValidationError("decode_failed", "The audio could not be decoded."));
    audio.src = url;
  });
}

export async function ingestAudio(file: File): Promise<StoredAudioAttachment> {
  const expected = supportedAudioMimes.get(
    file.type as "audio/mpeg" | "audio/mp3" | "audio/wav" | "audio/x-wav" | "audio/mp4" | "audio/x-m4a",
  );
  if (!expected) {
    throw new MediaValidationError("unsupported_type", "Use an MP3, WAV or M4A audio file.");
  }
  if (file.size > AUDIO_MAX_BYTES) {
    throw new MediaValidationError("too_large", "The audio must be 4 MB or smaller.");
  }
  const detected = detectAudioMime(await readHeader(file));
  if (detected !== expected) {
    throw new MediaValidationError("signature_mismatch", "The audio contents do not match its declared file type.");
  }
  const durationSeconds = await readAudioDuration(file);
  validateAudioDuration(durationSeconds);
  return {
    id: crypto.randomUUID(),
    kind: "audio",
    mime: expected,
    dataUrl: await blobToDataUrl(file),
    bytes: file.size,
    durationSeconds,
    metadataSanitized: false,
    sourceKind: "local_unsanitized_attachment",
  };
}

export function validateAudioDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new MediaValidationError("duration_invalid", "The audio duration could not be verified.");
  }
  if (durationSeconds > AUDIO_MAX_SECONDS) {
    throw new MediaValidationError("duration_too_long", "The audio must be 60 seconds or shorter.");
  }
}
