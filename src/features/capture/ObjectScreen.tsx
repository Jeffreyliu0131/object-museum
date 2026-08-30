import { Badge, Button, Callout, TextField } from "@radix-ui/themes";
import { ArrowLeft, ArrowRight, ImageSquare, WarningCircle } from "@phosphor-icons/react";
import type { StoredImageDerivative } from "../../app/media";

interface ObjectDraft {
  title: string;
  objectName: string;
  narratorLabel: string;
  imageUrl: string | null;
  imageAlt: string;
  synthetic: boolean;
}

interface ObjectScreenProps {
  draft: ObjectDraft;
  imageError: string | null;
  formError: string | null;
  busy: boolean;
  processing: boolean;
  onChange: (next: ObjectDraft) => void;
  onImage: (file: File) => Promise<StoredImageDerivative | null>;
  onBack: () => void;
  onContinue: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export function ObjectScreen({
  draft,
  imageError,
  formError,
  busy,
  processing,
  onChange,
  onImage,
  onBack,
  onContinue,
  headingRef,
}: ObjectScreenProps) {
  const canContinue = draft.title.trim() && draft.objectName.trim() && draft.narratorLabel.trim() && draft.imageUrl;

  return (
    <section className="page" aria-labelledby="object-title" aria-busy={busy}>
      <header className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Step 1 of 4 · Object</p>
          <h1 id="object-title" ref={headingRef} tabIndex={-1}>Begin with the object itself</h1>
          <p className="lede">This prototype keeps one raster derivative in the current local working state. It does not upload the file.</p>
        </div>
      </header>

      {draft.synthetic ? (
        <Callout.Root className="alert" color="indigo">
          <Callout.Icon><ImageSquare size={18} /></Callout.Icon>
          <Callout.Text>This working copy started from a synthetic fixture. No real family material is present.</Callout.Text>
        </Callout.Root>
      ) : null}

      {processing ? (
        <Callout.Root className="alert" color="indigo" role="status">
          <Callout.Icon><ImageSquare size={18} /></Callout.Icon>
          <Callout.Text>Checking and preparing the local image. Stay on this step until it finishes.</Callout.Text>
        </Callout.Root>
      ) : null}

      <div className="capture-layout">
        <section className="capture-media panel" aria-label="Object image">
          <div className="media-frame">
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt={draft.imageAlt || draft.objectName} />
            ) : (
              <div className="media-frame__placeholder"><ImageSquare size={40} /><span>No image selected</span></div>
            )}
          </div>
          <label className="upload-control" htmlFor="object-image">
            <span><strong>Choose a local image</strong><small>JPEG, PNG or WebP · up to 5 MB</small></span>
            <input
              id="object-image"
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              aria-describedby={imageError ? "image-error" : "image-help"}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                const media = await onImage(file);
                if (!media) return;
                onChange({
                  ...draft,
                  imageUrl: media.dataUrl,
                  imageAlt: `${draft.objectName || "Object"}, locally supplied image`,
                  synthetic: false,
                });
              }}
            />
          </label>
          <p className="field__hint" id="image-help">The browser re-encodes images to remove the original container metadata before local storage.</p>
          {imageError ? <p className="field__message field__message--error" id="image-error" role="alert"><WarningCircle size={16} /> {imageError}</p> : null}
        </section>

        <form className="capture-form panel" onSubmit={(event) => { event.preventDefault(); if (canContinue) onContinue(); }}>
          <div className="panel__header">
            <h2>Working labels</h2>
            <p>These labels stay editable. They are not inferred from the image.</p>
          </div>
          <div className="panel__body">
            {formError ? <p className="field__message field__message--error" role="alert"><WarningCircle size={16} /> {formError}</p> : null}
            <label className="field">
              <span className="field__label">Exhibit title</span>
              <TextField.Root
                value={draft.title}
                maxLength={80}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
              />
              <span className="field__hint">A short working title, written by the narrator.</span>
            </label>
            <label className="field">
              <span className="field__label">Object name</span>
              <TextField.Root
                value={draft.objectName}
                maxLength={60}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, objectName: event.currentTarget.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Narrator display label</span>
              <TextField.Root
                value={draft.narratorLabel}
                maxLength={60}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, narratorLabel: event.currentTarget.value })}
              />
              <span className="field__hint">This is attribution, not identity verification.</span>
            </label>
            <div className="local-boundary">
              <Badge className="local-label" variant="outline">Current browser only</Badge>
              <p>Use synthetic, self-owned or clearly licensed media. This portfolio prototype is not encrypted and has no backup.</p>
            </div>
          </div>
          <div className="panel__footer dialog-actions">
            <Button className="button button--quiet" variant="ghost" type="button" disabled={busy} onClick={onBack}><ArrowLeft size={18} /> Save and return</Button>
            <Button className="button button--primary" size="3" type="button" disabled={!canContinue || busy} onClick={() => { if (canContinue) onContinue(); }}>Continue to original words <ArrowRight size={18} /></Button>
          </div>
        </form>
      </div>
    </section>
  );
}
