import { useEffect, useRef } from "react";
import { AlertDialog, Button, Callout } from "@radix-ui/themes";
import { ArrowClockwise, Database, Trash, WarningCircle } from "@phosphor-icons/react";

export function LoadingPanel() {
  return (
    <section className="state-panel loading-panel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Opening the local working copy.</span>
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-image" />
        <div className="skeleton-stack">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row short" />
        </div>
      </div>
    </section>
  );
}

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  qaLabel?: string;
  onClearLocalState?: () => Promise<void>;
  clearBusy?: boolean;
}

export function ErrorPanel({ title, message, onRetry, retryLabel = "Retry local storage", qaLabel, onClearLocalState, clearBusy }: ErrorPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="state-panel error-panel" role="alert">
      {qaLabel ? <span className="qa-label">QA scenario · {qaLabel}</span> : null}
      <WarningCircle size={32} weight="regular" aria-hidden="true" />
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p>{message}</p>
      {onRetry ? (
        <Button className="button button--primary" size="3" onClick={onRetry}>
          <ArrowClockwise size={18} /> {retryLabel}
        </Button>
      ) : null}
      {onClearLocalState ? (
        <AlertDialog.Root>
          <AlertDialog.Trigger>
            <Button className="button button--danger" color="red" variant="outline" disabled={clearBusy}>
              <Trash size={18} /> Clear corrupt local prototype state
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content className="dialog-content" maxWidth="600px">
            <AlertDialog.Title className="dialog-title">Clear the prototype-controlled local stores?</AlertDialog.Title>
            <AlertDialog.Description className="dialog-description">
              This recovery removes the active working record and the entire local media store, then verifies both stores are empty.
            </AlertDialog.Description>
            <div className="dialog-body boundary-list">
              <p>It cannot remove original files, screenshots, downloads, browser/device backups, other copies or code-bundled fixtures.</p>
            </div>
            {message.startsWith("Clear incomplete:") ? (
              <Callout.Root className="clear-incomplete-state" color="red" role="alert">
                <Callout.Icon><WarningCircle size={19} /></Callout.Icon>
                <Callout.Text>{message}</Callout.Text>
              </Callout.Root>
            ) : null}
            <div className="dialog-footer">
              <AlertDialog.Cancel><Button className="button button--quiet" variant="ghost" disabled={clearBusy}>Keep local state</Button></AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button
                  className="button button--danger"
                  color="red"
                  disabled={clearBusy}
                  onClick={(event) => {
                    event.preventDefault();
                    void onClearLocalState();
                  }}
                >
                  <Trash size={18} /> {clearBusy ? "Verifying clear" : "Clear corrupt prototype state"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Root>
      ) : null}
    </section>
  );
}

export function SessionOnlyNotice() {
  return (
    <Callout.Root className="session-notice" color="amber" role="status">
      <Callout.Icon><Database size={18} /></Callout.Icon>
      <Callout.Text>
        Session-only mode. This browser could not open IndexedDB, so the working copy will disappear when this tab closes or refreshes. Clear can verify only this in-memory session; unavailable persistent browser storage is not inspected.
      </Callout.Text>
    </Callout.Root>
  );
}
