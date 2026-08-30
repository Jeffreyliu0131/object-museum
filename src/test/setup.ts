import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, "scrollTo", { writable: true, value: vi.fn() });
Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: vi.fn(() => `blob:test-${crypto.randomUUID()}`),
});
Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: vi.fn() });

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", { writable: true, value: ResizeObserverMock });

class BroadcastChannelMock {
  private static readonly channels = new Map<string, Set<BroadcastChannelMock>>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(private readonly name: string) {
    const peers = BroadcastChannelMock.channels.get(name) ?? new Set<BroadcastChannelMock>();
    peers.add(this);
    BroadcastChannelMock.channels.set(name, peers);
  }
  postMessage(data: unknown) {
    for (const peer of BroadcastChannelMock.channels.get(this.name) ?? []) {
      if (peer === this) continue;
      queueMicrotask(() => peer.onmessage?.(new MessageEvent("message", { data })));
    }
  }
  close() {
    const peers = BroadcastChannelMock.channels.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) BroadcastChannelMock.channels.delete(this.name);
  }
}

Object.defineProperty(window, "BroadcastChannel", { writable: true, value: BroadcastChannelMock });
Object.defineProperty(globalThis, "BroadcastChannel", { writable: true, value: BroadcastChannelMock });

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});
