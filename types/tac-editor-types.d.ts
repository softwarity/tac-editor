/**
 * @softwarity/tac-editor - Types and Constants
 * Shared types, interfaces, and configuration constants
 */
import { Token, ValidationError } from './tac-parser.js';
/** Editor state */
export type EditorState = 'editing' | 'waiting';
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
export declare const MESSAGE_TYPES: MessageTypeConfig[];
/** Default TAC codes if none specified */
export declare const DEFAULT_TAC_CODES: string[];
/** Multi-token identifiers that start with a given first word */
export declare const MULTI_TOKEN_IDENTIFIERS: Record<string, string[]>;
/** Map TAC identifier to TAC code(s) - for detecting message type from content */
export declare const IDENTIFIER_TO_TAC_CODES: Record<string, string[]>;
/** Maximum label column width for template normalization (TCA uses 28, VAA uses 22) */
export declare const TEMPLATE_LABEL_COLUMN_WIDTH = 28;
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
/** Template normalization configurations for each template message type */
export declare const TEMPLATE_NORM_CONFIGS: TemplateNormConfig[];
/** Find template normalization config by checking if text starts with a known identifier */
export declare function findTemplateNormConfig(text: string): TemplateNormConfig | undefined;
/** Find message type config by TAC code */
export declare function findMessageType(tacCode: string): MessageTypeConfig | undefined;
/** Extract a valid tacCode from a pattern (e.g., 'W[SCV]' -> 'WS') */
export declare function patternToTacCode(pattern: string): string;
