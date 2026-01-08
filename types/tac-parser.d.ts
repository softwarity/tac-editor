/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */
import { MessageTypeConfig, TokenDefinition, TokenPlaceholder, EditableRegion, TemplateField, TemplateDefinition, StructureItem, StructureToken, StructureOneOf, StructureSequence, StructureNode, isStructureOneOf, isStructureSequence, isStructureToken, Grammar, Token, TokenMatchResult, Suggestion, ValidationError, ValidationResult, SuggestionProviderContext, ProviderSuggestion, SuggestionProviderResult, SuggestionProviderFunction, SuggestionProviderOptions, SuggestionItem, SuggestionItemValue, SuggestionItemSkip, SuggestionItemCategory, SuggestionItemSwitchGrammar, GrammarSuggestions, isSuggestionItemSkip, isSuggestionItemCategory, isSuggestionItemSwitchGrammar, isSuggestionItemValue } from './tac-parser-types.js';
import { ValidatorContext, ValidatorCallback } from './tac-editor-types.js';
import { StructureTracker } from './tac-parser-structure.js';
export type { MessageTypeConfig, TokenDefinition, TokenPlaceholder, EditableRegion, TemplateField, TemplateDefinition, StructureItem, StructureToken, StructureOneOf, StructureSequence, StructureNode, Grammar, Token, TokenMatchResult, Suggestion, ValidationError, ValidationResult, SuggestionProviderContext, ProviderSuggestion, SuggestionProviderResult, SuggestionProviderFunction, SuggestionProviderOptions, SuggestionItem, SuggestionItemValue, SuggestionItemSkip, SuggestionItemCategory, SuggestionItemSwitchGrammar, GrammarSuggestions };
export { isStructureOneOf, isStructureSequence, isStructureToken, StructureTracker, isSuggestionItemSkip, isSuggestionItemCategory, isSuggestionItemSwitchGrammar, isSuggestionItemValue };
/**
 * TAC Parser class
 * Grammar-based parser for TAC messages
 */
/** Validator getter function type - returns matching validators for a given context */
export type ValidatorGetter = (validatorName: string | null, grammarCode: string | null, grammarStandard: string | null, grammarLang: string | null, tokenType: string) => ValidatorCallback[];
/** Provider getter function type - returns matching provider for a given context */
export type ProviderGetter = (providerId: string | null, grammarCode: string | null, grammarStandard: string | null, grammarLang: string | null, tokenType: string) => SuggestionProviderOptions | null;
export type { ValidatorContext };
export declare class TacParser {
    grammars: Map<string, Grammar>;
    currentGrammar: Grammar | null;
    /** Name of the current grammar (key in grammars map) */
    currentGrammarName: string | null;
    /** Grammar TAC code (e.g., 'sa', 'ft', 'ws') */
    grammarCode: string | null;
    /** Grammar standard (e.g., 'oaci', 'noaa') */
    grammarStandard: string | null;
    /** Grammar language (e.g., 'en', 'fr') */
    grammarLang: string | null;
    /** Raw (unresolved) grammars before inheritance resolution */
    private _rawGrammars;
    /** Registered suggestion providers by token type */
    private _suggestionProviders;
    /** Current editor text (set by editor for provider context) */
    private _currentText;
    /** Current cursor position (set by editor for provider context) */
    private _cursorPosition;
    /** Validator getter function (set by editor to provide validator lookup) */
    private _validatorGetter;
    /** Provider getter function (set by editor to provide pattern-based provider lookup) */
    private _providerGetter;
    /**
     * Set the validator getter function
     * Called by the editor to provide validator lookup capability
     */
    setValidatorGetter(getter: ValidatorGetter): void;
    /**
     * Set the provider getter function
     * Called by the editor to provide pattern-based provider lookup capability
     */
    setProviderGetter(getter: ProviderGetter): void;
    /**
     * Set grammar context (code, standard, lang)
     * Called by the editor when grammar changes
     */
    setGrammarContext(code: string | null, standard: string | null, lang: string | null): void;
    /**
     * Apply validator to a matched token
     * Checks both grammar-defined validators and pattern-based validators
     * @param result - The token match result
     * @param tokenText - The token text value
     * @param position - Position in the text
     * @param grammar - Current grammar
     * @returns TokenMatchResult with validation error if validator fails
     */
    private _applyValidator;
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
     * Check if any registered provider has userInteraction: true
     * @returns true if at least one provider requires user interaction
     */
    hasUserInteractionProvider(): boolean;
    /**
     * Get provider options for a specific token type
     * Checks both name-based providers and pattern-based providers
     * @param tokenType - The token type (provider ID)
     * @param providerId - Optional explicit provider ID
     * @returns Provider options or undefined if no provider registered
     */
    getProviderOptions(tokenType: string, providerId?: string): SuggestionProviderOptions | undefined;
    /**
     * Check if a provider is registered for a token type
     * Checks both name-based providers and pattern-based providers
     * @param tokenType - The token type to check
     * @param providerId - Optional explicit provider ID
     */
    hasProvider(tokenType: string, providerId?: string): boolean;
    /**
     * Get all registered provider token types
     */
    getRegisteredProviders(): string[];
    /**
     * Get suggestions from a provider (public method for editor to call)
     * @param providerId - The provider ID to fetch from
     * @returns Promise of suggestions array or empty array
     */
    getProviderSuggestions(providerId: string): Promise<Suggestion[]>;
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
     * Checks both name-based providers (from grammar) and pattern-based providers
     * @param tokenType - The token type (provider ID or grammar token ref)
     * @param prefix - Optional prefix to prepend to suggestions (from declaration)
     * @param suffix - Optional suffix to append to suggestions (from declaration)
     * @param providerId - Optional explicit provider ID (from suggestion declaration)
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
     * Get suggestions for a token from the new format (async for provider support)
     */
    private _getSuggestionsForToken;
    /**
     * Build Suggestion objects from new SuggestionItem array format
     * @param tokenId - The token ID to get suggestions for
     * @param prevTokenText - Previous token text for filtering (CB/TCU)
     * @returns Array of Suggestion objects
     */
    private _buildSuggestionsFromItems;
    /**
     * Convert SuggestionItem array to Suggestion array
     * Handles all item types: value, skip, category, switchGrammar
     */
    private _convertSuggestionItems;
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
     * Build template suggestions from token IDs (new format)
     * Uses suggestions.items to get the actual suggestion values
     */
    private _buildTemplateSuggestionsFromItems;
    /**
     * Convert a SuggestionItem to a Suggestion for template mode
     */
    private _convertTemplateSuggestionItem;
    /**
     * Generate dynamic datetime text based on pattern and description
     */
    private _generateDynamicDateTimeForPattern;
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
