import { Badge, Button, Callout, TextArea } from "@radix-ui/themes";
import { ArrowLeft, ArrowRight, SpeakerHigh, WarningCircle } from "@phosphor-icons/react";
import type { StoredAudioAttachment } from "../../app/media";
import { codePointLength } from "../../domain/provenance";

interface StoryDraft {
  text: string;
  audioUrl: string | null;
  audioTextEquivalent: string | null;
}

interface StoryScreenProps {
  draft: StoryDraft;
  audioError: string | null;
  storyError: string | null;
  busy: boolean;
  processing: boolean;
  onChange: (next: StoryDraft) => void;
  onAudio: (file: File) => Promise<StoredAudioAttachment | null>;
  onBack: () => void;
  onContinue: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export function StoryScreen({ draft, audioError, storyError, busy, processing, onChange, onAudio, onBack, onContinue, headingRef }: StoryScreenProps) {
  const sourceLength = codePointLength(draft.text);
  const trimmedSourceLength = codePointLength(draft.text.trim());
  const canContinue = trimmedSourceLength >= 20 && trimmedSourceLength <= 2_400;
  const audioMatchesVisibleText = Boolean(draft.audioTextEquivalent && draft.audioTextEquivalent === draft.text);

  return (
    <section className="page" aria-labelledby="story-title" aria-busy={busy}>
      <header className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Step 2 of 4 · Original words</p>
          <h1 id="story-title" ref={headingRef} tabIndex={-1}>Keep the narrator&apos;s words authoritative</h1>
          <p className="lede">Write what you remember, including uncertainty. The system will only point to exact phrases and will not complete the memory.</p>
        </div>
      </header>

      {processing ? (
        <Callout.Root className="alert" color="indigo" role="status">
          <Callout.Icon><SpeakerHigh size={18} /></Callout.Icon>
          <Callout.Text>Checking the local audio type and duration. Stay on this step until it finishes.</Callout.Text>
        </Callout.Root>
      ) : null}

      <div className="capture-layout story-layout">
        <section className="capture-form panel">
          <div className="panel__header">
            <h2>Original text source</h2>
            <p>Editing this text creates a new source revision and invalidates earlier candidate decisions.</p>
          </div>
          <div className="panel__body">
            <label className="field">
              <span className="field__label">Your original words</span>
              <TextArea
                className="textarea story-textarea"
                value={draft.text}
                rows={10}
                disabled={busy}
                aria-describedby={storyError ? "story-help story-error" : "story-help"}
                onChange={(event) => onChange({
                  ...draft,
                  text: Array.from(event.currentTarget.value).slice(0, 2_400).join(""),
                })}
              />
              <span className="field__hint" id="story-help">{sourceLength.toLocaleString()} / 2,400 Unicode characters. At least 20 are required; fuzzy time such as “late spring” stays fuzzy.</span>
              {storyError ? <span className="field__message field__message--error" id="story-error" role="alert"><WarningCircle size={16} /> {storyError}</span> : null}
            </label>
          </div>
        </section>

        <aside className="capture-media panel" aria-labelledby="audio-heading">
          <div className="panel__header">
            <h2 id="audio-heading">Optional short audio</h2>
            <p>Audio is supplemental playback only. There is no transcription or audio-derived source span.</p>
          </div>
          <div className="panel__body">
            {draft.audioUrl ? (
              <div className="audio-block">
                <Badge className="local-label" variant="outline">Local audio attachment</Badge>
                <audio controls preload="metadata" src={draft.audioUrl} aria-describedby="audio-boundary">Your browser does not support audio playback.</audio>
                <p className="field__hint" id="audio-boundary">
                  {audioMatchesVisibleText
                    ? "This audio has a text equivalent matching the visible original text."
                    : draft.audioTextEquivalent
                      ? "The original text changed, so this audio equivalence will be detached when you continue."
                      : "No verified text equivalent is attached. The audio will not appear in the accessibility-complete exhibit path."}
                </p>
              </div>
            ) : (
              <Callout.Root className="unsupported-state" color="gray">
                <Callout.Icon><SpeakerHigh size={18} /></Callout.Icon>
                <Callout.Text>No audio attached. Text-only is a complete supported path.</Callout.Text>
              </Callout.Root>
            )}

            <label className="upload-control" htmlFor="story-audio">
              <span><strong>Choose local audio</strong><small>MP3, WAV or M4A · up to 60 seconds</small></span>
              <input
                id="story-audio"
                className="visually-hidden"
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                disabled={busy}
                aria-describedby={audioError ? "audio-error" : "audio-metadata-note"}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  const media = await onAudio(file);
                  if (!media) return;
                  onChange({
                    ...draft,
                    audioUrl: media.dataUrl,
                    audioTextEquivalent: null,
                  });
                }}
              />
            </label>
            <p className="field__hint" id="audio-metadata-note">This prototype validates type and duration but does not sanitize embedded audio metadata.</p>
            {audioError ? <p className="field__message field__message--error" id="audio-error" role="alert"><WarningCircle size={16} /> {audioError}</p> : null}
          </div>
        </aside>
      </div>

      <div className="mobile-sticky-actions page-actions">
        <Button className="button button--quiet" variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft size={18} /> Save and back</Button>
        <Button className="button button--primary" size="3" disabled={!canContinue || busy} onClick={onContinue}>Review exact-text candidates <ArrowRight size={18} /></Button>
      </div>
    </section>
  );
}
