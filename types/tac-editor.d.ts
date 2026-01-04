/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */
import { TacParser, Token, Suggestion, ValidationError, Grammar } from './tac-parser.js';
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
interface MessageTypeConfig {
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
/** Cursor position in the editor */
export interface CursorPosition {
    line: number;
    column: number;
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
/**
 * TAC Editor Web Component
 * Monaco-like architecture with virtualized line rendering
 */
export declare class TacEditor extends HTMLElement {
    lines: string[];
    parser: TacParser;
    private _messageType;
    private _tokens;
    private _templateRenderer;
    private _isTemplateMode;
    scrollTop: number;
    viewportHeight: number;
    lineHeight: number;
    bufferLines: number;
    private _lastStartIndex;
    private _lastEndIndex;
    private _lastTotalLines;
    private _lastContentHash;
    private _scrollRaf;
    cursorLine: number;
    cursorColumn: number;
    selectionStart: CursorPosition | null;
    selectionEnd: CursorPosition | null;
    private _suggestions;
    private _unfilteredSuggestions;
    private _selectedSuggestion;
    private _showSuggestions;
    private _suggestionMenuStack;
    private _suggestionFilter;
    private _lastBlurTimestamp;
    /** Current editable region info - used when editing a token with editable parts */
    private _currentEditable;
    private renderTimer;
    private inputTimer;
    private _loadedGrammars;
    /** Forced TAC code for grammar selection (used when suggestion specifies a tacCode) */
    private _forceTacCode;
    /** Current TAC code being edited (for display purposes) */
    private _currentTacCode;
    /** Previous grammar name for ESC navigation in switchGrammar flow */
    private _previousGrammarName;
    private _isSelecting;
    private _undoStack;
    private _redoStack;
    private _maxHistory;
    private _providers;
    private _state;
    private _waitingAbortController;
    private _waitingProviderType;
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    get readonly(): boolean;
    /** Get current editor state */
    get state(): EditorState;
    /**
     * Register a provider for external data requests
     * @param type - Provider type (e.g., 'sequence-number', 'geometry-polygon')
     * @param provider - Async function that returns the value
     * @returns Unsubscribe function
     */
    registerProvider(type: string, provider: Provider): () => void;
    /**
     * Check if a provider is registered for a type
     */
    hasProvider(type: string): boolean;
    /**
     * Cancel waiting state (if in waiting mode)
     */
    cancelWaiting(): void;
    /**
     * Build provider context from current editor state
     */
    private _buildProviderContext;
    /**
     * Request data from a registered provider
     * @param type - Provider type
     * @returns The value from provider, or null if no provider or cancelled
     */
    requestFromProvider(type: string): Promise<string | null>;
    /**
     * Update UI for waiting state
     */
    private _updateWaitingUI;
    get value(): string;
    set value(val: string);
    get placeholder(): string;
    /** Get the current locale (e.g., 'fr-FR', 'en') */
    get lang(): string;
    set lang(val: string);
    /**
     * Get the supported TAC codes (e.g., SA, SP, FT, FC, WS, WV, WC, WA, FV, FK, FN)
     * @returns Array of TAC codes
     */
    get messageTypes(): string[];
    /** Get message types for menu display (deduplicated by name) */
    get menuMessageTypes(): MessageTypeConfig[];
    set messageTypes(val: string[]);
    /**
     * @deprecated Use messageTypes instead
     */
    get types(): string[];
    /**
     * Get message type configurations for suggestions
     */
    get messageTypeConfigs(): Array<{
        tacCode: string;
        name: string;
        grammar: string;
        description: string;
        hasSubMenu?: boolean;
    }>;
    set types(val: string[]);
    /** Get the grammars URL base */
    get grammarsUrl(): string;
    set grammarsUrl(val: string);
    get tokens(): Token[];
    get suggestions(): Suggestion[];
    get messageType(): string | null;
    get isValid(): boolean;
    get errors(): ValidationError[];
    render(): void;
    setupEventListeners(): void;
    private _isReady;
    private _readyPromise;
    private _readyResolve;
    private _pendingGrammarLoad;
    private _lastGrammarLoadPromise;
    /** Initialize editor - no grammars are loaded until a type is detected */
    private _loadDefaultGrammars;
    private _onReady;
    /** Returns a promise that resolves when the editor is ready */
    whenReady(): Promise<void>;
    /** Check if the editor is ready */
    get isReady(): boolean;
    /**
     * Get the TAC identifier from current text (supports multi-token identifiers)
     * @returns The TAC identifier (e.g., "METAR", "SIGMET", "VA ADVISORY") or null
     */
    private _getMessageIdentifier;
    /**
     * Get TAC code from identifier and supported message types
     * @param identifier - The TAC identifier (e.g., "METAR", "SIGMET")
     * @returns The best matching TAC code or null
     */
    private _getTacCodeFromIdentifier;
    /**
     * Load grammar for a detected message type
     * @param typeIdentifier - The message type identifier (e.g., 'METAR', 'TAF')
     * @returns Promise that resolves to true if grammar was loaded successfully
     */
    private _loadGrammarForType;
    /**
     * Load a grammar with inheritance resolution
     * @param grammarName - Base name of the grammar (without locale suffix)
     * @returns Promise that resolves to true if grammar was loaded successfully
     */
    private _loadGrammarWithInheritance;
    /**
     * Fetch a grammar file with locale fallback
     * @param grammarName - Base name of the grammar
     * @returns The grammar object or null if not found
     */
    private _fetchGrammar;
    /**
     * Get fallback chain for locale
     * e.g., "fr-FR" → ["fr-FR", "fr", "en"]
     * Always ends with base grammar (no locale suffix)
     */
    private _getLocaleFallbackChain;
    /**
     * Get URL for localized grammar file
     */
    private _getGrammarUrl;
    /** Manually load a grammar */
    loadGrammar(name: string, grammar: Grammar): void;
    /**
     * Load grammar from URL with locale fallback and inheritance resolution
     */
    loadGrammarFromUrl(name: string): Promise<boolean>;
    setValue(text: string | null | undefined): void;
    /**
     * Normalize input text to fix common format variations
     * This allows pasting messages from different sources that may have slight format differences
     */
    private _normalizeInputText;
    /**
     * Normalize VAA (Volcanic Ash Advisory) text format variations
     * Fixes labels to match the expected template format
     */
    private _normalizeVaaText;
    /**
     * Normalize TCA (Tropical Cyclone Advisory) text format variations
     */
    private _normalizeTcaText;
    clear(): void;
    focus(): void;
    private _detectMessageType;
    /**
     * Check if the current grammar uses template mode and initialize it
     */
    private _checkTemplateMode;
    /**
     * Apply template mode: generate full template and position cursor at first editable field
     * Called when selecting a message identifier that has template mode enabled
     */
    private _applyTemplateMode;
    /**
     * Navigate to the next template field (Tab key)
     * @returns true if navigation occurred, false otherwise
     */
    private _navigateToNextTemplateField;
    /**
     * Navigate to the previous template field (Shift+Tab)
     * @returns true if navigation occurred, false otherwise
     */
    private _navigateToPreviousTemplateField;
    /**
     * Focus a specific template field and select its value
     */
    private _focusTemplateField;
    /** Wait for any pending grammar load to complete */
    waitForGrammarLoad(): Promise<boolean>;
    private _tokenize;
    handleInput(_e: InputEvent): void;
    handleKeyDown(e: KeyboardEvent): void;
    /** Common operations after any edit */
    private _afterEdit;
    /**
     * Sync template lines: extract values from current lines and rebuild with proper column alignment
     * This ensures labels always maintain their fixed width and can't be accidentally modified
     */
    private _syncTemplateLines;
    /** Save current state to undo stack BEFORE making changes */
    private _saveToHistory;
    undo(): void;
    redo(): void;
    private _invalidateRenderCache;
    private _moveCursorByWord;
    insertText(text: string): void;
    insertNewline(): void;
    deleteBackward(): void;
    deleteForward(): void;
    deleteSelection(): void;
    /**
     * Apply template mode constraints to cursor position
     */
    private _applyTemplateModeConstraints;
    moveCursorLeft(selecting?: boolean): void;
    moveCursorRight(selecting?: boolean): void;
    moveCursorUp(selecting?: boolean): void;
    moveCursorDown(selecting?: boolean): void;
    moveCursorHome(selecting?: boolean, toDocument?: boolean): void;
    moveCursorEnd(selecting?: boolean, toDocument?: boolean): void;
    private _startSelection;
    private _updateSelection;
    private _clearSelection;
    private _normalizeSelection;
    selectAll(): void;
    getSelectedText(): string;
    copySelection(): void;
    cutSelection(): void;
    /**
     * Constrain cursor position in template mode
     * In template mode, cursor cannot be in the label column (left side) except on line 0
     */
    private _constrainCursorForTemplateMode;
    handleMouseDown(e: MouseEvent): void;
    handleMouseMove(e: MouseEvent): void;
    handleDoubleClick(e: MouseEvent): void;
    private _getPositionFromMouse;
    handleFocus(): void;
    handleBlur(): void;
    handleScroll(): void;
    /**
     * Ensure cursor is visible in the viewport by scrolling if necessary
     */
    private _ensureCursorVisible;
    renderViewport(): void;
    private _buildTokensMap;
    private _highlightLine;
    /**
     * Check if a token text is a placeholder value (incomplete/needs editing)
     * Placeholder tokens are values like 00000KT, 000000Z, 0000, etc.
     */
    private _isPlaceholderToken;
    /** Get absolute cursor position in the document */
    private _getAbsoluteCursorPosition;
    /** Convert absolute position to line/column */
    private _absoluteToLineColumn;
    /** Navigate to the next token (Tab key) */
    private _navigateToNextToken;
    /** Navigate to the previous token (Shift+Tab key) */
    private _navigateToPreviousToken;
    /** Select a token - if it's a placeholder, select the editable part */
    private _selectToken;
    /** Find the end of the editable portion in a token */
    private _findEditableEnd;
    private _renderCursor;
    private _updateCursor;
    private _renderSelection;
    /**
     * Find the token type for suggestions based on cursor position
     * Uses cached this._tokens instead of re-tokenizing
     * @returns { tokenType, prevTokenText } or null if no grammar
     */
    private _getTokenTypeForSuggestions;
    private _updateSuggestions;
    /** Filter suggestions based on current typed text */
    private _filterSuggestions;
    private _shouldShowSuggestions;
    /** Force show suggestions (Ctrl+Space) - gets suggestions for current context */
    private _forceShowSuggestions;
    private _renderSuggestions;
    private _scrollSuggestionIntoView;
    private _positionSuggestions;
    private _hideSuggestions;
    /** Navigate back to parent menu in suggestion submenu hierarchy */
    private _goBackToParentMenu;
    private _applySuggestion;
    handleSuggestionClick(e: MouseEvent): void;
    /** Get editable defaults - can return strings or full Suggestion objects with categories */
    private _getEditableDefaults;
    /** Show editable defaults as suggestions */
    private _showEditableDefaults;
    /**
     * Apply a message type suggestion (with tacCode)
     * Loads the grammar and gets the identifier from grammar.identifier
     */
    private _applyMessageTypeSuggestion;
    /**
     * Switch to a different grammar (e.g., from sigmet to ws/wc/wv)
     * Used when user selects a SIGMET type at the phenomenon position
     */
    private _applySwitchGrammarSuggestion;
    /**
     * Apply a suggestion that requires external provider data
     * @param suggestion - Suggestion with provider property
     */
    private _applyProviderSuggestion;
    /**
     * Insert suggestion text with proper handling of editable regions
     */
    private _insertSuggestionText;
    /**
     * Insert text at cursor position with proper spacing
     */
    private _insertTextAtCursor;
    /** Apply a default value to the current editable region */
    private _applyEditableDefault;
    /** Validate current editable region and move cursor to next token position */
    private _validateEditableAndMoveNext;
    /** Validate current editable and go back to previous token */
    private _validateEditableAndMovePrevious;
    private _updateStatus;
    /**
     * Clear the current message type and reset editor to initial state
     * Called when user clicks the chip delete button
     */
    private _clearMessageType;
    updatePlaceholderVisibility(): void;
    updatePlaceholderContent(): void;
    updateReadonly(): void;
    private _emitChange;
    /** Emit save event (Ctrl+S) */
    private _emitSave;
    /** Open file picker (Ctrl+O) */
    private _openFilePicker;
    private _escapeHtml;
}
export default TacEditor;
