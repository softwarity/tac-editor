/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */

import styles from './tac-editor.css?inline';
import { getTemplate } from './tac-editor.template.js';
import { TacParser, Token, Suggestion, ValidationError, Grammar, SuggestionProviderOptions, SuggestionProviderConfig, SuggestionProviderFunction, SuggestionProviderContext, ProviderSuggestion, TokenDefinition, ProviderGetterResult } from './tac-parser.js';
import { TemplateRenderer } from './template-renderer.js';
import { UndoManager } from './tac-editor-undo.js';
import {
  EditorState,
  ProviderContext,
  ProviderRequest,
  Provider,
  CursorPosition,
  LineToken,
  ChangeEventDetail,
  ErrorEventDetail,
  MessageTypeConfig,
  MESSAGE_TYPES,
  DEFAULT_TAC_CODES,
  MULTI_TOKEN_IDENTIFIERS,
  IDENTIFIER_TO_TAC_CODES,
  findMessageType,
  patternToTacCode,
  findTemplateNormConfig,
  TemplateNormConfig,
  TEMPLATE_LABEL_COLUMN_WIDTH,
  ValidatorCallback,
  ValidatorContext,
  ValidatorOptions,
  matchValidatorPattern
} from './tac-editor-types.js';
import { registerBuiltinValidators, BUILTIN_VALIDATORS } from './tac-validators.js';

// Re-export types for external use
export type { EditorState, ProviderContext, ProviderRequest, Provider, CursorPosition, ChangeEventDetail, ErrorEventDetail, ValidatorCallback, ValidatorContext, ValidatorOptions };

// Version injected by Vite build
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

/**
 * TAC Editor Web Component
 * Monaco-like architecture with virtualized line rendering
 */
export class TacEditor extends HTMLElement {
  // ========== Model (Source of Truth) ==========
  lines: string[] = [''];

  // ========== Parser ==========
  parser: TacParser = new TacParser();
  private _messageType: string | null = null;
  private _tokens: Token[] = [];

  // ========== Template Mode ==========
  private _templateRenderer: TemplateRenderer = new TemplateRenderer();
  private _isTemplateMode: boolean = false;

  // ========== View State ==========
  scrollTop: number = 0;
  viewportHeight: number = 0;
  lineHeight: number = 21;
  bufferLines: number = 3;

  // ========== Render Cache ==========
  private _lastStartIndex: number = -1;
  private _lastEndIndex: number = -1;
  private _lastTotalLines: number = -1;
  private _lastContentHash: string = '';
  private _scrollRaf: number | null = null;

  // ========== Cursor/Selection ==========
  cursorLine: number = 0;
  cursorColumn: number = 0;
  selectionStart: CursorPosition | null = null;
  selectionEnd: CursorPosition | null = null;

  // ========== Suggestions ==========
  private _suggestions: Suggestion[] = [];
  private _unfilteredSuggestions: Suggestion[] = []; // Original suggestions before filtering
  private _selectedSuggestion: number = 0;
  private _showSuggestions: boolean = false;
  private _isLoadingSuggestions: boolean = false;
  private _loadingLabel: string = ''; // Label of what is being loaded
  private _suggestionMenuStack: Suggestion[][] = []; // Stack for submenu navigation
  private _suggestionFilter: string = ''; // Current filter text
  private _lastBlurTimestamp: number = 0; // Timestamp of last blur event
  private _providerCache: Map<string, { data: Suggestion[], expiresAt: number }> = new Map(); // Cache for provider results with expiration
  private _loadingProviderRequests: Set<string> = new Set(); // Track in-flight provider requests to avoid duplicates

  // ========== Editable Token ==========
  /** Current editable region info - used when editing a token with editable parts */
  private _currentEditable: {
    tokenStart: number;
    tokenEnd: number;
    editableStart: number;
    editableEnd: number;
    suffix: string;
    defaultsFunction?: string;
    /** Token reference ID for looking up next tokens */
    ref?: string;
    /** All editable regions for this token */
    regions: Array<{ start: number; end: number; defaultsFunction?: string; hint?: string }>;
    /** Current region index (0-based) */
    currentRegionIndex: number;
  } | null = null;

  // ========== Debounce ==========
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private inputTimer: ReturnType<typeof setTimeout> | null = null;

  // ========== Loaded Grammars ==========
  private _loadedGrammars: Set<string> = new Set();

  // ========== Forced TAC Code ==========
  /** Forced TAC code for grammar selection (used when suggestion specifies a tacCode) */
  private _forceTacCode: string | null = null;
  /** Current TAC code being edited (for display purposes) */
  private _currentTacCode: string | null = null;
  /** Previous grammar name for ESC navigation in switchGrammar flow */
  private _previousGrammarName: string | null = null;
  /** Grammar name set via switchGrammar - prevents auto-detection from overriding it */
  private _switchedGrammarName: string | null = null;

  // ========== Mouse State ==========
  private _isSelecting: boolean = false;

  // ========== Undo/Redo History ==========
  private _undoManager = new UndoManager(100);

  // ========== Provider System ==========
  private _providers: Map<string, Provider> = new Map();
  private _state: EditorState = 'editing';
  private _waitingAbortController: AbortController | null = null;
  private _waitingProviderType: string | null = null;

  // ========== Validator System ==========
  /** Validators by name (for grammar-defined validators via 'validator' property) */
  private _validatorsByName: Map<string, ValidatorCallback> = new Map();
  /** Validators by pattern (for pattern-based validators like 'sa.*.*.datetime') */
  private _validatorsByPattern: Map<string, ValidatorCallback> = new Map();

  // ========== Suggestion Provider System (pattern-based) ==========
  /** Providers by pattern (for pattern-based providers like 'sa.*.*.temperature') */
  private _providersByPattern: Map<string, SuggestionProviderOptions> = new Map();

  // ========== Word Wrap ==========
  /** Whether word wrap is enabled (default: true) */
  private _wrapEnabled: boolean = true;
  /** Character width for monospace font (measured dynamically) */
  private _charWidth: number = 8.4;
  /** Cached container width for wrap calculations */
  private _containerWidth: number = 0;
  /** Number of characters that fit per visual row */
  private _charsPerRow: number = Infinity;
  /** ResizeObserver for container width changes */
  private _resizeObserver: ResizeObserver | null = null;
  /** Cache of wrap info per logical line: array of wrap break points (character indices) */
  private _wrapCache: Map<number, number[]> = new Map();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ========== Observed Attributes ==========
  static get observedAttributes(): string[] {
    return ['readonly', 'value', 'grammars-url', 'lang', 'standard', 'message-types', 'observation-auto', 'no-cache'];
  }

  // ========== Lifecycle ==========
  connectedCallback(): void {
    // Connect validator system to parser with pattern matching support
    this.parser.setValidatorGetter((
      validatorName: string | null,
      grammarCode: string | null,
      grammarStandard: string | null,
      grammarLang: string | null,
      tokenType: string
    ): ValidatorCallback[] => {
      const validators: ValidatorCallback[] = [];

      // 1. Check grammar-defined validator (by name)
      if (validatorName && this._validatorsByName.has(validatorName)) {
        validators.push(this._validatorsByName.get(validatorName)!);
      }

      // 2. Check pattern-based validators
      for (const [pattern, callback] of this._validatorsByPattern) {
        if (matchValidatorPattern(pattern, grammarCode, grammarStandard, grammarLang, tokenType)) {
          validators.push(callback);
        }
      }

      return validators;
    });

    // Connect suggestion provider system to parser with pattern matching support
    // Priority: token-specific pattern > category-based pattern
    // Returns matchedPattern for cache key construction: pattern prefix + tokenType
    this.parser.setProviderGetter((
      providerId: string | null,
      grammarCode: string | null,
      grammarStandard: string | null,
      grammarLang: string | null,
      tokenType: string,
      tokenCategory: string | null
    ): ProviderGetterResult | null => {
      // 1. First try token-specific patterns (e.g., 'sa.*.*.wind')
      for (const [pattern, options] of this._providersByPattern) {
        if (matchValidatorPattern(pattern, grammarCode, grammarStandard, grammarLang, tokenType)) {
          return { options, matchedPattern: pattern };
        }
      }
      // 2. If no token match, try category-based patterns (e.g., '*.*.*.measurement')
      if (tokenCategory) {
        for (const [pattern, options] of this._providersByPattern) {
          if (matchValidatorPattern(pattern, grammarCode, grammarStandard, grammarLang, tokenCategory)) {
            return { options, matchedPattern: pattern };
          }
        }
      }
      return null;
    });

    this.render();
    this.setupEventListeners();
    this._loadDefaultGrammars();
    this._setupResizeObserver();

    if (this.hasAttribute('value')) {
      this.setValue(this.getAttribute('value'));
    }
    this.renderViewport();
  }

  disconnectedCallback(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    if (this.inputTimer) clearTimeout(this.inputTimer);
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  /**
   * Setup ResizeObserver to recalculate wrap on container resize
   */
  private _setupResizeObserver(): void {
    const viewport = this.shadowRoot?.getElementById('viewport');
    if (!viewport) return;

    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width - 24; // Account for padding
        if (Math.abs(newWidth - this._containerWidth) > 1) {
          this._updateCharsPerRow();
          if (this._wrapEnabled) {
            this.renderViewport();
          }
        }
      }
    });

    this._resizeObserver.observe(viewport);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'value':
        this.setValue(newValue);
        break;
      case 'readonly':
        this.updateReadonly();
        break;
      case 'grammars-url':
        // Clear loaded grammars cache when URL changes
        this._loadedGrammars.clear();
        this.parser.reset();
        break;
      case 'lang':
      case 'standard':
        // Clear all grammars for new locale/standard - they will reload on next setValue
        this._loadedGrammars.clear();
        this.parser.clearGrammars();
        this._messageType = null;
        // Re-tokenize with empty grammar (will show as errors until grammar loads)
        this._tokens = [];
        // Reload grammars and reprocess current value
        if (this.value) {
          this._detectMessageType();
        }
        this.renderViewport();
        break;
      case 'message-types':
        // Message types changed - check if current grammar is still valid
        // _messageType contains grammar name (e.g., 'sa'), which is lowercase TAC code
        if (this._messageType) {
          const currentTacCode = this._messageType.toUpperCase();
          if (!this.messageTypes.includes(currentTacCode)) {
            // Current message type is no longer allowed - reset and re-detect
            this._messageType = null;
            this._currentTacCode = null;
            this.parser.reset();
          }
        }
        // Re-process current value with new message types
        if (this.value) {
          this.setValue(this.value);
        }
        this.renderViewport();
        break;
      case 'observation-auto':
        // Re-filter suggestions when AUTO mode changes
        if (this._showSuggestions && this._unfilteredSuggestions.length > 0) {
          this._filterSuggestions();
        }
        break;
      case 'no-cache':
        // Clear grammar cache and reload when no-cache changes
        this._loadedGrammars.clear();
        this.parser.clearGrammars();
        this._messageType = null;
        this._tokens = [];
        if (this.value) {
          this._detectMessageType();
        }
        this.renderViewport();
        break;
    }
  }

  // ========== Properties ==========
  get readonly(): boolean {
    return this.hasAttribute('readonly');
  }

  /** Include AUTO-specific entries in observation (METAR/SPECI) suggestions */
  get observationAuto(): boolean {
    return this.hasAttribute('observation-auto');
  }

  set observationAuto(value: boolean) {
    if (value) {
      this.setAttribute('observation-auto', '');
    } else {
      this.removeAttribute('observation-auto');
    }
  }

  // ========== Provider System API ==========

  /** Get current editor state */
  get state(): EditorState {
    return this._state;
  }

  /**
   * Register a provider for external data requests
   * @param type - Provider type (e.g., 'sequence-number', 'geometry-polygon')
   * @param provider - Async function that returns the value
   * @returns Unsubscribe function
   */
  registerProvider(type: string, provider: Provider): () => void {
    this._providers.set(type, provider);
    return () => this._providers.delete(type);
  }

  /**
   * Check if a provider is registered for a type
   */
  hasProvider(type: string): boolean {
    // Check direct registration first, then pattern-based via parser
    return this._providers.has(type) || this.parser.hasProvider(type);
  }

  /**
   * Flatten categories that have a provider property but no registered provider.
   * This removes unnecessary sub-menus when provider is disabled - children are shown directly.
   */
  private _flattenCategoriesWithoutProvider(suggestions: Suggestion[]): Suggestion[] {
    const result: Suggestion[] = [];
    for (const sug of suggestions) {
      if (sug.isCategory && sug.provider && !this.hasProvider(sug.provider)) {
        // Provider not registered - flatten: add children directly instead of category
        if (sug.children && sug.children.length > 0) {
          for (const child of sug.children) {
            // Ensure tacCode is inherited
            result.push({
              ...child,
              tacCode: child.tacCode || sug.tacCode
            });
          }
        }
      } else {
        result.push(sug);
      }
    }
    return result;
  }

  /**
   * Cancel waiting state (if in waiting mode)
   */
  cancelWaiting(): void {
    if (this._state === 'waiting' && this._waitingAbortController) {
      this._waitingAbortController.abort();
    }
  }

  /**
   * Build provider context from current editor state
   */
  private _buildProviderContext(): ProviderContext {
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    return {
      text: this.value,
      tokens: this._tokens,
      grammarName: this.parser.currentGrammarName,
      cursorPosition: cursorPos,
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    };
  }

  /**
   * Request data from a registered provider
   * @param type - Provider type
   * @returns The value from provider, or null if no provider or cancelled
   */
  async requestFromProvider(type: string): Promise<string | null> {
    const provider = this._providers.get(type);
    if (!provider) {
      return null; // No provider registered
    }

    // Enter waiting state
    this._state = 'waiting';
    this._waitingProviderType = type;
    this._waitingAbortController = new AbortController();
    this._updateWaitingUI(true);

    try {
      const result = await provider({
        type,
        context: this._buildProviderContext(),
        signal: this._waitingAbortController.signal
      });
      return result;
    } catch (e) {
      // Cancelled or error
      return null;
    } finally {
      // Exit waiting state
      this._state = 'editing';
      this._waitingProviderType = null;
      this._waitingAbortController = null;
      this._updateWaitingUI(false);
    }
  }

  /**
   * Update UI for waiting state
   * @param waiting - Whether to show waiting state
   * @param userInteraction - If true, shows "Waiting for user input..." overlay
   * @param label - Optional label to display in the overlay
   */
  private _updateWaitingUI(waiting: boolean, userInteraction: boolean = false, label: string = ''): void {
    const editor = this.shadowRoot?.getElementById('editorContent');
    if (editor) {
      if (userInteraction) {
        // User interaction mode - show overlay with message and label
        editor.classList.toggle('waiting-user-interaction', waiting);
        editor.classList.remove('waiting');
        if (waiting && label) {
          editor.setAttribute('data-waiting-label', label);
        } else {
          editor.removeAttribute('data-waiting-label');
        }
      } else {
        // Regular waiting - just dim the editor
        editor.classList.toggle('waiting', waiting);
        editor.classList.remove('waiting-user-interaction');
        editor.removeAttribute('data-waiting-label');
      }
    }
    // Emit state change event
    this.dispatchEvent(new CustomEvent('state-change', {
      detail: { state: this._state, providerType: this._waitingProviderType }
    }));
  }

  // ========== Suggestion Provider API ==========

  /**
   * Check if a string is a provider pattern (contains dots for codetac.standard.lang.tokenType format)
   */
  private _isProviderPattern(nameOrPattern: string): boolean {
    return nameOrPattern.split('.').length === 4;
  }

  /**
   * Register a suggestion provider for a token type
   *
   * Supports two registration modes:
   * 1. By ID: Referenced in grammar via 'provider' property (e.g., 'firId')
   * 2. By pattern: Matches tokens by grammar context (e.g., 'sa.*.*.temperature')
   *
   * Pattern format: codetac.standard.lang.tokenType (use * as wildcard)
   *
   * @param keys - Provider ID, pattern, or array of patterns
   * @param callback - Provider function that returns suggestions
   * @param config - Optional configuration (replace, cache, timeout, etc.)
   * @returns Unsubscribe function
   *
   * @example
   * // By ID (grammar must define: "provider": "firId")
   * editor.registerSuggestionProvider('firId', async (ctx) => [
   *   { text: 'LFPG', description: 'Paris CDG' }
   * ]);
   *
   * @example
   * // By pattern - all temperature tokens in METAR grammars
   * editor.registerSuggestionProvider('sa.*.*.temperature', async (ctx) => {
   *   const stationData = await fetchStationData();
   *   return [{ text: formatTemp(stationData.temp), description: 'From station' }];
   * });
   *
   * @example
   * // Multiple patterns with options
   * editor.registerSuggestionProvider(
   *   ['sa.*.*.temperature', 'sa.*.*.dewPoint'],
   *   async (ctx) => { ... },
   *   { cache: 'hour', replace: true }
   * );
   */
  registerSuggestionProvider(
    keys: string | string[],
    callback: SuggestionProviderFunction,
    config?: SuggestionProviderConfig
  ): () => void {
    const patterns = Array.isArray(keys) ? keys : [keys];
    const registeredKeys: string[] = [];
    const options: SuggestionProviderOptions = { provider: callback, ...config };

    for (const key of patterns) {
      if (this._isProviderPattern(key)) {
        this._providersByPattern.set(key, options);
      } else {
        // Name-based provider - register in parser
        this._providerCache.delete(key);
        this.parser.registerSuggestionProvider(key, callback, config);
      }
      registeredKeys.push(key);
    }

    return () => {
      for (const key of registeredKeys) {
        this.unregisterSuggestionProvider(key);
      }
    };
  }

  /**
   * Unregister a suggestion provider by ID or pattern
   * @param idOrPattern - Provider ID or pattern to unregister
   */
  unregisterSuggestionProvider(idOrPattern: string): void {
    if (this._isProviderPattern(idOrPattern)) {
      this._providersByPattern.delete(idOrPattern);
    } else {
      // Clear cache for this provider when unregistering
      this._providerCache.delete(idOrPattern);
      this.parser.unregisterSuggestionProvider(idOrPattern);
    }
  }

  /**
   * Check if a suggestion provider is registered for a token type
   * @param tokenType - Token type to check
   */
  hasSuggestionProvider(tokenType: string): boolean {
    if (this._isProviderPattern(tokenType)) {
      return this._providersByPattern.has(tokenType);
    }
    return this.parser.hasProvider(tokenType);
  }

  /**
   * Get all registered suggestion provider IDs and patterns
   */
  getRegisteredSuggestionProviders(): string[] {
    return [
      ...this.parser.getRegisteredProviders(),
      ...Array.from(this._providersByPattern.keys())
    ];
  }

  // ========== Validator Registration ==========

  /**
   * Check if a string is a pattern (contains dots for codetac.standard.lang.tokenType format)
   */
  private _isValidatorPattern(nameOrPattern: string): boolean {
    return nameOrPattern.split('.').length === 4;
  }

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
  registerValidator(nameOrPattern: string | string[], callback: ValidatorCallback, _options?: ValidatorOptions): () => void {
    const patterns = Array.isArray(nameOrPattern) ? nameOrPattern : [nameOrPattern];
    const registeredKeys: string[] = [];

    for (const key of patterns) {
      if (this._isValidatorPattern(key)) {
        this._validatorsByPattern.set(key, callback);
      } else {
        this._validatorsByName.set(key, callback);
      }
      registeredKeys.push(key);
    }

    // Re-tokenize to apply new validator
    this._tokenize();
    this.renderViewport();

    return () => {
      for (const key of registeredKeys) {
        this.unregisterValidator(key);
      }
    };
  }

  /**
   * Unregister a validator by name or pattern
   * @param nameOrPattern - Validator name or pattern to unregister
   */
  unregisterValidator(nameOrPattern: string): void {
    if (this._isValidatorPattern(nameOrPattern)) {
      this._validatorsByPattern.delete(nameOrPattern);
    } else {
      this._validatorsByName.delete(nameOrPattern);
    }
    // Re-tokenize to clear validation errors
    this._tokenize();
    this.renderViewport();
  }

  /**
   * Check if a validator is registered
   * @param nameOrPattern - Validator name or pattern to check
   */
  hasValidator(nameOrPattern: string): boolean {
    if (this._isValidatorPattern(nameOrPattern)) {
      return this._validatorsByPattern.has(nameOrPattern);
    }
    return this._validatorsByName.has(nameOrPattern);
  }

  /**
   * Get all registered validator names and patterns
   */
  getRegisteredValidators(): string[] {
    return [
      ...Array.from(this._validatorsByName.keys()),
      ...Array.from(this._validatorsByPattern.keys())
    ];
  }

  /**
   * Get a registered validator by name
   * @internal Used by parser for validation
   */
  getValidator(name: string): ValidatorCallback | undefined {
    return this._validatorsByName.get(name);
  }

  get value(): string {
    return this.lines.join('\n');
  }

  set value(val: string) {
    this.setValue(val);
  }

  /** Get the current locale (e.g., 'fr-FR', 'en') */
  get lang(): string {
    return this.getAttribute('lang') || 'en';
  }

  set lang(val: string) {
    this.setAttribute('lang', val);
  }

  /**
   * Get the supported TAC codes (e.g., SA, SP, FT, FC, WS, WV, WC, WA, FV, FK, FN)
   * @returns Array of TAC codes
   */
  get messageTypes(): string[] {
    const attr = this.getAttribute('message-types');
    if (!attr) return DEFAULT_TAC_CODES;

    // Parse as comma-separated list
    // Supports: "SA,SP,FT" or "SA, SP, FT" or "SA,SP,WS,WC,WV"
    const codes = attr.split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => findMessageType(t) !== undefined);

    return codes.length > 0 ? codes : DEFAULT_TAC_CODES;
  }

  /** Get message types for menu display (deduplicated by name) */
  get menuMessageTypes(): MessageTypeConfig[] {
    const rawCodes = this.messageTypes;
    const seen = new Set<string>();
    const result: MessageTypeConfig[] = [];

    for (const code of rawCodes) {
      const config = findMessageType(code);
      if (config && !seen.has(config.name)) {
        seen.add(config.name);
        result.push(config);
      }
    }

    return result;
  }

  set messageTypes(val: string[]) {
    this.setAttribute('message-types', val.join(','));
  }

  /**
   * @deprecated Use messageTypes instead
   */
  get types(): string[] {
    // Convert TAC codes to message type names for backward compatibility
    return this.messageTypes.map(code => {
      const config = findMessageType(code);
      return config ? config.name : code;
    });
  }

  /**
   * Get message type configurations for suggestions
   */
  get messageTypeConfigs(): Array<{tacCode: string; name: string; grammar: string; description: string; hasSubMenu?: boolean}> {
    return this.menuMessageTypes.map(config => ({
      tacCode: patternToTacCode(config.pattern), // Convert pattern to valid tacCode
      name: config.name,
      grammar: config.grammar,
      description: config.description,
      hasSubMenu: config.secondWordIdentifier // SIGMET/AIRMET show grammar suggestions
    }));
  }

  set types(val: string[]) {
    console.warn('tac-editor: "types" property is deprecated, use "messageTypes" instead');
    // Try to convert message type names to TAC codes
    const codes = val.map(name => {
      const upperName = name.toUpperCase();
      const config = MESSAGE_TYPES.find(mt => mt.name.toUpperCase() === upperName);
      // Return a simple pattern (first char match)
      return config ? config.pattern.replace(/\[.*\]/, config.pattern.charAt(config.pattern.indexOf('[') + 1) || '') : null;
    }).filter((c): c is string => c !== null);
    this.messageTypes = codes;
  }

  /** Get the grammars URL base */
  get grammarsUrl(): string {
    return this.getAttribute('grammars-url') || './grammars';
  }

  set grammarsUrl(val: string) {
    this.setAttribute('grammars-url', val);
  }

  /** Disable grammar caching (adds timestamp to URL) */
  get noCache(): boolean {
    return this.hasAttribute('no-cache');
  }

  set noCache(val: boolean) {
    if (val) {
      this.setAttribute('no-cache', '');
    } else {
      this.removeAttribute('no-cache');
    }
  }

  /** Get the grammar standard (oaci, us, etc.) - defaults to 'oaci' */
  get standard(): string {
    return this.getAttribute('standard') || 'oaci';
  }

  set standard(val: string) {
    this.setAttribute('standard', val);
  }

  get tokens(): Token[] {
    return [...this._tokens];
  }

  get suggestions(): Suggestion[] {
    return [...this._suggestions];
  }

  get messageType(): string | null {
    return this._messageType;
  }

  get isValid(): boolean {
    return this.parser.validate(this.value).valid;
  }

  get errors(): ValidationError[] {
    return this.parser.validate(this.value).errors;
  }

  // ========== Initial Render ==========
  render(): void {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;

    const template = document.createElement('div');
    template.innerHTML = getTemplate(VERSION);

    this.shadowRoot!.innerHTML = '';
    this.shadowRoot!.appendChild(styleEl);
    while (template.firstChild) {
      this.shadowRoot!.appendChild(template.firstChild);
    }
  }

  // ========== Event Listeners ==========
  setupEventListeners(): void {
    const hiddenTextarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    const viewport = this.shadowRoot!.getElementById('viewport')!;
    const suggestionsContainer = this.shadowRoot!.getElementById('suggestionsContainer')!;

    // Mouse events on viewport - capture clicks and focus hidden textarea
    viewport.addEventListener('mousedown', (e: MouseEvent) => {
      // Check if clicking the template exit button
      const target = e.target as HTMLElement;
      if (target.classList.contains('template-exit-btn')) {
        e.preventDefault();
        e.stopPropagation();
        this._clearMessageType();
        return;
      }

      e.preventDefault(); // Prevent text selection in viewport
      this._isSelecting = true;
      this.handleMouseDown(e);
      hiddenTextarea.focus();
    });

    viewport.addEventListener('click', (e: MouseEvent) => {
      // Ignore if clicking template exit button
      const target = e.target as HTMLElement;
      if (target.classList.contains('template-exit-btn')) {
        return;
      }
      hiddenTextarea.focus();
    });

    // Double-click to select word
    viewport.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      this.handleDoubleClick(e);
      hiddenTextarea.focus();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this._isSelecting) {
        this.handleMouseMove(e);
      }
    });

    document.addEventListener('mouseup', () => {
      this._isSelecting = false;
    });

    // Keyboard input via hidden textarea
    hiddenTextarea.addEventListener('input', (e: Event) => this.handleInput(e as InputEvent));
    hiddenTextarea.addEventListener('keydown', (e: KeyboardEvent) => this.handleKeyDown(e));
    hiddenTextarea.addEventListener('focus', () => this.handleFocus());
    hiddenTextarea.addEventListener('blur', () => this.handleBlur());

    // Scroll synchronization
    viewport.addEventListener('scroll', () => this.handleScroll());

    // Suggestions: prevent mousedown from causing blur on textarea
    suggestionsContainer.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
    });
    // Suggestions click
    suggestionsContainer.addEventListener('click', (e: MouseEvent) => this.handleSuggestionClick(e));

    // Info button click - toggle popup
    const infoBtn = this.shadowRoot!.getElementById('infoBtn');
    const infoPopup = this.shadowRoot!.getElementById('infoPopup');
    if (infoBtn && infoPopup) {
      infoBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        infoPopup.classList.toggle('visible');
      });
      // Close popup when clicking outside
      document.addEventListener('click', () => {
        infoPopup.classList.remove('visible');
      });
    }

    // Clear button click
    const clearBtn = this.shadowRoot!.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }

    // Close suggestions popup on page scroll
    window.addEventListener('scroll', () => {
      if (this._showSuggestions) {
        this._hideSuggestions();
      }
    }, { passive: true });

    // Prevent default context menu
    viewport.addEventListener('contextmenu', (e: Event) => e.preventDefault());
  }

  // ========== Grammar Loading ==========
  private _isReady: boolean = false;
  private _readyPromise: Promise<void> | null = null;
  private _readyResolve: (() => void) | null = null;
  private _pendingGrammarLoad: Promise<boolean> | null = null;
  private _lastGrammarLoadPromise: Promise<boolean> | null = null;

  /** Initialize editor - no grammars are loaded until a type is detected */
  private _loadDefaultGrammars(): void {
    // Create ready promise if not exists
    if (!this._readyPromise) {
      this._readyPromise = new Promise(resolve => {
        this._readyResolve = resolve;
      });
    }

    // Editor is ready immediately - grammars will be loaded on demand
    this._onReady();
  }

  private _onReady(): void {
    this._isReady = true;
    if (this._readyResolve) {
      this._readyResolve();
    }
    this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }));
  }

  /** Returns a promise that resolves when the editor is ready */
  whenReady(): Promise<void> {
    if (this._isReady) {
      return Promise.resolve();
    }
    if (!this._readyPromise) {
      this._readyPromise = new Promise(resolve => {
        this._readyResolve = resolve;
      });
    }
    return this._readyPromise;
  }

  /** Check if the editor is ready */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Get the TAC identifier from current text (supports multi-token identifiers)
   * @returns The TAC identifier (e.g., "METAR", "SIGMET", "VA ADVISORY") or null
   */
  private _getMessageIdentifier(): string | null {
    const text = this.value.trim().toUpperCase();
    if (!text) return null;

    const words = text.split(/\s+/);
    const firstWord = words[0];
    if (!firstWord) return null;

    // Check for multi-token identifiers (VA ADVISORY, TC ADVISORY)
    const multiTokenCandidates = MULTI_TOKEN_IDENTIFIERS[firstWord];
    if (multiTokenCandidates) {
      for (const identifier of multiTokenCandidates) {
        if (text.startsWith(identifier)) {
          return identifier;
        }
      }
    }

    // Return single-token identifier if it's a known TAC identifier
    if (IDENTIFIER_TO_TAC_CODES[firstWord]) {
      return firstWord;
    }

    // Check for SIGMET/AIRMET where identifier is second word (after FIR code)
    // Format: LFFF SIGMET 1 VALID...
    if (/^[A-Z]{4}$/.test(firstWord)) {
      if (words.length >= 2) {
        const secondWord = words[1];
        if (IDENTIFIER_TO_TAC_CODES[secondWord]) {
          return secondWord;
        }
      }
      // First word is ICAO code - speculatively return SIGMET for suggestions
      return 'SIGMET';
    }

    return firstWord; // Return first word even if not recognized (for suggestions)
  }

  /**
   * Get TAC code from identifier and supported message types
   * @param identifier - The TAC identifier (e.g., "METAR", "SIGMET")
   * @returns The best matching TAC code or null
   */
  private _getTacCodeFromIdentifier(identifier: string): string | null {
    const possibleCodes = IDENTIFIER_TO_TAC_CODES[identifier];
    if (!possibleCodes || possibleCodes.length === 0) return null;

    // Filter by supported message types
    const supportedCodes = possibleCodes.filter(code => this.messageTypes.includes(code));
    if (supportedCodes.length === 0) return null;

    // If only one code matches, use it
    if (supportedCodes.length === 1) return supportedCodes[0];

    // Multiple codes match - return the first one for now
    // TODO: Disambiguate based on content (e.g., TAF validity period for FT vs FC)
    return supportedCodes[0];
  }

  /**
   * Load a grammar with inheritance resolution
   * @param grammarName - Base name of the grammar, or "name.standard" format
   * @returns Promise that resolves to true if grammar was loaded successfully
   */
  private async _loadGrammarWithInheritance(grammarName: string): Promise<boolean> {
    // Parse name.standard format (e.g., "report.oaci" -> name="report", standard="oaci")
    let baseName = grammarName;
    let explicitStandard: string | undefined;
    if (grammarName.includes('.')) {
      const parts = grammarName.split('.');
      baseName = parts[0];
      explicitStandard = parts[1];
    }

    // Use unique key for tracking: name:standard (or name:current if no explicit standard)
    const effectiveStandard = explicitStandard || this.standard;
    const loadKey = `${baseName}:${effectiveStandard}`;

    // Check if already loaded with this standard
    if (this._loadedGrammars.has(loadKey)) {
      return true;
    }

    // Mark as loading to prevent infinite loops
    this._loadedGrammars.add(loadKey);

    // Load the grammar file
    const grammar = await this._fetchGrammar(baseName, explicitStandard);
    if (!grammar) {
      this._loadedGrammars.delete(loadKey);
      return false;
    }

    // Check if grammar has parent (inheritance)
    if (grammar.extends) {
      // Load parent grammar first (recursively handles inheritance chain)
      const parentLoaded = await this._loadGrammarWithInheritance(grammar.extends);
      if (!parentLoaded) {
        console.warn(`Failed to load parent grammar '${grammar.extends}' for '${baseName}'`);
        // Continue anyway - we'll use the grammar without inheritance
      }
    }

    // Register grammar with unique key (parser will resolve inheritance when resolveInheritance is called)
    this.parser.registerGrammar(loadKey, grammar as Grammar);

    // Also register with base name for lookups (last one wins)
    this.parser.registerGrammar(baseName, grammar as Grammar);

    // Resolve inheritance for all loaded grammars
    this.parser.resolveInheritance();

    // Re-tokenize if we have content
    if (this.value) {
      this._tokenize();
      this._invalidateRenderCache();
      this.renderViewport();
      this._updateStatus();
    }

    return true;
  }

  /**
   * Fetch a grammar file with standard and locale fallback
   * @param grammarName - Base name of the grammar
   * @param forceStandard - Optional: force a specific standard (skips fallback chain for standard)
   * @returns The grammar object or null if not found
   */
  private async _fetchGrammar(grammarName: string, forceStandard?: string): Promise<Grammar | null> {
    const fallbackChain = forceStandard
      ? this._getGrammarFallbackChain().filter(item => item.standard === forceStandard || item.standard === 'oaci')
      : this._getGrammarFallbackChain();
    const triedUrls: string[] = [];

    for (const { standard, locale } of fallbackChain) {
      const url = this._getGrammarUrl(grammarName, standard, locale);
      triedUrls.push(`${standard}.${locale}`);
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          let grammar: Grammar;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            grammar = await response.json();
          } else {
            const text = await response.text();
            if (text.startsWith('export default ')) {
              try {
                grammar = JSON.parse(text.replace(/^export default /, '').replace(/;$/, ''));
              } catch (parseError) {
                console.warn(`Grammar parse error for ${url}:`, parseError);
                continue;
              }
            } else {
              try {
                grammar = JSON.parse(text);
              } catch (parseError) {
                console.warn(`Grammar parse error for ${url}:`, parseError);
                continue;
              }
            }
          }
          return grammar;
        }
      } catch (e) {
        // Continue to next fallback
      }
    }

    console.warn(`Grammar not found: ${grammarName} (tried: ${triedUrls.join(', ')})`);
    return null;
  }

  /**
   * Get effective locale (resolve 'auto' to browser language)
   */
  private _getEffectiveLocale(): string {
    const lang = this.getAttribute('lang') || 'en';
    if (lang === 'auto') {
      // Use browser language, extract base language code
      const browserLang = navigator.language || 'en';
      return browserLang.split('-')[0];
    }
    return lang;
  }

  /**
   * Get fallback chain for standard and locale
   * e.g., standard="us", locale="fr" →
   *   [["us", "fr"], ["oaci", "fr"], ["oaci", "en"]]
   */
  private _getGrammarFallbackChain(): Array<{ standard: string; locale: string }> {
    const chain: Array<{ standard: string; locale: string }> = [];
    const standard = this.standard;
    const locale = this._getEffectiveLocale();

    // 1. Requested standard + requested locale
    chain.push({ standard, locale });

    // 2. If locale has region (fr-FR), try base locale (fr)
    if (locale.includes('-')) {
      chain.push({ standard, locale: locale.split('-')[0] });
    }

    // 3. If not OACI, fallback to OACI with requested locale
    if (standard !== 'oaci') {
      chain.push({ standard: 'oaci', locale });
      if (locale.includes('-')) {
        chain.push({ standard: 'oaci', locale: locale.split('-')[0] });
      }
    }

    // 4. If not English, try English
    if (locale !== 'en' && !locale.startsWith('en')) {
      if (standard !== 'oaci') {
        chain.push({ standard, locale: 'en' });
      }
      chain.push({ standard: 'oaci', locale: 'en' });
    }

    // Remove duplicates
    const seen = new Set<string>();
    return chain.filter(item => {
      const key = `${item.standard}.${item.locale}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get URL for grammar file with standard and locale
   */
  private _getGrammarUrl(grammarName: string, standard: string, locale: string): string {
    const baseUrl = `${this.grammarsUrl}/${grammarName}.${standard}.${locale}.json`;
    if (this.noCache) {
      return `${baseUrl}?_=${Date.now()}`;
    }
    return baseUrl;
  }

  /** Manually load a grammar */
  loadGrammar(name: string, grammar: Grammar): void {
    this.parser.registerGrammar(name, grammar);
    this._loadedGrammars.add(name);
  }

  /**
   * Load grammar from URL with locale fallback and inheritance resolution
   */
  async loadGrammarFromUrl(name: string): Promise<boolean> {
    return this._loadGrammarWithInheritance(name);
  }

  // ========== Value Management ==========
  setValue(text: string | null | undefined): void {
    if (text === null || text === undefined) text = '';

    // Normalize text format for specific message types
    text = this._normalizeInputText(text);

    this.lines = text.split('\n');
    if (this.lines.length === 0) this.lines = [''];

    this.cursorLine = 0;
    this.cursorColumn = 0;
    this.selectionStart = null;
    this.selectionEnd = null;

    // Invalidate render and wrap caches to force re-render
    this._lastStartIndex = -1;
    this._lastEndIndex = -1;
    this._lastTotalLines = -1;
    this._lastContentHash = '';
    this._invalidateWrapCache();

    // Detect message type - this may trigger async grammar loading
    const messageIdentifier = this._getMessageIdentifier();
    const tacCode = messageIdentifier ? this._getTacCodeFromIdentifier(messageIdentifier) : null;
    const grammarConfig = tacCode ? findMessageType(tacCode) : null;
    const grammarLoadKey = grammarConfig ? `${grammarConfig.grammar}:${this.standard}` : null;
    const grammarAlreadyLoaded = grammarLoadKey && this._loadedGrammars.has(grammarLoadKey);

    if (grammarAlreadyLoaded) {
      // Grammar is already loaded - tokenize synchronously
      this._detectMessageType();
      this._tokenize();
      this.renderViewport();
      this._updateStatus();
      this._emitChange();
    } else if (grammarConfig) {
      // Grammar needs to be loaded - trigger load and wait for callback
      // Clear tokens to avoid showing error state while loading
      this._tokens = [];
      this._detectMessageType();
      // _detectMessageType's .then() callback will handle tokenization after grammar loads
      this.renderViewport();
      this._emitChange();
    } else {
      // No grammar needed (empty text or unknown type)
      this._detectMessageType();
      this._tokenize();
      this.renderViewport();
      this._updateStatus();
      this._emitChange();
    }
  }

  /**
   * Normalize input text to fix common format variations
   * This allows pasting messages from different sources that may have slight format differences
   */
  private _normalizeInputText(text: string): string {
    const config = findTemplateNormConfig(text);
    if (config) {
      return this._normalizeTemplateText(text, config);
    }
    return text;
  }

  /**
   * Normalize template text (VAA, TCA) format variations
   * Fixes labels to match the expected template format using the provided config
   */
  private _normalizeTemplateText(text: string, config: TemplateNormConfig): string {
    const { identifier, labelMappings } = config;
    const lines = text.split('\n');
    const normalizedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines and identifier line
      if (!trimmedLine || trimmedLine === identifier) {
        normalizedLines.push(line);
        continue;
      }

      // Try to match and normalize a label
      let matched = false;
      for (const mapping of labelMappings) {
        const match = trimmedLine.match(mapping.pattern);
        if (match) {
          // Extract value after the matched label pattern
          const valueStart = trimmedLine.indexOf(':') + 1;
          let value = trimmedLine.substring(valueStart).trim();

          // Apply optional value transformation
          if (mapping.transformValue) {
            value = mapping.transformValue(value);
          }

          // Build normalized line with proper padding
          const paddedLabel = mapping.label.padEnd(TEMPLATE_LABEL_COLUMN_WIDTH, ' ');
          normalizedLines.push(paddedLabel + value);
          matched = true;
          break;
        }
      }

      // If no label matched, keep line as-is (continuation of previous value)
      if (!matched) {
        // Indent continuation lines to align with values
        if (trimmedLine && !trimmedLine.startsWith(identifier)) {
          normalizedLines.push(' '.repeat(TEMPLATE_LABEL_COLUMN_WIDTH) + trimmedLine);
        } else {
          normalizedLines.push(line);
        }
      }
    }

    return normalizedLines.join('\n');
  }

  clear(): void {
    this.lines = [''];
    this.cursorLine = 0;
    this.cursorColumn = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this._messageType = null;
    this._currentTacCode = null;
    this._tokens = [];
    this.parser.reset();

    // Invalidate render cache to force re-render
    this._lastStartIndex = -1;
    this._lastEndIndex = -1;
    this._lastTotalLines = -1;
    this._lastContentHash = '';

    this.renderViewport();
    this._updateStatus();
    this._emitChange();
    this.focus();
  }

  focus(): void {
    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    textarea?.focus();
  }

  // ========== Message Type Detection ==========
  /** Reset all message type related state */
  private _resetMessageTypeState(): void {
    this._messageType = null;
    this._currentTacCode = null;
    this._isTemplateMode = false;
    this._templateRenderer.reset();
    this.parser.reset();
    this.parser.setGrammarContext(null, null, null);
    this._lastGrammarLoadPromise = null;
    this._forceTacCode = null;
    this._switchedGrammarName = null;
  }

  /** Apply grammar after it's loaded (sync or async) */
  private _applyLoadedGrammar(grammarName: string, messageIdentifier: string, triggerRender: boolean = false): void {
    // Use grammar key with standard (e.g., "sa:noaa" instead of just "sa")
    const grammarKey = `${grammarName}:${this.standard}`;
    this.parser.setGrammar(grammarKey);
    this._messageType = grammarKey;

    // Set grammar context for pattern-based validators
    // Use the actual TAC code (e.g., 'ft', 'fc') for pattern matching, not the base grammar name ('taf')
    // this._currentTacCode is set in _detectMessageType before calling _applyLoadedGrammar
    // this.standard is the regional standard (e.g., 'oaci', 'noaa')
    // _getEffectiveLocale() returns the effective locale (e.g., 'en', 'fr')
    // Convert to lowercase for pattern matching (TAC codes are uppercase in IDENTIFIER_TO_TAC_CODES
    // but provider patterns use lowercase like 'ft.*.*.icao')
    const tacCodeForContext = (this._currentTacCode || grammarName).toLowerCase();
    this.parser.setGrammarContext(tacCodeForContext, this.standard, this._getEffectiveLocale());

    this._checkTemplateMode(messageIdentifier);

    if (triggerRender) {
      this._tokenize();
      this._invalidateRenderCache();
      this.renderViewport();
      this._updateStatus();
      this._emitChange();
    }
  }

  private _detectMessageType(): void {
    const messageIdentifier = this._getMessageIdentifier();

    // No identifier found - reset state
    if (!messageIdentifier) {
      this._resetMessageTypeState();
      return;
    }

    // Check if switched grammar is still valid for this identifier
    if (this._switchedGrammarName && this._isSwitchedGrammarValidForIdentifier(messageIdentifier)) {
      this.parser.setGrammar(this._switchedGrammarName);
      // Also set grammar context for validators and providers (e.g., 'fc' for TAF Short)
      this.parser.setGrammarContext(this._switchedGrammarName.toLowerCase(), this.standard, this._getEffectiveLocale());
      // Update TAC code to match switched grammar (e.g., 'FC' for TAF Short)
      this._currentTacCode = this._switchedGrammarName.toUpperCase();
      this._messageType = this._switchedGrammarName;
      this._lastGrammarLoadPromise = Promise.resolve(true);
      return;
    }

    // Clear switched grammar if identifier changed
    this._switchedGrammarName = null;

    // Get TAC code (forced or detected from identifier)
    const tacCode = this._forceTacCode || this._getTacCodeFromIdentifier(messageIdentifier);
    this._forceTacCode = null;

    const grammarConfig = tacCode ? findMessageType(tacCode) : null;
    if (!grammarConfig) {
      // Message type not allowed or not recognized
      this._resetMessageTypeState();
      return;
    }

    const grammarName = grammarConfig.grammar;
    const grammarLoadKey = `${grammarName}:${this.standard}`;
    this._currentTacCode = tacCode;

    // Load grammar if needed, then apply
    if (!this._loadedGrammars.has(grammarLoadKey)) {
      this._lastGrammarLoadPromise = this._loadGrammarWithInheritance(grammarName).then(loaded => {
        if (loaded) {
          this._applyLoadedGrammar(grammarName, messageIdentifier, true);
        }
        return loaded;
      });
    } else {
      this._applyLoadedGrammar(grammarName, messageIdentifier, false);
      this._lastGrammarLoadPromise = Promise.resolve(true);
    }
  }

  /**
   * Check if the switched grammar is still valid for the given identifier
   * e.g., 'ws' grammar is valid for 'SIGMET' identifier
   * For TAF (fc/ft), also check if validityPeriod is present - if not, return false
   * so the user gets the TAF Short/Long choice again
   */
  private _isSwitchedGrammarValidForIdentifier(identifier: string): boolean {
    if (!this._switchedGrammarName) return false;

    // Map grammar names to their parent identifiers
    const grammarToIdentifier: Record<string, string> = {
      'ws': 'SIGMET',
      'wv': 'SIGMET',
      'wc': 'SIGMET',
      'ft': 'TAF',
      'fc': 'TAF'
    };

    const expectedIdentifier = grammarToIdentifier[this._switchedGrammarName];
    if (expectedIdentifier !== identifier) return false;

    // For TAF (fc/ft), check if user deleted the validityPeriod
    // Only revert to TAF base if there's content after issueTime that's NOT a validityPeriod
    // This allows the user to stay in FC/FT while typing the validityPeriod
    if (this._switchedGrammarName === 'fc' || this._switchedGrammarName === 'ft') {
      // Pattern: TAF [AMD|COR]? ICAO DDHHmmZ [content after]
      const afterIssueTimeMatch = this.value.match(/\d{6}Z\s+(.+)/);
      if (afterIssueTimeMatch) {
        const contentAfterIssueTime = afterIssueTimeMatch[1].trim();
        // If there's content after issueTime, check if it starts with a validityPeriod (or partial)
        // Use a permissive pattern to allow typing in editable zones (e.g., "0806/0900" or "0806//090000")
        // Accept: digits followed by optional slash(es) and more digits
        const startsWithValidity = /^\d+[\/]*\d*/.test(contentAfterIssueTime);
        if (contentAfterIssueTime.length > 0 && !startsWithValidity) {
          // Content exists but is not a validityPeriod - user may have deleted it
          return false;
        }
      }
      // No content after issueTime or content is/starts with validityPeriod - keep switched grammar
    }

    return true;
  }

  /**
   * Check if the current grammar uses template mode and initialize it
   */
  private _checkTemplateMode(messageIdentifier: string): void {
    const grammar = this.parser.currentGrammar;
    if (grammar?.templateMode && grammar.template) {
      // Check if the content has proper multiline format for template mode
      // Template mode requires line breaks between fields
      const hasMultipleLines = this.value.includes('\n');
      const contentWithoutWhitespace = this.value.trim();
      const isJustIdentifier = contentWithoutWhitespace === messageIdentifier;

      if (!hasMultipleLines && !isJustIdentifier && contentWithoutWhitespace.length > messageIdentifier.length) {
        // Single-line content that's more than just the identifier - don't use template mode
        // This handles cases where VAA is pasted without line breaks
        this._isTemplateMode = false;
        this._templateRenderer.reset();
        return;
      }

      // Only initialize template if not already active with same identifier
      const needsInit = !this._isTemplateMode ||
                        !this._templateRenderer.isActive ||
                        this._templateRenderer.identifier !== messageIdentifier;

      this._isTemplateMode = true;

      if (needsInit) {
        this._templateRenderer.initialize(grammar.template, messageIdentifier);

        // If content is just the identifier (possibly with newline), generate full template
        if (isJustIdentifier || (hasMultipleLines && contentWithoutWhitespace === messageIdentifier)) {
          this._applyTemplateMode();
        } else if (this.value.trim() && hasMultipleLines) {
          // If there's existing content with line breaks, parse it to extract values
          this._templateRenderer.parseText(this.value);
          // Rebuild lines from template state to ensure proper column alignment
          const templateText = this._templateRenderer.generateText();
          this.lines = templateText.split('\n');

          // Position cursor at the first editable field
          const state = this._templateRenderer.state;
          if (state && state.fields.length > 0) {
            const firstField = state.fields[0];
            this.cursorLine = firstField.lineIndex;
            this.cursorColumn = state.labelColumnWidth;
            this._clearSelection();
          }
        }
      }
    } else {
      this._isTemplateMode = false;
      this._templateRenderer.reset();
    }
  }

  /**
   * Apply template mode: generate full template and position cursor at first editable field
   * Called when selecting a message identifier that has template mode enabled
   */
  private _applyTemplateMode(): void {
    if (!this._isTemplateMode || !this._templateRenderer.isActive) return;

    // Generate the full template text
    const templateText = this._templateRenderer.generateText();

    // Set the content
    this.lines = templateText.split('\n');

    // Position cursor at the first editable field's value position
    const state = this._templateRenderer.state;
    if (state && state.fields.length > 0) {
      const firstField = state.fields[0];
      // Position on the first field's line, after the label column
      this.cursorLine = firstField.lineIndex;
      this.cursorColumn = state.labelColumnWidth;
      this._clearSelection();

      // Show field-specific suggestions for the first field
      this._forceShowSuggestions();
    }
  }

  /**
   * Navigate to the next template field (Tab key)
   * @returns true if navigation occurred, false otherwise
   */
  private _navigateToNextTemplateField(): boolean {
    if (!this._isTemplateMode || !this._templateRenderer.isActive) return false;

    const nextField = this._templateRenderer.focusNextField();
    if (nextField) {
      this._focusTemplateField(nextField);
      return true;
    }
    return false;
  }

  /**
   * Navigate to the previous template field (Shift+Tab)
   * @returns true if navigation occurred, false otherwise
   */
  private _navigateToPreviousTemplateField(): boolean {
    if (!this._isTemplateMode || !this._templateRenderer.isActive) return false;

    const prevField = this._templateRenderer.focusPreviousField();
    if (prevField) {
      this._focusTemplateField(prevField);
      return true;
    }
    return false;
  }

  /**
   * Focus a specific template field and select its value
   */
  private _focusTemplateField(field: import('./template-renderer.js').RenderedField): void {
    const state = this._templateRenderer.state;
    if (!state) return;

    // Position cursor at the field's value position
    this.cursorLine = field.lineIndex;
    this.cursorColumn = state.labelColumnWidth;

    // Select the current value for immediate editing
    const valueLength = field.value.length;
    if (valueLength > 0) {
      this.selectionStart = { line: this.cursorLine, column: this.cursorColumn };
      this.selectionEnd = { line: this.cursorLine, column: this.cursorColumn + valueLength };
      this.cursorColumn = this.cursorColumn + valueLength;
    } else {
      this.selectionStart = null;
      this.selectionEnd = null;
    }

    // Scroll to show the field
    this._ensureCursorVisible();
    this.renderViewport();

    // Show field-specific suggestions automatically
    this._forceShowSuggestions();
  }

  /** Wait for any pending grammar load to complete */
  async waitForGrammarLoad(): Promise<boolean> {
    if (this._lastGrammarLoadPromise) {
      return this._lastGrammarLoadPromise;
    }
    return Promise.resolve(false);
  }

  // ========== Tokenization ==========
  private _tokenize(): void {
    if (this._isTemplateMode && this._templateRenderer.isActive) {
      this._tokens = this._templateRenderer.tokenize();
    } else {
      this._tokens = this.parser.tokenize(this.value);
    }
  }

  // ========== Input Handling ==========
  handleInput(_e: InputEvent): void {
    if (this.readonly) return;

    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    let inputValue = textarea.value;

    // If no input value, nothing to do (Backspace/Delete handled in keydown)
    if (!inputValue) return;

    // Force uppercase for TAC messages
    inputValue = inputValue.toUpperCase();

    // Clear textarea after processing
    textarea.value = '';

    // Non-destructive filtering: when suggestions are shown, filter without inserting
    if (this._showSuggestions && this._unfilteredSuggestions.length > 0) {
      const newFilter = this._suggestionFilter + inputValue;

      // Check if any suggestions would match the new filter
      const wouldMatch = this._unfilteredSuggestions.some(sug => {
        const text = sug.text.toUpperCase();
        return text.startsWith(newFilter) || text.includes(newFilter);
      });

      if (wouldMatch) {
        // Suggestions match - just update filter, don't insert in editor
        this._suggestionFilter = newFilter;
        this._filterSuggestions();
        return;
      } else {
        // No match - insert accumulated filter + new input into editor
        this._hideSuggestions();
        inputValue = newFilter;
        this._suggestionFilter = '';
      }
    }

    // Save state BEFORE making changes
    this._saveToHistory();

    // Check if we're in editable mode and about to replace the selection
    const wasInEditable = this._currentEditable !== null;

    // Clear selection if any before inserting
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    }

    // Insert the typed text at cursor position
    this.insertText(inputValue);

    // If we were in editable mode, check if the editable region is now complete
    if (wasInEditable && this._currentEditable) {
      // Get the current text in the editable region
      const line = this.lines[this.cursorLine] || '';
      const editableText = line.substring(
        this._currentEditable.editableStart,
        this.cursorColumn
      );

      // Get the expected length of this editable region
      const currentRegion = this._currentEditable.regions[this._currentEditable.currentRegionIndex];
      const expectedLength = currentRegion.end - currentRegion.start;

      // Check if we have reached the expected number of digits for this region
      const digitPattern = new RegExp(`^\\d{${expectedLength}}$`);
      if (digitPattern.test(editableText)) {
        // Check if there are more editable regions to navigate to
        if (this._currentEditable.currentRegionIndex < this._currentEditable.regions.length - 1) {
          // Navigate to next editable region
          this._navigateToEditableRegion(this._currentEditable.currentRegionIndex + 1);
        } else {
          // Last region - auto-validate the editable and show next suggestions
          this._validateEditableAndMoveNext();
        }
        return;
      }
    }

    this._afterEdit();
  }

  handleKeyDown(e: KeyboardEvent): void {
    // Ctrl+Enter: Force new line (always works, even with popup visible)
    const isCtrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && isCtrl) {
      e.preventDefault();
      this._hideSuggestions();
      if (this._currentEditable) {
        this._currentEditable = null;
      }
      this._saveToHistory();
      if (this.selectionStart && this.selectionEnd) {
        this.deleteSelection();
      }
      this.insertNewline();
      this._afterEdit();
      return;
    }

    // Template mode Tab navigation (priority over suggestions)
    if (e.key === 'Tab' && this._isTemplateMode && !this._currentEditable) {
      if (this._handleTemplateTabKey(e)) return;
    }

    // Suggestions navigation when popup is visible
    if (this._showSuggestions && this._handleSuggestionsKeyDown(e)) return;

    // Ctrl+Space for suggestions
    if ((e.key === ' ' || e.code === 'Space') && e.ctrlKey) {
      if (this._handleCtrlSpaceKey(e)) return;
    }

    // Editing keys
    if (e.key === 'Backspace' && this._handleBackspaceKey(e)) return;
    if (e.key === 'Delete' && this._handleDeleteKey(e)) return;
    if (e.key === 'Enter' && this._handleEnterKey(e)) return;
    if (e.key === 'Tab' && this._handleTabKey(e)) return;

    // Arrow keys and navigation
    this._handleArrowKeys(e);

    // Keyboard shortcuts (Ctrl+A, Ctrl+S, etc.)
    this._handleShortcutKeys(e);

    this.renderViewport();
  }

  /** Handle Tab key in template mode */
  private _handleTemplateTabKey(e: KeyboardEvent): boolean {
    e.preventDefault();
    this._hideSuggestions();
    if (e.shiftKey) {
      this._navigateToPreviousTemplateField();
    } else {
      this._navigateToNextTemplateField();
    }
    return true;
  }

  /** Handle keyboard navigation when suggestions popup is visible */
  private _handleSuggestionsKeyDown(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        // Skip non-selectable suggestions
        let nextDown = this._selectedSuggestion + 1;
        while (nextDown < this._suggestions.length && this._suggestions[nextDown].selectable === false) {
          nextDown++;
        }
        if (nextDown < this._suggestions.length) {
          this._selectedSuggestion = nextDown;
        }
        this._renderSuggestions();
        this._scrollSuggestionIntoView();
        return true;

      case 'ArrowUp':
        e.preventDefault();
        // Skip non-selectable suggestions
        let nextUp = this._selectedSuggestion - 1;
        while (nextUp >= 0 && this._suggestions[nextUp].selectable === false) {
          nextUp--;
        }
        if (nextUp >= 0) {
          this._selectedSuggestion = nextUp;
        }
        this._renderSuggestions();
        this._scrollSuggestionIntoView();
        return true;

      case 'Enter':
      case 'Tab':
        if (this._suggestions.length > 0) {
          const selectedSug = this._suggestions[this._selectedSuggestion];
          // Don't apply non-selectable suggestions
          if (selectedSug.selectable === false) {
            return true;
          }
          e.preventDefault();
          this._applySuggestion(selectedSug);
          return true;
        }
        return false;

      case 'Escape':
        e.preventDefault();
        if (this._suggestionMenuStack.length > 0) {
          this._goBackToParentMenu();
        } else {
          this._hideSuggestions();
          // Reset grammar state if editor is empty
          if (this.value.trim() === '') {
            this.parser.currentGrammar = null;
            this.parser.currentGrammarName = null;
            this._currentTacCode = null;
            this._forceTacCode = null;
            this._updateStatus();
          }
        }
        return true;

      default:
        return false;
    }
  }

  /** Handle Ctrl+Space for showing suggestions */
  private _handleCtrlSpaceKey(e: KeyboardEvent): boolean {
    e.preventDefault();
    e.stopPropagation();

    // If in editable mode, validate the editable first before showing suggestions
    if (this._currentEditable) {
      this.selectionStart = null;
      this.selectionEnd = null;
      this._currentEditable = null;
      this._tokenize();
    }

    if (this._showSuggestions && this._suggestionMenuStack.length > 0) {
      this._goBackToParentMenu();
    } else {
      this._forceShowSuggestions();
    }
    return true;
  }

  /** Handle Backspace key */
  private _handleBackspaceKey(e: KeyboardEvent): boolean {
    e.preventDefault();
    // Non-destructive filtering: remove from filter first if suggestions shown
    if (this._showSuggestions && this._suggestionFilter.length > 0) {
      this._suggestionFilter = this._suggestionFilter.slice(0, -1);
      this._filterSuggestions();
      return true;
    }
    this._saveToHistory();
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    } else {
      this.deleteBackward();
    }
    this._afterEdit();
    return true;
  }

  /** Handle Delete key */
  private _handleDeleteKey(e: KeyboardEvent): boolean {
    e.preventDefault();
    this._saveToHistory();
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    } else {
      this.deleteForward();
    }
    this._afterEdit();
    return true;
  }

  /** Handle Enter key */
  private _handleEnterKey(e: KeyboardEvent): boolean {
    // In editable mode, navigate to next/previous region or validate and move to next/previous token
    if (this._currentEditable) {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Enter: go to previous region or previous token
        if (this._currentEditable.currentRegionIndex > 0) {
          this._navigateToEditableRegion(this._currentEditable.currentRegionIndex - 1);
        } else {
          this._validateEditableAndMovePrevious();
        }
      } else {
        // Enter: go to next region or next token
        if (this._currentEditable.currentRegionIndex < this._currentEditable.regions.length - 1) {
          this._navigateToEditableRegion(this._currentEditable.currentRegionIndex + 1);
        } else {
          this._validateEditableAndMoveNext();
        }
      }
      return true;
    }

    e.preventDefault();
    // In template mode, Enter navigates to next field
    if (this._isTemplateMode) {
      this._navigateToNextTemplateField();
      return true;
    }

    this._saveToHistory();
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    }
    this.insertNewline();
    this._afterEdit();
    return true;
  }

  /** Handle Tab key for token navigation */
  private _handleTabKey(e: KeyboardEvent): boolean {
    // Skip if suggestions are visible (handled elsewhere)
    if (this._showSuggestions) return false;

    // Handle multi-region editable navigation
    if (this._currentEditable) {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: go to previous region or exit editable
        if (this._currentEditable.currentRegionIndex > 0) {
          this._navigateToEditableRegion(this._currentEditable.currentRegionIndex - 1);
        } else {
          // At first region, exit editable and go to previous token
          this._currentEditable = null;
          this._navigateToPreviousToken();
        }
      } else {
        // Tab: go to next region or exit editable
        if (this._currentEditable.currentRegionIndex < this._currentEditable.regions.length - 1) {
          this._navigateToEditableRegion(this._currentEditable.currentRegionIndex + 1);
        } else {
          // At last region, exit editable mode
          const tokenEnd = this._currentEditable.tokenEnd;
          this._currentEditable = null;

          // Add space after the token and show suggestions for next token
          const line = this.lines[this.cursorLine] || '';
          if (tokenEnd >= line.length || line[tokenEnd] !== ' ') {
            // Add space after the token
            this.lines[this.cursorLine] = line.substring(0, tokenEnd) + ' ' + line.substring(tokenEnd);
          }
          // Position cursor after the space
          this.cursorColumn = tokenEnd + 1;
          this.selectionStart = null;
          this.selectionEnd = null;
          this._afterEdit();
          this._forceShowSuggestions();
        }
      }
      return true;
    }

    e.preventDefault();
    if (e.shiftKey) {
      this._navigateToPreviousToken();
    } else {
      this._navigateToNextToken();
    }
    return true;
  }

  /** Navigate to a specific editable region within the current token */
  private _navigateToEditableRegion(regionIndex: number): void {
    if (!this._currentEditable || regionIndex < 0 || regionIndex >= this._currentEditable.regions.length) {
      return;
    }

    const region = this._currentEditable.regions[regionIndex];
    const prevRegionIndex = this._currentEditable.currentRegionIndex;
    this._currentEditable.currentRegionIndex = regionIndex;

    // When moving to a new region, we need to recalculate positions based on current token text
    // because editing previous regions may have changed the token length
    const line = this.lines[this.cursorLine] || '';
    const currentTokenText = line.substring(this._currentEditable.tokenStart, this._currentEditable.tokenEnd);

    // Calculate cumulative offset from previous region edits
    // We find the actual current region boundaries by looking at the token text
    let absoluteStart: number;
    let absoluteEnd: number;

    if (regionIndex === 0) {
      // First region always starts at tokenStart
      absoluteStart = this._currentEditable.tokenStart + region.start;
      // For end, we use the length from current edited region or original
      const regionLength = region.end - region.start;
      absoluteEnd = absoluteStart + regionLength;
    } else {
      // For subsequent regions, we need to account for changes in previous regions
      // Calculate where this region starts based on the delimiter(s) between regions

      // The simplest approach: calculate total length change from all previous regions
      // and apply that offset to this region's position
      let cumulativeOffset = 0;
      for (let i = 0; i < regionIndex; i++) {
        const prevRegion = this._currentEditable.regions[i];
        const originalLength = prevRegion.end - prevRegion.start;

        // If this was the previously active region, use the actual edited length
        if (i === prevRegionIndex) {
          const editedLength = this._currentEditable.editableEnd - this._currentEditable.editableStart;
          cumulativeOffset += editedLength - originalLength;
        }
        // For other regions that weren't just edited, assume original length
        // (this works because we update positions when navigating)
      }

      absoluteStart = this._currentEditable.tokenStart + region.start + cumulativeOffset;
      absoluteEnd = this._currentEditable.tokenStart + region.end + cumulativeOffset;
    }

    // Update the current editable state with new region info
    this._currentEditable.editableStart = absoluteStart;
    this._currentEditable.editableEnd = absoluteEnd;
    this._currentEditable.defaultsFunction = region.defaultsFunction;

    // Also update tokenEnd to reflect actual current token length
    const actualTokenEnd = this._currentEditable.tokenStart + currentTokenText.length;
    if (actualTokenEnd !== this._currentEditable.tokenEnd) {
      this._currentEditable.tokenEnd = actualTokenEnd;
    }

    // Select the region
    this.selectionStart = { line: this.cursorLine, column: absoluteStart };
    this.selectionEnd = { line: this.cursorLine, column: absoluteEnd };
    this.cursorColumn = absoluteEnd;

    this.renderViewport();
  }

  /** Handle arrow keys and Home/End navigation */
  private _handleArrowKeys(e: KeyboardEvent): void {
    const isCtrl = e.ctrlKey || e.metaKey;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (isCtrl) {
          this._moveCursorByWord(-1, e.shiftKey);
        } else {
          this.moveCursorLeft(e.shiftKey);
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (isCtrl) {
          this._moveCursorByWord(1, e.shiftKey);
        } else {
          this.moveCursorRight(e.shiftKey);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.moveCursorUp(e.shiftKey);
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.moveCursorDown(e.shiftKey);
        break;

      case 'Home':
        e.preventDefault();
        this.moveCursorHome(e.shiftKey, isCtrl);
        break;

      case 'End':
        e.preventDefault();
        this.moveCursorEnd(e.shiftKey, isCtrl);
        break;
    }
  }

  /** Handle keyboard shortcuts (Ctrl+A, Ctrl+S, Ctrl+Z, etc.) */
  private _handleShortcutKeys(e: KeyboardEvent): void {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;

    switch (e.key.toLowerCase()) {
      case 'a': // Select all
        e.preventDefault();
        this.selectAll();
        break;

      case 's': // Save
        e.preventDefault();
        this._emitSave();
        break;

      case 'o': // Open
        e.preventDefault();
        this._openFilePicker();
        break;

      case 'z': // Undo/Redo
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        break;

      case 'y': // Redo
        e.preventDefault();
        this.redo();
        break;

      case 'c': // Copy
        this.copySelection();
        break;

      case 'x': // Cut
        this.cutSelection();
        break;
    }
  }

  /** Common operations after any edit */
  private _afterEdit(): void {
    // Check if message type has changed (e.g., user pasted a different message type)
    const currentIdentifier = this._templateRenderer.identifier;
    const newIdentifier = this._getMessageIdentifier();

    // If message type changed, reset template mode first
    if (this._isTemplateMode && currentIdentifier && newIdentifier && currentIdentifier !== newIdentifier) {
      this._isTemplateMode = false;
      this._templateRenderer.reset();
    }

    // In template mode, sync and rebuild lines to maintain column structure
    if (this._isTemplateMode) {
      this._syncTemplateLines();
    }

    this._detectMessageType();
    this._tokenize();
    this.renderViewport();
    this._updateStatus();
    this._updateSuggestions();
    this._emitChange();
  }

  /**
   * Sync template lines: extract values from current lines and rebuild with proper column alignment
   * This ensures labels always maintain their fixed width and can't be accidentally modified
   */
  private _syncTemplateLines(): void {
    if (!this._isTemplateMode || !this._templateRenderer.state) return;

    const state = this._templateRenderer.state;
    const labelWidth = state.labelColumnWidth;

    // Line 0 is the identifier - keep it as-is but ensure it's correct
    if (this.lines.length > 0) {
      this.lines[0] = this._templateRenderer.identifier;
    }

    // For each field, extract the value part and rebuild the line
    for (let i = 0; i < state.fields.length; i++) {
      const field = state.fields[i];
      const lineIndex = i + 1; // Fields start at line 1

      if (lineIndex < this.lines.length) {
        const currentLine = this.lines[lineIndex];
        // Extract value: everything after labelColumnWidth position
        const value = currentLine.length > labelWidth ? currentLine.substring(labelWidth) : '';

        // Update the template state
        field.value = value;

        // Rebuild the line with proper format: paddedLabel + value
        const paddedLabel = field.field.label.padEnd(labelWidth);
        this.lines[lineIndex] = paddedLabel + value;
      }
    }

    // Ensure cursor column is still valid after potential line changes
    if (this.cursorLine > 0 && this.cursorLine < this.lines.length) {
      const maxCol = this.lines[this.cursorLine].length;
      if (this.cursorColumn > maxCol) {
        this.cursorColumn = maxCol;
      }
    }
  }

  // ========== Undo/Redo ==========

  /** Save current state to undo stack BEFORE making changes */
  private _saveToHistory(): void {
    this._undoManager.saveState({
      lines: this.lines,
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });
  }

  undo(): void {
    const state = this._undoManager.undo({
      lines: this.lines,
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });
    if (!state) return;

    this.lines = state.lines;
    this.cursorLine = state.cursorLine;
    this.cursorColumn = state.cursorColumn;

    this._clearSelection();
    this._invalidateRenderCache();
    this._detectMessageType();
    this._tokenize();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();
  }

  redo(): void {
    const state = this._undoManager.redo({
      lines: this.lines,
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });
    if (!state) return;

    this.lines = state.lines;
    this.cursorLine = state.cursorLine;
    this.cursorColumn = state.cursorColumn;

    this._clearSelection();
    this._invalidateRenderCache();
    this._detectMessageType();
    this._tokenize();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();
  }

  private _invalidateRenderCache(): void {
    this._lastStartIndex = -1;
    this._lastEndIndex = -1;
    this._lastTotalLines = -1;
    this._lastContentHash = '';
  }

  // ========== Word-by-word movement ==========
  private _moveCursorByWord(direction: number, selecting: boolean = false): void {
    if (selecting) this._startSelection();

    const line = this.lines[this.cursorLine] || '';
    const isWordChar = (ch: string) => /[\w-]/.test(ch);

    if (direction > 0) {
      // Move right
      let pos = this.cursorColumn;

      if (pos >= line.length) {
        // At end of line, move to start of next line
        if (this.cursorLine < this.lines.length - 1) {
          this.cursorLine++;
          this.cursorColumn = 0;
        }
      } else if (isWordChar(line[pos])) {
        // Inside a word: move to end of word
        while (pos < line.length && isWordChar(line[pos])) {
          pos++;
        }
        this.cursorColumn = pos;
      } else {
        // On non-word char: skip non-word chars
        while (pos < line.length && !isWordChar(line[pos])) {
          pos++;
        }
        this.cursorColumn = pos;
      }
    } else {
      // Move left
      let pos = this.cursorColumn;

      if (pos === 0) {
        // At start of line, move to end of previous line
        if (this.cursorLine > 0) {
          this.cursorLine--;
          this.cursorColumn = this.lines[this.cursorLine].length;
        }
      } else if (pos > 0 && isWordChar(line[pos - 1])) {
        // Just after a word char: move to start of word
        while (pos > 0 && isWordChar(line[pos - 1])) {
          pos--;
        }
        this.cursorColumn = pos;
      } else {
        // On or after non-word char: skip non-word chars, then skip word
        while (pos > 0 && !isWordChar(line[pos - 1])) {
          pos--;
        }
        while (pos > 0 && isWordChar(line[pos - 1])) {
          pos--;
        }
        this.cursorColumn = pos;
      }
    }

    if (selecting) this._updateSelection();
    else this._clearSelection();

    this.renderViewport();
  }

  // ========== Text Insertion ==========
  insertText(text: string): void {
    if (this.readonly) return;

    // In template mode, ensure cursor is in editable area
    if (this._isTemplateMode && this._templateRenderer.state) {
      // Line 0 is identifier line - no editing allowed
      if (this.cursorLine === 0) return;
      // Ensure cursor is past label column
      const minColumn = this._templateRenderer.state.labelColumnWidth;
      if (this.cursorColumn < minColumn) {
        this.cursorColumn = minColumn;
      }
    }

    // Handle empty editor case
    if (this.lines.length === 0) {
      this.lines = [text];
      this.cursorColumn = text.length;
      return;
    }

    if (this.cursorLine < this.lines.length) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] =
        line.substring(0, this.cursorColumn) + text + line.substring(this.cursorColumn);
      this.cursorColumn += text.length;
    }
  }

  insertNewline(): void {
    if (this.readonly) return;

    // In template mode, Enter moves to next field instead of inserting newline
    if (this._isTemplateMode) {
      this._navigateToNextTemplateField();
      return;
    }

    const line = this.lines[this.cursorLine] || '';
    const before = line.substring(0, this.cursorColumn);
    const after = line.substring(this.cursorColumn);

    this.lines[this.cursorLine] = before;
    this.lines.splice(this.cursorLine + 1, 0, after);

    this.cursorLine++;
    this.cursorColumn = 0;
  }

  deleteBackward(): void {
    if (this.readonly) return;

    // In template mode, respect label column boundary
    if (this._isTemplateMode && this._templateRenderer.state) {
      const minColumn = this._templateRenderer.state.labelColumnWidth;
      // Line 0 is identifier line - no editing allowed
      if (this.cursorLine === 0) return;
      // Don't delete into label column
      if (this.cursorColumn <= minColumn) return;
    }

    if (this.cursorColumn > 0) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] =
        line.substring(0, this.cursorColumn - 1) + line.substring(this.cursorColumn);
      this.cursorColumn--;
    } else if (this.cursorLine > 0) {
      // In template mode, don't merge lines (would break template structure)
      if (this._isTemplateMode) return;

      // Merge with previous line
      const currentLine = this.lines[this.cursorLine];
      const prevLine = this.lines[this.cursorLine - 1];
      this.cursorColumn = prevLine.length;
      this.lines[this.cursorLine - 1] = prevLine + currentLine;
      this.lines.splice(this.cursorLine, 1);
      this.cursorLine--;
    }
  }

  deleteForward(): void {
    if (this.readonly) return;

    // In template mode, line 0 is not editable
    if (this._isTemplateMode && this.cursorLine === 0) return;

    const line = this.lines[this.cursorLine];
    if (this.cursorColumn < line.length) {
      this.lines[this.cursorLine] =
        line.substring(0, this.cursorColumn) + line.substring(this.cursorColumn + 1);
    } else if (this.cursorLine < this.lines.length - 1) {
      // In template mode, don't merge lines (would break template structure)
      if (this._isTemplateMode) return;

      // Merge with next line
      this.lines[this.cursorLine] = line + this.lines[this.cursorLine + 1];
      this.lines.splice(this.cursorLine + 1, 1);
    }
  }

  deleteSelection(): void {
    if (!this.selectionStart || !this.selectionEnd) return;

    const sel = this._normalizeSelection();
    if (!sel) return;

    const { start, end } = sel;

    if (start.line === end.line) {
      // Single line selection
      const line = this.lines[start.line];
      this.lines[start.line] = line.substring(0, start.column) + line.substring(end.column);
    } else {
      // Multi-line selection
      const firstLine = this.lines[start.line].substring(0, start.column);
      const lastLine = this.lines[end.line].substring(end.column);
      this.lines[start.line] = firstLine + lastLine;
      this.lines.splice(start.line + 1, end.line - start.line);
    }

    this.cursorLine = start.line;
    this.cursorColumn = start.column;
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  // ========== Cursor Movement ==========
  /**
   * Apply template mode constraints to cursor position
   */
  private _applyTemplateModeConstraints(): void {
    if (!this._isTemplateMode || !this._templateRenderer.state) return;

    const constrained = this._constrainCursorForTemplateMode(this.cursorLine, this.cursorColumn);
    this.cursorLine = constrained.line;
    this.cursorColumn = constrained.column;
  }

  moveCursorLeft(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this.cursorColumn > 0) {
      this.cursorColumn--;
    } else if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorColumn = this.lines[this.cursorLine].length;
    }

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorRight(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    const line = this.lines[this.cursorLine] || '';
    if (this.cursorColumn < line.length) {
      this.cursorColumn++;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorColumn = 0;
    }

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorUp(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this._wrapEnabled) {
      // With wrap, navigate between visual rows
      const breaks = this._getWrapBreaks(this.cursorLine);

      // Find which visual row we're on
      let currentVisualRow = 0;
      for (const breakPoint of breaks) {
        if (this.cursorColumn >= breakPoint) {
          currentVisualRow++;
        } else {
          break;
        }
      }

      if (currentVisualRow > 0) {
        // Move to previous visual row within same logical line
        const prevBreak = currentVisualRow > 1 ? breaks[currentVisualRow - 2] : 0;
        const currentBreak = breaks[currentVisualRow - 1];
        // Calculate column offset within the visual row
        const columnInVisualRow = currentVisualRow > 0 && breaks.length > 0
          ? this.cursorColumn - breaks[currentVisualRow - 1]
          : this.cursorColumn;
        // Target column in previous visual row
        const prevRowLength = currentBreak - prevBreak;
        this.cursorColumn = prevBreak + Math.min(columnInVisualRow, prevRowLength);
      } else if (this.cursorLine > 0) {
        // Move to last visual row of previous logical line
        this.cursorLine--;
        const prevBreaks = this._getWrapBreaks(this.cursorLine);
        const lineLength = this.lines[this.cursorLine].length;
        if (prevBreaks.length > 0) {
          const lastBreak = prevBreaks[prevBreaks.length - 1];
          const lastRowLength = lineLength - lastBreak;
          // Calculate column offset within current visual row
          const columnInVisualRow = this.cursorColumn;
          this.cursorColumn = lastBreak + Math.min(columnInVisualRow, lastRowLength);
        } else {
          this.cursorColumn = Math.min(this.cursorColumn, lineLength);
        }
      }
    } else {
      // Without wrap, standard behavior
      if (this.cursorLine > 0) {
        this.cursorLine--;
        this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
      }
    }

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorDown(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this._wrapEnabled) {
      // With wrap, navigate between visual rows
      const breaks = this._getWrapBreaks(this.cursorLine);
      const lineLength = this.lines[this.cursorLine].length;

      // Find which visual row we're on
      let currentVisualRow = 0;
      for (const breakPoint of breaks) {
        if (this.cursorColumn >= breakPoint) {
          currentVisualRow++;
        } else {
          break;
        }
      }

      const totalVisualRows = breaks.length + 1;

      if (currentVisualRow < totalVisualRows - 1) {
        // Move to next visual row within same logical line
        const currentBreak = currentVisualRow > 0 ? breaks[currentVisualRow - 1] : 0;
        const nextBreak = breaks[currentVisualRow];
        const nextNextBreak = currentVisualRow + 1 < breaks.length ? breaks[currentVisualRow + 1] : lineLength;
        // Calculate column offset within current visual row
        const columnInVisualRow = this.cursorColumn - currentBreak;
        // Target column in next visual row
        const nextRowLength = nextNextBreak - nextBreak;
        this.cursorColumn = nextBreak + Math.min(columnInVisualRow, nextRowLength);
      } else if (this.cursorLine < this.lines.length - 1) {
        // Move to first visual row of next logical line
        const currentBreak = breaks.length > 0 ? breaks[breaks.length - 1] : 0;
        const columnInVisualRow = this.cursorColumn - currentBreak;
        this.cursorLine++;
        const nextBreaks = this._getWrapBreaks(this.cursorLine);
        const nextLineLength = this.lines[this.cursorLine].length;
        const firstRowLength = nextBreaks.length > 0 ? nextBreaks[0] : nextLineLength;
        this.cursorColumn = Math.min(columnInVisualRow, firstRowLength);
      }
    } else {
      // Without wrap, standard behavior
      if (this.cursorLine < this.lines.length - 1) {
        this.cursorLine++;
        this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
      }
    }

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorHome(selecting: boolean = false, toDocument: boolean = false): void {
    if (selecting) this._startSelection();

    if (toDocument) {
      this.cursorLine = 0;
    }
    this.cursorColumn = 0;

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorEnd(selecting: boolean = false, toDocument: boolean = false): void {
    if (selecting) this._startSelection();

    if (toDocument) {
      this.cursorLine = this.lines.length - 1;
    }
    this.cursorColumn = this.lines[this.cursorLine].length;

    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  // ========== Selection ==========
  private _startSelection(): void {
    if (!this.selectionStart) {
      this.selectionStart = { line: this.cursorLine, column: this.cursorColumn };
    }
  }

  private _updateSelection(): void {
    this.selectionEnd = { line: this.cursorLine, column: this.cursorColumn };
  }

  private _clearSelection(): void {
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  private _normalizeSelection(): { start: CursorPosition; end: CursorPosition } | null {
    if (!this.selectionStart || !this.selectionEnd) return null;

    let start = this.selectionStart;
    let end = this.selectionEnd;

    // Ensure start is before end
    if (start.line > end.line || (start.line === end.line && start.column > end.column)) {
      [start, end] = [end, start];
    }

    return { start, end };
  }

  selectAll(): void {
    if (this.lines.length === 0 || (this.lines.length === 1 && this.lines[0].length === 0)) {
      return; // Nothing to select
    }
    this.selectionStart = { line: 0, column: 0 };
    const lastLine = this.lines.length - 1;
    this.selectionEnd = { line: lastLine, column: this.lines[lastLine].length };
    this.cursorLine = lastLine;
    this.cursorColumn = this.lines[lastLine].length;
    this.renderViewport();
  }

  getSelectedText(): string {
    const sel = this._normalizeSelection();
    if (!sel) return '';

    if (sel.start.line === sel.end.line) {
      return this.lines[sel.start.line].substring(sel.start.column, sel.end.column);
    }

    const lines: string[] = [];
    lines.push(this.lines[sel.start.line].substring(sel.start.column));
    for (let i = sel.start.line + 1; i < sel.end.line; i++) {
      lines.push(this.lines[i]);
    }
    lines.push(this.lines[sel.end.line].substring(0, sel.end.column));
    return lines.join('\n');
  }

  copySelection(): void {
    const text = this.getSelectedText();
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }

  cutSelection(): void {
    if (this.readonly) return;
    this._saveToHistory();
    this.copySelection();
    this.deleteSelection();
    this.renderViewport();
    this._emitChange();
  }

  // ========== Mouse Handling ==========
  /**
   * Constrain cursor position in template mode
   * In template mode, cursor cannot be in the label column (left side) except on line 0
   */
  private _constrainCursorForTemplateMode(line: number, column: number): { line: number; column: number } {
    if (!this._isTemplateMode || !this._templateRenderer.state) {
      return { line, column };
    }

    const state = this._templateRenderer.state;

    // Line 0 is the identifier line - not editable at all in template mode
    if (line === 0) {
      // Move to first field
      if (state.fields.length > 0) {
        return { line: 1, column: state.labelColumnWidth };
      }
      return { line: 0, column: this.lines[0]?.length || 0 };
    }

    // For other lines, ensure cursor is in value column (right of labels)
    if (column < state.labelColumnWidth) {
      return { line, column: state.labelColumnWidth };
    }

    return { line, column };
  }

  handleMouseDown(e: MouseEvent): void {
    const pos = this._getPositionFromMouse(e);
    const constrained = this._constrainCursorForTemplateMode(pos.line, pos.column);
    this.cursorLine = constrained.line;
    this.cursorColumn = constrained.column;

    // In template mode, update focusedFieldIndex based on clicked line
    if (this._isTemplateMode && this._templateRenderer.state) {
      const fieldIndex = constrained.line - 1; // Fields start at line 1
      if (fieldIndex >= 0 && fieldIndex < this._templateRenderer.state.fields.length) {
        this._templateRenderer.state.focusedFieldIndex = fieldIndex;
        // Show suggestions for the clicked field
        this._hideSuggestions();
        this._forceShowSuggestions();
      }
    } else {
      // Hide suggestions when clicking elsewhere in non-template mode
      this._hideSuggestions();
    }

    if (e.shiftKey && this.selectionStart) {
      this._updateSelection();
    } else {
      this.selectionStart = { line: constrained.line, column: constrained.column };
      this.selectionEnd = null;
    }

    this.renderViewport();
  }

  handleMouseMove(e: MouseEvent): void {
    if (!this._isSelecting) return;

    const pos = this._getPositionFromMouse(e);
    const constrained = this._constrainCursorForTemplateMode(pos.line, pos.column);
    this.cursorLine = constrained.line;
    this.cursorColumn = constrained.column;
    this.selectionEnd = { line: constrained.line, column: constrained.column };

    this.renderViewport();
  }

  handleDoubleClick(e: MouseEvent): void {
    const pos = this._getPositionFromMouse(e);
    this.cursorLine = pos.line;
    this.cursorColumn = pos.column;

    const line = this.lines[pos.line] || '';
    if (line.length === 0) return;

    // Find word boundaries (word = sequence of non-whitespace characters)
    const isWordChar = (ch: string) => /\S/.test(ch);

    // Find start of word
    let start = pos.column;
    while (start > 0 && isWordChar(line[start - 1])) {
      start--;
    }

    // Find end of word
    let end = pos.column;
    while (end < line.length && isWordChar(line[end])) {
      end++;
    }

    // If we're on whitespace, don't select anything
    if (start === end) return;

    // Set selection
    this.selectionStart = { line: pos.line, column: start };
    this.selectionEnd = { line: pos.line, column: end };
    this.cursorColumn = end;

    this.renderViewport();
  }

  private _getPositionFromMouse(e: MouseEvent): CursorPosition {
    const viewport = this.shadowRoot!.getElementById('viewport')!;
    const rect = viewport.getBoundingClientRect();

    // Calculate position relative to viewport content area (accounting for padding)
    const x = e.clientX - rect.left - 12; // 12px left padding
    const y = e.clientY - rect.top - 8 + viewport.scrollTop; // 8px top padding + scroll offset

    // Use wrap-aware conversion when wrap is enabled
    if (this._wrapEnabled) {
      return this._visualToLogicalPosition(y, x);
    }

    const line = Math.max(0, Math.min(Math.floor(y / this.lineHeight), this.lines.length - 1));
    const lineText = this.lines[line] || '';

    // Approximate column from x position (assuming monospace font)
    const column = Math.max(0, Math.min(Math.round(x / this._charWidth), lineText.length));

    return { line, column };
  }

  // ========== Focus Handling ==========
  handleFocus(): void {
    this.shadowRoot!.querySelector('.editor-wrapper')?.classList.add('focused');
    this.renderViewport();
  }

  handleBlur(): void {
    this.shadowRoot!.querySelector('.editor-wrapper')?.classList.remove('focused');
    // Delay hiding suggestions to allow click on suggestion item
    // Use a timestamp to detect if suggestions were refreshed
    const blurTimestamp = Date.now();
    this._lastBlurTimestamp = blurTimestamp;
    setTimeout(() => {
      // Only hide if no new blur occurred and suggestions weren't refreshed
      if (this._lastBlurTimestamp === blurTimestamp && this._showSuggestions) {
        this._hideSuggestions();
      }
    }, 150);
    this.renderViewport();
  }

  // ========== Scroll Handling ==========
  handleScroll(): void {
    const viewport = this.shadowRoot!.getElementById('viewport')!;
    this.scrollTop = viewport.scrollTop;

    // Hide suggestions when scrolling (they don't follow the scroll)
    this._hideSuggestions();

    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      this.renderViewport();
    });
  }

  /**
   * Ensure cursor is visible in the viewport by scrolling if necessary
   */
  private _ensureCursorVisible(): void {
    const viewport = this.shadowRoot!.getElementById('viewport');
    if (!viewport) return;

    // Calculate cursor Y position accounting for wrapped lines
    const cursorY = this._getVisualYForPosition(this.cursorLine, this.cursorColumn);
    const viewportHeight = viewport.clientHeight;
    const scrollTop = viewport.scrollTop;

    // Check if cursor is above visible area
    if (cursorY < scrollTop) {
      viewport.scrollTop = cursorY;
    }
    // Check if cursor is below visible area
    else if (cursorY + this.lineHeight > scrollTop + viewportHeight) {
      viewport.scrollTop = cursorY - viewportHeight + this.lineHeight;
    }
  }

  // ========== Word Wrap Methods ==========

  /**
   * Measure the actual character width by creating a temporary element
   * This ensures wrap calculations work even if font is overridden
   */
  private _measureCharWidth(): void {
    const linesContainer = this.shadowRoot?.getElementById('linesContainer');
    if (!linesContainer) return;

    // Create a temporary span with the same styling as editor content
    const measureSpan = document.createElement('span');
    measureSpan.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      letter-spacing: inherit;
    `;
    // Use a string of known length to measure average char width
    measureSpan.textContent = 'XXXXXXXXXXXXXXXXXXXX'; // 20 X's
    linesContainer.appendChild(measureSpan);

    const width = measureSpan.getBoundingClientRect().width;
    if (width > 0) {
      this._charWidth = width / 20;
    }

    linesContainer.removeChild(measureSpan);
  }

  /**
   * Update chars per row based on container width
   */
  private _updateCharsPerRow(): void {
    const viewport = this.shadowRoot?.getElementById('viewport');
    if (!viewport) return;

    // Measure character width dynamically (handles font overrides)
    this._measureCharWidth();

    // Account for padding (12px left + 12px right)
    const contentWidth = viewport.clientWidth - 24;
    this._containerWidth = contentWidth;

    if (contentWidth > 0) {
      this._charsPerRow = Math.floor(contentWidth / this._charWidth);
      // Minimum 10 chars per row to avoid extreme wrapping
      this._charsPerRow = Math.max(10, this._charsPerRow);
    } else {
      this._charsPerRow = Infinity;
    }

    this._invalidateWrapCache();
  }

  /**
   * Clear wrap cache (call when content or container changes)
   */
  private _invalidateWrapCache(): void {
    this._wrapCache.clear();
  }

  /**
   * Get wrap break points for a logical line
   * Returns array of character indices where wraps occur
   * Wraps on word boundaries (spaces) when possible
   */
  private _getWrapBreaks(lineIndex: number): number[] {
    if (this._charsPerRow === Infinity) {
      return [];
    }

    // Check cache
    if (this._wrapCache.has(lineIndex)) {
      return this._wrapCache.get(lineIndex)!;
    }

    const lineText = this.lines[lineIndex] || '';
    const breaks: number[] = [];

    if (lineText.length > this._charsPerRow) {
      let currentPos = 0;

      while (currentPos + this._charsPerRow < lineText.length) {
        // Find the end of the current visual row
        const rowEnd = currentPos + this._charsPerRow;

        // Look for the last space within the row
        let breakPos = -1;
        for (let i = rowEnd; i > currentPos; i--) {
          if (lineText[i] === ' ') {
            breakPos = i + 1; // Break after the space
            break;
          }
        }

        if (breakPos > currentPos) {
          // Found a space to break on
          breaks.push(breakPos);
          currentPos = breakPos;
        } else {
          // No space found - break at character limit (fallback for very long tokens)
          breaks.push(rowEnd);
          currentPos = rowEnd;
        }
      }
    }

    this._wrapCache.set(lineIndex, breaks);
    return breaks;
  }

  /**
   * Get number of visual rows for a logical line
   */
  private _getVisualRowCount(lineIndex: number): number {
    const breaks = this._getWrapBreaks(lineIndex);
    return breaks.length + 1;
  }

  /**
   * Get total visual height for all lines up to (but not including) lineIndex
   */
  private _getVisualYForLine(lineIndex: number): number {
    if (!this._wrapEnabled) {
      return lineIndex * this.lineHeight;
    }

    let y = 0;
    for (let i = 0; i < lineIndex; i++) {
      y += this._getVisualRowCount(i) * this.lineHeight;
    }
    return y;
  }

  /**
   * Get visual Y position for a specific cursor position (line, column)
   */
  private _getVisualYForPosition(line: number, column: number): number {
    const baseY = this._getVisualYForLine(line);

    if (!this._wrapEnabled) {
      return baseY;
    }

    // Calculate which visual row within the line
    const breaks = this._getWrapBreaks(line);
    let visualRowInLine = 0;
    for (const breakPoint of breaks) {
      if (column >= breakPoint) {
        visualRowInLine++;
      } else {
        break;
      }
    }

    return baseY + visualRowInLine * this.lineHeight;
  }

  /**
   * Get visual X position for a cursor position (accounting for wrap)
   */
  private _getVisualXForPosition(line: number, column: number): number {
    if (!this._wrapEnabled) {
      return column * this._charWidth;
    }

    const breaks = this._getWrapBreaks(line);
    let effectiveColumn = column;

    // Find which segment the column is in
    for (const breakPoint of breaks) {
      if (column >= breakPoint) {
        effectiveColumn = column - breakPoint;
      } else {
        break;
      }
    }

    return effectiveColumn * this._charWidth;
  }

  /**
   * Convert visual position (from mouse click) to logical position
   */
  private _visualToLogicalPosition(visualY: number, visualX: number): { line: number; column: number } {
    if (!this._wrapEnabled) {
      const line = Math.max(0, Math.min(Math.floor(visualY / this.lineHeight), this.lines.length - 1));
      const column = Math.max(0, Math.round(visualX / this._charWidth));
      return { line, column: Math.min(column, (this.lines[line] || '').length) };
    }

    // Find which logical line this Y falls into
    let accumulatedY = 0;
    let targetLine = 0;

    for (let i = 0; i < this.lines.length; i++) {
      const rowCount = this._getVisualRowCount(i);
      const lineHeight = rowCount * this.lineHeight;

      if (accumulatedY + lineHeight > visualY) {
        targetLine = i;
        // Calculate which visual row within this line
        const yWithinLine = visualY - accumulatedY;
        const visualRowInLine = Math.floor(yWithinLine / this.lineHeight);

        // Calculate column offset based on visual row
        const breaks = this._getWrapBreaks(i);
        let columnOffset = 0;
        if (visualRowInLine > 0 && breaks.length > 0) {
          columnOffset = breaks[Math.min(visualRowInLine - 1, breaks.length - 1)];
        }

        const column = columnOffset + Math.max(0, Math.round(visualX / this._charWidth));
        return { line: targetLine, column: Math.min(column, (this.lines[targetLine] || '').length) };
      }

      accumulatedY += lineHeight;
    }

    // Past the end - return last position
    const lastLine = this.lines.length - 1;
    return { line: lastLine, column: (this.lines[lastLine] || '').length };
  }

  /**
   * Get total visual height of all content
   */
  private _getTotalVisualHeight(): number {
    if (!this._wrapEnabled) {
      return this.lines.length * this.lineHeight;
    }

    let total = 0;
    for (let i = 0; i < this.lines.length; i++) {
      total += this._getVisualRowCount(i) * this.lineHeight;
    }
    return total;
  }

  // ========== Viewport Rendering ==========
  renderViewport(): void {
    const viewport = this.shadowRoot!.getElementById('viewport');
    const scrollContent = this.shadowRoot!.getElementById('scrollContent');
    const linesContainer = this.shadowRoot!.getElementById('linesContainer');

    if (!viewport || !scrollContent || !linesContainer) return;

    // Use visual height calculation (accounts for wrapped lines)
    const totalHeight = this._getTotalVisualHeight();
    scrollContent.style.height = `${totalHeight}px`;

    this.viewportHeight = viewport.clientHeight;
    const scrollTop = viewport.scrollTop;

    // Calculate visible range
    // When wrap is enabled, render all lines (virtualization with variable heights is complex)
    // When wrap is disabled, use standard virtualization
    let startIndex: number;
    let endIndex: number;
    if (this._wrapEnabled || this.viewportHeight <= 0) {
      // Render all lines when wrap is enabled or viewport has no height
      startIndex = 0;
      endIndex = this.lines.length;
    } else {
      startIndex = Math.max(0, Math.floor(scrollTop / this.lineHeight) - this.bufferLines);
      const visibleCount = Math.ceil(this.viewportHeight / this.lineHeight) + this.bufferLines * 2;
      endIndex = Math.min(this.lines.length, startIndex + visibleCount);
    }

    // Calculate content hash for visible lines to detect changes
    const visibleContent = this.lines.slice(startIndex, endIndex).join('\n');
    const selectionHash = this.selectionStart && this.selectionEnd
      ? `${this.selectionStart.line}:${this.selectionStart.column}-${this.selectionEnd.line}:${this.selectionEnd.column}`
      : 'none';
    const wrapHash = this._wrapEnabled ? `wrap:${this._charsPerRow}` : 'nowrap';
    const contentHash = visibleContent + '|' + this.cursorLine + '|' + this.cursorColumn + '|' + selectionHash + '|' + wrapHash;

    // Check if we need to re-render
    if (
      startIndex === this._lastStartIndex &&
      endIndex === this._lastEndIndex &&
      this.lines.length === this._lastTotalLines &&
      contentHash === this._lastContentHash
    ) {
      // Just update cursor
      this._updateCursor(linesContainer);
      return;
    }

    // Check if content changed (for wrap cache invalidation)
    const contentOnlyChanged = visibleContent !== this._lastContentHash.split('|')[0];
    if (contentOnlyChanged && this._wrapEnabled) {
      this._invalidateWrapCache();
    }

    this._lastStartIndex = startIndex;
    this._lastEndIndex = endIndex;
    this._lastTotalLines = this.lines.length;
    this._lastContentHash = contentHash;

    // Position container - use visual Y position for start index
    const containerY = this._wrapEnabled ? 0 : startIndex * this.lineHeight;
    linesContainer.style.transform = `translateY(${containerY}px)`;

    // Toggle wrap class on lines container
    linesContainer.classList.toggle('wrap-enabled', this._wrapEnabled);

    // Build tokens map for highlighting
    const tokensMap = this._buildTokensMap();

    // Render visible lines
    let html = '';
    for (let i = startIndex; i < endIndex; i++) {
      const lineText = this.lines[i] || '';
      const isCurrentLine = i === this.cursorLine;
      const lineClass = isCurrentLine ? 'line current-line' : 'line';

      // Get tokens for this line
      const lineTokens = tokensMap.get(i) || [];
      let highlightedContent = this._highlightLine(lineText, lineTokens, i);

      // Add template exit button after identifier line (line 0) in template mode
      if (i === 0 && this._isTemplateMode) {
        highlightedContent += '<button class="template-exit-btn" id="templateExitBtn" title="Exit template mode" aria-label="Exit template mode">✕</button>';
      }

      html += `<div class="${lineClass}" data-line="${i}">${highlightedContent || '&nbsp;'}</div>`;
    }

    linesContainer.innerHTML = html;

    // Render cursor and selection
    this._renderCursor(linesContainer);
    this._renderSelection(linesContainer, startIndex, endIndex);
    this._renderHint(linesContainer);
  }

  private _buildTokensMap(): Map<number, LineToken[]> {
    // Map line number to tokens on that line
    const map = new Map<number, LineToken[]>();

    for (const token of this._tokens) {
      // Calculate which line this token is on
      const textBefore = this.value.substring(0, token.start);
      const linesInBefore = textBefore.split('\n');
      const tokenLine = linesInBefore.length - 1;
      const tokenCol = linesInBefore[linesInBefore.length - 1].length;

      if (!map.has(tokenLine)) {
        map.set(tokenLine, []);
      }

      map.get(tokenLine)!.push({
        ...token,
        column: tokenCol,
        length: token.text.length
      });
    }

    return map;
  }

  private _highlightLine(lineText: string, tokens: LineToken[], lineIndex: number): string {
    if (!lineText) return '';
    if (tokens.length === 0) {
      return this._escapeHtml(lineText);
    }

    // Sort tokens by column
    tokens.sort((a, b) => a.column - b.column);

    let result = '';
    let lastEnd = 0;

    for (const token of tokens) {
      // Add unhighlighted text before this token
      if (token.column > lastEnd) {
        result += this._escapeHtml(lineText.substring(lastEnd, token.column));
      }

      // Add highlighted token
      const tokenText = lineText.substring(token.column, token.column + token.length);

      // Check if token is incomplete (placeholder value) and cursor is not inside it
      // Only show as incomplete if editor has focus
      const hasFocus = this.shadowRoot!.querySelector('.editor-wrapper')?.classList.contains('focused') ?? false;
      const isIncomplete = hasFocus && this._isPlaceholderToken(tokenText, token.type);
      const cursorInToken = lineIndex === this.cursorLine &&
        this.cursorColumn >= token.column &&
        this.cursorColumn <= token.column + token.length;

      let tokenClass = `token token-${token.category || token.type}`;
      const showIncomplete = isIncomplete && !cursorInToken;
      if (showIncomplete) {
        tokenClass += ' token-incomplete';
      }
      if (token.error) {
        tokenClass += ' token-error';
      }

      // Build title attribute for tooltip (error message or incomplete hint)
      let titleAttr = '';
      if (token.error) {
        titleAttr = ` title="${this._escapeHtml(token.error)}"`;
      } else if (showIncomplete) {
        const hint = token.description || 'Incomplete value';
        titleAttr = ` title="${this._escapeHtml(hint)}"`;
      }
      result += `<span class="${tokenClass}" data-type="${token.type}"${titleAttr}>${this._escapeHtml(tokenText)}</span>`;

      lastEnd = token.column + token.length;
    }

    // Add remaining text
    if (lastEnd < lineText.length) {
      result += this._escapeHtml(lineText.substring(lastEnd));
    }

    return result;
  }

  /**
   * Check if a token text is a placeholder value (incomplete/needs editing)
   * Placeholder tokens are values like 00000KT, 000000Z, 0000, etc.
   */
  private _isPlaceholderToken(tokenText: string, tokenType: string): boolean {
    // Known placeholder patterns for different token types
    const placeholderPatterns: Record<string, RegExp> = {
      'wind': /^0{5}(KT|MPS)$/,                // 00000KT, 00000MPS
      'datetime': /^0{6}Z$/,                   // 000000Z
      'visibility': /^0{4}$/,                  // 0000
      'windVariation': /^0{3}V0{3}$/,         // 000V000
    };

    const pattern = placeholderPatterns[tokenType];
    if (pattern) {
      return pattern.test(tokenText);
    }

    return false;
  }

  /** Get absolute cursor position in the document */
  private _getAbsoluteCursorPosition(): number {
    let pos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      pos += this.lines[i].length + 1; // +1 for newline
    }
    pos += this.cursorColumn;
    return pos;
  }

  /** Convert absolute position to line/column */
  private _absoluteToLineColumn(absPos: number): { line: number; column: number } {
    let remaining = absPos;
    for (let i = 0; i < this.lines.length; i++) {
      const lineLen = this.lines[i].length;
      if (remaining <= lineLen) {
        return { line: i, column: remaining };
      }
      remaining -= lineLen + 1; // +1 for newline
    }
    // Past end of document
    const lastLine = this.lines.length - 1;
    return { line: lastLine, column: this.lines[lastLine].length };
  }

  /** Navigate to the next token (Tab key) */
  private _navigateToNextToken(): void {
    const cursorPos = this._getAbsoluteCursorPosition();

    // Find first non-whitespace token that starts after current cursor position
    // or that contains the cursor (to move to next one)
    let foundCurrentToken = false;
    for (const token of this._tokens) {
      if (token.type === 'whitespace') continue;

      // Check if cursor is inside or at the start of this token
      if (cursorPos >= token.start && cursorPos < token.end) {
        foundCurrentToken = true;
        continue; // Skip current token, look for next
      }

      // If we found a token after cursor position (or after current token)
      if (token.start >= cursorPos || foundCurrentToken) {
        this._selectToken(token);
        this.renderViewport();
        return;
      }
    }

    // No token found after cursor - move to end of current line
    const currentLineLength = this.lines[this.cursorLine]?.length || 0;
    this.cursorColumn = currentLineLength;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.renderViewport();
  }

  /** Navigate to the previous token (Shift+Tab key) */
  private _navigateToPreviousToken(): void {
    const cursorPos = this._getAbsoluteCursorPosition();

    // Find the token before the current cursor position
    let previousToken: Token | null = null;
    let currentToken: Token | null = null;

    for (const token of this._tokens) {
      if (token.type === 'whitespace') continue;

      // Check if cursor is inside this token
      if (cursorPos > token.start && cursorPos <= token.end) {
        currentToken = token;
        break;
      }

      // Track the last token before cursor
      if (token.end <= cursorPos) {
        previousToken = token;
      }
    }

    // If cursor is inside a token, go to previous token
    if (currentToken && previousToken) {
      this._selectToken(previousToken);
      this.renderViewport();
      return;
    }

    // If cursor is inside a token but no previous token, go to start of line
    if (currentToken && !previousToken) {
      this.cursorColumn = 0;
      this.selectionStart = null;
      this.selectionEnd = null;
      this.renderViewport();
      return;
    }

    // Cursor not in a token - go to previous token if exists
    if (previousToken) {
      this._selectToken(previousToken);
      this.renderViewport();
      return;
    }

    // No previous token - move to start of current line
    this.cursorColumn = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.renderViewport();
  }

  /** Select a token - if it's a placeholder, select the editable part */
  private _selectToken(token: Token): void {
    // Check if this token is a placeholder with editable region
    const isPlaceholder = this._isPlaceholderToken(token.text, token.type);

    if (isPlaceholder) {
      // Select the editable part (usually the numeric portion)
      // For wind tokens like "00000KT", select "00000"
      // For datetime "000000Z", select "000000"
      const editableEnd = this._findEditableEnd(token.text, token.type);
      const startPos = this._absoluteToLineColumn(token.start);
      const endPos = this._absoluteToLineColumn(token.start + editableEnd);

      this.cursorLine = endPos.line;
      this.cursorColumn = endPos.column;
      this.selectionStart = { line: startPos.line, column: startPos.column };
      this.selectionEnd = { line: endPos.line, column: endPos.column };
    } else {
      // Just move cursor to the start of the token
      const pos = this._absoluteToLineColumn(token.start);
      this.cursorLine = pos.line;
      this.cursorColumn = pos.column;
      this.selectionStart = null;
      this.selectionEnd = null;
    }
  }

  /** Find the end of the editable portion in a token */
  private _findEditableEnd(tokenText: string, tokenType: string): number {
    // Define editable regions for different token types
    const editableRegions: Record<string, number> = {
      'wind': 5,          // "00000" in "00000KT"
      'datetime': 6,      // "000000" in "000000Z"
      'visibility': 4,    // "0000" for visibility
      'windVariation': 7, // "000V000" entire token is editable
    };

    return editableRegions[tokenType] || tokenText.length;
  }

  private _renderCursor(container: HTMLElement): void {
    // Remove old cursor
    const oldCursor = container.querySelector('.cursor');
    if (oldCursor) oldCursor.remove();

    // Only show cursor if focused
    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    if (document.activeElement !== this && this.shadowRoot!.activeElement !== textarea) {
      return;
    }

    const lineEl = container.querySelector(`[data-line="${this.cursorLine}"]`);
    if (!lineEl) return;

    const cursor = document.createElement('div');
    cursor.className = 'cursor';

    // Calculate cursor position (accounting for wrap)
    const cursorX = this._getVisualXForPosition(this.cursorLine, this.cursorColumn);
    cursor.style.left = `${cursorX}px`;

    // Calculate Y offset within the line (for wrapped lines)
    if (this._wrapEnabled) {
      const breaks = this._getWrapBreaks(this.cursorLine);
      let visualRowInLine = 0;
      for (const breakPoint of breaks) {
        if (this.cursorColumn >= breakPoint) {
          visualRowInLine++;
        } else {
          break;
        }
      }
      cursor.style.top = `${visualRowInLine * this.lineHeight}px`;
    } else {
      cursor.style.top = '0';
    }

    lineEl.appendChild(cursor);
  }

  private _updateCursor(container: HTMLElement): void {
    this._renderCursor(container);
  }

  /**
   * Get the absolute position in text where a line starts
   */
  private _getLineStartPosition(lineIndex: number): number {
    let pos = 0;
    for (let i = 0; i < lineIndex && i < this.lines.length; i++) {
      pos += this.lines[i].length + 1; // +1 for newline character
    }
    return pos;
  }

  /**
   * Render hint text below the current editable region
   */
  private _renderHint(container: HTMLElement): void {
    // Remove old hint
    const oldHint = container.querySelector('.editable-hint');
    if (oldHint) oldHint.remove();

    // Only show hint if in editable mode with a hint defined
    if (!this._currentEditable) return;

    const currentRegion = this._currentEditable.regions[this._currentEditable.currentRegionIndex];
    if (!currentRegion || !currentRegion.hint) return;

    // Only show hint if focused
    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    if (document.activeElement !== this && this.shadowRoot!.activeElement !== textarea) {
      return;
    }

    // Only show hint if cursor is within the editable region
    const cursorAbsolutePos = this._getLineStartPosition(this.cursorLine) + this.cursorColumn;
    if (cursorAbsolutePos < this._currentEditable.editableStart ||
        cursorAbsolutePos > this._currentEditable.editableEnd) {
      return;
    }

    const lineEl = container.querySelector(`[data-line="${this.cursorLine}"]`);
    if (!lineEl) return;

    const hint = document.createElement('div');
    hint.className = 'editable-hint';
    hint.textContent = currentRegion.hint;

    // Position hint below the editable region
    // Calculate X position at the start of the editable region
    const editableStartCol = this._currentEditable.editableStart - this._getLineStartPosition(this.cursorLine);
    const hintX = editableStartCol * this._charWidth;
    hint.style.left = `${hintX}px`;

    // Calculate Y offset (below the current line, accounting for wrap)
    if (this._wrapEnabled) {
      const breaks = this._getWrapBreaks(this.cursorLine);
      let visualRowInLine = 0;
      for (const breakPoint of breaks) {
        if (this.cursorColumn >= breakPoint) {
          visualRowInLine++;
        } else {
          break;
        }
      }
      hint.style.top = `${(visualRowInLine + 1) * this.lineHeight}px`;
    } else {
      hint.style.top = `${this.lineHeight}px`;
    }

    lineEl.appendChild(hint);
  }

  private _renderSelection(container: HTMLElement, startIndex: number, endIndex: number): void {
    // Remove old selections
    container.querySelectorAll('.selection').forEach(el => el.remove());

    const sel = this._normalizeSelection();
    if (!sel) return;

    for (let i = Math.max(sel.start.line, startIndex); i <= Math.min(sel.end.line, endIndex - 1); i++) {
      const lineEl = container.querySelector(`[data-line="${i}"]`);
      if (!lineEl) continue;

      const lineText = this.lines[i] || '';
      let startCol = 0;
      let endCol = lineText.length;

      if (i === sel.start.line) startCol = sel.start.column;
      if (i === sel.end.line) endCol = sel.end.column;

      // When wrap is enabled, selection might span multiple visual rows
      if (this._wrapEnabled) {
        this._renderSelectionWithWrap(lineEl, i, startCol, endCol);
      } else {
        const selEl = document.createElement('div');
        selEl.className = 'selection';
        selEl.style.left = `${startCol * this._charWidth}px`;
        selEl.style.width = `${(endCol - startCol) * this._charWidth}px`;
        lineEl.insertBefore(selEl, lineEl.firstChild);
      }
    }
  }

  /**
   * Render selection for a single logical line with wrap enabled
   * Creates multiple selection rectangles if the selection spans visual rows
   */
  private _renderSelectionWithWrap(lineEl: Element, lineIndex: number, startCol: number, endCol: number): void {
    const breaks = this._getWrapBreaks(lineIndex);

    if (breaks.length === 0) {
      // No wrapping on this line, simple case
      const selEl = document.createElement('div');
      selEl.className = 'selection';
      selEl.style.left = `${startCol * this._charWidth}px`;
      selEl.style.width = `${(endCol - startCol) * this._charWidth}px`;
      selEl.style.top = '0';
      lineEl.insertBefore(selEl, lineEl.firstChild);
      return;
    }

    // Build segments: [0, breaks[0]], [breaks[0], breaks[1]], ..., [breaks[n-1], lineLength]
    const lineText = this.lines[lineIndex] || '';
    const segments: { start: number; end: number; visualRow: number }[] = [];
    let segStart = 0;
    for (let row = 0; row <= breaks.length; row++) {
      const segEnd = row < breaks.length ? breaks[row] : lineText.length;
      segments.push({ start: segStart, end: segEnd, visualRow: row });
      segStart = segEnd;
    }

    // Create selection rectangles for each segment that overlaps with [startCol, endCol]
    for (const seg of segments) {
      // Check overlap
      const overlapStart = Math.max(startCol, seg.start);
      const overlapEnd = Math.min(endCol, seg.end);

      if (overlapStart < overlapEnd) {
        const selEl = document.createElement('div');
        selEl.className = 'selection';
        selEl.style.left = `${(overlapStart - seg.start) * this._charWidth}px`;
        selEl.style.width = `${(overlapEnd - overlapStart) * this._charWidth}px`;
        selEl.style.top = `${seg.visualRow * this.lineHeight}px`;
        lineEl.insertBefore(selEl, lineEl.firstChild);
      }
    }
  }

  // ========== Suggestions ==========

  /**
   * Find the token type for suggestions based on cursor position
   * Uses cached this._tokens instead of re-tokenizing
   * @returns { tokenType, prevTokenText } or null if no grammar
   */
  private _getTokenTypeForSuggestions(cursorPos: number): { tokenType: string | null; prevTokenText: string } | null {
    // Filter out whitespace tokens
    const nonWhitespaceTokens = this._tokens.filter(t => t.type !== 'whitespace');

    if (nonWhitespaceTokens.length === 0) {
      return { tokenType: null, prevTokenText: '' };
    }

    // Find token at cursor and token before cursor
    let tokenAtCursor: typeof nonWhitespaceTokens[0] | null = null;
    let tokenBeforeCursor: typeof nonWhitespaceTokens[0] | null = null;

    for (let i = 0; i < nonWhitespaceTokens.length; i++) {
      const token = nonWhitespaceTokens[i];

      // Cursor is INSIDE token (not at the end)
      if (cursorPos >= token.start && cursorPos < token.end) {
        tokenAtCursor = token;
        tokenBeforeCursor = i > 0 ? nonWhitespaceTokens[i - 1] : null;
        break;
      }

      // Cursor is AT or AFTER the end of this token
      if (cursorPos >= token.end) {
        tokenBeforeCursor = token;
      }
    }

    // If cursor is inside a token, use the token BEFORE it for suggestions (alternatives)
    // If cursor is after a token, use that token for suggestions (what comes next)
    if (tokenAtCursor && tokenBeforeCursor) {
      // Inside a token - suggest alternatives (what comes after the previous token)
      return { tokenType: tokenBeforeCursor.type, prevTokenText: tokenBeforeCursor.text };
    } else if (tokenBeforeCursor) {
      // After a token - suggest what comes next
      return { tokenType: tokenBeforeCursor.type, prevTokenText: tokenBeforeCursor.text };
    }

    return { tokenType: null, prevTokenText: '' };
  }

  private async _updateSuggestions(force: boolean = false): Promise<void> {
    // Get current word being typed (filter text)
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const match = beforeCursor.match(/(\S*)$/);
    const currentWord = match ? match[1].toUpperCase() : '';

    // Check if cursor is at a token boundary (after space or at start of line)
    // If so, we need to recalculate suggestions from parser, not just filter
    const isAtTokenBoundary = beforeCursor.length === 0 || /\s$/.test(beforeCursor);

    // Special case: no grammar detected yet - show initial suggestions filtered by typed text
    // This allows typing "VA" to filter and show "VA ADVISORY"
    const noGrammarYet = !this._messageType;

    // If suggestions popup is already open, check if we should filter or recalculate
    if (this._showSuggestions && this._unfilteredSuggestions.length > 0) {
      // If we're at a token boundary, close popup and let new suggestions be calculated
      // This handles the case of backspace/delete moving cursor to previous token
      // or deleting text entirely (cursor at position 0)
      if (isAtTokenBoundary) {
        // Series stack is preserved automatically (not cleared in _hideSuggestions)
        this._hideSuggestions();
        // Fall through to recalculate suggestions below
      } else if (!noGrammarYet || currentWord.length > 0) {
        // Still typing in same token - just filter
        this._suggestionFilter = currentWord;
        this._filterSuggestions();
        return;
      } else {
        // No grammar and at non-boundary with nothing typed - recalculate
        // Series stack is preserved automatically
        this._hideSuggestions();
        // Fall through to recalculate suggestions below
      }
    }

    // Calculate cursor position in text
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1; // +1 for newline
    }
    cursorPos += this.cursorColumn;

    // Update provider context for suggestion providers
    this.parser.updateProviderContext(this.value, cursorPos);

    // Get token type from cached tokens and get suggestions (async for provider support)
    const tokenInfo = this._getTokenTypeForSuggestions(cursorPos);

    // Check if any provider requires user interaction (shows overlay with message)
    const isUserInteraction = this.parser.hasUserInteractionProvider();

    // Get default timeout from provider options (use 500ms as default)
    const DEFAULT_TIMEOUT = 500;
    let providerTimeout = DEFAULT_TIMEOUT;
    for (const [, options] of (this.parser as any)._suggestionProviders) {
      if (options.timeout !== undefined) {
        providerTimeout = Math.max(providerTimeout, options.timeout);
      }
    }

    // Show loading state
    if (isUserInteraction) {
      // User interaction mode: show overlay with message
      this._updateWaitingUI(true, true);
    } else {
      // Non-blocking mode: show popup immediately with spinner
      this._showSuggestions = true;
      this._unfilteredSuggestions = [];
      this._suggestions = [];
      this._showSuggestionsLoading(true);
      this._positionSuggestions();
      this._renderSuggestions();
    }

    // Fetch suggestions with timeout
    let timedOut = false;
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, providerTimeout);
    });

    const suggestionsPromise = this.parser.getSuggestionsForTokenType(
      tokenInfo?.tokenType || null,
      tokenInfo?.prevTokenText,
      this.messageTypeConfigs,
      this._tokens
    );

    const result = await Promise.race([suggestionsPromise, timeoutPromise]);

    // Get actual suggestions (may have arrived after timeout race)
    let newSuggestions: Suggestion[];
    if (timedOut) {
      // Timeout occurred - check if we got results anyway
      const actualResult = await Promise.race([
        suggestionsPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))
      ]);
      newSuggestions = actualResult || [];

      // Add timeout message if no results
      if (newSuggestions.length === 0) {
        newSuggestions = [{
          text: '',
          description: 'Loading expired',
          selectable: false
        }];
      }
    } else {
      newSuggestions = result || [];
    }

    // Hide loading state
    this._showSuggestionsLoading(false);
    if (isUserInteraction) {
      this._updateWaitingUI(false, true);
    }

    // Filter out switchGrammar suggestions based on configured messageTypes
    // Only show switchGrammar options whose TAC codes are explicitly in messageTypes
    const configuredTypes = this.messageTypes;
    const filteredSuggestions = newSuggestions.filter(sug => {
      if (!sug.switchGrammar) return true;
      const tacCode = sug.switchGrammar.toUpperCase();
      // Check if this TAC code is directly configured
      return configuredTypes.includes(tacCode);
    });

    // Flatten categories without registered provider: show children directly
    this._unfilteredSuggestions = this._flattenCategoriesWithoutProvider(filteredSuggestions);
    this._suggestionFilter = currentWord;
    this._selectedSuggestion = 0;

    // Show suggestions if:
    // - force is true (Ctrl+Space)
    // - at token boundary (after space or start)
    // - no grammar detected yet AND user is typing something (filter initial suggestions)
    const shouldShow = force || this._shouldShowSuggestions() || (noGrammarYet && currentWord.length > 0);

    if (newSuggestions.length > 0 && shouldShow) {
      this._showSuggestions = true;
      this._filterSuggestions();
      this._positionSuggestions();
      // Launch parallel loading for providers with category=false
      this._loadPendingProviders();
    } else {
      this._hideSuggestions();
    }
  }

  /** Show/hide loading indicator in suggestions popup */
  private _showSuggestionsLoading(loading: boolean, label: string = ''): void {
    this._isLoadingSuggestions = loading;
    this._loadingLabel = label;
    const container = this.shadowRoot?.getElementById('suggestionsContainer');
    if (container) {
      container.classList.toggle('loading', loading);
    }
  }

  /** Filter suggestions based on current typed text and AUTO mode */
  private _filterSuggestions(): void {
    // Start with all suggestions
    let filtered = [...this._unfilteredSuggestions];

    // Filter by AUTO mode: hide AUTO-specific entries when observation-auto is not set
    // This applies only to observation grammars (SA/SP = METAR/SPECI)
    const grammarName = this.parser.currentGrammarName?.toLowerCase() || '';
    const isObservationGrammar = grammarName.startsWith('sa') || grammarName.startsWith('sp');
    const hideAutoEntries = isObservationGrammar && !this.observationAuto;

    if (hideAutoEntries) {
      filtered = this._filterAutoSuggestions(filtered);
    }

    // Filter by typed text
    if (this._suggestionFilter) {
      const filter = this._suggestionFilter.toUpperCase();
      filtered = filtered.filter(sug => {
        const text = sug.text.toUpperCase();
        return text.startsWith(filter) || text.includes(filter);
      });
    }

    // Add "Back" suggestion at the beginning if we're in a submenu
    if (this._suggestionMenuStack.length > 0) {
      filtered.unshift({
        text: 'Back',
        description: 'Return to previous menu',
        isBack: true
      });
    }

    this._suggestions = filtered;
    this._selectedSuggestion = this._suggestionMenuStack.length > 0 ? 1 : 0; // Skip "Back" by default

    // Auto-expand single category: if there's only one suggestion and it's a category with a REGISTERED provider,
    // fetch its content directly without creating a menu level
    if (this._suggestions.length === 1 && this._suggestions[0].isCategory && this._suggestions[0].provider && this.hasProvider(this._suggestions[0].provider)) {
      this._expandSingleCategory(this._suggestions[0]);
      return;
    }

    if (this._suggestions.length > 0) {
      this._renderSuggestions();
    } else {
      // No matches - hide suggestions
      this._hideSuggestions();
    }
  }

  /** Filter out AUTO-specific suggestions (recursive for categories) */
  private _filterAutoSuggestions(suggestions: Suggestion[]): Suggestion[] {
    const result: Suggestion[] = [];

    for (const sug of suggestions) {
      // Filter out suggestions marked as auto
      if (sug.auto) continue;

      // For categories, filter children recursively
      if (sug.isCategory && sug.children) {
        const filteredChildren = this._filterAutoSuggestions(sug.children);
        // Keep category if it has provider (children loaded on click) or has non-auto children
        if (filteredChildren.length === 0 && !sug.provider) continue;
        // Create a copy with filtered children (don't mutate original)
        result.push({ ...sug, children: filteredChildren });
      } else {
        result.push(sug);
      }
    }

    return result;
  }

  private _shouldShowSuggestions(): boolean {
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    return beforeCursor.length === 0 || /\s$/.test(beforeCursor);
  }

  /** Force show suggestions (Ctrl+Space) - gets suggestions for current context */
  private async _forceShowSuggestions(): Promise<void> {
    // Invalidate any pending blur timeout to prevent it from hiding these new suggestions
    this._lastBlurTimestamp = 0;

    // In template mode, get field-specific suggestions based on the current field's labelType
    if (this._isTemplateMode && this._templateRenderer.isActive) {
      const state = this._templateRenderer.state;
      if (state) {
        // Find which field the cursor is on based on line number
        const currentField = state.fields.find(f => f.lineIndex === this.cursorLine);
        if (currentField) {
          // Get suggestions for this field based on its labelType
          this._unfilteredSuggestions = this.parser.getTemplateSuggestions(currentField.field.labelType);

          // Set _showSuggestions BEFORE _filterSuggestions so that _renderSuggestions()
          // (called from _filterSuggestions) doesn't early-exit due to _showSuggestions being false
          this._showSuggestions = true;

          this._filterSuggestions();

          if (this._suggestions.length > 0) {
            this._positionSuggestions();
          } else {
            this._showSuggestions = false;
          }
          return;
        }
      }
    }

    // Calculate cursor position in text
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    // Update provider context for suggestion providers
    this.parser.updateProviderContext(this.value, cursorPos);

    // Get token type from cached tokens and get suggestions (async for provider support)
    const tokenInfo = this._getTokenTypeForSuggestions(cursorPos);

    // Check if any provider requires user interaction
    const isUserInteraction = this.parser.hasUserInteractionProvider();

    // Show loading state
    if (isUserInteraction) {
      this._updateWaitingUI(true, true);
    } else {
      this._showSuggestions = true;
      this._unfilteredSuggestions = [];
      this._suggestions = [];
      this._showSuggestionsLoading(true);
      this._positionSuggestions();
      this._renderSuggestions();
    }

    const rawSuggestions = await this.parser.getSuggestionsForTokenType(
      tokenInfo?.tokenType || null,
      tokenInfo?.prevTokenText,
      this.messageTypeConfigs,
      this._tokens
    );
    // Flatten categories without registered provider
    this._unfilteredSuggestions = this._flattenCategoriesWithoutProvider(rawSuggestions);

    // Hide loading state
    this._showSuggestionsLoading(false);
    if (isUserInteraction) {
      this._updateWaitingUI(false, true);
    }

    // Set _showSuggestions BEFORE _filterSuggestions so that _renderSuggestions()
    // (called from _filterSuggestions) doesn't early-exit due to _showSuggestions being false
    this._showSuggestions = true;

    this._filterSuggestions();

    if (this._suggestions.length > 0) {
      this._positionSuggestions();
      // Launch parallel loading for providers with category=false
      this._loadPendingProviders();
    } else {
      this._showSuggestions = false;
    }
  }

  /**
   * Show suggestions based on a specific token ref (used by skipToNext)
   * This allows skip suggestions to specify which after section to use
   */
  private async _showSuggestionsForRef(tokenRef: string): Promise<void> {
    // Check if any provider requires user interaction
    const isUserInteraction = this.parser.hasUserInteractionProvider();

    // Show loading state
    if (isUserInteraction) {
      this._updateWaitingUI(true, true);
    } else {
      this._showSuggestions = true;
      this._unfilteredSuggestions = [];
      this._suggestions = [];
      this._showSuggestionsLoading(true);
      this._positionSuggestions();
      this._renderSuggestions();
    }

    // Get suggestions from after.[tokenRef]
    const rawSuggestions = await this.parser.getSuggestionsForTokenType(tokenRef, '', undefined, this._tokens);
    this._unfilteredSuggestions = this._flattenCategoriesWithoutProvider(rawSuggestions);

    // Hide loading state
    this._showSuggestionsLoading(false);
    if (isUserInteraction) {
      this._updateWaitingUI(false, true);
    }

    // Set _showSuggestions BEFORE _filterSuggestions so that _renderSuggestions()
    // (called from _filterSuggestions) doesn't early-exit due to _showSuggestions being false
    this._showSuggestions = true;

    this._filterSuggestions();

    if (this._suggestions.length > 0) {
      this._positionSuggestions();
      // Launch parallel loading for providers with category=false
      this._loadPendingProviders();
    } else {
      this._showSuggestions = false;
      this._hideSuggestions();
    }
  }

  private _renderSuggestions(): void {
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (!container) return;

    // Show popup if: suggestions visible AND (have suggestions OR loading in non-blocking mode)
    const shouldShowPopup = this._showSuggestions && (this._suggestions.length > 0 || this._isLoadingSuggestions);

    if (!shouldShowPopup) {
      container.classList.remove('visible');
      return;
    }

    // If loading with no suggestions yet, show loading message with label (like a disabled suggestion)
    if (this._isLoadingSuggestions && this._suggestions.length === 0) {
      const labelHtml = this._loadingLabel
        ? `<span class="suggestion-text">${this._escapeHtml(this._loadingLabel)}</span>`
        : '';
      container.innerHTML = `
        <div class="suggestion-item disabled loading">
          ${labelHtml}
          <span class="suggestion-desc"><span class="spinner"></span> Loading...</span>
        </div>`;
      container.classList.add('visible');
      return;
    }

    // Show filter header if active
    let headerHtml = '';
    if (this._suggestionFilter) {
      headerHtml = `<div class="suggestion-filter">Filter: ${this._escapeHtml(this._suggestionFilter)}</div>`;
    }

    const html = headerHtml + this._suggestions
      .map((sug, i) => {
        const selected = i === this._selectedSuggestion ? 'selected' : '';
        const categoryClass = sug.isCategory ? 'category' : '';
        const disabledClass = sug.selectable === false ? 'disabled' : '';
        const backClass = sug.isBack ? 'back-nav' : '';
        const loadingClass = sug.loadingProvider ? 'loading' : '';
        const categoryIcon = sug.isCategory ? '<span class="suggestion-arrow">▶</span>' : '';
        // Show spinner for loading items
        const descContent = sug.loadingProvider
          ? `<span class="spinner"></span> ${this._escapeHtml(sug.description || 'Loading...')}`
          : this._escapeHtml(sug.description || '');
        // Use label if defined, otherwise text
        const displayText = sug.label || sug.text;
        return `
        <div class="suggestion-item ${selected} ${categoryClass} ${disabledClass} ${backClass} ${loadingClass}" data-index="${i}">
          <div class="suggestion-content">
            <span class="suggestion-text">${this._escapeHtml(displayText)}</span>
            ${descContent ? `<span class="suggestion-desc">${descContent}</span>` : ''}
          </div>
          ${categoryIcon}
        </div>
      `;
      })
      .join('');

    container.innerHTML = html;
    container.classList.add('visible');
  }

  /**
   * Load pending providers in parallel and update suggestions as they arrive.
   * This method finds all suggestions with loadingProvider set, launches
   * parallel requests, and updates the list incrementally.
   */
  private _loadPendingProviders(): void {
    // Find all loading placeholders in unfiltered suggestions
    const pendingProviders = this._unfilteredSuggestions
      .filter(sug => sug.loadingProvider);

    if (pendingProviders.length === 0) return;

    // Launch all provider requests in parallel (skip already loading ones)
    for (const sug of pendingProviders) {
      const providerId = sug.loadingProvider!;

      // Skip if already loading this provider
      if (this._loadingProviderRequests.has(providerId)) {
        continue;
      }

      // Get provider options for timeout and cache settings
      const providerOptions = this.parser.getProviderOptions(providerId);
      const timeout = providerOptions?.timeout ?? 500;
      const cacheOption = providerOptions?.cache;
      const useReplace = providerOptions?.replace !== false;

      // Get cache key
      const cacheKey = this.parser.getProviderCacheKey(providerId);

      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        // Filter cached data for duplicates (tokens may have changed since caching)
        const filteredCachedData = this.parser.filterProviderSuggestionsIfNeeded(providerId, cachedData, this._tokens);
        this._updateProviderSuggestion(filteredCachedData, providerId, useReplace);
        continue;
      }

      // Mark as loading and launch async provider request
      this._loadingProviderRequests.add(providerId);
      this._loadSingleProvider(providerId, timeout, cacheKey, cacheOption, useReplace);
    }
  }

  /**
   * Load a single provider asynchronously and update its suggestion when complete.
   */
  private async _loadSingleProvider(
    providerId: string,
    timeout: number,
    cacheKey: string,
    cacheOption: boolean | number | 'minute' | 'hour' | 'day' | undefined,
    useReplace: boolean
  ): Promise<void> {
    try {
      // Fetch from provider with timeout
      const providerPromise = this.parser.getProviderSuggestions(providerId);

      let providerSuggestions: Suggestion[] | null = null;
      let timedOut = false;

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeout);
      });

      const result = await Promise.race([providerPromise, timeoutPromise]);

      if (timedOut) {
        // Check if result arrived just after timeout
        const lateResult = await Promise.race([
          providerPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))
        ]);
        if (lateResult && lateResult.suggestions.length > 0) {
          providerSuggestions = lateResult.suggestions;
        }
      } else if (result) {
        providerSuggestions = result.suggestions;
      }

      // Convert provider suggestions (pass providerId as ref for after-lookup)
      let suggestions: Suggestion[] = providerSuggestions
        ? providerSuggestions.map(s => this._convertProviderSuggestion(s, providerId))
        : [];

      // Filter duplicates if token has noDuplicates condition
      if (suggestions.length > 0) {
        suggestions = this.parser.filterProviderSuggestionsIfNeeded(providerId, suggestions, this._tokens);
      }

      // Cache results if caching is enabled
      if (suggestions.length > 0) {
        const expiresAt = this._getCacheExpiration(cacheOption);
        if (expiresAt > 0) {
          this._providerCache.set(cacheKey, { data: suggestions, expiresAt });
        }
      }

      // Update the suggestion (find by providerId, not index)
      this._updateProviderSuggestion(suggestions, providerId, useReplace, timedOut);
    } finally {
      // Always remove from loading set when done
      this._loadingProviderRequests.delete(providerId);
    }
  }

  /**
   * Update a provider suggestion with loaded results.
   * Finds the loading placeholder by providerId and replaces it with actual results.
   */
  private _updateProviderSuggestion(
    suggestions: Suggestion[],
    providerId: string,
    useReplace: boolean,
    timedOut: boolean = false
  ): void {
    // Find the loading placeholder by providerId (not by index - index can change)
    const index = this._unfilteredSuggestions.findIndex(s => s.loadingProvider === providerId);
    if (index === -1) {
      // Suggestion no longer exists (user typed something, suggestions refreshed)
      return;
    }

    const current = this._unfilteredSuggestions[index];

    if (suggestions.length === 0) {
      if (timedOut) {
        // Show timeout message
        this._unfilteredSuggestions[index] = {
          text: current.text,
          description: 'Loading expired',
          ref: current.ref,
          selectable: false
        };
      } else {
        // Provider returned nothing - get fallback from grammar
        const grammar = this.parser.currentGrammar;
        const tokenDef = grammar?.tokens?.[providerId];
        const placeholder = tokenDef?.placeholder;
        if (useReplace && placeholder) {
          this._unfilteredSuggestions[index] = {
            text: placeholder.value,
            description: tokenDef?.description || '',
            ref: providerId,
            editable: placeholder.editable,
            appendToPrevious: tokenDef?.appendToPrevious
          };
        } else {
          // Remove the loading placeholder
          this._unfilteredSuggestions.splice(index, 1);
        }
      }
    } else if (suggestions.length === 1) {
      // Single suggestion - replace the placeholder
      this._unfilteredSuggestions[index] = suggestions[0];
    } else {
      // Multiple suggestions - replace placeholder with first, insert rest after
      this._unfilteredSuggestions.splice(index, 1, ...suggestions);
    }

    // Re-filter and render
    this._filterSuggestions();
  }

  private _scrollSuggestionIntoView(): void {
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (!container) return;

    const selectedItem = container.querySelector('.suggestion-item.selected') as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  private _positionSuggestions(): void {
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    const viewport = this.shadowRoot!.getElementById('viewport');
    if (!container || !viewport) return;

    const viewportRect = viewport.getBoundingClientRect();

    // Calculate cursor position in screen coordinates (accounting for wrap)
    const cursorVisualX = this._getVisualXForPosition(this.cursorLine, this.cursorColumn);
    const cursorVisualY = this._getVisualYForPosition(this.cursorLine, this.cursorColumn);
    const cursorScreenX = viewportRect.left + 12 + cursorVisualX;
    const cursorScreenY = viewportRect.top + 8 + cursorVisualY - viewport.scrollTop;

    // Temporarily make container visible to measure its height
    container.style.visibility = 'hidden';
    container.classList.add('visible');
    const containerHeight = container.offsetHeight || 150;
    container.style.visibility = '';

    // Calculate available space on screen
    const spaceBelow = window.innerHeight - cursorScreenY - this.lineHeight - 10;
    const spaceAbove = cursorScreenY - 10;

    let top: number;

    if (spaceBelow >= containerHeight || spaceBelow >= spaceAbove) {
      // Position below cursor
      top = cursorScreenY + this.lineHeight;
    } else {
      // Position above cursor
      top = cursorScreenY - Math.min(containerHeight, spaceAbove);
    }

    // Ensure popup doesn't go off-screen horizontally
    const left = Math.min(cursorScreenX, window.innerWidth - 220);

    container.style.left = `${Math.max(0, left)}px`;
    container.style.top = `${Math.max(0, top)}px`;
    container.style.minWidth = '200px';
    container.style.maxHeight = '300px'; // Enough for 8 message types without scroll
  }

  /**
   * Convert a ProviderSuggestion to a Suggestion (recursive for children)
   * @param ps - Provider suggestion to convert
   * @param ref - Optional token reference (tokenId) to add to suggestions for after-lookup
   */
  private _convertProviderSuggestion(ps: ProviderSuggestion, ref?: string): Suggestion {
    return {
      ...ps,
      description: ps.description || '',
      ref: ps.ref || ref, // Use provider's ref if set, otherwise use the tokenId
      children: ps.children?.map(c => this._convertProviderSuggestion(c, ref))
    };
  }

  /**
   * Calculate cache expiration time based on cache option
   * @param cacheOption - The cache configuration
   * @returns expiration timestamp (0 = no cache, Infinity = never expires)
   */
  private _getCacheExpiration(cacheOption: boolean | number | 'minute' | 'hour' | 'day' | undefined): number {
    if (cacheOption === undefined || cacheOption === false) {
      return 0; // No caching
    }

    const now = Date.now();

    if (cacheOption === true) {
      return Infinity; // Cache indefinitely
    }

    if (typeof cacheOption === 'number') {
      return now + cacheOption; // TTL in milliseconds
    }

    // Time-boundary alignment: cache until next boundary
    const date = new Date();
    switch (cacheOption) {
      case 'minute':
        // Expire at next minute boundary
        date.setSeconds(0, 0);
        date.setMinutes(date.getMinutes() + 1);
        return date.getTime();
      case 'hour':
        // Expire at next hour boundary
        date.setMinutes(0, 0, 0);
        date.setHours(date.getHours() + 1);
        return date.getTime();
      case 'day':
        // Expire at midnight
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 1);
        return date.getTime();
      default:
        return 0;
    }
  }

  /**
   * Check if a cached entry is still valid
   * @param providerId - The provider ID to check
   * @returns The cached data if valid, or null if expired/not found
   */
  private _getCachedData(providerId: string): Suggestion[] | null {
    const cached = this._providerCache.get(providerId);
    if (!cached) return null;

    // Check expiration
    if (cached.expiresAt !== Infinity && Date.now() >= cached.expiresAt) {
      // Cache expired, remove it
      this._providerCache.delete(providerId);
      return null;
    }

    return cached.data;
  }

  private _hideSuggestions(): void {
    this._showSuggestions = false;
    this._suggestionMenuStack = []; // Clear submenu stack
    this._unfilteredSuggestions = []; // Clear unfiltered suggestions
    this._suggestions = []; // Clear filtered suggestions to prevent stale data
    this._suggestionFilter = ''; // Clear filter
    this._loadingProviderRequests.clear(); // Clear pending provider requests
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (container) {
      container.classList.remove('visible');
    }
  }

  /** Navigate back to parent menu in suggestion submenu hierarchy */
  private _goBackToParentMenu(): void {
    if (this._suggestionMenuStack.length > 0) {
      // Restore previous grammar if we came from a switchGrammar
      if (this._previousGrammarName) {
        this.parser.setGrammar(this._previousGrammarName);
        this._previousGrammarName = null;
        this._tokenize();
        this.renderViewport();
        this._updateStatus();
      }
      this._unfilteredSuggestions = this._suggestionMenuStack.pop()!;
      this._suggestionFilter = '';
      this._filterSuggestions();
    }
  }

  private _applySuggestion(suggestion: Suggestion): void {
    if (!suggestion) return;

    // If this is a back navigation suggestion, go back to parent menu
    if (suggestion.isBack) {
      this._goBackToParentMenu();
      return;
    }

    // If this is a skip suggestion, just hide suggestions and show next ones
    if (suggestion.skipToNext) {
      this._hideSuggestions();

      // Add a space after the current token to separate from next token
      const line = this.lines[this.cursorLine] || '';
      const afterCursor = line.substring(this.cursorColumn);
      if (!afterCursor.startsWith(' ')) {
        this.lines[this.cursorLine] = line.substring(0, this.cursorColumn) + ' ' + afterCursor;
      }
      // Position cursor after the space
      this.cursorColumn++;

      this._tokenize();
      this.renderViewport();
      this._updateStatus();
      // Use the suggestion's ref to look up next suggestions (if provided)
      // This allows skip to specify what comes next (e.g., "cloud" -> after.cloud)
      if (suggestion.ref) {
        this._showSuggestionsForRef(suggestion.ref);
      } else {
        this._forceShowSuggestions();
      }
      return;
    }

    // If this is a category with provider, ALWAYS open category (fetch from provider)
    if (suggestion.isCategory && suggestion.provider) {
      this._openCategoryWithProvider(suggestion);
      return;
    }

    // If this is a category with children (no provider), open the submenu
    if (suggestion.isCategory && suggestion.children && suggestion.children.length > 0) {
      // Push current unfiltered suggestions to stack (for back navigation)
      this._suggestionMenuStack.push([...this._unfilteredSuggestions]);
      // Show children and reset filter
      this._unfilteredSuggestions = suggestion.children;
      this._suggestionFilter = '';
      this._filterSuggestions();
      return;
    }

    // If we're in editable mode and selecting a value, apply it to the editable region
    if (this._currentEditable) {
      this._applyEditableDefault(suggestion.text);
      return;
    }

    // If suggestion has a tacCode, this is a message type selection
    // Load the grammar and handle based on grammar configuration
    if (suggestion.tacCode) {
      this._applyMessageTypeSuggestion(suggestion);
      return;
    }

    // If suggestion has switchGrammar, switch to that grammar and show its suggestions
    if (suggestion.switchGrammar) {
      this._applySwitchGrammarSuggestion(suggestion);
      return;
    }

    // If suggestion has a provider (non-category), request data from it
    if (suggestion.provider) {
      this._applyProviderSuggestion(suggestion);
      return;
    }

    // Save state BEFORE making changes
    this._saveToHistory();

    // In template mode with selection, replace the selected value
    if (this._isTemplateMode && this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    }

    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const afterCursor = line.substring(this.cursorColumn);

    // Find word boundary - prefix before cursor (partial word being typed)
    const prefixMatch = beforeCursor.match(/(\S*)$/);
    let prefix = prefixMatch ? prefixMatch[1] : '';
    let insertPos = this.cursorColumn - prefix.length;

    // Handle appendToPrevious: append directly to the previous token
    if (suggestion.appendToPrevious) {
      if (beforeCursor.endsWith(' ')) {
        // Cursor is after a space - remove the space and append
        insertPos = this.cursorColumn - 1;
        prefix = ' ';
      } else if (prefix !== '') {
        // Cursor is at end of a token - just append (don't replace the token)
        insertPos = this.cursorColumn;
        prefix = '';
      }
      // Insert text directly without trailing space
      const suffixMatch = afterCursor.match(/^(\S*)/);
      const suffix = suffixMatch ? suffixMatch[1] : '';
      const afterToken = afterCursor.substring(suffix.length);

      this.lines[this.cursorLine] =
        line.substring(0, insertPos) + suggestion.text + afterToken;

      // Clear suggestion state (but keep series stack - it will be cleared if no appendToPrevious in new suggestions)
      this._suggestionMenuStack = [];
      this._showSuggestions = false;
      this._unfilteredSuggestions = [];
      this._suggestionFilter = '';

      // Handle editable region if present
      const hasEditable = Array.isArray(suggestion.editable) && suggestion.editable.length > 0;
      if (hasEditable) {
        const editable = suggestion.editable![0];
        // Set selection on the editable part of the inserted token
        this.selectionStart = { line: this.cursorLine, column: insertPos + editable.start };
        this.selectionEnd = { line: this.cursorLine, column: insertPos + editable.end };
        // Position cursor at end of selection
        this.cursorColumn = insertPos + editable.end;
        // Store editable info for validation during editing
        this._currentEditable = {
          tokenStart: insertPos,
          tokenEnd: insertPos + suggestion.text.length,
          editableStart: insertPos + editable.start,
          editableEnd: insertPos + editable.end,
          suffix: suggestion.text.substring(editable.end),
          defaultsFunction: editable.defaultsFunction,
          ref: suggestion.ref,
          regions: suggestion.editable!,
          currentRegionIndex: 0
        };
        this._afterEdit();
      } else {
        // Add a space after the inserted text to separate from next token
        const currentLine = this.lines[this.cursorLine];
        const endPos = insertPos + suggestion.text.length;
        if (endPos >= currentLine.length || currentLine[endPos] !== ' ') {
          this.lines[this.cursorLine] = currentLine.substring(0, endPos) + ' ' + currentLine.substring(endPos);
        }
        // Position cursor after the space
        this.cursorColumn = endPos + 1;
        this._afterEdit();
        // Show suggestions for next step (e.g., after CB/TCU is appended)
        this._forceShowSuggestions();
      }
      return;
    }

    // Handle newLineBefore: insert a newline before the token (for multiline formats like VAA)
    if (suggestion.newLineBefore) {
      // Insert newline + token on new line
      const currentLineContent = line.substring(0, this.cursorColumn).trimEnd();
      const afterContent = line.substring(this.cursorColumn).trim();

      // Update current line (remove any trailing content that will move to new line)
      this.lines[this.cursorLine] = currentLineContent;

      // Insert new line with the suggestion
      const newLineContent = suggestion.text + (afterContent ? ' ' + afterContent : ' ');
      this.lines.splice(this.cursorLine + 1, 0, newLineContent);

      // Move cursor to end of inserted token on new line
      this.cursorLine++;
      this.cursorColumn = suggestion.text.length + 1;

      // Clear suggestion state (but keep series stack - it will be cleared if no appendToPrevious in new suggestions)
      this._suggestionMenuStack = [];
      this._showSuggestions = false;
      this._unfilteredSuggestions = [];
      this._suggestionFilter = '';

      this._afterEdit();
      return;
    }

    // For normal suggestions: if cursor is at end of a complete token (no partial typing),
    // we should ADD a new token, not replace the previous one
    const cursorAtEndOfToken = prefix !== '' && !afterCursor.match(/^\S/);
    if (cursorAtEndOfToken) {
      // Check if this is a new token (not a completion of the current prefix)
      const suggestionStartsWithPrefix = suggestion.text.toUpperCase().startsWith(prefix.toUpperCase());
      if (!suggestionStartsWithPrefix) {
        // This is a new token - add space before it
        insertPos = this.cursorColumn;
        prefix = '';
      }
    }

    // Find word boundary - suffix after cursor (the rest of the current token)
    const suffixMatch = afterCursor.match(/^(\S*)/);
    const suffix = suffixMatch ? suffixMatch[1] : '';

    // Build new line - remove prefix + suffix and insert suggestion
    const afterToken = afterCursor.substring(suffix.length);
    const hasEditable = Array.isArray(suggestion.editable) && suggestion.editable.length > 0;

    // Determine if we need to add a space before the inserted text
    // (when cursor is at end of previous token and we're inserting a new token)
    const needsLeadingSpace = insertPos === this.cursorColumn && prefix === '' && beforeCursor.length > 0 && !beforeCursor.endsWith(' ');

    // Determine if we need to add a space after the inserted text:
    // - Don't add space if afterToken already starts with whitespace
    // - Don't add space if the next tokens have appendToPrevious (like cloud heights after cloud amount)
    // - Add space otherwise to separate from next token
    const afterStartsWithSpace = /^\s/.test(afterToken);

    // Check if next tokens have appendToPrevious - if so, don't add trailing space
    // Also check if this is an end token (no next tokens) - don't add trailing space
    const grammar = this.parser.currentGrammar;
    const tokenRef = suggestion.ref || '';
    const nextTokenIds = grammar?.suggestions?.after?.[tokenRef] || [];
    const tokenDefs = grammar?.tokens || {};
    const nextHasAppendToPrevious = nextTokenIds.some((tokenId: string) => {
      const tokenDef = tokenDefs[tokenId] as TokenDefinition | undefined;
      return tokenDef?.appendToPrevious === true;
    });
    const isEndToken = nextTokenIds.length === 0;

    const needsTrailingSpace = !afterStartsWithSpace && !nextHasAppendToPrevious && !isEndToken;
    const insertedText = (needsLeadingSpace ? ' ' : '') + suggestion.text + (needsTrailingSpace ? ' ' : '');

    this.lines[this.cursorLine] =
      line.substring(0, insertPos) + insertedText + afterToken;

    // Clear suggestion state to force fetching new suggestions (but keep series stack)
    this._suggestionMenuStack = [];
    this._showSuggestions = false;
    this._unfilteredSuggestions = [];
    this._suggestionFilter = '';

    // Calculate the actual token start position (after any leading space)
    const tokenStartPos = insertPos + (needsLeadingSpace ? 1 : 0);

    // Handle editable region - select it for immediate editing
    if (hasEditable) {
      const editable = suggestion.editable![0];
      // Set selection on the editable part of the inserted token
      this.selectionStart = { line: this.cursorLine, column: tokenStartPos + editable.start };
      this.selectionEnd = { line: this.cursorLine, column: tokenStartPos + editable.end };
      // Position cursor at end of selection
      this.cursorColumn = tokenStartPos + editable.end;
      // Store editable info for validation during editing
      this._currentEditable = {
        tokenStart: tokenStartPos,
        tokenEnd: tokenStartPos + suggestion.text.length,
        editableStart: tokenStartPos + editable.start,
        editableEnd: tokenStartPos + editable.end,
        suffix: suggestion.text.substring(editable.end),
        defaultsFunction: editable.defaultsFunction,
        ref: suggestion.ref,
        regions: suggestion.editable!,
        currentRegionIndex: 0
      };
    } else {
      // No editable - move cursor after the inserted token AND any existing space
      // If afterToken already started with a space, we didn't add one, but cursor should skip it
      const skipExistingSpace = afterStartsWithSpace ? 1 : 0;
      this.cursorColumn = insertPos + insertedText.length + skipExistingSpace;
      this.selectionStart = null;
      this.selectionEnd = null;
      this._currentEditable = null;
    }

    // Check if this was a template mode identifier (like VA ADVISORY)
    // We check before _detectMessageType because template mode won't be set until grammar loads
    const isTemplateIdentifier = suggestion.text === 'VA ADVISORY' || suggestion.text === 'TC ADVISORY';

    // If suggestion has a specific tacCode, use it to force the correct grammar
    // This is needed for cases like TAF Long (FT) vs TAF Short (FC) which have the same identifier
    if (suggestion.tacCode) {
      this._forceTacCode = suggestion.tacCode;
    }

    this._detectMessageType();

    if (isTemplateIdentifier) {
      // Wait for grammar to load, then apply template mode
      this.waitForGrammarLoad().then(() => {
        // Check if grammar loaded and template mode is now active
        if (this._isTemplateMode && this._templateRenderer.isActive) {
          this._applyTemplateMode();
          this._tokenize();
          this._invalidateRenderCache();
          this.renderViewport();
          this._updateStatus();
          this._emitChange();
          this._hideSuggestions();
        }
      });
      // Don't show regular suggestions for template mode
      return;
    }

    // In template mode, sync lines to update field values before tokenizing
    if (this._isTemplateMode && this._templateRenderer.isActive) {
      this._syncTemplateLines();
    }

    this._tokenize();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();

    // Show suggestions for next token after applying this one
    // Need to wait for grammar to load (especially when first token like TAF is inserted)
    if (hasEditable) {
      // In template mode, skip editable defaults and move to next field
      if (this._isTemplateMode && this._templateRenderer.isActive) {
        this._currentEditable = null; // Clear editable state
        this._navigateToNextTemplateField();
      } else {
        const defaults = this._getEditableDefaults();
        if (defaults.length === 1 && !defaults[0].isCategory) {
          // Single default value - apply directly without showing popup
          this._applyEditableDefault(defaults[0].text);
        } else if (defaults.length > 1) {
          // Multiple defaults - show popup for user to choose
          this._showEditableDefaults(defaults);
        } else {
          // No defaults - series stack preserved automatically, header shown via _renderSuggestions
          this._hideSuggestions();
        }
      }
    } else {
      // Hide suggestions immediately - series stack preserved automatically
      this._hideSuggestions();
      // Wait for grammar to load before showing suggestions
      this.waitForGrammarLoad().then(() => {
        // In template mode, navigate to next field after inserting a value
        if (this._isTemplateMode && this._templateRenderer.isActive) {
          this._navigateToNextTemplateField();
        } else {
          // Re-tokenize with the newly loaded grammar before showing suggestions
          this._tokenize();
          // Force recalculation for next token
          this._forceShowSuggestions();
        }
      });
    }
  }

  handleSuggestionClick(e: MouseEvent): void {
    const item = (e.target as HTMLElement).closest('.suggestion-item') as HTMLElement;
    if (!item) return;

    // Don't handle clicks on disabled items
    if (item.classList.contains('disabled')) return;

    const index = parseInt(item.dataset.index || '', 10);
    if (!isNaN(index) && this._suggestions[index]) {
      const sug = this._suggestions[index];
      // Double check selectable flag
      if (sug.selectable === false) return;
      this._applySuggestion(sug);
    }
  }

  /** Get editable defaults - can return strings or full Suggestion objects with categories */
  private _getEditableDefaults(): Suggestion[] {
    if (!this._currentEditable) return [];

    const { defaultsFunction } = this._currentEditable;

    // Evaluate the function if present
    if (defaultsFunction) {
      try {
        // Create and execute the function
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return (${defaultsFunction})()`) as () => (string | Suggestion)[];
        const result = fn();
        if (Array.isArray(result)) {
          // Convert strings to Suggestion objects, pass through Suggestion objects as-is
          return result.map(item => {
            if (typeof item === 'string') {
              return {
                text: item,
                description: ''
              };
            }
            // It's already a Suggestion object (or partial) - ensure required fields
            return {
              text: item.text || '',
              description: item.description || '',
              isCategory: item.isCategory,
              children: item.children,
              placeholder: item.placeholder,
              editable: item.editable
            };
          });
        }
      } catch (e) {
        console.warn('Error evaluating defaultsFunction:', e);
      }
    }

    return [];
  }

  /** Show editable defaults as suggestions */
  private _showEditableDefaults(defaults: Suggestion[]): void {
    if (defaults.length === 0) return;

    // Use suggestions directly (already Suggestion objects)
    this._unfilteredSuggestions = defaults;
    this._suggestionFilter = '';

    // Set _showSuggestions BEFORE _filterSuggestions so that _renderSuggestions()
    // (called from _filterSuggestions) doesn't early-exit due to _showSuggestions being false
    this._showSuggestions = true;

    this._filterSuggestions();

    if (this._suggestions.length > 0) {
      this._positionSuggestions();
    } else {
      this._showSuggestions = false;
    }
  }

  /**
   * Apply a message type suggestion (with tacCode)
   * Loads the grammar and gets the identifier from grammar.identifier
   */
  private async _applyMessageTypeSuggestion(suggestion: Suggestion): Promise<void> {
    if (!suggestion.tacCode) return;

    const tacCode = suggestion.tacCode;
    const config = findMessageType(tacCode);
    if (!config) return;

    // Hide suggestions immediately to prevent showing stale suggestions during grammar load
    this._suggestionMenuStack = [];
    this._hideSuggestions();

    // Set forced TAC code for detection
    this._forceTacCode = tacCode;

    // Load the grammar
    const grammarName = config.grammar;
    await this._loadGrammarWithInheritance(grammarName);

    // Get the grammar and its identifier
    const grammar = this.parser.grammars.get(grammarName);
    if (!grammar || !grammar.identifier) {
      // Fallback: use the suggestion text as-is
      console.warn(`Grammar ${grammarName} has no identifier, using suggestion text`);
      this._insertTextAtCursor(suggestion.text);
      return;
    }

    // Set the grammar as current
    this.parser.setGrammar(grammarName);
    this._currentTacCode = tacCode;

    // For SIGMET/AIRMET, the identifier is the SECOND word (after FIR code)
    // Don't insert identifier, just show "start" suggestions which include FIR options
    if (config.secondWordIdentifier) {
      // Re-tokenize and show start suggestions
      this._tokenize();
      this.renderViewport();
      this._updateStatus();
      this._forceShowSuggestions();
      return;
    }

    // For other message types, create a suggestion from the identifier
    // and apply it through the normal flow (which handles spacing correctly)
    const identifierSuggestion: Suggestion = {
      text: grammar.identifier,
      description: grammar.description || '',
      ref: 'identifier'
    };

    // Apply through normal flow - this handles spacing and shows next suggestions
    this._applySuggestion(identifierSuggestion);
  }

  /**
   * Switch to a different grammar (e.g., from sigmet to ws/wc/wv)
   * Used when user selects a SIGMET type at the phenomenon position
   */
  private async _applySwitchGrammarSuggestion(suggestion: Suggestion): Promise<void> {
    if (!suggestion.switchGrammar) return;

    const grammarName = suggestion.switchGrammar;

    // Save current suggestions to stack for back navigation with ESC
    if (this._unfilteredSuggestions.length > 0) {
      this._suggestionMenuStack.push([...this._unfilteredSuggestions]);
    }

    // Hide suggestions immediately to prevent showing stale suggestions during grammar load
    this._showSuggestions = false;
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (container) {
      container.classList.remove('visible');
    }

    // Store the previous grammar name for potential rollback
    const previousGrammarName = this.parser.currentGrammarName;

    // Load the new grammar with inheritance
    await this._loadGrammarWithInheritance(grammarName);

    // Get the loaded grammar
    const grammar = this.parser.grammars.get(grammarName);
    if (!grammar) {
      console.warn(`Grammar ${grammarName} not found after loading`);
      // Rollback: restore stack
      if (this._suggestionMenuStack.length > 0) {
        this._suggestionMenuStack.pop();
      }
      return;
    }

    // Set the grammar as current
    this.parser.setGrammar(grammarName);

    // Update grammar context for validators and providers
    // grammarName is the TAC code (e.g., 'fc', 'ft', 'ws') - convert to lowercase for pattern matching
    this._currentTacCode = grammarName.toUpperCase();
    this.parser.setGrammarContext(grammarName.toLowerCase(), this.standard, this._getEffectiveLocale());

    // Store the switched grammar name to prevent _detectMessageType from overriding it
    this._switchedGrammarName = grammarName;

    // Store the previous grammar name so we can restore it on ESC
    this._previousGrammarName = previousGrammarName;

    // Re-tokenize with new grammar
    this._tokenize();
    this.renderViewport();
    this._updateStatus();

    // Show suggestions for the current position with the new grammar
    this._forceShowSuggestions();
  }

  /**
   * Expand a single category directly without creating a menu level.
   * Used when there's only one category suggestion - we fetch its content
   * and use it as the main suggestions list (no stack, no back navigation).
   */
  private async _expandSingleCategory(suggestion: Suggestion): Promise<void> {
    if (!suggestion.provider) return;

    // Invalidate any pending blur timeout
    this._lastBlurTimestamp = 0;

    // Get provider options
    const providerOptions = this.parser.getProviderOptions(suggestion.provider);
    const timeout = providerOptions?.timeout ?? 500;
    const cacheOption = providerOptions?.cache;
    const useReplace = providerOptions?.replace !== false;

    // Build suggestions list
    const suggestions: Suggestion[] = [];

    // Add placeholder first if not in replace mode
    if (!useReplace && suggestion.editable && suggestion.placeholder) {
      suggestions.push({
        text: suggestion.placeholder,
        description: suggestion.description || '',
        ref: suggestion.ref,
        editable: suggestion.editable,
        placeholder: suggestion.placeholder
      });
    }

    // Get cache key based on pattern matching (e.g., '*.*.*.measurement' + 'wind' => '*.*.*.wind')
    const cacheKey = this.parser.getProviderCacheKey(suggestion.provider);

    // Check cache first (with expiration handling)
    const cachedData = this._getCachedData(cacheKey);
    if (cachedData) {
      suggestions.push(...cachedData);
      this._unfilteredSuggestions = suggestions;
      this._suggestionFilter = '';
      this._suggestions = suggestions;
      this._selectedSuggestion = 0;
      this._renderSuggestions();
      return;
    }

    // Show loading state
    this._showSuggestions = true;
    this._showSuggestionsLoading(true, suggestion.text || '');
    this._renderSuggestions();

    // Fetch from provider with timeout
    const providerPromise = this.parser.getProviderSuggestions(suggestion.provider);
    let providerSuggestions: Suggestion[] | null = null;

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeout);
    });

    const result = await Promise.race([providerPromise, timeoutPromise]);
    if (result) {
      providerSuggestions = result.suggestions;
    }

    // Hide loading
    this._showSuggestionsLoading(false);

    // Add provider results (pass provider as ref for after-lookup)
    const converted = providerSuggestions && providerSuggestions.length > 0
      ? providerSuggestions.map(s => this._convertProviderSuggestion(s, suggestion.provider))
      : [];

    if (converted.length > 0) {
      // Cache with expiration if caching is enabled
      const expiresAt = this._getCacheExpiration(cacheOption);
      if (expiresAt > 0) {
        this._providerCache.set(cacheKey, { data: converted, expiresAt });
      }
    }

    // Add grammar children if not in replace mode (provider suggestions extend grammar suggestions)
    if (!useReplace && suggestion.children && suggestion.children.length > 0) {
      // Check if grammar has a category as first child - if so, merge provider suggestions INTO it
      const firstChild = suggestion.children[0];
      if (firstChild.isCategory && converted.length > 0) {
        // Merge: create new category with provider suggestions first, then grammar category children
        const mergedCategory: Suggestion = {
          ...firstChild,
          children: [
            ...converted,
            ...(firstChild.children || [])
          ]
        };
        suggestions.push(mergedCategory);
        // Add remaining grammar children (after the first category)
        suggestions.push(...suggestion.children.slice(1));
      } else {
        // No category to merge into - add provider suggestions then grammar children
        suggestions.push(...converted);
        suggestions.push(...suggestion.children);
      }
    } else {
      // Replace mode or no grammar children - just add provider suggestions
      suggestions.push(...converted);
    }

    // Set suggestions and apply filtering (AUTO mode, text filter)
    this._unfilteredSuggestions = suggestions;
    this._suggestionFilter = '';
    // Call _applyFilters instead of _filterSuggestions to avoid infinite recursion
    this._applyFiltersAndRender();
  }

  /** Apply filters and render - used by _expandSingleCategory to avoid recursion */
  private _applyFiltersAndRender(): void {
    let filtered = [...this._unfilteredSuggestions];

    // Filter by AUTO mode
    const grammarCode = this.parser.grammarCode;
    const isObservationGrammar = grammarCode === 'sa' || grammarCode === 'sp';
    const hideAutoEntries = isObservationGrammar && !this.observationAuto;
    if (hideAutoEntries) {
      filtered = this._filterAutoSuggestions(filtered);
    }

    // Filter by text
    if (this._suggestionFilter) {
      const filterLower = this._suggestionFilter.toLowerCase();
      filtered = filtered.filter(s =>
        s.text.toLowerCase().startsWith(filterLower) ||
        (s.description && s.description.toLowerCase().includes(filterLower))
      );
    }

    this._suggestions = filtered;
    this._selectedSuggestion = 0;

    if (this._suggestions.length > 0) {
      this._renderSuggestions();
    } else {
      this._hideSuggestions();
    }
  }

  /**
   * Open a category that has a provider - fetch suggestions from provider (with optional caching)
   * @param suggestion - Category suggestion with provider property
   */
  private async _openCategoryWithProvider(suggestion: Suggestion): Promise<void> {
    if (!suggestion.provider) return;

    // Invalidate any pending blur timeout to prevent it from hiding suggestions during async provider fetch
    this._lastBlurTimestamp = 0;

    // Push current suggestions to stack for back navigation
    this._suggestionMenuStack.push([...this._unfilteredSuggestions]);

    // Check if provider is registered
    const hasRegisteredProvider = this.hasProvider(suggestion.provider);

    // Get provider options using pattern matching
    const providerOptions = this.parser.getProviderOptions(suggestion.provider);
    const isUserInteraction = providerOptions?.userInteraction === true;
    const timeout = providerOptions?.timeout ?? 500;
    const cacheOption = providerOptions?.cache;
    const useReplace = providerOptions?.replace !== false;

    // Build suggestions: placeholder first (if not replace mode), then provider results or grammar children
    const children: Suggestion[] = [];

    // Add placeholder if not in replace mode and category has placeholder info
    if (!useReplace && suggestion.editable && suggestion.placeholder) {
      children.push({
        text: suggestion.placeholder,
        description: suggestion.description || '',
        ref: suggestion.ref,
        editable: suggestion.editable,
        placeholder: suggestion.placeholder
      });
    }

    // If no provider registered, use grammar children and show immediately
    if (!hasRegisteredProvider) {
      if (suggestion.children && suggestion.children.length > 0) {
        children.push(...suggestion.children);
      }
      this._unfilteredSuggestions = children;
      this._suggestionFilter = '';
      this._filterSuggestions();
      return;
    }

    // Get cache key based on pattern matching (e.g., '*.*.*.measurement' + 'wind' => '*.*.*.wind')
    const cacheKey = this.parser.getProviderCacheKey(suggestion.provider);

    // Check if we have cached results for this provider (with expiration handling)
    const cachedData = this._getCachedData(cacheKey);
    if (cachedData) {
      children.push(...cachedData);
      // Show cached results immediately
      this._unfilteredSuggestions = children;
      this._suggestionFilter = '';
      this._filterSuggestions();
      return;
    }

    // Get label for loading indicator (category title)
    const loadingLabel = suggestion.text || '';

    // Show loading state
    if (isUserInteraction) {
      // User interaction mode - show overlay with message, hide popup
      this._hideSuggestions();
      this._renderSuggestions();
      this._updateWaitingUI(true, true, loadingLabel);
    } else {
      // Non-blocking: show popup with loading message
      this._showSuggestions = true;
      this._unfilteredSuggestions = [];
      this._suggestions = [];
      this._showSuggestionsLoading(true, loadingLabel);
      this._renderSuggestions();
    }

    // Fetch from provider
    const providerPromise = this.parser.getProviderSuggestions(suggestion.provider);

    let providerSuggestions: Suggestion[] | null = null;

    if (isUserInteraction) {
      // User interaction mode: no timeout - user can take their time
      const result = await providerPromise;
      providerSuggestions = result.suggestions;
    } else {
      // Non-blocking mode: apply timeout
      let timedOut = false;
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeout);
      });

      const result = await Promise.race([providerPromise, timeoutPromise]);

      if (timedOut) {
        // Check if result arrived just after timeout
        const lateResult = await Promise.race([
          providerPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))
        ]);

        if (lateResult && lateResult.suggestions.length > 0) {
          providerSuggestions = lateResult.suggestions;
        } else {
          children.push({
            text: '',
            description: 'Loading expired',
            selectable: false
          });
        }
      } else if (result) {
        providerSuggestions = result.suggestions;
      }
    }

    // Hide loading state
    this._showSuggestionsLoading(false);
    if (isUserInteraction) {
      this._updateWaitingUI(false, true);
      // Re-show suggestions popup
      this._showSuggestions = true;
    }

    // Add provider results if any
    if (providerSuggestions && providerSuggestions.length > 0) {
      // Convert Suggestion[] to final format (ensure description is set)
      const suggestions: Suggestion[] = providerSuggestions.map(s => this._convertProviderSuggestion(s, suggestion.provider));
      children.push(...suggestions);
      // Cache with expiration if caching is enabled
      const expiresAt = this._getCacheExpiration(cacheOption);
      if (expiresAt > 0) {
        this._providerCache.set(cacheKey, { data: suggestions, expiresAt });
      }
    }

    // Add grammar children if not in replace mode (provider suggestions extend grammar suggestions)
    if (!useReplace && suggestion.children && suggestion.children.length > 0) {
      children.push(...suggestion.children);
    }

    // Show suggestions
    this._unfilteredSuggestions = children;
    this._suggestionFilter = '';
    this._filterSuggestions();
  }

  /**
   * Apply a suggestion that requires external provider data
   * @param suggestion - Suggestion with provider property
   */
  private async _applyProviderSuggestion(suggestion: Suggestion): Promise<void> {
    if (!suggestion.provider) return;

    // Hide suggestions while waiting
    this._hideSuggestions();

    // Check if a provider is registered
    if (!this.hasProvider(suggestion.provider)) {
      // No provider - use default text/placeholder
      this._insertSuggestionText(suggestion);
      return;
    }

    // Request data from provider
    const result = await this.requestFromProvider(suggestion.provider);

    if (result === null) {
      // Provider cancelled or failed - insert placeholder with editable region
      this._insertSuggestionText(suggestion);
      // Restore focus to editor (modal may have taken it)
      this.focus();
      return;
    }

    // Insert the result
    this._saveToHistory();
    this._insertTextAtCursor(result);
    this._afterEdit();
    // Restore focus to editor (modal may have taken it)
    this.focus();
  }

  /**
   * Insert suggestion text with proper handling of editable regions
   */
  private _insertSuggestionText(suggestion: Suggestion): void {
    this._saveToHistory();

    const text = suggestion.text || suggestion.placeholder || '';
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const afterCursor = line.substring(this.cursorColumn);

    // Find word boundary - prefix before cursor
    const prefixMatch = beforeCursor.match(/(\S*)$/);
    let prefix = prefixMatch ? prefixMatch[1] : '';
    let insertPos = this.cursorColumn - prefix.length;

    // For suggestions: if cursor is at end of a complete token (no partial typing),
    // we should ADD a new token, not replace the previous one
    const cursorAtEndOfToken = prefix !== '' && !afterCursor.match(/^\S/);
    if (cursorAtEndOfToken) {
      // Check if this is a new token (not a completion of the current prefix)
      const suggestionStartsWithPrefix = text.toUpperCase().startsWith(prefix.toUpperCase());
      if (!suggestionStartsWithPrefix) {
        // This is a new token - add after current position
        insertPos = this.cursorColumn;
        prefix = '';
      }
    }

    // Find word boundary - suffix after cursor
    const suffixMatch = afterCursor.match(/^(\S*)/);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const afterToken = afterCursor.substring(suffix.length);

    // Check for editable region
    const hasEditable = Array.isArray(suggestion.editable) && suggestion.editable.length > 0;

    // Determine spacing - always add trailing space (even for editable tokens) to ensure proper separation
    const needsLeadingSpace = insertPos === this.cursorColumn && prefix === '' && beforeCursor.length > 0 && !beforeCursor.endsWith(' ');
    const afterStartsWithSpace = /^\s/.test(afterToken);
    const needsTrailingSpace = !afterStartsWithSpace;
    const insertedText = (needsLeadingSpace ? ' ' : '') + text + (needsTrailingSpace ? ' ' : '');

    this.lines[this.cursorLine] = line.substring(0, insertPos) + insertedText + afterToken;

    // Clear suggestion state (but keep series stack - it will be cleared if no appendToPrevious in new suggestions)
    this._suggestionMenuStack = [];
    this._showSuggestions = false;
    this._unfilteredSuggestions = [];
    this._suggestionFilter = '';

    // Calculate the actual token start position
    const tokenStartPos = insertPos + (needsLeadingSpace ? 1 : 0);

    // Handle editable region - select it for immediate editing
    if (hasEditable) {
      const editable = suggestion.editable![0];
      this.selectionStart = { line: this.cursorLine, column: tokenStartPos + editable.start };
      this.selectionEnd = { line: this.cursorLine, column: tokenStartPos + editable.end };
      this.cursorColumn = tokenStartPos + editable.end;
      this._currentEditable = {
        tokenStart: tokenStartPos,
        tokenEnd: tokenStartPos + text.length,
        editableStart: tokenStartPos + editable.start,
        editableEnd: tokenStartPos + editable.end,
        suffix: text.substring(editable.end),
        defaultsFunction: editable.defaultsFunction,
        ref: suggestion.ref,
        regions: suggestion.editable!,
        currentRegionIndex: 0
      };
    } else {
      const skipExistingSpace = afterStartsWithSpace ? 1 : 0;
      this.cursorColumn = insertPos + insertedText.length + skipExistingSpace;
      this.selectionStart = null;
      this.selectionEnd = null;
      this._currentEditable = null;
    }

    this._afterEdit();
  }

  /**
   * Insert text at cursor position with proper spacing
   */
  private _insertTextAtCursor(text: string): void {
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const afterCursor = line.substring(this.cursorColumn);

    // Find word boundary - prefix before cursor
    const prefixMatch = beforeCursor.match(/(\S*)$/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const insertPos = this.cursorColumn - prefix.length;

    // Find word boundary - suffix after cursor
    const suffixMatch = afterCursor.match(/^(\S*)/);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const afterToken = afterCursor.substring(suffix.length);

    // Need leading space if we're after content and no space
    const needsLeadingSpace = insertPos === this.cursorColumn && prefix === '' && beforeCursor.length > 0 && !beforeCursor.endsWith(' ');
    // Always add trailing space unless there's already a space after (ensures proper token separation)
    const needsTrailingSpace = !/^\s/.test(afterToken);

    const newText = (needsLeadingSpace ? ' ' : '') + text + (needsTrailingSpace ? ' ' : '');
    this.lines[this.cursorLine] = line.substring(0, insertPos) + newText + afterToken;

    // Position cursor after inserted text (including trailing space)
    this.cursorColumn = insertPos + newText.length;

    this._afterEdit();
  }

  /** Apply a default value to the current editable region */
  private _applyEditableDefault(value: string): void {
    if (!this._currentEditable) return;

    this._saveToHistory();

    // Find the current cursor position in absolute terms
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    // Find the token that contains the cursor
    const tokens = this.parser.tokenize(this.value);
    let tokenStart = cursorPos;
    let tokenEnd = cursorPos;
    for (const token of tokens) {
      if (token.type !== 'whitespace' && cursorPos >= token.start && cursorPos <= token.end) {
        tokenStart = token.start;
        tokenEnd = token.end;
        break;
      }
    }

    // Replace the entire token with the new value + suffix (e.g., "101100" + "Z")
    const text = this.value;
    const beforeToken = text.substring(0, tokenStart);
    const afterToken = text.substring(tokenEnd);
    const suffix = this._currentEditable.suffix || '';
    const tokenRef = this._currentEditable.ref || '';

    // Check if any next token has appendToPrevious (meaning user might want to append without space)
    // If at least one token has appendToPrevious, don't add space automatically
    const grammar = this.parser.currentGrammar;
    const nextTokenIds = grammar?.suggestions?.after?.[tokenRef] || [];
    const tokenDefs = grammar?.tokens || {};
    const anyNextHasAppendToPrevious = nextTokenIds.some((tokenId: string) => {
      const tokenDef = tokenDefs[tokenId] as TokenDefinition | undefined;
      return tokenDef?.appendToPrevious === true;
    });

    // Add space after if needed:
    // - Don't add if afterToken already starts with space
    // - Don't add if any next token has appendToPrevious (user might want to append directly)
    const afterStartsWithSpace = /^\s/.test(afterToken);
    const needsSpace = !afterStartsWithSpace && !anyNextHasAppendToPrevious;
    const newText = beforeToken + value + suffix + (needsSpace ? ' ' : '') + afterToken;

    // Update lines
    this.lines = newText.split('\n');

    // Calculate new cursor position (after the value + suffix + space)
    const tokenLength = value.length + suffix.length;
    const newCursorPos = tokenStart + tokenLength + (needsSpace ? 1 : (afterStartsWithSpace ? 1 : 0));
    const pos = this._absoluteToLineColumn(newCursorPos);
    this.cursorLine = pos.line;
    this.cursorColumn = pos.column;

    this.selectionStart = null;
    this.selectionEnd = null;
    this._currentEditable = null;

    // Do what _afterEdit does, but skip _updateSuggestions to avoid race condition
    // (_updateSuggestions is async and would interfere with _forceShowSuggestions)
    this._detectMessageType();
    this._tokenize();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();

    // Now force show suggestions for next token
    this._forceShowSuggestions();
  }

  /** Validate current editable region and move cursor to next token position */
  private _validateEditableAndMoveNext(): void {
    if (!this._currentEditable) return;

    // Clear selection and editable state
    this.selectionStart = null;
    this.selectionEnd = null;
    this._currentEditable = null;

    // Tokenize to find current token boundaries
    this._tokenize();

    // Find the current cursor position in absolute terms
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    // Find the token that contains or ends at the cursor
    const tokens = this.parser.tokenize(this.value);
    let tokenEnd = cursorPos;
    let currentTokenType: string | null = null;
    for (const token of tokens) {
      if (token.type !== 'whitespace' && cursorPos >= token.start && cursorPos <= token.end) {
        tokenEnd = token.end;
        currentTokenType = token.type;
        break;
      }
    }

    // Check if this token type has next tokens with appendToPrevious (like visibility directions)
    // In that case, don't add space - position cursor at end of token to allow appending
    const grammar = this.parser.currentGrammar;
    const nextTokenIds = grammar?.suggestions?.after?.[currentTokenType || ''] || [];
    const tokenDefs = grammar?.tokens || {};

    // Check if any next token has appendToPrevious in its definition
    const hasAppendSuggestions = nextTokenIds.some((tokenId: string) => {
      const tokenDef = tokenDefs[tokenId] as TokenDefinition | undefined;
      return tokenDef?.appendToPrevious === true;
    });

    const text = this.value;

    if (hasAppendSuggestions) {
      // Don't add space - position cursor at end of token to allow appending
      const pos = this._absoluteToLineColumn(tokenEnd);
      this.cursorLine = pos.line;
      this.cursorColumn = pos.column;
    } else if (tokenEnd < text.length && text[tokenEnd] === ' ') {
      // Space already exists, just move after it
      const pos = this._absoluteToLineColumn(tokenEnd + 1);
      this.cursorLine = pos.line;
      this.cursorColumn = pos.column;
    } else {
      // No space, add one
      const beforeToken = text.substring(0, tokenEnd);
      const afterToken = text.substring(tokenEnd);
      this.lines = (beforeToken + ' ' + afterToken).split('\n');
      const pos = this._absoluteToLineColumn(tokenEnd + 1);
      this.cursorLine = pos.line;
      this.cursorColumn = pos.column;
    }

    this._hideSuggestions();
    this._tokenize();
    this.renderViewport();
    this._updateStatus();

    // Show suggestions for next token
    this._forceShowSuggestions();
  }

  /** Validate current editable and go back to previous token */
  private _validateEditableAndMovePrevious(): void {
    if (!this._currentEditable) return;

    // Clear selection and editable state
    this.selectionStart = null;
    this.selectionEnd = null;
    this._currentEditable = null;

    // Tokenize to find current token boundaries
    this._tokenize();

    // Find the current cursor position in absolute terms
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    // Find all non-whitespace tokens
    const tokens = this.parser.tokenize(this.value);
    const nonWsTokens = tokens.filter(t => t.type !== 'whitespace');

    // Find current token and the one before it
    let currentTokenIndex = -1;
    for (let i = 0; i < nonWsTokens.length; i++) {
      const token = nonWsTokens[i];
      if (cursorPos >= token.start && cursorPos <= token.end) {
        currentTokenIndex = i;
        break;
      }
    }

    // Navigate to previous token
    if (currentTokenIndex > 0) {
      const prevToken = nonWsTokens[currentTokenIndex - 1];
      // Position cursor at the end of the previous token
      const pos = this._absoluteToLineColumn(prevToken.end);
      this.cursorLine = pos.line;
      this.cursorColumn = pos.column;
    } else {
      // No previous token, go to start
      this.cursorLine = 0;
      this.cursorColumn = 0;
    }

    this._hideSuggestions();
    this.renderViewport();
    this._updateStatus();

    // Show suggestions at this position
    this._forceShowSuggestions();
  }

  // ========== Header & Footer ==========
  private _updateStatus(): void {
    const headerType = this.shadowRoot!.getElementById('headerType');
    const footerInfo = this.shadowRoot!.getElementById('footerInfo');

    // Update header with message type
    if (headerType) {
      const grammar = this.parser.currentGrammar;
      const config = this._currentTacCode ? findMessageType(this._currentTacCode) : undefined;
      if (this._currentTacCode && config) {
        // Use grammar description (localized) or fallback to config description
        headerType.textContent = grammar?.description || config.description;
        headerType.title = config.name;
      } else if (this._messageType) {
        headerType.textContent = grammar?.description || grammar?.name || this._messageType.toUpperCase();
        headerType.title = '';
      } else {
        headerType.textContent = 'TAC';
        headerType.title = '';
      }
    }

    // Update footer with validation status
    if (footerInfo) {
      const trimmedValue = this.value.trim();

      if (trimmedValue.length === 0) {
        // Empty message - no status
        footerInfo.textContent = '';
        footerInfo.className = 'footer-info';
        return;
      }

      // Count token-level errors (actual syntax errors, not missing fields)
      const tokenErrors = this._tokens.filter(t => t.type === 'error' || t.error).length;

      if (tokenErrors > 0) {
        // Has token errors - show error count
        footerInfo.textContent = `✗ ${tokenErrors} error${tokenErrors > 1 ? 's' : ''}`;
        footerInfo.className = 'footer-info invalid';
      } else {
        // No token errors - check full validation
        const validation = this.parser.validate(this.value);
        if (validation.valid) {
          // Fully valid message
          footerInfo.textContent = '✓ Valid';
          footerInfo.className = 'footer-info valid';
        } else {
          // Message is incomplete (missing required fields) but no syntax errors
          // Stay silent - user is still typing
          footerInfo.textContent = '';
          footerInfo.className = 'footer-info';
        }
      }
    }
  }

  /**
   * Clear the current message type and reset editor to initial state
   * Called when user clicks the chip delete button
   */
  private _clearMessageType(): void {
    // Save state for undo
    this._saveToHistory();

    // Clear the content
    this.lines = [''];
    this.cursorLine = 0;
    this.cursorColumn = 0;
    this.selectionStart = null;
    this.selectionEnd = null;

    // Reset parser and message type
    this.parser.reset();
    this._messageType = null;
    this._currentTacCode = null;
    this._tokens = [];

    // Reset template mode if active
    this._isTemplateMode = false;
    this._templateRenderer.reset();

    // Update display
    this._invalidateRenderCache();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();

    // Focus the editor
    this.focus();

    // Show initial suggestions
    this._forceShowSuggestions();
  }

  updateReadonly(): void {
    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.readOnly = this.readonly;
    }
  }

  // ========== Events ==========
  private _emitChange(): void {
    const validation = this.parser.validate(this.value);

    this.dispatchEvent(
      new CustomEvent<ChangeEventDetail>('change', {
        bubbles: true,
        composed: true,
        detail: {
          value: this.value,
          type: this._messageType,
          tokens: this._tokens,
          valid: validation.valid
        }
      })
    );

    if (!validation.valid && this.value.trim().length > 0) {
      this.dispatchEvent(
        new CustomEvent<ErrorEventDetail>('validation-error', {
          bubbles: true,
          composed: true,
          detail: {
            errors: validation.errors
          }
        })
      );
    }
  }

  /** Emit save event (Ctrl+S) */
  private _emitSave(): void {
    this.dispatchEvent(
      new CustomEvent('save', {
        bubbles: true,
        composed: true,
        detail: {
          value: this.value,
          type: this._messageType,
          valid: this.parser.validate(this.value).valid
        }
      })
    );
  }

  /** Open file picker (Ctrl+O) */
  private _openFilePicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.tac,.metar,.taf,.speci';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          const content = await file.text();
          this.value = content.trim().toUpperCase();
          this.dispatchEvent(
            new CustomEvent('open', {
              bubbles: true,
              composed: true,
              detail: {
                filename: file.name,
                value: this.value
              }
            })
          );
        } catch (error) {
          console.error('Error reading file:', error);
        }
      }
    };
    input.click();
  }

  // ========== Utilities ==========
  private _escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Register custom element
if (!customElements.get('tac-editor')) {
  customElements.define('tac-editor', TacEditor);
}

export default TacEditor;

// Re-export suggestion provider types for external use
export type { SuggestionProviderOptions, SuggestionProviderContext, ProviderSuggestion };

// Re-export built-in validators for external use
export { registerBuiltinValidators, BUILTIN_VALIDATORS };
