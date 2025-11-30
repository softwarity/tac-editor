/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */
import { TacParser, Token, Suggestion, ValidationError, Grammar } from './tac-parser.js';
/** Cursor position in the editor */
export interface CursorPosition {
    line: number;
    column: number;
}
/** Theme configuration */
export interface ThemeConfig {
    [key: string]: string;
}
/** Theme settings for dark and light modes */
export interface ThemeSettings {
    dark?: ThemeConfig;
    light?: ThemeConfig;
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
    /** Current editable region info - used when editing a token with editable parts */
    private _currentEditable;
    private renderTimer;
    private inputTimer;
    private _loadedGrammars;
    themes: ThemeSettings;
    private _isSelecting;
    private _undoStack;
    private _redoStack;
    private _maxHistory;
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    get readonly(): boolean;
    get value(): string;
    set value(val: string);
    get placeholder(): string;
    /** Get the current locale (e.g., 'fr-FR', 'en') */
    get lang(): string;
    set lang(val: string);
    /** Get the supported message types */
    get types(): string[];
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
    /** Get the first token (message type identifier) from current text */
    private _getFirstToken;
    /**
     * Load grammar for a detected message type
     * @param typeIdentifier - The message type identifier (e.g., 'METAR', 'TAF')
     * @returns Promise that resolves to true if grammar was loaded successfully
     */
    private _loadGrammarForType;
    /**
     * Load localized grammar with fallback chain
     * Each locale has its own complete grammar file (not just translations)
     * This allows for regional variations in weather codes, formats, etc.
     * e.g., for lang="fr-FR": tries metar-speci.fr-FR.json → metar-speci.fr.json → metar-speci.json
     */
    private _loadLocalizedGrammar;
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
     * Load grammar from URL with locale fallback
     */
    loadGrammarFromUrl(name: string): Promise<boolean>;
    setValue(text: string | null | undefined): void;
    clear(): void;
    focus(): void;
    private _detectMessageType;
    /** Wait for any pending grammar load to complete */
    waitForGrammarLoad(): Promise<boolean>;
    private _tokenize;
    handleInput(_e: InputEvent): void;
    handleKeyDown(e: KeyboardEvent): void;
    /** Common operations after any edit */
    private _afterEdit;
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
    handleMouseDown(e: MouseEvent): void;
    handleMouseMove(e: MouseEvent): void;
    handleDoubleClick(e: MouseEvent): void;
    private _getPositionFromMouse;
    handleFocus(): void;
    handleBlur(): void;
    handleScroll(): void;
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
    private _updateStatus;
    updatePlaceholderVisibility(): void;
    updatePlaceholderContent(): void;
    updateReadonly(): void;
    private _emitChange;
    /**
     * Update dynamic theme CSS based on dark-selector attribute.
     */
    updateThemeCSS(): void;
    /**
     * Convert a CSS selector to a :host or :host-context rule.
     */
    private _parseSelectorToHostRule;
    /**
     * Programmatically set theme colors.
     */
    setTheme(theme: ThemeSettings): void;
    /**
     * Reset theme to defaults.
     */
    resetTheme(): void;
    private _escapeHtml;
}
export default TacEditor;
