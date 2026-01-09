/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */
import { TacParser, Token, Suggestion, ValidationError, Grammar, SuggestionProviderOptions, SuggestionProviderContext, ProviderSuggestion } from './tac-parser.js';
import { EditorState, ProviderContext, ProviderRequest, Provider, CursorPosition, ChangeEventDetail, ErrorEventDetail, MessageTypeConfig, ValidatorCallback, ValidatorContext, ValidatorOptions } from './tac-editor-types.js';
export type { EditorState, ProviderContext, ProviderRequest, Provider, CursorPosition, ChangeEventDetail, ErrorEventDetail, ValidatorCallback, ValidatorContext, ValidatorOptions };
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
    private _isLoadingSuggestions;
    private _loadingLabel;
    private _suggestionMenuStack;
    private _suggestionFilter;
    private _lastBlurTimestamp;
    private _providerCache;
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
    /** Grammar name set via switchGrammar - prevents auto-detection from overriding it */
    private _switchedGrammarName;
    private _isSelecting;
    private _undoManager;
    private _providers;
    private _state;
    private _waitingAbortController;
    private _waitingProviderType;
    /** Validators by name (for grammar-defined validators via 'validator' property) */
    private _validatorsByName;
    /** Validators by pattern (for pattern-based validators like 'sa.*.*.datetime') */
    private _validatorsByPattern;
    /** Providers by pattern (for pattern-based providers like 'sa.*.*.temperature') */
    private _providersByPattern;
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    get readonly(): boolean;
    /** Include AUTO-specific entries in observation (METAR/SPECI) suggestions */
    get observationAuto(): boolean;
    set observationAuto(value: boolean);
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
     * Flatten categories that have a provider property but no registered provider.
     * This removes unnecessary sub-menus when provider is disabled - children are shown directly.
     */
    private _flattenCategoriesWithoutProvider;
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
     * @param waiting - Whether to show waiting state
     * @param userInteraction - If true, shows "Waiting for user input..." overlay
     * @param label - Optional label to display in the overlay
     */
    private _updateWaitingUI;
    /**
     * Check if a string is a provider pattern (contains dots for codetac.standard.lang.tokenType format)
     */
    private _isProviderPattern;
    /**
     * Register a suggestion provider for a token type
     *
     * Supports two registration modes:
     * 1. By ID: Referenced in grammar via 'provider' property (e.g., 'firId')
     * 2. By pattern: Matches tokens by grammar context (e.g., 'sa.*.*.temperature')
     *
     * Pattern format: codetac.standard.lang.tokenType (use * as wildcard)
     *
     * @param idOrPattern - Provider ID, pattern, or array of patterns
     * @param options - Provider options including the provider function and mode
     * @returns Unsubscribe function
     *
     * @example
     * // By ID (grammar must define: "provider": "firId")
     * editor.registerSuggestionProvider('firId', {
     *   provider: async (ctx) => [{ text: 'LFPG', description: 'Paris CDG' }]
     * });
     *
     * @example
     * // By pattern - all temperature tokens in METAR grammars
     * editor.registerSuggestionProvider('sa.*.*.temperature', {
     *   provider: async (ctx) => {
     *     const stationData = await fetchStationData();
     *     return [{ text: formatTemp(stationData.temp), description: 'From station' }];
     *   }
     * });
     *
     * @example
     * // Multiple patterns at once
     * editor.registerSuggestionProvider(['sa.*.*.temperature', 'sa.*.*.dewPoint'], {
     *   provider: async (ctx) => { ... }
     * });
     */
    registerSuggestionProvider(idOrPattern: string | string[], options: SuggestionProviderOptions): () => void;
    /**
     * Unregister a suggestion provider by ID or pattern
     * @param idOrPattern - Provider ID or pattern to unregister
     */
    unregisterSuggestionProvider(idOrPattern: string): void;
    /**
     * Check if a suggestion provider is registered for a token type
     * @param tokenType - Token type to check
     */
    hasSuggestionProvider(tokenType: string): boolean;
    /**
     * Get all registered suggestion provider IDs and patterns
     */
    getRegisteredSuggestionProviders(): string[];
    /**
     * Check if a string is a pattern (contains dots for codetac.standard.lang.tokenType format)
     */
    private _isValidatorPattern;
    /**
     * Register a validator for semantic validation of token values
     *
     * Supports two registration modes:
     * 1. By name: Referenced in grammar via 'validator' property (e.g., 'DDHHmmZ')
     * 2. By pattern: Matches tokens by grammar context (e.g., 'sa.*.*.datetime')
     *
     * Pattern format: codetac.standard.lang.tokenType (use * as wildcard)
     *
     * @param nameOrPattern - Validator name, pattern, or array of patterns
     * @param callback - Validation function that returns undefined if valid, or error message if invalid
     * @param options - Optional validator options
     * @returns Unsubscribe function
     *
     * @example
     * // By name (grammar must define: "validator": "DDHHmmZ")
     * editor.registerValidator('DDHHmmZ', (ctx) => {
     *   if (+ctx.tokenValue.slice(0,2) > 31) return 'Invalid day';
     *   return undefined;
     * });
     *
     * @example
     * // By pattern - all datetime tokens in METAR grammars
     * editor.registerValidator('sa.*.*.datetime', (ctx) => {
     *   // Validate datetime...
     * });
     *
     * @example
     * // Multiple patterns at once
     * editor.registerValidator(['sa.*.*.datetime', 'sp.*.*.datetime'], (ctx) => {
     *   // Same validator for METAR and SPECI datetime
     * });
     *
     * @example
     * // All wind tokens across all grammars
     * editor.registerValidator('*.*.*.wind', (ctx) => {
     *   // Validate wind...
     * });
     */
    registerValidator(nameOrPattern: string | string[], callback: ValidatorCallback, _options?: ValidatorOptions): () => void;
    /**
     * Unregister a validator by name or pattern
     * @param nameOrPattern - Validator name or pattern to unregister
     */
    unregisterValidator(nameOrPattern: string): void;
    /**
     * Check if a validator is registered
     * @param nameOrPattern - Validator name or pattern to check
     */
    hasValidator(nameOrPattern: string): boolean;
    /**
     * Get all registered validator names and patterns
     */
    getRegisteredValidators(): string[];
    /**
     * Get a registered validator by name
     * @internal Used by parser for validation
     */
    getValidator(name: string): ValidatorCallback | undefined;
    get value(): string;
    set value(val: string);
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
    /** Get the grammar standard (oaci, us, etc.) - defaults to 'oaci' */
    get standard(): string;
    set standard(val: string);
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
     * Load a grammar with inheritance resolution
     * @param grammarName - Base name of the grammar, or "name.standard" format
     * @returns Promise that resolves to true if grammar was loaded successfully
     */
    private _loadGrammarWithInheritance;
    /**
     * Fetch a grammar file with standard and locale fallback
     * @param grammarName - Base name of the grammar
     * @param forceStandard - Optional: force a specific standard (skips fallback chain for standard)
     * @returns The grammar object or null if not found
     */
    private _fetchGrammar;
    /**
     * Get effective locale (resolve 'auto' to browser language)
     */
    private _getEffectiveLocale;
    /**
     * Get fallback chain for standard and locale
     * e.g., standard="us", locale="fr" →
     *   [["us", "fr"], ["oaci", "fr"], ["oaci", "en"]]
     */
    private _getGrammarFallbackChain;
    /**
     * Get URL for grammar file with standard and locale
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
     * Normalize template text (VAA, TCA) format variations
     * Fixes labels to match the expected template format using the provided config
     */
    private _normalizeTemplateText;
    clear(): void;
    focus(): void;
    /** Reset all message type related state */
    private _resetMessageTypeState;
    /** Apply grammar after it's loaded (sync or async) */
    private _applyLoadedGrammar;
    private _detectMessageType;
    /**
     * Check if the switched grammar is still valid for the given identifier
     * e.g., 'ws' grammar is valid for 'SIGMET' identifier
     * For TAF (fc/ft), also check if validityPeriod is present - if not, return false
     * so the user gets the TAF Short/Long choice again
     */
    private _isSwitchedGrammarValidForIdentifier;
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
    /** Handle Tab key in template mode */
    private _handleTemplateTabKey;
    /** Handle keyboard navigation when suggestions popup is visible */
    private _handleSuggestionsKeyDown;
    /** Handle Ctrl+Space for showing suggestions */
    private _handleCtrlSpaceKey;
    /** Handle Backspace key */
    private _handleBackspaceKey;
    /** Handle Delete key */
    private _handleDeleteKey;
    /** Handle Enter key */
    private _handleEnterKey;
    /** Handle Tab key for token navigation */
    private _handleTabKey;
    /** Navigate to a specific editable region within the current token */
    private _navigateToEditableRegion;
    /** Handle arrow keys and Home/End navigation */
    private _handleArrowKeys;
    /** Handle keyboard shortcuts (Ctrl+A, Ctrl+S, Ctrl+Z, etc.) */
    private _handleShortcutKeys;
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
    /** Show/hide loading indicator in suggestions popup */
    private _showSuggestionsLoading;
    /** Filter suggestions based on current typed text and AUTO mode */
    private _filterSuggestions;
    /** Filter out AUTO-specific suggestions (recursive for categories) */
    private _filterAutoSuggestions;
    private _shouldShowSuggestions;
    /** Force show suggestions (Ctrl+Space) - gets suggestions for current context */
    private _forceShowSuggestions;
    /**
     * Show suggestions based on a specific token ref (used by skipToNext)
     * This allows skip suggestions to specify which after section to use
     */
    private _showSuggestionsForRef;
    private _renderSuggestions;
    private _scrollSuggestionIntoView;
    private _positionSuggestions;
    /**
     * Convert a ProviderSuggestion to a Suggestion (recursive for children)
     */
    private _convertProviderSuggestion;
    /**
     * Calculate cache expiration time based on cache option
     * @param cacheOption - The cache configuration
     * @returns expiration timestamp (0 = no cache, Infinity = never expires)
     */
    private _getCacheExpiration;
    /**
     * Check if a cached entry is still valid
     * @param providerId - The provider ID to check
     * @returns The cached data if valid, or null if expired/not found
     */
    private _getCachedData;
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
     * Expand a single category directly without creating a menu level.
     * Used when there's only one category suggestion - we fetch its content
     * and use it as the main suggestions list (no stack, no back navigation).
     */
    private _expandSingleCategory;
    /** Apply filters and render - used by _expandSingleCategory to avoid recursion */
    private _applyFiltersAndRender;
    /**
     * Open a category that has a provider - fetch suggestions from provider (with optional caching)
     * @param suggestion - Category suggestion with provider property
     */
    private _openCategoryWithProvider;
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
    updateReadonly(): void;
    private _emitChange;
    /** Emit save event (Ctrl+S) */
    private _emitSave;
    /** Open file picker (Ctrl+O) */
    private _openFilePicker;
    private _escapeHtml;
}
export default TacEditor;
export type { SuggestionProviderOptions, SuggestionProviderContext, ProviderSuggestion };
