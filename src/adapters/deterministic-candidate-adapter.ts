import { createPendingCandidate } from "../domain/candidates";
import {
  codePointLength,
  createSourceSpan,
  sha256Utf8,
  utf16IndexToCodePointIndex,
} from "../domain/provenance";
import type {
  CandidateCategory,
  CandidateSupportStatus,
  PendingCandidate,
  TextSourceRevision,
} from "../domain/types";
import type {
  CandidateAdapter,
  CandidateAdapterResult,
} from "../ports/candidate-adapter";

export interface DeterministicCandidateRule {
  id: string;
  version: string;
  category: CandidateCategory;
  pattern: RegExp;
  supportStatus: Exclude<CandidateSupportStatus, "unsupported">;
  reasonCode: string;
}

export const DEFAULT_DETERMINISTIC_RULES: readonly DeterministicCandidateRule[] = [
  {
    id: "fuzzy-year-zh",
    version: "1",
    category: "fuzzy_time",
    pattern: /(?:大约|约|差不多)\s*\d{4}\s*年?/gu,
    supportStatus: "exact",
    reasonCode: "explicit_approximate_year_phrase",
  },
  {
    id: "fuzzy-year-en",
    version: "1",
    category: "fuzzy_time",
    pattern: /\b(?:about|around|circa)\s+\d{4}\b/giu,
    supportStatus: "exact",
    reasonCode: "explicit_approximate_year_phrase",
  },
  {
    id: "family-role-zh",
    version: "1",
    category: "person",
    pattern:
      /(?:我的)?(?:妈妈|母亲|爸爸|父亲|爷爷|奶奶|外公|外婆|姑姑|叔叔|阿姨)/gu,
    supportStatus: "ambiguous",
    reasonCode: "family_role_not_unique_identity",
  },
  {
    id: "family-role-en",
    version: "1",
    category: "person",
    pattern:
      /\b(?:my\s+)?(?:mother|father|grandmother|grandfather|aunt|uncle)\b/giu,
    supportStatus: "ambiguous",
    reasonCode: "family_role_not_unique_identity",
  },
  {
    id: "bounded-place-zh",
    version: "1",
    category: "place",
    pattern: /(?:上海|北京|广州|成都|杭州|新加坡|老家|厨房|客厅)/gu,
    supportStatus: "ambiguous",
    reasonCode: "place_word_requires_narrator_confirmation",
  },
  {
    id: "bounded-place-en",
    version: "1",
    category: "place",
    pattern:
      /\b(?:Singapore|Shanghai|Beijing|kitchen|living room|family home)\b/giu,
    supportStatus: "ambiguous",
    reasonCode: "place_word_requires_narrator_confirmation",
  },
  {
    id: "bounded-event-zh",
    version: "1",
    category: "event",
    pattern: /(?:搬家|清屋|结婚|毕业|离家|过年)/gu,
    supportStatus: "ambiguous",
    reasonCode: "event_word_requires_narrator_confirmation",
  },
  {
    id: "bounded-event-en",
    version: "1",
    category: "event",
    pattern:
      /\b(?:moving day|move|house clearing|wedding|graduation)\b/giu,
    supportStatus: "ambiguous",
    reasonCode: "event_word_requires_narrator_confirmation",
  },
  {
    id: "why-testimony-zh",
    version: "1",
    category: "why_it_matters",
    pattern: /因为[^。！？!?\n]{2,80}/gu,
    supportStatus: "ambiguous",
    reasonCode: "because_clause_is_narrator_testimony",
  },
  {
    id: "why-testimony-en",
    version: "1",
    category: "why_it_matters",
    pattern: /\bbecause\s+[^.!?\n]{2,80}/giu,
    supportStatus: "ambiguous",
    reasonCode: "because_clause_is_narrator_testimony",
  },
] as const;

function cloneGlobalPattern(pattern: RegExp): RegExp {
  const flags = Array.from(new Set(`${pattern.flags}gu`.split(""))).join("");
  return new RegExp(pattern.source, flags);
}

function candidateId(
  source: TextSourceRevision,
  rule: DeterministicCandidateRule,
  start: number,
  end: number,
): string {
  return `${source.id}:${rule.id}:${start}:${end}`;
}

export class DeterministicCandidateAdapter implements CandidateAdapter {
  readonly id = "deterministic-exact-rules";
  readonly version = "1";

  constructor(
    private readonly rules: readonly DeterministicCandidateRule[] =
      DEFAULT_DETERMINISTIC_RULES,
  ) {}

  async analyze(source: TextSourceRevision): Promise<CandidateAdapterResult> {
    const currentHash = await sha256Utf8(source.text);
    if (
      currentHash !== source.sha256 ||
      codePointLength(source.text) !== source.codePointLength
    ) {
      return {
        status: "unsupported",
        candidates: [],
        reasonCode: "source_integrity_failed",
      };
    }

    const candidates: PendingCandidate[] = [];
    const seen = new Set<string>();

    for (const rule of this.rules) {
      const pattern = cloneGlobalPattern(rule.pattern);
      for (const match of source.text.matchAll(pattern)) {
        if (match.index === undefined || !match[0]) continue;
        const start = utf16IndexToCodePointIndex(source.text, match.index);
        const end = start + codePointLength(match[0]);
        const dedupeKey = `${rule.category}:${start}:${end}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const sourceSpan = createSourceSpan({ source, start, end });
        candidates.push(
          createPendingCandidate({
            id: candidateId(source, rule, start, end),
            category: rule.category,
            text: sourceSpan.exactExcerpt,
            sourceSpan,
            supportStatus: rule.supportStatus,
            candidateOrigin: "deterministic_rule",
            ruleId: rule.id,
            ruleVersion: rule.version,
            reasonCode: rule.reasonCode,
          }),
        );
      }
    }

    if (candidates.length === 0) {
      return {
        status: "unsupported",
        candidates: [],
        reasonCode: "deterministic_no_rule_match_use_manual_span",
      };
    }

    return { status: "ready", candidates };
  }
}
