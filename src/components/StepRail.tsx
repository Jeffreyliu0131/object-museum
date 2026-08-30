import { Check, Circle } from "@phosphor-icons/react";

export type AppStep = "collection" | "object" | "story" | "review" | "exhibit";

const steps: Array<{ id: AppStep; label: string; short: string }> = [
  { id: "collection", label: "Sample collection", short: "Collection" },
  { id: "object", label: "Object", short: "Object" },
  { id: "story", label: "Original words", short: "Story" },
  { id: "review", label: "Review candidates", short: "Review" },
  { id: "exhibit", label: "Local exhibit", short: "Exhibit" },
];

interface StepRailProps {
  current: AppStep;
  enabled: AppStep[];
  busy?: boolean;
  onSelect: (step: AppStep) => void;
}

export function StepRail({ current, enabled, busy = false, onSelect }: StepRailProps) {
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <nav className="step-rail" aria-label="First-exhibit steps">
      <p className="step-rail__title">First exhibit</p>
      <ol className="step-list">
        {steps.map((step, index) => {
          const isCurrent = step.id === current;
          const isComplete = index < currentIndex;
          const isEnabled = enabled.includes(step.id);
          return (
            <li key={step.id} data-current={isCurrent || undefined} data-complete={isComplete || undefined}>
              <button
                type="button"
                className="step-button"
                aria-current={isCurrent ? "step" : undefined}
                data-active={isCurrent || undefined}
                disabled={!isEnabled || busy}
                onClick={() => onSelect(step.id)}
              >
                <span className="step-icon" aria-hidden="true">
                  {isComplete ? <Check size={15} weight="bold" /> : <Circle size={12} weight={isCurrent ? "fill" : "regular"} />}
                </span>
                <span className="step-label" data-short={step.short}>{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
