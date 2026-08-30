import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Theme } from "@radix-ui/themes";
import * as Toast from "@radix-ui/react-toast";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";
import { AppHeader } from "../components/AppHeader";
import { ErrorPanel, LoadingPanel, SessionOnlyNotice } from "../components/StatePanels";
import { StepRail, type AppStep } from "../components/StepRail";
import { CollectionScreen, type FixtureCardData } from "../features/collection/CollectionScreen";
import { ObjectScreen } from "../features/capture/ObjectScreen";
import { StoryScreen } from "../features/capture/StoryScreen";
import {
  ReviewScreen,
  type ReviewAction,
  type ReviewActionOutcome,
} from "../features/review/ReviewScreen";
import { ExhibitScreen } from "../features/exhibit/ExhibitScreen";
import { useThemePreference } from "./useTheme";
import {
  ingestAudio,
  ingestImage,
  MediaValidationError,
  type StoredAudioAttachment,
  type StoredImageDerivative,
} from "./media";
import {
  confirmCandidate,
  createUserSelectedCandidate,
  markCandidateUncertain,
  rejectCandidate,
  reopenCandidate,
  replaceCandidate,
  rewriteCandidate,
  undoCandidateAction,
  type SessionOnlyUndoPayload,
} from "../domain/candidates";
import { reviseEnvelope } from "../domain/envelope";
import { materializePrivateExhibit, type MaterializedPrivateExhibit, type QuarantinedCandidate } from "../domain/materialize";
import {
  canonicalizeSourceText,
  codePointLength,
  createTextSourceRevision,
  sha256Utf8,
  utf16IndexToCodePointIndex,
} from "../domain/provenance";
import {
  ExhibitRecordSchema,
  FixtureMediaIdSchema,
  type CandidateCategory,
  type CurrentExhibitEnvelope,
  type ExhibitRecord,
  type MediaReference,
} from "../domain/types";
import { DeterministicCandidateAdapter } from "../adapters/deterministic-candidate-adapter";
import { IndexedDbExhibitStore } from "../adapters/indexeddb-exhibit-store";
import { MemoryExhibitStore } from "../adapters/memory-exhibit-store";
import { NoModelCandidateAdapter } from "../adapters/no-model-candidate-adapter";
import type { ExhibitStore, MediaWrite } from "../ports/exhibit-store";
import { StoreConflictError, StoreCorruptDataError, StoreInvalidCommitError } from "../ports/exhibit-store";
import {
  loadSyntheticFixtureCatalog,
  type SyntheticFixtureCatalog,
  type SyntheticFixtureRecord,
} from "../fixtures/records";

type RuntimeStatus = "loading" | "ready" | "error";
type StorageMode = "indexeddb" | "session";

interface ObjectDraftState {
  title: string;
  objectName: string;
  narratorLabel: string;
  imageUrl: string | null;
  imageAlt: string;
  synthetic: boolean;
}

interface StoryDraftState {
  text: string;
  audioUrl: string | null;
  audioTextEquivalent: string | null;
}

interface MaterializedState {
  envelopeRevision: number;
  exhibit: MaterializedPrivateExhibit;
  quarantined: QuarantinedCandidate[];
}

interface ToastState {
  open: boolean;
  title: string;
  description: string;
  undoAvailable: boolean;
}

type ExclusiveCommandResult<T> =
  | { status: "completed"; value: T }
  | { status: "not_submitted" }
  | { status: "failed"; error: unknown };

type LocalChannelMessage =
  | { type: "commit"; recordId: string; revision: number }
  | { type: "cleared" };

const appSearchParams = new URLSearchParams(window.location.search);
const qaScenario = appSearchParams.get("qa");
const forceSessionStorage = appSearchParams.get("storage") === "session";
const qaLabels: Record<string, string> = {
  loading: "forced loading window",
  "storage-error": "local storage error",
  "session-only": "IndexedDB unavailable fallback",
  unsupported: "unsupported candidate adapter",
  "source-mismatch": "source revision mismatch",
  "clear-error": "clear incomplete",
  "zoom-200": "200% text zoom reflow",
  "reduced-motion": "forced reduced-motion rendering",
  performance: "production performance probe",
};

interface PerformanceSnapshot {
  loadEventMs: number;
  firstContentfulPaintMs: number | null;
  resourceCount: number;
  transferBytes: number;
  externalRequestCount: number;
  domNodes: number;
  horizontalOverflow: number;
}

function PerformanceProbe() {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const paint = performance.getEntriesByName("first-contentful-paint")[0];
      setSnapshot({
        loadEventMs: Math.round(navigation?.loadEventEnd ?? 0),
        firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
        resourceCount: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        externalRequestCount: resources.filter((entry) => new URL(entry.name).origin !== window.location.origin).length,
        domNodes: document.getElementsByTagName("*").length,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <output className="qa-performance" aria-live="polite">
      {snapshot ? (
        <>QA performance · load {snapshot.loadEventMs} ms · FCP {snapshot.firstContentfulPaintMs ?? "unavailable"} ms · {snapshot.resourceCount} resources · {snapshot.transferBytes} transferred bytes · {snapshot.externalRequestCount} external requests · {snapshot.domNodes} DOM nodes · {snapshot.horizontalOverflow} px horizontal overflow</>
      ) : "QA performance · collecting local timing"}
    </output>
  );
}

function fixtureSummary(fixture: SyntheticFixtureRecord): FixtureCardData {
  const summaries: Record<SyntheticFixtureRecord["id"], string> = {
    "cobalt-mug": "A repaired handle, an exact synthetic story and five candidates ready for narrator review.",
    "red-camera": "A static reviewed sample that keeps an uncertain season separate from system support.",
    "sea-glass-brooch": "A static reviewed sample with a fuzzy decade, exact spans and attributed testimony.",
  };
  return {
    id: fixture.id,
    title: fixture.record.title,
    objectName: fixture.record.objectName,
    summary: summaries[fixture.id],
    imageUrl: fixture.record.image?.id ?? "",
    imageAlt: fixture.record.image?.altText ?? fixture.record.objectName,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) throw new Error("Invalid local media data URL");
  const bytes = Uint8Array.from(window.atob(match[2]), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

function cloneEnvelope(envelope: CurrentExhibitEnvelope): CurrentExhibitEnvelope {
  return structuredClone(envelope);
}

function pendingCandidateCount(envelope: CurrentExhibitEnvelope): number {
  return envelope.record.candidates.filter((candidate) => candidate.reviewState === "pending").length;
}

function isMaterializedForEnvelope(
  state: MaterializedState | null,
  envelope: CurrentExhibitEnvelope | null,
): state is MaterializedState {
  return Boolean(
    state &&
    envelope &&
    state.envelopeRevision === envelope.revision &&
    state.exhibit.revision === envelope.revision &&
    state.exhibit.recordId === envelope.recordId &&
    pendingCandidateCount(envelope) === 0,
  );
}

export function App() {
  const { preference: themePreference, resolved: theme, setPreference: setThemePreference } = useThemePreference();
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("loading");
  const [runtimeError, setRuntimeError] = useState("The local working copy could not be opened.");
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);
  const [storageMode, setStorageMode] = useState<StorageMode>("indexeddb");
  const [catalog, setCatalog] = useState<SyntheticFixtureCatalog | null>(null);
  const [envelope, setEnvelope] = useState<CurrentExhibitEnvelope | null>(null);
  const envelopeRef = useRef<CurrentExhibitEnvelope | null>(null);
  const storeRef = useRef<ExhibitStore | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const [step, setStep] = useState<AppStep>("collection");
  const [objectDraft, setObjectDraft] = useState<ObjectDraftState | null>(null);
  const [storyDraft, setStoryDraft] = useState<StoryDraftState | null>(null);
  const [pendingImage, setPendingImage] = useState<StoredImageDerivative | null>(null);
  const [pendingAudio, setPendingAudio] = useState<StoredAudioAttachment | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [audioProcessing, setAudioProcessing] = useState(false);
  const imageProcessingRef = useRef(false);
  const audioProcessingRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [objectError, setObjectError] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const commandInFlightRef = useRef<string | null>(null);
  const [adapterUnsupported, setAdapterUnsupported] = useState(qaScenario === "unsupported");
  const [materialized, setMaterialized] = useState<MaterializedState | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const clearInFlightRef = useRef(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [undoPayload, setUndoPayload] = useState<SessionOnlyUndoPayload | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, title: "", description: "", undoAvailable: false });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<AppStep>("collection");
  const currentMaterialized = isMaterializedForEnvelope(materialized, envelope) ? materialized : null;

  useEffect(() => {
    if (qaScenario === "zoom-200") document.documentElement.dataset.qaZoom = "200";
    if (qaScenario === "reduced-motion") document.documentElement.dataset.qaReducedMotion = "true";
    return () => {
      delete document.documentElement.dataset.qaZoom;
      delete document.documentElement.dataset.qaReducedMotion;
    };
  }, []);

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  const resolveMediaUrl = useCallback(async (store: ExhibitStore, media: MediaReference | null): Promise<string | null> => {
    if (!media) return null;
    if (media.storage === "fixture") {
      const fixtureId = FixtureMediaIdSchema.parse(media.id);
      const resolved = new URL(fixtureId, window.location.origin);
      if (resolved.origin !== window.location.origin) {
        throw new StoreCorruptDataError("Fixture media escaped the same-origin policy");
      }
      return resolved.pathname;
    }
    const blob = await store.getMedia(media.id);
    if (!blob) throw new StoreCorruptDataError(`Local ${media.kind} media is missing`);
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const populateDrafts = useCallback(async (store: ExhibitStore, current: CurrentExhibitEnvelope) => {
    revokeObjectUrls();
    const [imageUrl, audioUrl] = await Promise.all([
      resolveMediaUrl(store, current.record.image),
      resolveMediaUrl(store, current.record.audio),
    ]);
    setObjectDraft({
      title: current.record.title,
      objectName: current.record.objectName,
      narratorLabel: current.record.narrator.label,
      imageUrl,
      imageAlt: current.record.image?.altText ?? current.record.objectName,
      synthetic: current.record.provenance.contentOrigin === "synthetic_fixture",
    });
    setStoryDraft({
      text: current.record.source.text,
      audioUrl,
      audioTextEquivalent: current.record.audio?.textEquivalent ?? null,
    });
  }, [resolveMediaUrl, revokeObjectUrls]);

  useEffect(() => {
    let cancelled = false;
    let activeStore: ExhibitStore | null = null;
    let activeChannel: BroadcastChannel | null = null;

    const boot = async () => {
      mediaGenerationRef.current += 1;
      imageProcessingRef.current = false;
      audioProcessingRef.current = false;
      setImageProcessing(false);
      setAudioProcessing(false);
      setRuntimeStatus("loading");
      setRecoveryAvailable(false);
      setRuntimeError("The local working copy could not be opened.");
      setClearError(null);
      setObjectError(null);
      setStoryError(null);
      setMaterialized(null);
      setUndoPayload(null);
      try {
        const nextCatalog = await loadSyntheticFixtureCatalog();
        if (!cancelled) setCatalog(nextCatalog);
        if (qaScenario === "loading") {
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        }
        if (qaScenario === "storage-error") {
          throw new Error("Local storage initialization failed before reading any content.");
        }

        let loaded: CurrentExhibitEnvelope | null = null;
        let nextStorageMode: StorageMode = "indexeddb";
        if (qaScenario === "session-only" || forceSessionStorage) {
          activeStore = new MemoryExhibitStore();
          nextStorageMode = "session";
          setStorageMode("session");
          loaded = await activeStore.load();
        } else {
          const indexedStore = new IndexedDbExhibitStore();
          try {
            loaded = await indexedStore.load();
            activeStore = indexedStore;
            setStorageMode("indexeddb");
          } catch (error) {
            if (error instanceof StoreCorruptDataError) {
              activeStore = indexedStore;
              storeRef.current = indexedStore;
              setRecoveryAvailable(true);
              throw error;
            }
            await indexedStore.close().catch(() => undefined);
            activeStore = new MemoryExhibitStore();
            loaded = await activeStore.load();
            nextStorageMode = "session";
            setStorageMode("session");
          }
        }

        if (cancelled || !activeStore) {
          await activeStore?.close();
          return;
        }

        storeRef.current = activeStore;
        if (typeof BroadcastChannel !== "undefined" && nextStorageMode !== "session") {
          activeChannel = new BroadcastChannel("object-museum-local-revision");
          activeChannel.onmessage = (event: MessageEvent<LocalChannelMessage>) => {
            if (event.data.type === "cleared") {
              mediaGenerationRef.current += 1;
              imageProcessingRef.current = false;
              audioProcessingRef.current = false;
              setImageProcessing(false);
              setAudioProcessing(false);
              revokeObjectUrls();
              setEnvelope(null);
              envelopeRef.current = null;
              setObjectDraft(null);
              setStoryDraft(null);
              setPendingImage(null);
              setPendingAudio(null);
              setMaterialized(null);
              setUndoPayload(null);
              setStep("collection");
              setRuntimeStatus("ready");
              setToast({
                open: true,
                title: "Local working copy cleared in another tab",
                description: "This tab released its in-memory view and object URLs.",
                undoAvailable: false,
              });
              return;
            }
            const current = envelopeRef.current;
            if (!current || (event.data.recordId === current.recordId && event.data.revision > current.revision)) {
              mediaGenerationRef.current += 1;
              imageProcessingRef.current = false;
              audioProcessingRef.current = false;
              setImageProcessing(false);
              setAudioProcessing(false);
              setMaterialized(null);
              setUndoPayload(null);
              setRuntimeError(
                current
                  ? "This working copy changed in another tab. Reload it before making more edits."
                  : "A local working copy was created in another tab. Reload this tab before starting or editing a copy.",
              );
              setRuntimeStatus("error");
            }
          };
          channelRef.current = activeChannel;
        }

        if (qaScenario === "source-mismatch" && loaded) {
          const drifted = structuredClone(loaded);
          drifted.record.source.text += " [QA source drift]";
          loaded = drifted;
        }

        setEnvelope(loaded);
        envelopeRef.current = loaded;
        setPendingImage(null);
        setPendingAudio(null);
        setAdapterUnsupported(qaScenario === "unsupported");
        if (loaded) await populateDrafts(activeStore, loaded);
        else {
          revokeObjectUrls();
          setObjectDraft(null);
          setStoryDraft(null);
        }
        if (!cancelled) {
          setStep("collection");
          setRuntimeStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          if (activeStore) {
            storeRef.current = activeStore;
            setRecoveryAvailable(true);
          }
          setRuntimeError(error instanceof Error ? error.message : "Unknown local storage error");
          setRuntimeStatus("error");
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      activeChannel?.close();
      if (channelRef.current === activeChannel) channelRef.current = null;
      if (storeRef.current === activeStore) storeRef.current = null;
      void activeStore?.close();
      revokeObjectUrls();
    };
  }, [bootNonce, populateDrafts, revokeObjectUrls]);

  useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  useLayoutEffect(() => {
    if (runtimeStatus !== "ready") return;
    if (previousStepRef.current !== step) {
      window.scrollTo({ top: 0, behavior: "auto" });
      headingRef.current?.focus({ preventScroll: true });
      previousStepRef.current = step;
    }
  }, [runtimeStatus, step]);

  const showToast = useCallback((title: string, description: string, undoAvailable = false) => {
    setToast({ open: false, title, description, undoAvailable });
    window.requestAnimationFrame(() => setToast({ open: true, title, description, undoAvailable }));
  }, []);

  const publishCommit = useCallback((committed: CurrentExhibitEnvelope) => {
    // A materialized exhibit is a revision-bound projection, never an independent
    // source of truth. Every successful commit invalidates the cached projection.
    setMaterialized(null);
    setEnvelope(committed);
    envelopeRef.current = committed;
    channelRef.current?.postMessage({ type: "commit", recordId: committed.recordId, revision: committed.revision } satisfies LocalChannelMessage);
  }, []);

  const broadcastClear = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "cleared" } satisfies LocalChannelMessage);
      return;
    }
    if (storageMode === "indexeddb" && typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("object-museum-local-revision");
      channel.postMessage({ type: "cleared" } satisfies LocalChannelMessage);
      window.setTimeout(() => channel.close(), 0);
    }
  }, [storageMode]);

  const commitRecord = useCallback(async (
    base: CurrentExhibitEnvelope,
    record: ExhibitRecord,
    mediaWrites: readonly MediaWrite[] = [],
  ): Promise<CurrentExhibitEnvelope> => {
    const store = storeRef.current;
    if (!store) throw new Error("No active local working copy");
    const next = reviseEnvelope(base, ExhibitRecordSchema.parse(record));
    const committed = await store.commitWithMedia(
      { expectedRevision: base.revision, next },
      mediaWrites,
    );
    publishCommit(committed);
    return committed;
  }, [publishCommit]);

  const handleCommandError = useCallback((error: unknown) => {
    if (
      error instanceof StoreConflictError ||
      (error instanceof StoreInvalidCommitError && error.message.includes("record id cannot change"))
    ) {
      setUndoPayload(null);
      setRuntimeError("This action was not saved because the working copy changed or was recreated in another tab. Reload the current copy, review the latest state, then make the decision again.");
      setRuntimeStatus("error");
      return;
    }
    showToast("Action not saved", error instanceof Error ? error.message : "The local action failed.");
  }, [showToast]);

  const runExclusiveCommand = useCallback(async <T,>(
    attemptedLabel: string,
    activeLabel: string,
    command: () => Promise<T>,
  ): Promise<ExclusiveCommandResult<T>> => {
    const activeCommand = commandInFlightRef.current;
    if (activeCommand) {
      showToast(
        "Action not submitted",
        `${attemptedLabel} was not submitted because ${activeCommand} is still saving. Wait for the current save to finish, then try again.`,
      );
      return { status: "not_submitted" };
    }

    commandInFlightRef.current = activeLabel;
    setCommandBusy(true);
    try {
      return { status: "completed", value: await command() };
    } catch (error) {
      return { status: "failed", error };
    } finally {
      commandInFlightRef.current = null;
      setCommandBusy(false);
    }
  }, [showToast]);

  const allowNavigation = useCallback((attemptedLabel: string): boolean => {
    const activeCommand = commandInFlightRef.current;
    if (!activeCommand) return true;
    showToast(
      "Navigation not completed",
      `${attemptedLabel} was not completed because ${activeCommand} is still saving. Wait for the current save to finish, then try again.`,
    );
    return false;
  }, [showToast]);

  const startFixture = useCallback(async (fixtureId: string) => {
    const store = storeRef.current;
    if (!store || !catalog || envelopeRef.current || fixtureId !== "cobalt-mug") return;
    const result = await runExclusiveCommand(
      "This fixture start",
      "the synthetic working copy",
      async () => {
      const next = cloneEnvelope(catalog.activeEnvelope);
      next.recordId = `working-copy-${crypto.randomUUID()}`;
      const committed = await store.commit({ expectedRevision: null, next });
      publishCommit(committed);
      await populateDrafts(store, committed);
      setStep("object");
      setUndoPayload(null);
      showToast("Synthetic working copy created", "The cobalt mug fixture is now the one active browser-local working copy.");
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [catalog, handleCommandError, populateDrafts, publishCommit, runExclusiveCommand, showToast]);

  const openWorkingCopy = useCallback(async () => {
    const current = envelopeRef.current;
    if (!current) return;
    const unresolved = pendingCandidateCount(current);
    if (unresolved > 0) {
      setMaterialized(null);
      setStep("review");
    } else {
      const result = await materializePrivateExhibit(current);
      if (result.status === "materialized") {
        const latest = envelopeRef.current;
        if (
          !latest ||
          latest.recordId !== current.recordId ||
          latest.revision !== current.revision ||
          pendingCandidateCount(latest) > 0
        ) {
          setMaterialized(null);
          if (latest) {
            setStep("review");
            showToast(
              "Exhibit not opened",
              "The working copy changed while the exhibit was being prepared. Review the current saved state, then open it again.",
            );
          }
          return;
        }
        setMaterialized({
          envelopeRevision: current.revision,
          exhibit: result.exhibit,
          quarantined: result.quarantined,
        });
        setStep("exhibit");
      } else {
        setRuntimeError(`Authoritative source validation failed: ${result.issues.join("; ")}`);
        setRecoveryAvailable(true);
        setRuntimeStatus("error");
      }
    }
  }, [showToast]);

  const saveObject = useCallback(async (targetStep: AppStep = "story") => {
    const current = envelopeRef.current;
    const store = storeRef.current;
    if (!current || !store || !objectDraft) return;
    if (imageProcessingRef.current) {
      setObjectError("Wait for the local image check to finish before leaving this step.");
      setStep("object");
      return;
    }
    if (!objectDraft.title.trim() || !objectDraft.objectName.trim() || !objectDraft.narratorLabel.trim() || !objectDraft.imageUrl) {
      setObjectError("Complete the title, object name, narrator label and image before leaving this step.");
      setStep("object");
      return;
    }
    setObjectError(null);
    const result = await runExclusiveCommand(
      "This object update",
      "the object update",
      async () => {
      let image = current.record.image;
      const mediaWrites: MediaWrite[] = [];
      if (pendingImage) {
        const id = `${current.recordId}:local-image`;
        mediaWrites.push({ id, blob: dataUrlToBlob(pendingImage.dataUrl) });
        image = {
          id,
          kind: "image",
          storage: "local",
          mimeType: pendingImage.mime,
          altText: objectDraft.imageAlt,
        };
      }
      await commitRecord(current, {
        ...current.record,
        title: objectDraft.title.trim(),
        objectName: objectDraft.objectName.trim(),
        narrator: { ...current.record.narrator, label: objectDraft.narratorLabel.trim() },
        image,
        updatedAt: new Date().toISOString(),
      }, mediaWrites);
      setPendingImage(null);
      if (targetStep === "exhibit") {
        setStep("review");
        showToast(
          "Exhibit needs refreshing",
          "The object changes were saved. Open the exhibit again to materialize this committed revision.",
        );
      } else {
        setStep(targetStep);
      }
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [commitRecord, handleCommandError, objectDraft, pendingImage, runExclusiveCommand, showToast]);

  const saveStory = useCallback(async (targetStep: AppStep = "review") => {
    const current = envelopeRef.current;
    const store = storeRef.current;
    if (!current || !store || !storyDraft) return;
    if (audioProcessingRef.current) {
      setStoryError("Wait for the local audio check to finish before leaving this step.");
      setStep("story");
      return;
    }
    const validatedText = canonicalizeSourceText(storyDraft.text.trim());
    if (codePointLength(validatedText) < 20 || codePointLength(validatedText) > 2_400) {
      setStoryError("Original words must contain 20 to 2,400 Unicode characters before leaving this step.");
      setStep("story");
      return;
    }
    setStoryError(null);
    const result = await runExclusiveCommand(
      "This original-word update",
      "the original-word update",
      async () => {
      const nextText = validatedText;
      const sourceContentChanged = nextText !== current.record.source.text;
      const storedSourceHash = await sha256Utf8(current.record.source.text);
      const sourceIntegrityInvalid =
        storedSourceHash !== current.record.source.sha256 ||
        codePointLength(current.record.source.text) !== current.record.source.codePointLength;
      const sourceChanged = sourceContentChanged || sourceIntegrityInvalid;
      const source = sourceChanged
        ? await createTextSourceRevision({ id: `source-${crypto.randomUUID()}`, text: nextText })
        : current.record.source;

      let candidates = current.record.candidates;
      let unsupported = qaScenario === "unsupported";
      if (sourceChanged || unsupported) {
        const adapter = unsupported ? new NoModelCandidateAdapter() : new DeterministicCandidateAdapter();
        const result = await adapter.analyze(source);
        candidates = result.candidates;
        unsupported = result.status === "unsupported";
      }

      let audio = current.record.audio;
      if (sourceChanged && audio?.textEquivalent) {
        if (!sourceContentChanged && audio.textEquivalent === source.text) {
          audio = {
            ...audio,
            textEquivalentSourceRevisionId: source.id,
            textEquivalentSourceSha256: source.sha256,
          };
        } else {
          const {
            textEquivalent: _textEquivalent,
            textEquivalentSourceRevisionId: _sourceRevisionId,
            textEquivalentSourceSha256: _sourceSha256,
            ...detachedAudio
          } = audio;
          void _textEquivalent;
          void _sourceRevisionId;
          void _sourceSha256;
          audio = detachedAudio;
        }
      }
      const mediaWrites: MediaWrite[] = [];
      if (pendingAudio) {
        const id = `${current.recordId}:local-audio`;
        mediaWrites.push({ id, blob: dataUrlToBlob(pendingAudio.dataUrl) });
        audio = {
          id,
          kind: "audio",
          storage: "local",
          mimeType: pendingAudio.mime,
        };
      }

      const committed = await commitRecord(current, {
        ...current.record,
        source,
        candidates,
        audio,
        updatedAt: new Date().toISOString(),
      }, mediaWrites);
      setPendingAudio(null);
      setAdapterUnsupported(unsupported);
      if (sourceChanged) {
        setUndoPayload(null);
        setToast((value) => ({ ...value, open: false }));
      }
      setStoryDraft((draft) => draft ? {
        ...draft,
        text: committed.record.source.text,
        audioTextEquivalent: committed.record.audio?.textEquivalent ?? null,
      } : draft);
      if (targetStep === "exhibit") {
        setStep("review");
        showToast(
          "Exhibit needs refreshing",
          pendingCandidateCount(committed) > 0
            ? "The original words changed and the new exact-span candidates need review before an exhibit can open."
            : "The original-word changes were saved. Open the exhibit again to materialize this committed revision.",
        );
      } else {
        setStep(targetStep);
      }
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [commitRecord, handleCommandError, pendingAudio, runExclusiveCommand, showToast, storyDraft]);

  const actOnCandidate = useCallback(async (candidateId: string, action: ReviewAction): Promise<ReviewActionOutcome> => {
    const result = await runExclusiveCommand(
      "This candidate decision",
      "another local decision",
      async () => {
      const current = envelopeRef.current;
      const candidate = current?.record.candidates.find((item) => item.id === candidateId);
      if (!current || !candidate) throw new Error("The candidate is no longer available in the current working copy.");
      const transition = action.kind === "confirm"
        ? confirmCandidate(candidate)
        : action.kind === "mark_uncertain"
          ? markCandidateUncertain(candidate)
          : action.kind === "reject"
            ? rejectCandidate(candidate)
            : action.kind === "rewrite"
              ? rewriteCandidate(candidate, action.text, action.certainty)
              : null;
      const nextCandidate = action.kind === "reopen"
        ? reopenCandidate(candidate, current.record.source)
        : transition!.candidate;
      await commitRecord(current, {
        ...current.record,
        candidates: replaceCandidate(current.record.candidates, nextCandidate),
        updatedAt: new Date().toISOString(),
      });
      setUndoPayload(transition?.undo ?? null);
      const actionLabel: Record<ReviewAction["kind"], string> = {
        confirm: "Confirmed",
        mark_uncertain: "Marked uncertain",
        reject: "Rejected",
        rewrite: "Rewritten",
        reopen: "Decision reopened",
      };
      showToast(
        actionLabel[action.kind],
        action.kind === "reopen"
          ? "Choose a new decision for this exact source span."
          : "The local decision was saved. Undo is available for this session.",
        action.kind !== "reopen",
      );
      setMaterialized(null);
      },
    );
    if (result.status === "failed") {
      handleCommandError(result.error);
      return "failed";
    }
    return result.status === "completed" ? "committed" : "not_submitted";
  }, [commitRecord, handleCommandError, runExclusiveCommand, showToast]);

  const undoCandidate = useCallback(async () => {
    const result = await runExclusiveCommand(
      "Undo",
      "another local decision",
      async () => {
      const current = envelopeRef.current;
      if (!current || !undoPayload) throw new Error("There is no candidate decision available to undo.");
      const candidate = current.record.candidates.find((item) => item.id === undoPayload.candidateId);
      if (!candidate) throw new Error("The candidate for this undo is no longer available.");
      const restored = undoCandidateAction(candidate, undoPayload);
      await commitRecord(current, {
        ...current.record,
        candidates: replaceCandidate(current.record.candidates, restored),
        updatedAt: new Date().toISOString(),
      });
      setUndoPayload(null);
      setToast((value) => ({ ...value, open: false }));
      showToast("Decision undone", "The previous candidate state was restored in this local session.");
      window.requestAnimationFrame(() => {
        document.getElementById(`candidate-row-${candidate.id}`)?.focus({ preventScroll: true });
      });
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [commitRecord, handleCommandError, runExclusiveCommand, showToast, undoPayload]);

  const addManualCandidate = useCallback(async (excerptInput: string, category: CandidateCategory): Promise<string | null> => {
    const result = await runExclusiveCommand(
      "The exact-span candidate",
      "another local decision",
      async () => {
      const current = envelopeRef.current;
      if (!current) throw new Error("No active source revision.");
      const excerpt = excerptInput.trim();
      const utf16Start = current.record.source.text.indexOf(excerpt);
      if (!excerpt || utf16Start < 0) throw new Error("Paste an exact phrase that appears in the original words.");
      if (current.record.source.text.indexOf(excerpt, utf16Start + excerpt.length) >= 0) {
        throw new Error("That phrase occurs more than once. Paste a longer exact phrase that identifies one occurrence.");
      }
      const start = utf16IndexToCodePointIndex(current.record.source.text, utf16Start);
      const end = start + codePointLength(excerpt);
      const candidate = createUserSelectedCandidate({
        id: `manual-${crypto.randomUUID()}`,
        category,
        source: current.record.source,
        start,
        end,
      });
      await commitRecord(current, {
        ...current.record,
        candidates: adapterUnsupported ? [candidate] : [...current.record.candidates, candidate],
        updatedAt: new Date().toISOString(),
      });
      setAdapterUnsupported(false);
      setUndoPayload(null);
      showToast("Exact-span candidate added", "It remains pending until the narrator reviews it.");
      },
    );
    if (result.status === "completed") return null;
    if (result.status === "not_submitted") {
      return "This exact-span candidate was not submitted. Wait for the current save to finish, then try again.";
    }
    if (result.error instanceof StoreConflictError) handleCommandError(result.error);
    return result.error instanceof Error ? result.error.message : "The exact-span candidate could not be added.";
  }, [adapterUnsupported, commitRecord, handleCommandError, runExclusiveCommand, showToast]);

  const reextractCandidates = useCallback(async () => {
    const result = await runExclusiveCommand(
      "This source re-extraction",
      "the source re-extraction",
      async () => {
      const current = envelopeRef.current;
      if (!current) throw new Error("No active source revision.");
      const actualHash = await sha256Utf8(current.record.source.text);
      const sourceNeedsRepair =
        actualHash !== current.record.source.sha256 ||
        codePointLength(current.record.source.text) !== current.record.source.codePointLength;
      const source = sourceNeedsRepair
        ? await createTextSourceRevision({ id: `source-${crypto.randomUUID()}`, text: current.record.source.text })
        : current.record.source;
      const result = await new DeterministicCandidateAdapter().analyze(source);
      let audio = current.record.audio;
      if (sourceNeedsRepair && audio?.textEquivalent) {
        if (audio.textEquivalent === source.text) {
          audio = {
            ...audio,
            textEquivalentSourceRevisionId: source.id,
            textEquivalentSourceSha256: source.sha256,
          };
        } else {
          const {
            textEquivalent: _textEquivalent,
            textEquivalentSourceRevisionId: _sourceRevisionId,
            textEquivalentSourceSha256: _sourceSha256,
            ...detachedAudio
          } = audio;
          void _textEquivalent;
          void _sourceRevisionId;
          void _sourceSha256;
          audio = detachedAudio;
        }
      }
      await commitRecord(current, {
        ...current.record,
        source,
        audio,
        candidates: result.candidates,
        updatedAt: new Date().toISOString(),
      });
      setAdapterUnsupported(result.status === "unsupported");
      setMaterialized(null);
      setUndoPayload(null);
      setToast((value) => ({ ...value, open: false }));
      showToast(
        result.status === "ready" ? "Source candidates re-extracted" : "No supported extraction",
        result.status === "ready" ? "Every candidate now binds the current source revision and awaits review." : "Keep the source-only exhibit or add a manual exact span.",
      );
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [commitRecord, handleCommandError, runExclusiveCommand, showToast]);

  const openExhibit = useCallback(async () => {
    const result = await runExclusiveCommand(
      "This exhibit request",
      "the local exhibit",
      async () => {
      const current = envelopeRef.current;
      if (!current) throw new Error("No active local working copy.");
      const unresolved = pendingCandidateCount(current);
      if (unresolved > 0) {
        setMaterialized(null);
        setStep("review");
        showToast(
          "Exhibit not opened",
          `Review ${unresolved} pending candidate${unresolved === 1 ? "" : "s"} before opening a newly materialized exhibit.`,
        );
        return;
      }
      const result = await materializePrivateExhibit(current);
      if (result.status === "invalid_envelope") {
        setRuntimeError(`Authoritative source validation failed: ${result.issues.join("; ")}`);
        setRecoveryAvailable(true);
        setRuntimeStatus("error");
        return;
      }
      const latest = envelopeRef.current;
      if (
        !latest ||
        latest.recordId !== current.recordId ||
        latest.revision !== current.revision ||
        pendingCandidateCount(latest) > 0
      ) {
        setMaterialized(null);
        if (latest) {
          setStep("review");
          showToast(
            "Exhibit not opened",
            "The working copy changed while the exhibit was being prepared. Review the current saved state, then open it again.",
          );
        }
        return;
      }
      setMaterialized({
        envelopeRevision: current.revision,
        exhibit: result.exhibit,
        quarantined: result.quarantined,
      });
      setStep("exhibit");
      },
    );
    if (result.status === "failed") handleCommandError(result.error);
  }, [handleCommandError, runExclusiveCommand, showToast]);

  const clearWorkingCopy = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    if (clearInFlightRef.current) {
      setClearError("A local clear verification is already running. Wait for it to finish before trying again.");
      return;
    }
    clearInFlightRef.current = true;
    setClearBusy(true);
    setClearError(null);
    try {
      if (qaScenario === "clear-error") {
        throw new Error("QA scenario: controlled key verification intentionally failed.");
      }
      const result = await store.clear();
      if (result.status !== "cleared") throw new Error(result.reason);
      revokeObjectUrls();
      mediaGenerationRef.current += 1;
      imageProcessingRef.current = false;
      audioProcessingRef.current = false;
      setImageProcessing(false);
      setAudioProcessing(false);
      setEnvelope(null);
      envelopeRef.current = null;
      setObjectDraft(null);
      setStoryDraft(null);
      setPendingImage(null);
      setPendingAudio(null);
      setMaterialized(null);
      setUndoPayload(null);
      setStep("collection");
      broadcastClear();
      showToast(
        storageMode === "session" ? "Session working copy cleared" : "Local working copy cleared",
        storageMode === "session"
          ? "Verified empty in this in-memory session only. Unavailable persistent browser storage was not inspected or claimed cleared."
          : "Verified in this browser prototype only. Original files, screenshots, backups, other copies and bundled fixtures remain outside scope.",
      );
    } catch (error) {
      setClearError(error instanceof Error ? error.message : "Controlled local keys could not be verified as empty.");
    } finally {
      clearInFlightRef.current = false;
      setClearBusy(false);
    }
  }, [broadcastClear, revokeObjectUrls, showToast, storageMode]);

  const recoverCorruptLocalState = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    if (clearInFlightRef.current) {
      setRuntimeError("Clear incomplete: a controlled-store verification is already running.");
      return;
    }
    clearInFlightRef.current = true;
    setClearBusy(true);
    try {
      const result = await store.clear();
      if (result.status !== "cleared") throw new Error(result.reason);
      revokeObjectUrls();
      mediaGenerationRef.current += 1;
      imageProcessingRef.current = false;
      audioProcessingRef.current = false;
      setImageProcessing(false);
      setAudioProcessing(false);
      setEnvelope(null);
      envelopeRef.current = null;
      setObjectDraft(null);
      setStoryDraft(null);
      setPendingImage(null);
      setPendingAudio(null);
      setMaterialized(null);
      setUndoPayload(null);
      setRecoveryAvailable(false);
      setStep("collection");
      setRuntimeStatus("ready");
      broadcastClear();
      showToast(
        "Corrupt local state cleared",
        "Both prototype-controlled stores were verified empty. Other copies remain outside scope.",
      );
    } catch (error) {
      setRuntimeError(`Clear incomplete: ${error instanceof Error ? error.message : "controlled stores could not be verified"}`);
      setRuntimeStatus("error");
    } finally {
      clearInFlightRef.current = false;
      setClearBusy(false);
    }
  }, [broadcastClear, revokeObjectUrls, showToast]);

  const navigateToStep = useCallback(async (next: AppStep) => {
    if (next === step) return;
    if (!allowNavigation(`Moving to ${next}`)) return;
    if (step === "object") {
      await saveObject(next);
      return;
    }
    if (step === "story") {
      await saveStory(next);
      return;
    }
    if (next === "exhibit" && !currentMaterialized) await openExhibit();
    else setStep(next);
  }, [allowNavigation, currentMaterialized, openExhibit, saveObject, saveStory, step]);

  const fixtureCards = useMemo(() => catalog?.fixtures.map(fixtureSummary) ?? [], [catalog]);
  const enabledSteps = useMemo<AppStep[]>(() => {
    if (!envelope) return ["collection"];
    const enabled: AppStep[] = ["collection", "object", "story", "review"];
    if (currentMaterialized) enabled.push("exhibit");
    return enabled;
  }, [currentMaterialized, envelope]);

  const renderPage = () => {
    if (runtimeStatus === "loading") return <LoadingPanel />;
    if (runtimeStatus === "error") {
      return (
        <ErrorPanel
          title="The local working copy is unavailable"
          message={runtimeError}
          onRetry={() => setBootNonce((value) => value + 1)}
          retryLabel={runtimeError.includes("another tab") || runtimeError.includes("recreated") ? "Reload working copy" : "Retry local storage"}
          onClearLocalState={recoveryAvailable ? recoverCorruptLocalState : undefined}
          clearBusy={clearBusy}
        />
      );
    }
    if (!catalog) return <ErrorPanel title="Synthetic fixtures are unavailable" message="The fixture catalog did not load." />;

    if (step === "collection") {
      return (
        <CollectionScreen
          fixtures={fixtureCards}
          hasWorkingCopy={Boolean(envelope)}
          onOpenWorkingCopy={() => void openWorkingCopy()}
          onStartFixture={(id) => void startFixture(id)}
          headingRef={headingRef}
        />
      );
    }
    if (!envelope || !objectDraft || !storyDraft) {
      return <ErrorPanel title="No local working copy" message="Return to the sample collection and start the synthetic fixture." onRetry={() => setStep("collection")} retryLabel="Return to sample collection" />;
    }
    if (step === "object") {
      return (
        <ObjectScreen
          draft={objectDraft}
          imageError={imageError}
          formError={objectError}
          busy={commandBusy || imageProcessing}
          processing={imageProcessing}
          onChange={(next) => { setObjectError(null); setObjectDraft(next); }}
          onImage={async (file) => {
            if (imageProcessingRef.current) {
              setImageError("Another local image is still being checked.");
              return null;
            }
            const generation = mediaGenerationRef.current;
            const recordId = envelopeRef.current?.recordId ?? null;
            imageProcessingRef.current = true;
            setImageProcessing(true);
            setImageError(null);
            try {
              const media = await ingestImage(file);
              if (mediaGenerationRef.current !== generation || envelopeRef.current?.recordId !== recordId) {
                return null;
              }
              setPendingImage(media);
              return media;
            } catch (error) {
              setImageError(error instanceof MediaValidationError ? error.message : "The image could not be prepared.");
              return null;
            } finally {
              if (mediaGenerationRef.current === generation) {
                imageProcessingRef.current = false;
                setImageProcessing(false);
              }
            }
          }}
          onBack={() => void saveObject("collection")}
          onContinue={() => void saveObject("story")}
          headingRef={headingRef}
        />
      );
    }
    if (step === "story") {
      return (
        <StoryScreen
          draft={storyDraft}
          audioError={audioError}
          storyError={storyError}
          busy={commandBusy || audioProcessing}
          processing={audioProcessing}
          onChange={(next) => { setStoryError(null); setStoryDraft(next); }}
          onAudio={async (file) => {
            if (audioProcessingRef.current) {
              setAudioError("Another local audio file is still being checked.");
              return null;
            }
            const generation = mediaGenerationRef.current;
            const recordId = envelopeRef.current?.recordId ?? null;
            audioProcessingRef.current = true;
            setAudioProcessing(true);
            setAudioError(null);
            try {
              const media = await ingestAudio(file);
              if (mediaGenerationRef.current !== generation || envelopeRef.current?.recordId !== recordId) {
                return null;
              }
              setPendingAudio(media);
              return media;
            } catch (error) {
              setAudioError(error instanceof MediaValidationError ? error.message : "The audio could not be prepared.");
              return null;
            } finally {
              if (mediaGenerationRef.current === generation) {
                audioProcessingRef.current = false;
                setAudioProcessing(false);
              }
            }
          }}
          onBack={() => void saveStory("object")}
          onContinue={() => void saveStory("review")}
          headingRef={headingRef}
        />
      );
    }
    if (step === "review") {
      return (
          <ReviewScreen
          record={envelope.record}
          unsupportedMode={adapterUnsupported}
          busy={commandBusy}
          onAction={actOnCandidate}
          onAddManualCandidate={addManualCandidate}
          onReextract={reextractCandidates}
          onBack={() => {
            if (allowNavigation("Returning to the original words")) setStep("story");
          }}
          onContinue={() => void openExhibit()}
          headingRef={headingRef}
        />
      );
    }
    if (!currentMaterialized) {
      return <ErrorPanel title="Exhibit view is not materialized" message="Return to Review and materialize from the current authoritative state." onRetry={() => setStep("review")} retryLabel="Return to Review" />;
    }
    return (
      <ExhibitScreen
        exhibit={currentMaterialized.exhibit}
        imageUrl={objectDraft.imageUrl}
        audioUrl={storyDraft.audioUrl}
        quarantined={currentMaterialized.quarantined}
        clearBusy={clearBusy}
        clearError={clearError}
        storageMode={storageMode}
        onCorrect={() => setStep("review")}
        onCollection={() => setStep("collection")}
        onClear={clearWorkingCopy}
        headingRef={headingRef}
      />
    );
  };

  return (
    <Theme appearance={theme} accentColor="indigo" grayColor="slate" radius="medium" scaling="100%">
      <Toast.Provider duration={10_000} swipeDirection="right">
        <div className="app app-frame">
          <AppHeader themePreference={themePreference} onThemeChange={setThemePreference} />
          {qaScenario && qaLabels[qaScenario] ? <div className="qa-banner" role="status">QA scenario · {qaLabels[qaScenario]}</div> : null}
          {envelope?.record.provenance.contentOrigin === "synthetic_fixture" ? (
            <div className="synthetic-context-banner" role="status">
              <span className="synthetic-label">Synthetic fixture</span>
              This working copy remains fixture-derived even if its image or wording is corrected.
            </div>
          ) : null}
          <div className="app-shell">
            {runtimeStatus === "ready" ? (
              <StepRail
                current={step}
                enabled={enabledSteps}
                busy={commandBusy}
                onSelect={(next) => void navigateToStep(next)}
              />
            ) : <div aria-hidden="true" />}
            <main id="main-content" className="app-content content">
              {runtimeStatus === "ready" && storageMode === "session" ? <SessionOnlyNotice /> : null}
              {qaScenario === "performance" ? <PerformanceProbe /> : null}
              {renderPage()}
            </main>
          </div>
        </div>

        <Toast.Root className="toast-root" open={toast.open} onOpenChange={(open) => setToast((value) => ({ ...value, open }))}>
          <div>
            <Toast.Title className="toast-title">{toast.title}</Toast.Title>
            <Toast.Description className="toast-description">{toast.description}</Toast.Description>
          </div>
          <div className="toast-actions">
            {toast.undoAvailable && undoPayload ? (
              <Toast.Action altText="Undo the last candidate decision" asChild>
                <Button className="button button--quiet" variant="ghost" disabled={commandBusy} onClick={() => void undoCandidate()}>
                  <ArrowCounterClockwise size={17} /> Undo
                </Button>
              </Toast.Action>
            ) : null}
            <Toast.Close asChild>
              <button type="button" className="icon-button" aria-label="Dismiss notification"><X size={17} /></button>
            </Toast.Close>
          </div>
        </Toast.Root>
        <Toast.Viewport
          className="toast-viewport"
          data-session-only={storageMode === "session" || undefined}
          data-context={qaScenario && envelope?.record.provenance.contentOrigin === "synthetic_fixture"
            ? "qa-synthetic"
            : qaScenario
              ? "qa"
              : envelope?.record.provenance.contentOrigin === "synthetic_fixture"
                ? "synthetic"
                : "default"}
        />
      </Toast.Provider>
    </Theme>
  );
}
