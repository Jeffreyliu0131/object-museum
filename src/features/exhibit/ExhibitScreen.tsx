import { AlertDialog, Badge, Button, Callout } from "@radix-ui/themes";
import {
  ArrowLeft,
  CheckCircle,
  Database,
  PencilSimple,
  Quotes,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { MaterializedPrivateExhibit, MaterializedStatement, QuarantinedCandidate } from "../../domain/materialize";

const statementLabels: Record<MaterializedStatement["category"], string> = {
  fuzzy_time: "Time, kept fuzzy",
  person: "Person",
  place: "Place",
  event: "Event",
  why_it_matters: "Why it matters, narrator testimony",
};

interface ExhibitScreenProps {
  exhibit: MaterializedPrivateExhibit;
  imageUrl: string | null;
  audioUrl: string | null;
  quarantined: QuarantinedCandidate[];
  clearBusy: boolean;
  clearError: string | null;
  storageMode: "indexeddb" | "session";
  onCorrect: () => void;
  onCollection: () => void;
  onClear: () => Promise<void>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

function Statement({ statement }: { statement: MaterializedStatement }) {
  return (
    <li className="exhibit-statement" data-certainty={statement.certainty}>
      <div>
        <span className="exhibit-statement__label">{statementLabels[statement.category]}</span>
        {statement.certainty === "uncertain" ? <Badge className="certainty-status" variant="outline">Narrator uncertain</Badge> : null}
      </div>
      <div>
        {statement.quoted ? (
          <blockquote className="exhibit-statement__value">“{statement.text}”</blockquote>
        ) : (
          <p className="exhibit-statement__value">{statement.text}</p>
        )}
        <p className="candidate-caption">
          {statement.authorship === "source_exact"
            ? `Exact words from ${statement.attribution.label}`
            : `Rewritten by ${statement.attribution.label} from the adjacent source excerpt`}
        </p>
        <details className="provenance-inline">
          <summary>Source excerpt and span</summary>
          <p>“{statement.source.excerpt}”</p>
          <small>
            Unicode code points [{statement.source.span.start}, {statement.source.span.end}) · revision {statement.source.span.sourceRevisionId} · SHA-256 {statement.source.span.sourceSha256}
          </small>
        </details>
      </div>
    </li>
  );
}

export function ExhibitScreen({
  exhibit,
  imageUrl,
  audioUrl,
  quarantined,
  clearBusy,
  clearError,
  storageMode,
  onCorrect,
  onCollection,
  onClear,
  headingRef,
}: ExhibitScreenProps) {
  const sessionOnly = storageMode === "session";
  return (
    <section className="page" aria-labelledby="exhibit-title" aria-busy={clearBusy}>
      <header className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Step 4 of 4 · Local exhibit</p>
          <h1 id="exhibit-title" ref={headingRef} tabIndex={-1}>A local working exhibit in this prototype</h1>
          <p className="lede">This is a local working view, not an encrypted vault, shared page, backed-up archive or production privacy guarantee.</p>
        </div>
        <div className="page-header__actions">
          <Badge className="local-label" variant="outline">{sessionOnly ? "Current tab session" : "Current browser profile"}</Badge>
        </div>
      </header>

      {quarantined.length ? (
        <Callout.Root className="error-state" color="red" role="alert">
          <Callout.Icon><WarningCircle size={19} /></Callout.Icon>
          <Callout.Text>{quarantined.length} statement{quarantined.length === 1 ? " was" : "s were"} excluded because its source contract failed. Nothing was shown without valid provenance.</Callout.Text>
        </Callout.Root>
      ) : null}

      <article className="exhibit-layout">
        <figure className="exhibit-media">
          <div className="exhibit-media__frame">
            {imageUrl ? <img src={imageUrl} alt={exhibit.image?.altText || exhibit.objectName} /> : null}
          </div>
          <figcaption className="exhibit-media__caption">
            <Badge className={exhibit.image?.storage === "fixture" ? "synthetic-label" : "local-label"} variant="outline">
              {exhibit.image?.storage === "fixture" ? "Synthetic fixture image" : "Local raster derivative"}
            </Badge>
            {exhibit.contentOrigin === "synthetic_fixture" ? <Badge className="synthetic-label" variant="outline">Fixture-derived story</Badge> : null}
          </figcaption>
        </figure>

        <div className="exhibit-story">
          <p className="eyebrow">{exhibit.objectName}</p>
          <h2 className="exhibit-title">{exhibit.title}</h2>
          <div className="exhibit-testimony testimony">
            <Quotes size={24} aria-hidden="true" />
            <blockquote>“{exhibit.sourceText}”</blockquote>
            <p className="testimony__attribution">Original words · {exhibit.narrator.label}</p>
          </div>

          {audioUrl ? (
            <section className="audio-block" aria-labelledby="narration-heading">
              <h3 id="narration-heading">Supplemental narration</h3>
              <audio controls preload="metadata" src={audioUrl} aria-describedby="narration-boundary">Your browser does not support audio playback.</audio>
              <p className="candidate-caption" id="narration-boundary">
                {exhibit.audioHasTextEquivalent
                  ? "A visible text equivalent is present. Audio did not create any candidate or source span."
                  : "No verified text equivalent is present, so this audio is outside the accessibility-complete exhibit path."}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="reviewed-statements-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Narrator reviewed</p>
                <h3 id="reviewed-statements-heading">Statements with sources</h3>
              </div>
              <span className="status-label"><CheckCircle size={15} /> {exhibit.statements.length} included</span>
            </div>
            {exhibit.statements.length ? (
              <ul className="exhibit-statements">
                {exhibit.statements.map((statement) => <Statement key={statement.candidateId} statement={statement} />)}
              </ul>
            ) : (
              <Callout.Root className="unsupported-state" color="gray">
                <Callout.Text>Source-only exhibit. No candidate statements were included.</Callout.Text>
              </Callout.Root>
            )}
          </section>
        </div>
      </article>

      <section className="local-boundary scope-note" aria-labelledby="local-scope-title">
        <Database size={22} aria-hidden="true" />
        <div>
          <h2 id="local-scope-title">Local control boundary</h2>
          <p>{sessionOnly
            ? "IndexedDB is unavailable, so this working copy exists only in memory for this tab and will disappear on close or refresh."
            : "This working copy is stored in the current browser profile. It is not encrypted and may be affected by browser clearing, profile access and device security."}</p>
          <p>{sessionOnly
            ? "Clearing can verify only this in-memory session. Unavailable persistent browser storage is not inspected or claimed cleared; original files, screenshots, backups, other copies and bundled fixtures also remain outside the action."
            : "Clearing can remove only the prototype's working record and local media derivative. Original files, screenshots, downloads, backups, other copies and bundled fixtures remain outside that action."}</p>
        </div>
      </section>

      {clearError ? <Callout.Root className="clear-incomplete-state" color="red" role="alert"><Callout.Icon><WarningCircle size={19} /></Callout.Icon><Callout.Text><strong>Clear incomplete.</strong> {clearError} The working-copy success state was not shown.</Callout.Text></Callout.Root> : null}

      <div className="page-actions dialog-actions">
        <Button className="button button--quiet" variant="ghost" disabled={clearBusy} onClick={onCollection}><ArrowLeft size={18} /> Sample collection</Button>
        <Button className="button button--secondary" variant="outline" disabled={clearBusy} onClick={onCorrect}><PencilSimple size={18} /> Correct candidates</Button>

        <AlertDialog.Root>
          <AlertDialog.Trigger>
            <Button className="button button--danger" color="red" variant="outline" disabled={clearBusy}><Trash size={18} /> Clear local working copy</Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content className="dialog-content" maxWidth="620px">
            <AlertDialog.Title className="dialog-title">Clear this browser prototype working copy?</AlertDialog.Title>
            <AlertDialog.Description className="dialog-description">
              {sessionOnly
                ? "This action removes the in-memory record and attachments for this tab, then verifies this session is empty."
                : "This action removes the active record and all prototype-controlled media from this browser profile, then verifies both local stores are empty."}
            </AlertDialog.Description>
            <div className="dialog-body boundary-list">
              <p><strong>Removed if verification succeeds:</strong> {sessionOnly ? "the current in-memory working record, candidate decisions and session attachments." : "the current working record, candidate decisions, local image/audio entries and in-memory object URLs."}</p>
              <p><strong>Not removed or inspected:</strong> {sessionOnly ? "unavailable persistent browser storage, original files, screenshots, downloads, browser or device backups, other copies and code-bundled synthetic fixtures." : "original files, screenshots, downloads, browser or device backups, other copies and the code-bundled synthetic fixtures."}</p>
              <p>If verification fails, the app reports clear incomplete and does not claim success.</p>
            </div>
            {clearError ? (
              <Callout.Root className="clear-incomplete-state" color="red" role="alert">
                <Callout.Icon><WarningCircle size={19} /></Callout.Icon>
                <Callout.Text><strong>Clear incomplete.</strong> {clearError} The working-copy success state was not shown.</Callout.Text>
              </Callout.Root>
            ) : null}
            <div className="dialog-footer">
              <AlertDialog.Cancel><Button className="button button--quiet" variant="ghost" disabled={clearBusy}>Keep working copy</Button></AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button
                  className="button button--danger"
                  color="red"
                  disabled={clearBusy}
                  onClick={(event) => {
                    event.preventDefault();
                    void onClear();
                  }}
                >
                  <Trash size={18} /> {clearBusy ? "Verifying clear" : sessionOnly ? "Clear this session copy" : "Clear from this browser prototype"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </div>
    </section>
  );
}
