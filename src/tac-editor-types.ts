/**
 * @softwarity/tac-editor - Types and Constants
 * Shared types, interfaces, and configuration constants
 */

import { Token, ValidationError } from './tac-parser.js';

// ========== Editor State ==========

/** Editor state */
export type EditorState = 'editing' | 'waiting';

// ========== Provider Types ==========

/** Context passed to providers */
export interface ProviderContext {
  /** Full text content of the editor */
  text: string;
  /** Parsed tokens */
  tokens: Token[];
  /** Current grammar name (e.g., 'ws', 'sigmet') */
  grammarName: string | null;
  /** Cursor position in text */
  cursorPosition: number;
  /** Current line number */
  cursorLine: number;
  /** Current column number */
  cursorColumn: number;
}

/** Request passed to provider function */
export interface ProviderRequest {
  /** Provider type (e.g., 'sequence-number', 'geometry-polygon') */
  type: string;
  /** Context with editor state */
  context: ProviderContext;
  /** AbortSignal for cancellation (ESC key, timeout, etc.) */
  signal: AbortSignal;
}

/** Provider function type */
export type Provider = (request: ProviderRequest) => Promise<string>;

// ========== Cursor & Selection ==========

/** Cursor position in the editor */
export interface CursorPosition {
  line: number;
  column: number;
}

/** Token with position info for rendering */
export interface LineToken extends Token {
  column: number;
  length: number;
}

// ========== Event Details ==========

/** Change event detail */
export interface ChangeEventDetail {
  value: string;
  type: string | null;
  tokens: Token[];
  valid: boolean;
}

/** Error event detail */
export interface ErrorEventDetail {
  errors: ValidationError[];
}

// ========== TAC Code Configuration ==========

/** Message type configuration */
export interface MessageTypeConfig {
  /** Regex pattern to match TAC codes (e.g., 'SA' or 'W[SCV]') */
  pattern: string;
  /** Display name of the message type */
  name: string;
  /** Grammar file base name (without locale suffix) */
  grammar: string;
  /** Description of the message type */
  description: string;
  /** If true, identifier is second word (after FIR code) - don't insert text on selection */
  secondWordIdentifier?: boolean;
}

/** Message type configurations with regex patterns */
export const MESSAGE_TYPES: MessageTypeConfig[] = [
  // Routine OPMET data
  {
    pattern: 'SA',
    name: 'METAR',
    grammar: 'sa',
    description: 'Aerodrome routine meteorological report'
  },
  {
    pattern: 'SP',
    name: 'SPECI',
    grammar: 'sp',
    description: 'Aerodrome special meteorological report'
  },
  // TAF: F[TC] matches FT, FC - subtypes (short/long) handled by grammar via switchGrammar
  {
    pattern: 'F[TC]',
    name: 'TAF',
    grammar: 'taf',
    description: 'Terminal aerodrome forecast'
  },
  // Non-routine OPMET data
  // SIGMET: W[SCV] matches WS, WC, WV - subtypes handled by grammar via switchGrammar
  {
    pattern: 'W[SCV]',
    name: 'SIGMET',
    grammar: 'sigmet',
    description: 'Significant meteorological information',
    secondWordIdentifier: true
  },
  {
    pattern: 'WA',
    name: 'AIRMET',
    grammar: 'wa',
    description: 'Airmen\'s meteorological information',
    secondWordIdentifier: true
  },
  {
    pattern: 'FV',
    name: 'VAA',
    grammar: 'fv',
    description: 'Volcanic ash advisory'
  },
  {
    pattern: 'FK',
    name: 'TCA',
    grammar: 'fk',
    description: 'Tropical cyclone advisory'
  },
  {
    pattern: 'FN',
    name: 'SWXA',
    grammar: 'fn',
    description: 'Space weather advisory'
  }
];

/** Default TAC codes if none specified */
export const DEFAULT_TAC_CODES = ['SA', 'SP', 'FT', 'FC', 'WS', 'WA', 'FV', 'FK'];

/** Multi-token identifiers that start with a given first word */
export const MULTI_TOKEN_IDENTIFIERS: Record<string, string[]> = {
  'VA': ['VA ADVISORY'],
  'TC': ['TC ADVISORY']
};

/** Map TAC identifier to TAC code(s) - for detecting message type from content */
export const IDENTIFIER_TO_TAC_CODES: Record<string, string[]> = {
  'METAR': ['SA'],
  'SPECI': ['SP'],
  'TAF': ['FT', 'FC'],  // Disambiguated by switchGrammar at validity period
  'SIGMET': ['WS', 'WC', 'WV'],  // Will be disambiguated by category
  'AIRMET': ['WA'],
  'VA ADVISORY': ['FV'],
  'TC ADVISORY': ['FK'],
  'SWXA': ['FN']
};

// ========== Template Normalization Configuration ==========

/** Maximum label column width for template normalization (TCA uses 28, VAA uses 22) */
export const TEMPLATE_LABEL_COLUMN_WIDTH = 28;

/** Label mapping for template text normalization */
export interface LabelMapping {
  /** Regex pattern to match the label (case-insensitive) */
  pattern: RegExp;
  /** Standard label to use */
  label: string;
  /** Optional value transformation function */
  transformValue?: (value: string) => string;
}

/** Template normalization configuration */
export interface TemplateNormConfig {
  /** Message identifier (e.g., 'VA ADVISORY') */
  identifier: string;
  /** Label mappings for normalization */
  labelMappings: LabelMapping[];
}

/** Transform SUMMIT ELEV value: convert "FT (M)" format to just "M" */
function transformSummitElev(value: string): string {
  const elevMatch = value.match(/\d+\s*FT\s*\((\d+)\s*M\)/i);
  return elevMatch ? elevMatch[1] + 'M' : value;
}

/** Template normalization configurations for each template message type */
export const TEMPLATE_NORM_CONFIGS: TemplateNormConfig[] = [
  // VAA (Volcanic Ash Advisory)
  {
    identifier: 'VA ADVISORY',
    labelMappings: [
      { pattern: /^DTG:/i, label: 'DTG:' },
      { pattern: /^VAAC:/i, label: 'VAAC:' },
      { pattern: /^VOLCANO:/i, label: 'VOLCANO:' },
      { pattern: /^PSN:/i, label: 'PSN:' },
      { pattern: /^AREA:/i, label: 'AREA:' },
      { pattern: /^SUMMIT ELEV:/i, label: 'SUMMIT ELEV:', transformValue: transformSummitElev },
      { pattern: /^ADVISORY NR:/i, label: 'ADVISORY NR:' },
      { pattern: /^INFO SOURCE:/i, label: 'INFO SOURCE:' },
      { pattern: /^AVIATION COLOU?R CODE:/i, label: 'AVIATION COLOUR CODE:' },
      { pattern: /^ERUPTION DETAILS:/i, label: 'ERUPTION DETAILS:' },
      { pattern: /^OBS VA DTG:/i, label: 'OBS VA DTG:' },
      { pattern: /^OBS VA CLD:/i, label: 'OBS VA CLD:' },
      { pattern: /^FCST VA CLD \+6\s*HR:/i, label: 'FCST VA CLD +6 HR:' },
      { pattern: /^FCST VA CLD \+12\s*HR:/i, label: 'FCST VA CLD +12 HR:' },
      { pattern: /^FCST VA CLD \+18\s*HR:/i, label: 'FCST VA CLD +18 HR:' },
      { pattern: /^RMK:/i, label: 'RMK:' },
      { pattern: /^NXT ADVISORY:/i, label: 'NXT ADVISORY:' },
    ]
  },
  // TCA (Tropical Cyclone Advisory)
  {
    identifier: 'TC ADVISORY',
    labelMappings: [
      { pattern: /^DTG:/i, label: 'DTG:' },
      { pattern: /^TCAC:/i, label: 'TCAC:' },
      { pattern: /^TC:/i, label: 'TC:' },
      { pattern: /^ADVISORY NR:/i, label: 'ADVISORY NR:' },
      { pattern: /^OBS PSN:/i, label: 'OBS PSN:' },
      { pattern: /^CB:/i, label: 'CB:' },
      { pattern: /^MOV:/i, label: 'MOV:' },
      { pattern: /^INTST CHANGE:/i, label: 'INTST CHANGE:' },
      { pattern: /^C:/i, label: 'C:' },
      { pattern: /^MAX WIND:/i, label: 'MAX WIND:' },
      { pattern: /^FCST PSN \+6\s*HR:/i, label: 'FCST PSN +6 HR:' },
      { pattern: /^FCST MAX WIND \+6\s*HR:/i, label: 'FCST MAX WIND +6 HR:' },
      { pattern: /^FCST PSN \+12\s*HR:/i, label: 'FCST PSN +12 HR:' },
      { pattern: /^FCST MAX WIND \+12\s*HR:/i, label: 'FCST MAX WIND +12 HR:' },
      { pattern: /^FCST PSN \+18\s*HR:/i, label: 'FCST PSN +18 HR:' },
      { pattern: /^FCST MAX WIND \+18\s*HR:/i, label: 'FCST MAX WIND +18 HR:' },
      { pattern: /^FCST PSN \+24\s*HR:/i, label: 'FCST PSN +24 HR:' },
      { pattern: /^FCST MAX WIND \+24\s*HR:/i, label: 'FCST MAX WIND +24 HR:' },
      { pattern: /^RMK:/i, label: 'RMK:' },
      { pattern: /^NXT MSG:/i, label: 'NXT MSG:' },
    ]
  }
];

/** Find template normalization config by checking if text starts with a known identifier */
export function findTemplateNormConfig(text: string): TemplateNormConfig | undefined {
  const trimmedText = text.trim();
  return TEMPLATE_NORM_CONFIGS.find(config => trimmedText.startsWith(config.identifier));
}

// ========== Utility Functions ==========

/** Find message type config by TAC code */
export function findMessageType(tacCode: string): MessageTypeConfig | undefined {
  return MESSAGE_TYPES.find(mt => new RegExp(`^${mt.pattern}$`).test(tacCode));
}

/** Extract a valid tacCode from a pattern (e.g., 'W[SCV]' -> 'WS') */
export function patternToTacCode(pattern: string): string {
  // If pattern has character class like [SCV], take first option
  const match = pattern.match(/^([^[]*)\[([^\]]+)\](.*)$/);
  if (match) {
    return match[1] + match[2][0] + match[3];
  }
  return pattern;
}

// ========== Validator Types ==========

/** Context passed to validators */
export interface ValidatorContext {
  /** The token value to validate */
  tokenValue: string;
  /** The token type (e.g., 'datetime', 'icao') */
  tokenType: string;
  /** The full message text */
  fullText: string;
  /** Position of the token in the message */
  position: number;
  /** Current grammar name (display name) */
  grammarName: string | null;
  /** Grammar TAC code (e.g., 'sa', 'ft', 'ws') */
  grammarCode: string | null;
  /** Grammar standard (e.g., 'oaci', 'noaa') */
  grammarStandard: string | null;
  /** Grammar language (e.g., 'en', 'fr') */
  grammarLang: string | null;
}

/**
 * Validator callback function
 * @returns undefined if valid, error message string if invalid
 */
export type ValidatorCallback = (context: ValidatorContext) => string | undefined;

/** Validator registration options */
export interface ValidatorOptions {
  /** Optional description of what this validator checks */
  description?: string;
}

/**
 * Match a validator pattern against a context
 * Pattern format: codetac.standard.lang.tokenType
 * Wildcards: * matches any single segment
 *
 * @example
 * matchValidatorPattern('sa.*.*.datetime', 'sa', 'oaci', 'en', 'datetime') // true
 * matchValidatorPattern('*.oaci.*.wind', 'ft', 'oaci', 'fr', 'wind') // true
 * matchValidatorPattern('sa.oaci.en.datetime', 'sa', 'oaci', 'en', 'datetime') // true
 */
export function matchValidatorPattern(
  pattern: string,
  grammarCode: string | null,
  grammarStandard: string | null,
  grammarLang: string | null,
  tokenType: string
): boolean {
  const parts = pattern.split('.');

  // Support both old format (just tokenType like 'DDHHmmZ') and new pattern format
  if (parts.length === 1) {
    // Old format: exact token type or validator name match
    // This is handled separately via grammar's validator property
    return false;
  }

  if (parts.length !== 4) {
    return false;
  }

  const [patternCode, patternStandard, patternLang, patternToken] = parts;

  // Match each segment (* is wildcard)
  const matchSegment = (pattern: string, value: string | null): boolean => {
    if (pattern === '*') return true;
    return pattern === value;
  };

  return (
    matchSegment(patternCode, grammarCode) &&
    matchSegment(patternStandard, grammarStandard) &&
    matchSegment(patternLang, grammarLang) &&
    matchSegment(patternToken, tokenType)
  );
}
