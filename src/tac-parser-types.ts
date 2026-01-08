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

/** Placeholder with default value and editable regions */
export interface TokenPlaceholder {
  /** Default text value for the placeholder */
  value: string;
  /** Editable regions within the placeholder */
  editable?: EditableRegion[];
}

/** Token definition from grammar */
export interface TokenDefinition {
  pattern?: string;
  style?: string;
  description?: string;
  values?: string[];
  /** Name of validator to use for semantic validation (registered via editor.registerValidator) */
  validator?: string;
  /** If true, append this token to the previous token (without space) */
  appendToPrevious?: boolean;
  /** Placeholder with default value and editable regions - used when no specific suggestions */
  placeholder?: TokenPlaceholder;
}

/** Single editable region within a token */
export interface EditableRegion {
  /** Start position of editable region (0-based) */
  start: number;
  /** End position of editable region (exclusive) */
  end: number;
  /** JavaScript function (as string) that returns an array of default values dynamically */
  defaultsFunction?: string;
}


// ========== New Simplified Suggestion System ==========

/**
 * Base suggestion item - a simple value suggestion
 * Default type when no 'type' property is specified
 */
export interface SuggestionItemValue {
  /** The text to insert */
  text: string;
  /** Human-readable description */
  description?: string;
  /** Editable regions within the text */
  editable?: EditableRegion[];
  /** If true, insert a newline before this token (for multiline formats like VAA) */
  newLineBefore?: boolean;
  /** If true, this suggestion is specific to automatic weather stations (METAR/SPECI AUTO) */
  auto?: boolean;
}

/**
 * Skip suggestion - moves to next token without inserting text
 */
export interface SuggestionItemSkip {
  type: 'skip';
  /** Human-readable description explaining why to skip */
  description: string;
}

/**
 * Category suggestion - creates a submenu with children
 */
export interface SuggestionItemCategory {
  type: 'category';
  /** Category display name */
  text: string;
  /** Optional description */
  description?: string;
  /** Child suggestions */
  children: SuggestionItem[];
}

/**
 * SwitchGrammar suggestion - switches to a different grammar
 */
export interface SuggestionItemSwitchGrammar {
  type: 'switchGrammar';
  /** Display text for the option */
  text: string;
  /** Optional description */
  description?: string;
  /** Target grammar name to switch to */
  target: string;
}

/**
 * Union type for all suggestion item types
 */
export type SuggestionItem =
  | SuggestionItemValue
  | SuggestionItemSkip
  | SuggestionItemCategory
  | SuggestionItemSwitchGrammar;

/**
 * Type guards for SuggestionItem types
 */
export function isSuggestionItemSkip(item: SuggestionItem): item is SuggestionItemSkip {
  return 'type' in item && item.type === 'skip';
}

export function isSuggestionItemCategory(item: SuggestionItem): item is SuggestionItemCategory {
  return 'type' in item && item.type === 'category';
}

export function isSuggestionItemSwitchGrammar(item: SuggestionItem): item is SuggestionItemSwitchGrammar {
  return 'type' in item && item.type === 'switchGrammar';
}

export function isSuggestionItemValue(item: SuggestionItem): item is SuggestionItemValue {
  return !('type' in item) || (item as any).type === undefined;
}

/**
 * Suggestions structure in grammar
 * - items: maps tokenId to array of suggestion items
 * - after: maps tokenId to array of next tokenIds
 */
export interface GrammarSuggestions {
  /** Suggestion items by token ID */
  items?: Record<string, SuggestionItem[]>;
  /** Maps token ID to array of next token IDs */
  after?: Record<string, string[]>;
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
  /** Default/placeholder value with editable regions */
  placeholder?: TokenPlaceholder;
  /** Possible values (for dropdowns/suggestions) */
  suggestions?: SuggestionItem[];
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
  suggestions?: GrammarSuggestions;
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
  /** If false, this suggestion cannot be selected (used for messages like "Loading..." or "Timeout") */
  selectable?: boolean;
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
  /** Text typed by the user for the current token (from last space to cursor) */
  search: string;
  /** Full TAC message content in the editor */
  tac: string;
  /** Cursor position in the text */
  cursorPosition: number;
  /** Current grammar name (display name) */
  grammarName: string | null;
  /** Grammar TAC code (e.g., 'sa', 'ft', 'ws') */
  grammarCode: string | null;
  /** Grammar standard (e.g., 'oaci', 'noaa') */
  grammarStandard: string | null;
  /** Grammar language (e.g., 'en', 'fr') */
  grammarLang: string | null;
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
  /**
   * If true, shows an overlay with "Waiting for user input..." message while waiting
   * for user interaction (e.g., modal dialog, map selection, form input).
   * If false (default), popup opens immediately with loading spinner while waiting.
   */
  userInteraction?: boolean;
  /**
   * Timeout in milliseconds for provider response.
   * If exceeded, a timeout message is shown in the popup.
   * Default: 500ms
   */
  timeout?: number;
  /**
   * Custom label to display as the category title instead of grammar description.
   * If empty or not provided, uses the grammar token description.
   */
  label?: string;
  /**
   * If true, caches provider results after first load.
   * Subsequent clicks on the same category will use cached data.
   * If false (default), provider is called every time the category is opened.
   */
  cache?: boolean;
  /**
   * If true, shows provider suggestions in a category submenu.
   * If false (default), shows provider suggestions flat (directly in popup).
   */
  category?: boolean;
}
