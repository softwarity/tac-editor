/**
 * Template Renderer for structured TAC messages (VAA, TCA)
 * Handles column-based layout with editable fields
 */
import type { TemplateDefinition, TemplateField, Token } from './tac-parser';
/** Rendered field state */
export interface RenderedField {
    field: TemplateField;
    lineIndex: number;
    labelStart: number;
    labelEnd: number;
    valueStart: number;
    valueEnd: number;
    value: string;
    /** Additional lines for multiline values */
    additionalLines?: string[];
}
/** Template state for the editor */
export interface TemplateState {
    /** The template definition */
    template: TemplateDefinition;
    /** Current field values */
    fields: RenderedField[];
    /** Currently focused field index */
    focusedFieldIndex: number;
    /** Label column width (computed or from template) */
    labelColumnWidth: number;
}
/**
 * TemplateRenderer class
 * Manages rendering and editing of template-based messages
 */
export declare class TemplateRenderer {
    private _template;
    private _state;
    private _identifier;
    /**
     * Initialize with a template definition
     */
    initialize(template: TemplateDefinition, identifier: string): void;
    /**
     * Get current template state
     */
    get state(): TemplateState | null;
    /**
     * Get the message identifier (e.g., "VA ADVISORY")
     */
    get identifier(): string;
    /**
     * Check if template mode is active
     */
    get isActive(): boolean;
    /**
     * Create initial state from template
     */
    private _createInitialState;
    /**
     * Generate the full text content from current state
     */
    generateText(): string;
    /**
     * Parse text back into template state
     * Extracts values from existing VAA text and maps them to template fields
     */
    parseText(text: string): void;
    /**
     * Get the field at a given line and column position
     */
    getFieldAtPosition(line: number, column: number): RenderedField | null;
    /**
     * Check if position is in the label column (read-only)
     */
    isInLabelColumn(line: number, column: number): boolean;
    /**
     * Move focus to next field
     */
    focusNextField(): RenderedField | null;
    /**
     * Move focus to previous field
     */
    focusPreviousField(): RenderedField | null;
    /**
     * Get currently focused field
     */
    getFocusedField(): RenderedField | null;
    /**
     * Set field value
     */
    setFieldValue(fieldIndex: number, value: string): void;
    /**
     * Reset the template renderer
     */
    reset(): void;
    /**
     * Tokenize the template content for syntax highlighting
     */
    tokenize(): Token[];
}
