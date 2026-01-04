/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */
/** Message type configuration for suggestions */
export interface MessageTypeConfig {
    tacCode: string;
    name: string;
    grammar: string;
    description: string;
    hasSubMenu?: boolean;
}
/** Token definition from grammar */
export interface TokenDefinition {
    pattern?: string;
    style?: string;
    description?: string;
    values?: string[];
}
/** Editable region definition for suggestions */
export interface EditableDefinition {
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
    /** Editable region - when present, this part of the token will be selected after insertion */
    editable?: EditableDefinition;
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
}
/** @deprecated Use SuggestionDeclaration instead - kept for backward compatibility */
export interface SuggestionDefinition {
    text?: string;
    pattern?: string;
    description?: string;
    type?: string;
    placeholder?: string;
    editable?: EditableDefinition;
    appendToPrevious?: boolean;
    skipToNext?: boolean;
    newLineBefore?: boolean;
    category?: string;
    children?: SuggestionDefinition[];
}
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
export declare function isStructureOneOf(node: StructureNode): node is StructureOneOf;
/** Type guard for StructureSequence */
export declare function isStructureSequence(node: StructureNode): node is StructureSequence;
/** Type guard for StructureToken */
export declare function isStructureToken(node: StructureNode): node is StructureToken;
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
/** Suggestion item */
export interface Suggestion {
    text: string;
    description: string;
    type: string;
    placeholder?: string;
    /** TAC code for loading specific grammar variant (e.g., 'FT' for TAF Long, 'FC' for TAF Short) */
    tacCode?: string;
    /** If true, this is a category that opens a submenu */
    isCategory?: boolean;
    /** Sub-suggestions for categories */
    children?: Suggestion[];
    /** Editable region - when present, this part of the token will be selected after insertion */
    editable?: EditableDefinition;
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
    editable?: EditableDefinition;
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
/**
 * Tracks position in grammar structure tree during parsing.
 * Handles sequences, oneOf alternatives, and cardinality constraints.
 */
export declare class StructureTracker {
    private structure;
    private tokens;
    private matchCounts;
    private currentIndex;
    private oneOfChoices;
    constructor(structure: StructureNode[], tokens: Record<string, TokenDefinition>);
    /**
     * Reset tracker to initial state
     */
    reset(): void;
    /**
     * Get all token IDs that could match at current position.
     * This considers:
     * - Current position in sequence
     * - Optional elements (can be skipped)
     * - OneOf alternatives (all options valid until one matches)
     * - Cardinality (repeatable elements)
     */
    getExpectedTokenIds(): string[];
    /**
     * Try to match a token ID at current position.
     * Returns true if matched and position was advanced.
     */
    tryMatch(tokenId: string): boolean;
    /**
     * Collect expected tokens starting from a position in a sequence
     */
    private _collectExpectedTokens;
    /**
     * Collect token IDs from a single node (handles oneOf, sequence, or token)
     */
    private _collectTokensFromNode;
    /**
     * Try to match a token at a level, advancing position if successful
     */
    private _tryMatchAtLevel;
    /**
     * Try to match a token against a specific node
     */
    private _tryMatchNode;
    /**
     * Get current position info for debugging
     */
    getDebugInfo(): {
        currentIndex: number;
        matchCounts: Record<string, number>;
    };
}
/**
 * TAC Parser class
 * Grammar-based parser for TAC messages
 */
export declare class TacParser {
    grammars: Map<string, Grammar>;
    currentGrammar: Grammar | null;
    /** Name of the current grammar (key in grammars map) */
    currentGrammarName: string | null;
    /** Raw (unresolved) grammars before inheritance resolution */
    private _rawGrammars;
    /** Registered suggestion providers by token type */
    private _suggestionProviders;
    /** Current editor text (set by editor for provider context) */
    private _currentText;
    /** Current cursor position (set by editor for provider context) */
    private _cursorPosition;
    /**
     * Register a grammar
     * If the grammar has an 'extends' property, inheritance is resolved after all grammars are registered.
     * Call resolveInheritance() after registering all grammars to apply inheritance.
     */
    registerGrammar(name: string, grammar: Grammar): void;
    /**
     * Resolve inheritance for all registered grammars.
     * Must be called after all grammars are registered if any use 'extends'.
     */
    resolveInheritance(): void;
    /**
     * Register a suggestion provider for a specific token type
     * @param tokenType - The token type to provide suggestions for (e.g., 'firId', 'sequenceNumber')
     * @param options - Provider options including the provider function and mode
     */
    registerSuggestionProvider(tokenType: string, options: SuggestionProviderOptions): void;
    /**
     * Unregister a suggestion provider
     * @param tokenType - The token type to unregister
     */
    unregisterSuggestionProvider(tokenType: string): void;
    /**
     * Check if a provider is registered for a token type
     * @param tokenType - The token type to check
     */
    hasProvider(tokenType: string): boolean;
    /**
     * Get all registered provider token types
     */
    getRegisteredProviders(): string[];
    /**
     * Update the context for providers (called by editor before getting suggestions)
     * @param text - Current editor text
     * @param cursorPosition - Current cursor position
     */
    updateProviderContext(text: string, cursorPosition: number): void;
    /**
     * Convert provider suggestions to internal Suggestion format
     * @param providerSuggestions - Suggestions from provider
     * @param prefix - Optional prefix to prepend to each suggestion text
     * @param suffix - Optional suffix to append to each suggestion text
     */
    private _convertProviderSuggestions;
    /**
     * Get suggestions from provider if registered (async)
     * @param tokenType - The token type (provider ID)
     * @param prevTokenText - Previous token text
     * @param prefix - Optional prefix to prepend to suggestions (from declaration)
     * @param suffix - Optional suffix to append to suggestions (from declaration)
     * @returns Promise of provider suggestions or null if no provider
     */
    private _getProviderSuggestionsAsync;
    /**
     * Resolve grammar inheritance recursively
     * @param grammar - The grammar to resolve
     * @param visited - Set of already visited grammar names (to detect cycles)
     */
    private _resolveGrammarInheritance;
    /**
     * Deep merge two grammars (parent and child)
     * Child properties override parent properties
     */
    private _mergeGrammars;
    /**
     * Merge suggestion definitions
     */
    private _mergeSuggestions;
    /**
     * Get registered grammar names
     */
    getGrammarNames(): string[];
    /**
     * Detect message type from text and load appropriate grammar
     */
    detectMessageType(text: string): string | null;
    /**
     * Tokenize text using current grammar
     */
    tokenize(text: string): Token[];
    /**
     * Tokenize without grammar (raw tokens)
     */
    private _tokenizeRaw;
    /**
     * Tokenize with grammar rules
     */
    private _tokenizeWithGrammar;
    /**
     * Tokenize normal mode messages (METAR, SPECI, TAF, SIGMET, AIRMET)
     * Handles both single-word and multi-word tokens with structure-aware matching
     */
    private _tokenizeNormal;
    /**
     * Match token using StructureTracker for context-aware matching
     */
    private _matchTokenWithTracker;
    /**
     * Flatten grammar structure into a linear sequence of expected token IDs
     * This handles nested sequences and oneOf choices
     */
    private _flattenStructure;
    /**
     * Structure-aware token matching: tries expected token first, then falls back to pattern matching
     */
    private _matchTokenStructureAware;
    /**
     * Tokenize template-based messages (VAA, TCA, SWX)
     * These messages have fixed labels and editable values
     * Parses line-by-line and matches labels from the template definition
     */
    private _tokenizeTemplate;
    /**
     * Tokenize a value part of a template field
     */
    private _tokenizeValue;
    /**
     * Tokenize value words individually
     */
    private _tokenizeValueWords;
    /**
     * Match a token against grammar definitions
     */
    private _matchToken;
    /**
     * Get suggestions based on current position
     * @param text - The current text
     * @param cursorPosition - The cursor position
     * @param supportedTypes - Optional list of supported message types for initial suggestions
     * @deprecated Use getSuggestionsForTokenType with cached tokens instead
     */
    getSuggestions(text: string, cursorPosition: number, supportedTypes?: string[]): Promise<Suggestion[]>;
    /**
     * Get suggestions for a specific token type (async to support async providers)
     * @param tokenType - The type of token to get suggestions for (from suggestions.after)
     * @param prevTokenText - Optional text of the previous token (for CB/TCU filtering)
     * @param supportedTypes - Optional list of supported message types for initial suggestions (MessageTypeConfig[] or string[])
     */
    getSuggestionsForTokenType(tokenType: string | null, prevTokenText?: string, supportedTypes?: MessageTypeConfig[] | string[]): Promise<Suggestion[]>;
    /**
     * Get style from token definition by ref
     */
    private _getStyleFromRef;
    /**
     * Get declaration by ID
     */
    private _getDeclarationById;
    /**
     * Build Suggestion objects from declaration IDs (new format)
     */
    private _buildSuggestionsFromDeclarations;
    /**
     * Sort suggestions to put generic/editable entries first
     * This allows manual input to be the first option, with specific values as alternatives
     */
    private _sortSuggestions;
    /**
     * Build Suggestion objects from SuggestionDefinition array (legacy format)
     * @deprecated Use declarations format instead
     */
    private _buildSuggestionsLegacy;
    /**
     * Map type names to TAC identifiers
     * Handles various input formats: TAC codes, display names, etc.
     */
    private _typeToIdentifier;
    /** Message types that start with FIR code instead of the identifier */
    private static readonly SECOND_WORD_IDENTIFIER_TYPES;
    /**
     * Find child grammars that extend a parent grammar
     * @param parentName - Name of the parent grammar
     * @returns Map of category to grammars
     */
    private _findChildGrammars;
    /**
     * Build category submenu for SIGMET/AIRMET with optional sub-categories (WS/WV/WC)
     * @param upperType - The message type (SIGMET or AIRMET)
     * @param grammarName - The grammar name (sigmet or airmet)
     */
    private _buildSecondWordTypeSubmenu;
    /**
     * Build a category with FIR suggestions for a single SIGMET/AIRMET config
     * The category is shown directly in the main menu (SIGMET, SIGMET TC, SIGMET VA, AIRMET)
     */
    private _buildFirSubmenuForConfig;
    /**
     * Get initial suggestions (message type names + FIR codes for SIGMET/AIRMET)
     * @param supportedTypes - Optional list of supported types (MessageTypeConfig[] or string[])
     */
    private _getInitialSuggestions;
    /**
     * Get description for a message type
     */
    private _getTypeDescription;
    /**
     * Get contextual suggestions based on grammar state
     * @deprecated Use getSuggestionsForTokenType with cached tokens instead
     */
    private _getContextualSuggestions;
    /**
     * Get suggestions for a template field based on its label type
     * Used in template mode (VAA, TCA) to provide field-specific suggestions
     * @param labelType - The labelType from the template field definition
     */
    getTemplateSuggestions(labelType: string): Suggestion[];
    /**
     * Build template suggestions from declaration IDs (new format)
     */
    private _buildTemplateSuggestionsFromDeclarations;
    /**
     * Generate dynamic datetime text based on pattern and description
     */
    private _generateDynamicDateTimeText;
    /**
     * Build template suggestions from SuggestionDefinition array (legacy format)
     * @deprecated Use declarations format instead
     */
    private _buildTemplateSuggestionsLegacy;
    /**
     * Generate current datetime in METAR format (DDHHmmZ)
     * Rounded to nearest 30 minutes (00 or 30)
     */
    private _generateMetarDateTime;
    /**
     * Generate current datetime in VAA full format (YYYYMMDD/HHmmZ)
     */
    private _generateVaaDateTime;
    /**
     * Generate current datetime in VAA day/time format (DD/HHmmZ)
     * @param hoursOffset - Optional offset in hours (e.g., 6, 12, 18 for forecasts)
     */
    private _generateVaaDayTime;
    /**
     * Validate TAC message
     * Checks for:
     * 1. Token-level errors (unknown tokens)
     * 2. Required fields presence (identifier, icao, datetime, etc.)
     * 3. Basic structure validation
     */
    validate(text: string): ValidationResult;
    /**
     * Get list of required tokens from grammar
     */
    private _getRequiredTokens;
    /**
     * Validate METAR-specific structure
     */
    private _validateMetarStructure;
    /**
     * Validate TAF-specific structure
     */
    private _validateTafStructure;
    /**
     * Set the current grammar by name (for speculative grammar loading)
     * @param grammarName - The name of the grammar to set as current
     */
    setGrammar(grammarName: string): void;
    /**
     * Clear current grammar
     */
    reset(): void;
}
export declare const parser: TacParser;
