/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */
import { MessageTypeConfig, TokenDefinition, EditableDefinition, SuggestionDeclaration, SuggestionDefinition, TemplateField, TemplateDefinition, StructureItem, StructureToken, StructureOneOf, StructureSequence, StructureNode, isStructureOneOf, isStructureSequence, isStructureToken, Grammar, Token, TokenMatchResult, Suggestion, ValidationError, ValidationResult, SuggestionProviderContext, ProviderSuggestion, SuggestionProviderResult, SuggestionProviderFunction, SuggestionProviderOptions } from './tac-parser-types.js';
import { StructureTracker } from './tac-parser-structure.js';
export type { MessageTypeConfig, TokenDefinition, EditableDefinition, SuggestionDeclaration, SuggestionDefinition, TemplateField, TemplateDefinition, StructureItem, StructureToken, StructureOneOf, StructureSequence, StructureNode, Grammar, Token, TokenMatchResult, Suggestion, ValidationError, ValidationResult, SuggestionProviderContext, ProviderSuggestion, SuggestionProviderResult, SuggestionProviderFunction, SuggestionProviderOptions };
export { isStructureOneOf, isStructureSequence, isStructureToken, StructureTracker };
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
     * Merge structure arrays by node ID
     * Child nodes replace parent nodes with matching ID
     */
    private _mergeStructure;
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
    /**
     * Clear all loaded grammars (for standard/locale changes)
     */
    clearGrammars(): void;
}
export declare const parser: TacParser;
