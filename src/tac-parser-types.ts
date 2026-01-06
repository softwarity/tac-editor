/**
 * TAC Parser - Type Definitions
 * All interfaces and types used by the parser engine
 */

// ========== Message Type Configuration ==========

/** Message type configuration for suggestions */
export interface MessageTypeConfig {
  tacCode: string;
  name: string;
  grammar: string;
  description: string;
  hasSubMenu?: boolean; // True for types that show grammar suggestions (SIGMET, AIRMET)
}

// ========== Token Definitions ==========

/** Token definition from grammar */
export interface TokenDefinition {
  pattern?: string;
  style?: string;
  description?: string;
  values?: string[];
}

/** Single editable region within a token */
export interface EditableRegion {
  /** Start position of editable region (0-based) */
  start: number;
  /** End position of editable region (exclusive) */
  end: number;
  /** Validation pattern for the editable content */
  pattern?: string;
  /** Description of expected content */
  description?: string;
  /** JavaScript function (as string) that returns an array of default values dynamically */
  defaultsFunction?: string;
}

/** @deprecated Use EditableRegion[] instead */
export type EditableDefinition = EditableRegion;

// ========== Suggestion Definitions ==========

/** Grammar suggestion declaration */
export interface SuggestionDeclaration {
  /** Unique identifier for this suggestion */
  id: string;
  /** Reference to token definition (for style lookup) */
  ref: string;
  /** Fixed text to insert */
  text?: string;
  /** Regex pattern for validation */
  pattern?: string;
  /** Human-readable description */
  description?: string;
  /** Display text (for pattern-based suggestions) */
  placeholder?: string;
  /** Category name (makes this a category with children) */
  category?: string;
  /** Child suggestion IDs (for categories) */
  children?: string[];
  /** Editable regions - Tab navigates between regions, each region can be edited independently */
  editable?: EditableRegion[];
  /** If true, append this text to the previous token (without space) */
  appendToPrevious?: boolean;
  /** If true, skip this item and just move to next token (no text inserted) */
  skipToNext?: boolean;
  /** If true, insert a newline before this token (for multiline formats like VAA) */
  newLineBefore?: boolean;
  /** Grammar to switch to when this suggestion is selected (e.g., "ws" for SIGMET weather) */
  switchGrammar?: string;
  /** External provider type to request data from (e.g., "sequence-number", "geometry-polygon") */
  provider?: string;
  /** Prefix to prepend to provider suggestions (e.g., "MT " for volcano names) */
  prefix?: string;
  /** Suffix to append to provider suggestions (e.g., "-" for MWO, " SIGMET" for FIR) */
  suffix?: string;
  /** If true, this suggestion is specific to automatic weather stations (METAR/SPECI AUTO) */
  auto?: boolean;
}

/** @deprecated Use SuggestionDeclaration instead - kept for backward compatibility */
export interface SuggestionDefinition {
  text?: string;
  pattern?: string;
  description?: string;
  type?: string;
  placeholder?: string;
  editable?: EditableRegion[];
  appendToPrevious?: boolean;
  skipToNext?: boolean;
  newLineBefore?: boolean;
  category?: string;
  children?: SuggestionDefinition[];
}

// ========== Template Definitions ==========

/** Template field definition for structured messages like VAA/TCA */
export interface TemplateField {
  /** Field label (e.g., "DTG:", "VAAC:") */
  label: string;
  /** Token type for the label */
  labelType: string;
  /** Token type for the value */
  valueType: string;
  /** Whether this field is required */
  required?: boolean;
  /** Whether this field can have multiple lines of values */
  multiline?: boolean;
  /** Default/placeholder value */
  placeholder?: string;
  /** Editable region definition */
  editable?: EditableDefinition;
  /** Possible values (for dropdowns/suggestions) */
  suggestions?: SuggestionDefinition[];
  /** Minimum column width for the label (for alignment) */
  labelWidth?: number;
}

/** Template definition for structured message formats */
export interface TemplateDefinition {
  /** Template fields in order */
  fields: TemplateField[];
  /** Label column width (characters) for alignment */
  labelColumnWidth?: number;
}

// ========== Structure Definitions ==========

/** Base structure item */
export interface StructureItem {
  /** Token ID (references tokens definition) or group name */
  id: string;
  /** Cardinality [min, max] where max can be null for unlimited */
  cardinality: [number, number | null];
}

/** Single token reference */
export interface StructureToken extends StructureItem {
  /** If true, parsing stops here */
  terminal?: boolean;
}

/** OneOf choice - one of the tokens must match */
export interface StructureOneOf extends StructureItem {
  /** Array of alternative structures */
  oneOf: StructureNode[];
}

/** Sequence - tokens must appear in order */
export interface StructureSequence extends StructureItem {
  /** Array of structures in sequence */
  sequence: StructureNode[];
}

/** Union type for all structure nodes */
export type StructureNode = StructureToken | StructureOneOf | StructureSequence;

/** Type guard for StructureOneOf */
export function isStructureOneOf(node: StructureNode): node is StructureOneOf {
  return 'oneOf' in node;
}

/** Type guard for StructureSequence */
export function isStructureSequence(node: StructureNode): node is StructureSequence {
  return 'sequence' in node;
}

/** Type guard for StructureToken */
export function isStructureToken(node: StructureNode): node is StructureToken {
  return !('oneOf' in node) && !('sequence' in node);
}

// ========== Grammar Definition ==========

/** Grammar definition */
export interface Grammar {
  name?: string;
  version?: string;
  description?: string;
  identifier?: string;
  /**
   * Parent grammar name to inherit from.
   * When set, this grammar inherits all tokens, structure, and suggestions from the parent.
   * Local definitions override parent definitions (deep merge for objects, replace for arrays).
   */
  extends?: string;
  /**
   * Category for grouped grammars (e.g., "WS", "WV", "WC" for SIGMET variants).
   * Used by the editor to group related grammars in the suggestion submenu.
   */
  category?: string;
  /** If true, use template mode instead of normal grammar mode */
  templateMode?: boolean;
  /** Template definition for structured formats (VAA, TCA) */
  template?: TemplateDefinition;
  /** Token pattern definitions */
  tokens?: Record<string, TokenDefinition>;
  /** Grammar structure (sequence of tokens, oneOf, nested sequences) */
  structure?: StructureNode[];
  /** Suggestions for autocompletion */
  suggestions?: {
    /** Suggestion declarations (new format) */
    declarations?: SuggestionDeclaration[];
    /** Mapping of token IDs to suggestion IDs */
    after?: Record<string, string[] | SuggestionDefinition[]>;
  };
}

// ========== Token & Validation ==========

/** Parsed token */
export interface Token {
  text: string;
  type: string;
  style?: string;
  start: number;
  end: number;
  error?: string;
  description?: string;
}

/** Token match result (internal) */
export interface TokenMatchResult {
  type: string;
  style?: string;
  description?: string;
  error?: string;
}

/** Suggestion item */
export interface Suggestion {
  text: string;
  description: string;
  /** Token type reference (e.g., "cloudAmount", "cloud") for grammar after lookups */
  ref?: string;
  placeholder?: string;
  /** TAC code for loading specific grammar variant (e.g., 'FT' for TAF Long, 'FC' for TAF Short) */
  tacCode?: string;
  /** If true, this is a category that opens a submenu */
  isCategory?: boolean;
  /** Sub-suggestions for categories */
  children?: Suggestion[];
  /** Editable regions - when present, these parts of the token can be edited after insertion (Tab to navigate between regions) */
  editable?: EditableRegion[];
  /** If true, append this text to the previous token (without space) */
  appendToPrevious?: boolean;
  /** If true, skip this item and just move to next token (no text inserted) */
  skipToNext?: boolean;
  /** If true, insert a newline before this token (for multiline formats like VAA) */
  newLineBefore?: boolean;
  /** Grammar to switch to when this suggestion is selected (e.g., "ws" for SIGMET weather) */
  switchGrammar?: string;
  /** External provider type to request data from (e.g., "sequence-number", "geometry-polygon") */
  provider?: string;
  /** If true, this suggestion is specific to automatic weather stations (METAR/SPECI AUTO) */
  auto?: boolean;
}

/** Validation error */
export interface ValidationError {
  message: string;
  position: number;
  token: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ========== Provider System ==========

/** Context passed to suggestion providers */
export interface SuggestionProviderContext {
  /** The token type triggering the suggestion */
  tokenType: string;
  /** Current text in the editor */
  currentText: string;
  /** Cursor position */
  cursorPosition: number;
  /** Current grammar name */
  grammarName: string | null;
  /** Previous token text (if any) */
  prevTokenText?: string;
}

/** Suggestion from a provider (same structure as internal Suggestion) */
export interface ProviderSuggestion {
  text: string;
  description?: string;
  type?: string;
  placeholder?: string;
  editable?: EditableRegion[];
  appendToPrevious?: boolean;
  skipToNext?: boolean;
  newLineBefore?: boolean;
  /** Sub-suggestions for categories */
  children?: ProviderSuggestion[];
  /** If true, this is a category that opens a submenu */
  isCategory?: boolean;
}

/** Provider function result type */
export type SuggestionProviderResult = ProviderSuggestion[] | null | undefined;

/** Provider function signature - can be sync or async */
export type SuggestionProviderFunction = (context: SuggestionProviderContext) => SuggestionProviderResult | Promise<SuggestionProviderResult>;

/** Provider registration options */
export interface SuggestionProviderOptions {
  /** The provider function (sync or async) */
  provider: SuggestionProviderFunction;
  /**
   * If true (default), provider suggestions replace grammar suggestions entirely.
   * If false, provider suggestions are added after placeholder and before grammar suggestions.
   */
  replace?: boolean;
}
