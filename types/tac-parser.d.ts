/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */
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
}
/** Grammar suggestion definition */
export interface SuggestionDefinition {
    text?: string;
    pattern?: string;
    description?: string;
    type?: string;
    placeholder?: string;
    /** Editable region - when present, this part of the token will be selected after insertion */
    editable?: EditableDefinition;
}
/** Grammar definition */
export interface Grammar {
    name?: string;
    version?: string;
    description?: string;
    identifiers?: string[];
    tokens?: Record<string, TokenDefinition>;
    sequence?: unknown[];
    suggestions?: {
        initial?: SuggestionDefinition[];
        after?: Record<string, SuggestionDefinition[]>;
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
    /** If true, this is a category that opens a submenu */
    isCategory?: boolean;
    /** Sub-suggestions for categories */
    children?: Suggestion[];
    /** Editable region - when present, this part of the token will be selected after insertion */
    editable?: EditableDefinition;
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
/**
 * TAC Parser class
 * Grammar-based parser for TAC messages
 */
export declare class TacParser {
    grammars: Map<string, Grammar>;
    currentGrammar: Grammar | null;
    /**
     * Register a grammar
     */
    registerGrammar(name: string, grammar: Grammar): void;
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
     * Match a token against grammar definitions
     */
    private _matchToken;
    /**
     * Get suggestions based on current position
     * @param text - The current text
     * @param cursorPosition - The cursor position
     * @param supportedTypes - Optional list of supported message types for initial suggestions
     */
    getSuggestions(text: string, cursorPosition: number, supportedTypes?: string[]): Suggestion[];
    /**
     * Get initial suggestions (message type identifiers)
     * @param supportedTypes - Optional list of supported types to filter suggestions
     */
    private _getInitialSuggestions;
    /**
     * Get description for a message type
     */
    private _getTypeDescription;
    /**
     * Get contextual suggestions based on grammar state
     */
    private _getContextualSuggestions;
    /**
     * Generate current datetime in METAR format (DDHHmmZ)
     * Rounded to nearest 30 minutes (00 or 30)
     */
    private _generateMetarDateTime;
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
     * Clear current grammar
     */
    reset(): void;
}
export declare const parser: TacParser;
