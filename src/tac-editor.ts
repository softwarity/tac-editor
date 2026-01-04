/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */

import styles from './tac-editor.css?inline';
import { getTemplate } from './tac-editor.template.js';
import { TacParser, Token, Suggestion, ValidationError, Grammar, TemplateDefinition } from './tac-parser.js';
import { TemplateRenderer } from './template-renderer.js';

// Version injected by Vite build
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

// ========== Provider Types ==========

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

// ========== TAC Code Configuration ==========

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

/** Message type configurations with regex patterns */
const MESSAGE_TYPES: MessageTypeConfig[] = [
  // Routine OPMET data
  {
    pattern: 'SA',
    name: 'METAR',
    grammar: 'sa',
    description: 'Aerodrome routine meteorological report'
  },
  {
    pattern: 'SP',
    name: 'SPECI',
    grammar: 'sp',
    description: 'Aerodrome special meteorological report'
  },
  {
    pattern: 'FT',
    name: 'TAF Long',
    grammar: 'ft',
    description: 'Terminal aerodrome forecast (12-30 hours)'
  },
  {
    pattern: 'FC',
    name: 'TAF Short',
    grammar: 'fc',
    description: 'Terminal aerodrome forecast (less than 12 hours)'
  },
  // Non-routine OPMET data
  // SIGMET: W[SCV] matches WS, WC, WV - subtypes handled by grammar via switchGrammar
  {
    pattern: 'W[SCV]',
    name: 'SIGMET',
    grammar: 'sigmet',
    description: 'Significant meteorological information',
    secondWordIdentifier: true
  },
  {
    pattern: 'WA',
    name: 'AIRMET',
    grammar: 'wa',
    description: 'Airmen\'s meteorological information',
    secondWordIdentifier: true
  },
  {
    pattern: 'FV',
    name: 'VAA',
    grammar: 'fv',
    description: 'Volcanic ash advisory'
  },
  {
    pattern: 'FK',
    name: 'TCA',
    grammar: 'fk',
    description: 'Tropical cyclone advisory'
  },
  {
    pattern: 'FN',
    name: 'SWXA',
    grammar: 'fn',
    description: 'Space weather advisory'
  }
];

/** Find message type config by TAC code */
function findMessageType(tacCode: string): MessageTypeConfig | undefined {
  return MESSAGE_TYPES.find(mt => new RegExp(`^${mt.pattern}$`).test(tacCode));
}

/** Extract a valid tacCode from a pattern (e.g., 'W[SCV]' -> 'WS') */
function patternToTacCode(pattern: string): string {
  // If pattern has character class like [SCV], take first option
  const match = pattern.match(/^([^[]*)\[([^\]]+)\](.*)$/);
  if (match) {
    return match[1] + match[2][0] + match[3];
  }
  return pattern;
}

/** Default TAC codes if none specified */
const DEFAULT_TAC_CODES = ['SA', 'SP', 'FT', 'FC', 'WS', 'WA', 'FV', 'FK'];

/** Multi-token identifiers that start with a given first word */
const MULTI_TOKEN_IDENTIFIERS: Record<string, string[]> = {
  'VA': ['VA ADVISORY'],
  'TC': ['TC ADVISORY']
};

/** Map TAC identifier to TAC code(s) - for detecting message type from content */
const IDENTIFIER_TO_TAC_CODES: Record<string, string[]> = {
  'METAR': ['SA'],
  'SPECI': ['SP'],
  'TAF': ['FT', 'FC'],  // Will need further disambiguation
  'SIGMET': ['WS', 'WC', 'WV'],  // Will be disambiguated by category
  'AIRMET': ['WA'],
  'VA ADVISORY': ['FV'],
  'TC ADVISORY': ['FK'],
  'SWXA': ['FN']
};

// ========== Type Definitions ==========

/** Cursor position in the editor */
export interface CursorPosition {
  line: number;
  column: number;
}

/** Token with position info for rendering */
interface LineToken extends Token {
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
  private _suggestionMenuStack: Suggestion[][] = []; // Stack for submenu navigation
  private _suggestionFilter: string = ''; // Current filter text
  private _lastBlurTimestamp: number = 0; // Timestamp of last blur event

  // ========== Editable Token ==========
  /** Current editable region info - used when editing a token with editable parts */
  private _currentEditable: {
    tokenStart: number;
    tokenEnd: number;
    editableStart: number;
    editableEnd: number;
    pattern?: string;
    suffix: string;
    defaultsFunction?: string;
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

  // ========== Mouse State ==========
  private _isSelecting: boolean = false;

  // ========== Undo/Redo History ==========
  private _undoStack: Array<{ lines: string[]; cursorLine: number; cursorColumn: number }> = [];
  private _redoStack: Array<{ lines: string[]; cursorLine: number; cursorColumn: number }> = [];
  private _maxHistory: number = 100;

  // ========== Provider System ==========
  private _providers: Map<string, Provider> = new Map();
  private _state: EditorState = 'editing';
  private _waitingAbortController: AbortController | null = null;
  private _waitingProviderType: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ========== Observed Attributes ==========
  static get observedAttributes(): string[] {
    return ['readonly', 'value', 'placeholder', 'grammars-url', 'lang', 'message-types'];
  }

  // ========== Lifecycle ==========
  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
    this._loadDefaultGrammars();

    if (this.hasAttribute('value')) {
      this.setValue(this.getAttribute('value'));
    }
    this.updatePlaceholderVisibility();
    this.renderViewport();
  }

  disconnectedCallback(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    if (this.inputTimer) clearTimeout(this.inputTimer);
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
      case 'placeholder':
        this.updatePlaceholderContent();
        break;
      case 'grammars-url':
        // Clear loaded grammars cache when URL changes
        this._loadedGrammars.clear();
        this.parser.reset();
        break;
      case 'lang':
        // Clear loaded grammars and reload for new locale
        this._loadedGrammars.clear();
        this.parser.reset();
        if (this._messageType) {
          this._loadGrammarForType(this._getMessageIdentifier());
        }
        break;
      case 'message-types':
        // Message types changed - re-render to update suggestions
        this.renderViewport();
        break;
    }
  }

  // ========== Properties ==========
  get readonly(): boolean {
    return this.hasAttribute('readonly');
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
    return this._providers.has(type);
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
   */
  private _updateWaitingUI(waiting: boolean): void {
    const editor = this.shadowRoot?.getElementById('editorContent');
    if (editor) {
      editor.classList.toggle('waiting', waiting);
    }
    // Emit state change event
    this.dispatchEvent(new CustomEvent('state-change', {
      detail: { state: this._state, providerType: this._waitingProviderType }
    }));
  }

  get value(): string {
    return this.lines.join('\n');
  }

  set value(val: string) {
    this.setValue(val);
  }

  get placeholder(): string {
    return this.getAttribute('placeholder') || '';
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
    template.innerHTML = getTemplate(this.placeholder, VERSION);

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
   * Load grammar for a detected message type
   * @param typeIdentifier - The message type identifier (e.g., 'METAR', 'TAF')
   * @returns Promise that resolves to true if grammar was loaded successfully
   */
  private async _loadGrammarForType(typeIdentifier: string | null): Promise<boolean> {
    if (!typeIdentifier) return false;

    // Get the TAC code from the identifier
    const tacCode = this._getTacCodeFromIdentifier(typeIdentifier);
    if (!tacCode) return false;

    // Get the grammar config
    const config = findMessageType(tacCode);
    if (!config) return false;

    // Check if grammar is already loaded
    if (this._loadedGrammars.has(config.grammar)) {
      return true;
    }

    // Avoid duplicate loading
    if (this._pendingGrammarLoad) {
      return this._pendingGrammarLoad;
    }

    this._pendingGrammarLoad = this._loadGrammarWithInheritance(config.grammar);
    const result = await this._pendingGrammarLoad;
    this._pendingGrammarLoad = null;

    return result;
  }

  /**
   * Load a grammar with inheritance resolution
   * @param grammarName - Base name of the grammar (without locale suffix)
   * @returns Promise that resolves to true if grammar was loaded successfully
   */
  private async _loadGrammarWithInheritance(grammarName: string): Promise<boolean> {
    // Check if already loaded
    if (this._loadedGrammars.has(grammarName)) {
      return true;
    }

    // Load the grammar file
    const grammar = await this._fetchGrammar(grammarName);
    if (!grammar) return false;

    // Check if grammar has parent (inheritance)
    if (grammar.extends) {
      // Load parent grammar first (recursively handles inheritance chain)
      const parentLoaded = await this._loadGrammarWithInheritance(grammar.extends);
      if (!parentLoaded) {
        console.warn(`Failed to load parent grammar '${grammar.extends}' for '${grammarName}'`);
        // Continue anyway - we'll use the grammar without inheritance
      }
    }

    // Register grammar (parser will resolve inheritance when resolveInheritance is called)
    this.parser.registerGrammar(grammarName, grammar as Grammar);
    this._loadedGrammars.add(grammarName);

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
   * Fetch a grammar file with locale fallback
   * @param grammarName - Base name of the grammar
   * @returns The grammar object or null if not found
   */
  private async _fetchGrammar(grammarName: string): Promise<Grammar | null> {
    const locales = this._getLocaleFallbackChain(this.lang);

    for (const locale of locales) {
      const url = this._getGrammarUrl(grammarName, locale);
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          let grammar;
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
          return grammar as Grammar;
        }
      } catch (e) {
        // Continue to next fallback
      }
    }

    console.warn(`Grammar not found: ${grammarName} (tried locales: ${locales.join(', ')})`);
    return null;
  }

  /**
   * Get fallback chain for locale
   * e.g., "fr-FR" → ["fr-FR", "fr", "en"]
   * Always ends with base grammar (no locale suffix)
   */
  private _getLocaleFallbackChain(lang: string): string[] {
    const chain: string[] = [];

    if (lang && lang !== 'en') {
      chain.push(lang);
      if (lang.includes('-')) {
        chain.push(lang.split('-')[0]);
      }
    }

    // Always add 'en' as final fallback (base grammar)
    chain.push('en');

    return chain;
  }

  /**
   * Get URL for localized grammar file
   */
  private _getGrammarUrl(grammarName: string, locale: string): string {
    return `${this.grammarsUrl}/${grammarName}.${locale}.json`;
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

    // Invalidate render cache to force re-render
    this._lastStartIndex = -1;
    this._lastEndIndex = -1;
    this._lastTotalLines = -1;
    this._lastContentHash = '';

    // Detect message type - this may trigger async grammar loading
    const messageIdentifier = this._getMessageIdentifier();
    const tacCode = messageIdentifier ? this._getTacCodeFromIdentifier(messageIdentifier) : null;
    const grammarConfig = tacCode ? findMessageType(tacCode) : null;
    const grammarAlreadyLoaded = grammarConfig && this._loadedGrammars.has(grammarConfig.grammar);

    if (grammarAlreadyLoaded) {
      // Grammar is already loaded - tokenize synchronously
      this._detectMessageType();
      this._tokenize();
      this.updatePlaceholderVisibility();
      this.renderViewport();
      this._updateStatus();
      this._emitChange();
    } else if (grammarConfig) {
      // Grammar needs to be loaded - trigger load and wait for callback
      // Clear tokens to avoid showing error state while loading
      this._tokens = [];
      this._detectMessageType();
      // _detectMessageType's .then() callback will handle tokenization after grammar loads
      this.updatePlaceholderVisibility();
      this.renderViewport();
      this._emitChange();
    } else {
      // No grammar needed (empty text or unknown type)
      this._detectMessageType();
      this._tokenize();
      this.updatePlaceholderVisibility();
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
    // Check if this is a VAA message
    if (text.trim().startsWith('VA ADVISORY')) {
      return this._normalizeVaaText(text);
    }
    // Check if this is a TCA message
    if (text.trim().startsWith('TC ADVISORY')) {
      return this._normalizeTcaText(text);
    }
    return text;
  }

  /**
   * Normalize VAA (Volcanic Ash Advisory) text format variations
   * Fixes labels to match the expected template format
   */
  private _normalizeVaaText(text: string): string {
    const LABEL_WIDTH = 22;

    // Define label mappings: regex pattern -> standard label
    const labelMappings: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /^DTG:/i, label: 'DTG:' },
      { pattern: /^VAAC:/i, label: 'VAAC:' },
      { pattern: /^VOLCANO:/i, label: 'VOLCANO:' },
      { pattern: /^PSN:/i, label: 'PSN:' },
      { pattern: /^AREA:/i, label: 'AREA:' },
      { pattern: /^SUMMIT ELEV:/i, label: 'SUMMIT ELEV:' },
      { pattern: /^ADVISORY NR:/i, label: 'ADVISORY NR:' },
      { pattern: /^INFO SOURCE:/i, label: 'INFO SOURCE:' },
      { pattern: /^AVIATION COLOU?R CODE:/i, label: 'AVIATION COLOUR CODE:' },
      { pattern: /^ERUPTION DETAILS:/i, label: 'ERUPTION DETAILS:' },
      { pattern: /^OBS VA DTG:/i, label: 'OBS VA DTG:' },
      { pattern: /^OBS VA CLD:/i, label: 'OBS VA CLD:' },
      { pattern: /^FCST VA CLD \+6\s*HR:/i, label: 'FCST VA CLD +6 HR:' },
      { pattern: /^FCST VA CLD \+12\s*HR:/i, label: 'FCST VA CLD +12 HR:' },
      { pattern: /^FCST VA CLD \+18\s*HR:/i, label: 'FCST VA CLD +18 HR:' },
      { pattern: /^RMK:/i, label: 'RMK:' },
      { pattern: /^NXT ADVISORY:/i, label: 'NXT ADVISORY:' },
    ];

    const lines = text.split('\n');
    const normalizedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines and identifier line
      if (!trimmedLine || trimmedLine === 'VA ADVISORY') {
        normalizedLines.push(line);
        continue;
      }

      // Try to match and normalize a label
      let matched = false;
      for (const { pattern, label } of labelMappings) {
        const match = trimmedLine.match(pattern);
        if (match) {
          // Extract value after the matched label pattern
          const valueStart = trimmedLine.indexOf(':') + 1;
          let value = trimmedLine.substring(valueStart).trim();

          // Special handling for SUMMIT ELEV: convert "FT (M)" to just "M"
          if (label === 'SUMMIT ELEV:') {
            const elevMatch = value.match(/\d+\s*FT\s*\((\d+)\s*M\)/i);
            if (elevMatch) {
              value = elevMatch[1] + 'M';
            }
          }

          // Build normalized line with proper padding
          const paddedLabel = label.padEnd(LABEL_WIDTH, ' ');
          normalizedLines.push(paddedLabel + value);
          matched = true;
          break;
        }
      }

      // If no label matched, keep line as-is (continuation of previous value)
      if (!matched) {
        // Indent continuation lines to align with values
        if (trimmedLine && !trimmedLine.startsWith('VA ADVISORY')) {
          normalizedLines.push(' '.repeat(LABEL_WIDTH) + trimmedLine);
        } else {
          normalizedLines.push(line);
        }
      }
    }

    return normalizedLines.join('\n');
  }

  /**
   * Normalize TCA (Tropical Cyclone Advisory) text format variations
   */
  private _normalizeTcaText(text: string): string {
    // Add TCA normalizations as needed
    return text;
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

    this.updatePlaceholderVisibility();
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
  private _detectMessageType(): void {
    const messageIdentifier = this._getMessageIdentifier();

    if (!messageIdentifier) {
      this._messageType = null;
      this._currentTacCode = null;
      this._isTemplateMode = false;
      this._templateRenderer.reset();
      this.parser.reset();
      this._lastGrammarLoadPromise = null;
      this._forceTacCode = null;
      return;
    }

    // Use forced TAC code if set (from suggestion selection), otherwise detect from identifier
    // This handles cases like TAF Long (FT) vs TAF Short (FC) which have the same identifier
    const tacCode = this._forceTacCode || this._getTacCodeFromIdentifier(messageIdentifier);
    // Clear forced TAC code after use
    this._forceTacCode = null;
    const grammarConfig = tacCode ? findMessageType(tacCode) : null;

    if (grammarConfig) {
      const grammarName = grammarConfig.grammar;
      // Store current TAC code for display purposes
      this._currentTacCode = tacCode;

      // Try to load grammar if not already loaded
      if (!this._loadedGrammars.has(grammarName)) {
        // Trigger async grammar load and store promise
        // Use _loadGrammarWithInheritance directly with the resolved grammarName
        // to ensure we load the correct grammar (e.g., 'fc' for TAF Short, not 'ft')
        this._lastGrammarLoadPromise = this._loadGrammarWithInheritance(grammarName).then(loaded => {
          if (loaded) {
            // Set the specific grammar (e.g., 'ft' for TAF Long, 'fc' for TAF Short)
            // This ensures the correct grammar name is displayed in the header
            this.parser.setGrammar(grammarName);

            // Re-detect and re-tokenize after grammar is loaded
            const detectedType = this.parser.detectMessageType(this.value);
            this._messageType = detectedType;

            // Check if this grammar uses template mode
            this._checkTemplateMode(messageIdentifier);

            this._tokenize();
            this._invalidateRenderCache();
            this.renderViewport();
            this._updateStatus();
            this._emitChange();
          }
          return loaded;
        });
      } else {
        // Grammar already loaded - set the specific grammar to display correct name
        this.parser.setGrammar(grammarName);

        // Detect message type from content
        const detectedType = this.parser.detectMessageType(this.value);
        this._messageType = detectedType;

        // Check if this grammar uses template mode
        this._checkTemplateMode(messageIdentifier);

        this._lastGrammarLoadPromise = Promise.resolve(true);
      }
    } else {
      this._messageType = null;
      this._currentTacCode = null;
      this._isTemplateMode = false;
      this._templateRenderer.reset();
      this._lastGrammarLoadPromise = null;
    }
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

    // Clear selection if any before inserting
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    }

    // Insert the typed text at cursor position
    this.insertText(inputValue);

    this._afterEdit();
  }

  handleKeyDown(e: KeyboardEvent): void {
    // In template mode, Tab/Shift+Tab navigates between fields (takes priority over suggestions)
    if (e.key === 'Tab' && this._isTemplateMode && !this._currentEditable) {
      e.preventDefault();
      this._hideSuggestions();
      if (e.shiftKey) {
        this._navigateToPreviousTemplateField();
      } else {
        this._navigateToNextTemplateField();
      }
      return;
    }

    // Handle suggestions navigation
    if (this._showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._selectedSuggestion = Math.min(
          this._selectedSuggestion + 1,
          this._suggestions.length - 1
        );
        this._renderSuggestions();
        this._scrollSuggestionIntoView();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._selectedSuggestion = Math.max(this._selectedSuggestion - 1, 0);
        this._renderSuggestions();
        this._scrollSuggestionIntoView();
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (this._suggestions.length > 0) {
          e.preventDefault();
          this._applySuggestion(this._suggestions[this._selectedSuggestion]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // If we have a menu stack (e.g., after switchGrammar), go back to parent menu
        if (this._suggestionMenuStack.length > 0) {
          this._goBackToParentMenu();
        } else {
          this._hideSuggestions();
          // If editor is empty, reset grammar state so Ctrl+Space returns to initial menu
          if (this.value.trim() === '') {
            this.parser.currentGrammar = null;
            this.parser.currentGrammarName = null;
            this._currentTacCode = null;
            this._forceTacCode = null;
            this._updateStatus();
          }
        }
        return;
      }
    }

    // Ctrl+Space for suggestions (also check for 'Spacebar' for older browsers)
    if ((e.key === ' ' || e.code === 'Space') && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();

      // If we're in a submenu, go back to parent menu
      if (this._showSuggestions && this._suggestionMenuStack.length > 0) {
        this._goBackToParentMenu();
      } else {
        this._forceShowSuggestions();
      }
      return;
    }

    // Handle Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      // Non-destructive filtering: if suggestions shown with filter, remove from filter first
      if (this._showSuggestions && this._suggestionFilter.length > 0) {
        this._suggestionFilter = this._suggestionFilter.slice(0, -1);
        this._filterSuggestions();
        return;
      }
      this._saveToHistory();
      if (this.selectionStart && this.selectionEnd) {
        this.deleteSelection();
      } else {
        this.deleteBackward();
      }
      this._afterEdit();
      return;
    }

    // Handle Delete
    if (e.key === 'Delete') {
      e.preventDefault();
      this._saveToHistory();
      if (this.selectionStart && this.selectionEnd) {
        this.deleteSelection();
      } else {
        this.deleteForward();
      }
      this._afterEdit();
      return;
    }

    // Handle Enter/Tab in editable mode - validate and move to next/previous token
    if ((e.key === 'Enter' || e.key === 'Tab') && this._currentEditable) {
      e.preventDefault();
      if (e.shiftKey) {
        this._validateEditableAndMovePrevious();
      } else {
        this._validateEditableAndMoveNext();
      }
      return;
    }

    // Handle Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      // In template mode, Enter navigates to next field without deleting selection
      if (this._isTemplateMode) {
        this._navigateToNextTemplateField();
        return;
      }
      this._saveToHistory();
      if (this.selectionStart && this.selectionEnd) {
        this.deleteSelection();
      }
      this.insertNewline();
      this._afterEdit();
      return;
    }

    // Arrow key navigation with Ctrl for word-by-word
    const isCtrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (isCtrl) {
        this._moveCursorByWord(-1, e.shiftKey);
      } else {
        this.moveCursorLeft(e.shiftKey);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (isCtrl) {
        this._moveCursorByWord(1, e.shiftKey);
      } else {
        this.moveCursorRight(e.shiftKey);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveCursorUp(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveCursorDown(e.shiftKey);
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.moveCursorHome(e.shiftKey, isCtrl);
    } else if (e.key === 'End') {
      e.preventDefault();
      this.moveCursorEnd(e.shiftKey, isCtrl);
    }

    // Tab/Shift+Tab navigation between tokens (only when suggestions not visible)
    if (e.key === 'Tab' && !this._showSuggestions) {
      e.preventDefault();
      if (e.shiftKey) {
        this._navigateToPreviousToken();
      } else {
        this._navigateToNextToken();
      }
      return;
    }

    // Select all (Ctrl+A)
    if (e.key === 'a' && isCtrl) {
      e.preventDefault();
      this.selectAll();
      return;
    }

    // Save (Ctrl+S) - emit save event
    if (e.key === 's' && isCtrl) {
      e.preventDefault();
      this._emitSave();
      return;
    }

    // Open (Ctrl+O) - emit open event and trigger file picker
    if (e.key === 'o' && isCtrl) {
      e.preventDefault();
      this._openFilePicker();
      return;
    }

    // Undo (Ctrl+Z)
    if (e.key === 'z' && isCtrl && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }

    // Redo (Ctrl+Shift+Z or Ctrl+Y)
    if ((e.key === 'z' && isCtrl && e.shiftKey) || (e.key === 'y' && isCtrl)) {
      e.preventDefault();
      this.redo();
    }

    // Copy
    if (e.key === 'c' && isCtrl) {
      this.copySelection();
    }

    // Cut
    if (e.key === 'x' && isCtrl) {
      this.cutSelection();
    }

    // Paste is handled by input event

    this.renderViewport();
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
    this.updatePlaceholderVisibility();
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
    // Push current state to undo stack
    this._undoStack.push({
      lines: [...this.lines],
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });

    // Limit history size
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }

    // Clear redo stack on new action
    this._redoStack = [];
  }

  undo(): void {
    if (this._undoStack.length === 0) return;

    // Save current state to redo stack
    this._redoStack.push({
      lines: [...this.lines],
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });

    // Restore previous state from undo stack
    const state = this._undoStack.pop()!;
    this.lines = [...state.lines];
    this.cursorLine = state.cursorLine;
    this.cursorColumn = state.cursorColumn;

    this._clearSelection();
    this._invalidateRenderCache();
    this._detectMessageType();
    this._tokenize();
    this.updatePlaceholderVisibility();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();
  }

  redo(): void {
    if (this._redoStack.length === 0) return;

    // Save current state to undo stack
    this._undoStack.push({
      lines: [...this.lines],
      cursorLine: this.cursorLine,
      cursorColumn: this.cursorColumn
    });

    // Restore next state from redo stack
    const state = this._redoStack.pop()!;
    this.lines = [...state.lines];
    this.cursorLine = state.cursorLine;
    this.cursorColumn = state.cursorColumn;

    this._clearSelection();
    this._invalidateRenderCache();
    this._detectMessageType();
    this._tokenize();
    this.updatePlaceholderVisibility();
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

    if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
    }

    this._applyTemplateModeConstraints();
    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorDown(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
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

    const line = Math.max(0, Math.min(Math.floor(y / this.lineHeight), this.lines.length - 1));
    const lineText = this.lines[line] || '';

    // Approximate column from x position (assuming monospace font)
    const charWidth = 8.4; // approximate character width for 14px Courier New
    const column = Math.max(0, Math.min(Math.round(x / charWidth), lineText.length));

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

    const cursorY = this.cursorLine * this.lineHeight;
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

  // ========== Viewport Rendering ==========
  renderViewport(): void {
    const viewport = this.shadowRoot!.getElementById('viewport');
    const scrollContent = this.shadowRoot!.getElementById('scrollContent');
    const linesContainer = this.shadowRoot!.getElementById('linesContainer');

    if (!viewport || !scrollContent || !linesContainer) return;

    const totalHeight = this.lines.length * this.lineHeight;
    scrollContent.style.height = `${totalHeight}px`;

    this.viewportHeight = viewport.clientHeight;
    const scrollTop = viewport.scrollTop;

    // Calculate visible range
    // If viewport has no height (e.g., not in DOM yet), render all lines
    let startIndex: number;
    let endIndex: number;
    if (this.viewportHeight > 0) {
      startIndex = Math.max(0, Math.floor(scrollTop / this.lineHeight) - this.bufferLines);
      const visibleCount = Math.ceil(this.viewportHeight / this.lineHeight) + this.bufferLines * 2;
      endIndex = Math.min(this.lines.length, startIndex + visibleCount);
    } else {
      // Render all lines if viewport has no height
      startIndex = 0;
      endIndex = this.lines.length;
    }

    // Calculate content hash for visible lines to detect changes
    const visibleContent = this.lines.slice(startIndex, endIndex).join('\n');
    const contentHash = visibleContent + '|' + this.cursorLine + '|' + this.cursorColumn;

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

    this._lastStartIndex = startIndex;
    this._lastEndIndex = endIndex;
    this._lastTotalLines = this.lines.length;
    this._lastContentHash = contentHash;

    // Position container
    linesContainer.style.transform = `translateY(${startIndex * this.lineHeight}px)`;

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

      let tokenClass = `token token-${token.style || token.type}`;
      if (isIncomplete && !cursorInToken) {
        tokenClass += ' token-incomplete';
      }

      result += `<span class="${tokenClass}" data-type="${token.type}">${this._escapeHtml(tokenText)}</span>`;

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
      'wind': /^0{5}(KT|MPS|KMH)$/,           // 00000KT, 00000MPS
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

    // Calculate cursor position
    const charWidth = 8.4; // approximate for 14px Courier New
    cursor.style.left = `${this.cursorColumn * charWidth}px`;
    cursor.style.top = '0';

    lineEl.appendChild(cursor);
  }

  private _updateCursor(container: HTMLElement): void {
    this._renderCursor(container);
  }

  private _renderSelection(container: HTMLElement, startIndex: number, endIndex: number): void {
    // Remove old selections
    container.querySelectorAll('.selection').forEach(el => el.remove());

    const sel = this._normalizeSelection();
    if (!sel) return;

    const charWidth = 8.4;

    for (let i = Math.max(sel.start.line, startIndex); i <= Math.min(sel.end.line, endIndex - 1); i++) {
      const lineEl = container.querySelector(`[data-line="${i}"]`);
      if (!lineEl) continue;

      const lineText = this.lines[i] || '';
      let startCol = 0;
      let endCol = lineText.length;

      if (i === sel.start.line) startCol = sel.start.column;
      if (i === sel.end.line) endCol = sel.end.column;

      const selEl = document.createElement('div');
      selEl.className = 'selection';
      selEl.style.left = `${startCol * charWidth}px`;
      selEl.style.width = `${(endCol - startCol) * charWidth}px`;

      lineEl.insertBefore(selEl, lineEl.firstChild);
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

  private _updateSuggestions(force: boolean = false): void {
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
      // This handles the case of backspace moving cursor to previous token
      if (isAtTokenBoundary && !noGrammarYet) {
        this._hideSuggestions();
        // Fall through to recalculate suggestions below
      } else {
        // Still typing in same token - just filter
        this._suggestionFilter = currentWord;
        this._filterSuggestions();
        return;
      }
    }

    // Calculate cursor position in text
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1; // +1 for newline
    }
    cursorPos += this.cursorColumn;

    // Get token type from cached tokens and get suggestions
    const tokenInfo = this._getTokenTypeForSuggestions(cursorPos);
    const newSuggestions = this.parser.getSuggestionsForTokenType(
      tokenInfo?.tokenType || null,
      tokenInfo?.prevTokenText,
      this.messageTypeConfigs
    );

    // Filter out switchGrammar suggestions based on configured messageTypes
    // Use regex to match aliased codes (e.g., WS/WC/WV -> SIGMET)
    const configuredTypes = this.messageTypes;
    const filteredSuggestions = newSuggestions.filter(sug => {
      if (!sug.switchGrammar) return true;
      const tacCode = sug.switchGrammar.toUpperCase();
      // Check if this TAC code is directly configured
      if (configuredTypes.includes(tacCode)) return true;
      // Check if any configured code matches the same message type
      // e.g., switchGrammar='ws' -> check if any of WS, WC, WV is in configuredTypes
      const switchConfig = findMessageType(tacCode);
      if (switchConfig) {
        return configuredTypes.some(ct => {
          const ctConfig = findMessageType(ct);
          return ctConfig && ctConfig.name === switchConfig.name;
        });
      }
      return false;
    });

    this._unfilteredSuggestions = filteredSuggestions;
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
    } else {
      this._hideSuggestions();
    }
  }

  /** Filter suggestions based on current typed text */
  private _filterSuggestions(): void {
    if (!this._suggestionFilter) {
      this._suggestions = [...this._unfilteredSuggestions];
    } else {
      this._suggestions = this._unfilteredSuggestions.filter(sug => {
        const text = sug.text.toUpperCase();
        const filter = this._suggestionFilter.toUpperCase();
        return text.startsWith(filter) || text.includes(filter);
      });
    }

    this._selectedSuggestion = 0;

    if (this._suggestions.length > 0) {
      this._renderSuggestions();
    } else {
      // No matches - hide suggestions
      this._hideSuggestions();
    }
  }

  private _shouldShowSuggestions(): boolean {
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    return beforeCursor.length === 0 || /\s$/.test(beforeCursor);
  }

  /** Force show suggestions (Ctrl+Space) - gets suggestions for current context */
  private _forceShowSuggestions(): void {
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
          this._suggestions = this.parser.getTemplateSuggestions(currentField.field.labelType);
          this._unfilteredSuggestions = [...this._suggestions];
          this._selectedSuggestion = 0;

          if (this._suggestions.length > 0) {
            this._showSuggestions = true;
            this._renderSuggestions();
            this._positionSuggestions();
          } else {
            this._hideSuggestions();
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

    // Get token type from cached tokens and get suggestions
    const tokenInfo = this._getTokenTypeForSuggestions(cursorPos);
    this._suggestions = this.parser.getSuggestionsForTokenType(
      tokenInfo?.tokenType || null,
      tokenInfo?.prevTokenText,
      this.messageTypeConfigs
    );
    this._unfilteredSuggestions = [...this._suggestions];
    this._selectedSuggestion = 0;

    if (this._suggestions.length > 0) {
      this._showSuggestions = true;
      this._renderSuggestions();
      this._positionSuggestions();
    } else {
      // No suggestions available
      this._hideSuggestions();
    }
  }

  private _renderSuggestions(): void {
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (!container) return;

    if (!this._showSuggestions || this._suggestions.length === 0) {
      container.classList.remove('visible');
      return;
    }

    // Show back indicator if we're in a submenu, and show filter if active
    let headerHtml = '';
    if (this._suggestionMenuStack.length > 0) {
      headerHtml = '<div class="suggestion-back">Ctrl+Space to go back</div>';
    }
    if (this._suggestionFilter) {
      headerHtml += `<div class="suggestion-filter">Filter: ${this._escapeHtml(this._suggestionFilter)}</div>`;
    }

    const html = headerHtml + this._suggestions
      .map((sug, i) => {
        const selected = i === this._selectedSuggestion ? 'selected' : '';
        const categoryClass = sug.isCategory ? 'category' : '';
        const categoryIcon = sug.isCategory ? '<span class="suggestion-arrow">▶</span>' : '';
        return `
        <div class="suggestion-item ${selected} ${categoryClass}" data-index="${i}">
          <span class="suggestion-text">${this._escapeHtml(sug.text)}${categoryIcon}</span>
          ${sug.description ? `<span class="suggestion-desc">${this._escapeHtml(sug.description)}</span>` : ''}
        </div>
      `;
      })
      .join('');

    container.innerHTML = html;
    container.classList.add('visible');
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
    const charWidth = 8.4;

    // Calculate cursor position in screen coordinates
    const cursorScreenX = viewportRect.left + 12 + this.cursorColumn * charWidth;
    const cursorScreenY = viewportRect.top + 8 + this.cursorLine * this.lineHeight - viewport.scrollTop;

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

  private _hideSuggestions(): void {
    this._showSuggestions = false;
    this._suggestionMenuStack = []; // Clear submenu stack
    this._unfilteredSuggestions = []; // Clear unfiltered suggestions
    this._suggestionFilter = ''; // Clear filter
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
      this._suggestions = [...this._unfilteredSuggestions];
      this._suggestionFilter = '';
      this._selectedSuggestion = 0;
      this._renderSuggestions();
    }
  }

  private _applySuggestion(suggestion: Suggestion): void {
    if (!suggestion) return;

    // If this is a skip suggestion, just hide suggestions and show next ones
    if (suggestion.skipToNext) {
      this._hideSuggestions();
      this._tokenize();
      this.renderViewport();
      this._updateStatus();
      // Show suggestions for next token position
      this._forceShowSuggestions();
      return;
    }

    // If this is a category with children, open the submenu
    if (suggestion.isCategory && suggestion.children && suggestion.children.length > 0) {
      // Push current unfiltered suggestions to stack (for back navigation)
      this._suggestionMenuStack.push([...this._unfilteredSuggestions]);
      // Show children and reset filter
      this._unfilteredSuggestions = suggestion.children;
      this._suggestions = [...suggestion.children];
      this._suggestionFilter = '';
      this._selectedSuggestion = 0;
      this._renderSuggestions();
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

    // If suggestion has a provider, request data from it
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

      // Position cursor after inserted text
      this.cursorColumn = insertPos + suggestion.text.length;

      // Clear suggestion state
      this._suggestionMenuStack = [];
      this._showSuggestions = false;
      this._unfilteredSuggestions = [];
      this._suggestionFilter = '';

      this._afterEdit();
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

      // Clear suggestion state
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
    const hasEditable = suggestion.editable && suggestion.editable.start !== undefined && suggestion.editable.end !== undefined;

    // Determine if we need to add a space before the inserted text
    // (when cursor is at end of previous token and we're inserting a new token)
    const needsLeadingSpace = insertPos === this.cursorColumn && prefix === '' && beforeCursor.length > 0 && !beforeCursor.endsWith(' ');

    // Determine if we need to add a space after the inserted text:
    // - Don't add space if token has editable region (user will continue editing)
    // - Don't add space if afterToken already starts with whitespace
    // - Add space otherwise to separate from next token
    const afterStartsWithSpace = /^\s/.test(afterToken);
    const needsTrailingSpace = !hasEditable && !afterStartsWithSpace;
    const insertedText = (needsLeadingSpace ? ' ' : '') + suggestion.text + (needsTrailingSpace ? ' ' : '');

    this.lines[this.cursorLine] =
      line.substring(0, insertPos) + insertedText + afterToken;

    // Clear suggestion state to force fetching new suggestions
    this._suggestionMenuStack = [];
    this._showSuggestions = false;
    this._unfilteredSuggestions = [];
    this._suggestionFilter = '';

    // Calculate the actual token start position (after any leading space)
    const tokenStartPos = insertPos + (needsLeadingSpace ? 1 : 0);

    // Handle editable region - select it for immediate editing
    if (hasEditable) {
      const editable = suggestion.editable!;
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
        pattern: editable.pattern,
        suffix: suggestion.text.substring(editable.end),
        defaultsFunction: editable.defaultsFunction
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
          this.updatePlaceholderVisibility();
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
    this.updatePlaceholderVisibility();
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
        if (defaults.length > 0) {
          this._showEditableDefaults(defaults);
        }
      }
    } else {
      // Wait for grammar to load before showing suggestions
      this.waitForGrammarLoad().then(() => {
        // In template mode, navigate to next field after inserting a value
        if (this._isTemplateMode && this._templateRenderer.isActive) {
          this._navigateToNextTemplateField();
        } else {
          // Force recalculation for next token
          this._forceShowSuggestions();
        }
      });
    }
  }

  handleSuggestionClick(e: MouseEvent): void {
    const item = (e.target as HTMLElement).closest('.suggestion-item') as HTMLElement;
    if (!item) return;

    const index = parseInt(item.dataset.index || '', 10);
    if (!isNaN(index) && this._suggestions[index]) {
      this._applySuggestion(this._suggestions[index]);
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
                description: '',
                type: 'default'
              };
            }
            // It's already a Suggestion object (or partial) - ensure required fields
            return {
              text: item.text || '',
              description: item.description || '',
              type: item.type || 'default',
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
    this._suggestions = defaults;
    this._unfilteredSuggestions = [...this._suggestions];
    this._selectedSuggestion = 0;
    this._showSuggestions = true;
    this._suggestionFilter = '';

    this._renderSuggestions();
    this._positionSuggestions();
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

    // Clear suggestion state
    this._suggestionMenuStack = [];
    this._hideSuggestions();

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

    // For other message types, insert the identifier
    const identifier = grammar.identifier;
    this._insertTextAtCursor(identifier);
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

    // Store the previous grammar name so we can restore it on ESC
    this._previousGrammarName = previousGrammarName;

    // Hide suggestions temporarily (don't clear stack)
    this._showSuggestions = false;
    const container = this.shadowRoot!.getElementById('suggestionsContainer');
    if (container) {
      container.classList.remove('visible');
    }

    // Re-tokenize with new grammar
    this._tokenize();
    this.renderViewport();
    this._updateStatus();

    // Show suggestions for the current position with the new grammar
    this._forceShowSuggestions();
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
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const insertPos = this.cursorColumn - prefix.length;

    // Find word boundary - suffix after cursor
    const suffixMatch = afterCursor.match(/^(\S*)/);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const afterToken = afterCursor.substring(suffix.length);

    // Check for editable region
    const hasEditable = suggestion.editable && suggestion.editable.start !== undefined && suggestion.editable.end !== undefined;

    // Determine spacing
    const needsLeadingSpace = insertPos === this.cursorColumn && prefix === '' && beforeCursor.length > 0 && !beforeCursor.endsWith(' ');
    const afterStartsWithSpace = /^\s/.test(afterToken);
    const needsTrailingSpace = !hasEditable && !afterStartsWithSpace;
    const insertedText = (needsLeadingSpace ? ' ' : '') + text + (needsTrailingSpace ? ' ' : '');

    this.lines[this.cursorLine] = line.substring(0, insertPos) + insertedText + afterToken;

    // Clear suggestion state
    this._suggestionMenuStack = [];
    this._showSuggestions = false;
    this._unfilteredSuggestions = [];
    this._suggestionFilter = '';

    // Calculate the actual token start position
    const tokenStartPos = insertPos + (needsLeadingSpace ? 1 : 0);

    // Handle editable region - select it for immediate editing
    if (hasEditable) {
      const editable = suggestion.editable!;
      this.selectionStart = { line: this.cursorLine, column: tokenStartPos + editable.start };
      this.selectionEnd = { line: this.cursorLine, column: tokenStartPos + editable.end };
      this.cursorColumn = tokenStartPos + editable.end;
      this._currentEditable = {
        tokenStart: tokenStartPos,
        tokenEnd: tokenStartPos + text.length,
        editableStart: tokenStartPos + editable.start,
        editableEnd: tokenStartPos + editable.end,
        pattern: editable.pattern,
        suffix: text.substring(editable.end),
        defaultsFunction: editable.defaultsFunction
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
    this._saveToHistory();

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
    // Need trailing space if there's content after and no space
    const needsTrailingSpace = afterToken.length > 0 && !/^\s/.test(afterToken);

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

    // Replace the entire token with the new value
    const text = this.value;
    const beforeToken = text.substring(0, tokenStart);
    const afterToken = text.substring(tokenEnd);

    // Add space after if needed
    const needsSpace = afterToken.length > 0 && !/^\s/.test(afterToken);
    const newText = beforeToken + value + (needsSpace ? ' ' : '') + afterToken;

    // Update lines
    this.lines = newText.split('\n');

    // Calculate new cursor position (after the value + space)
    const newCursorPos = tokenStart + value.length + (needsSpace ? 1 : (afterToken.length > 0 && /^\s/.test(afterToken) ? 1 : 0));
    const pos = this._absoluteToLineColumn(newCursorPos);
    this.cursorLine = pos.line;
    this.cursorColumn = pos.column;

    this.selectionStart = null;
    this.selectionEnd = null;
    this._currentEditable = null;

    this._hideSuggestions();
    this._afterEdit();
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

    // Check if this token type has suggestions with appendToPrevious (like visibility directions)
    // In that case, don't add space - position cursor at end of token to allow appending
    const grammar = this.parser.currentGrammar;
    const afterSuggestions = grammar?.suggestions?.after?.[currentTokenType || ''] || [];
    const hasAppendSuggestions = afterSuggestions.some((s: { appendToPrevious?: boolean; children?: { appendToPrevious?: boolean }[] }) =>
      s.appendToPrevious || (s.children && s.children.some((c: { appendToPrevious?: boolean }) => c.appendToPrevious))
    );

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
    this.updatePlaceholderVisibility();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();

    // Focus the editor
    this.focus();

    // Show initial suggestions
    this._forceShowSuggestions();
  }

  // ========== Placeholder ==========
  updatePlaceholderVisibility(): void {
    const placeholder = this.shadowRoot!.getElementById('placeholderLayer');
    if (placeholder) {
      // Check if there's any non-whitespace content
      const hasContent = this.lines.some(line => line.length > 0);
      placeholder.classList.toggle('hidden', hasContent);
    }
  }

  updatePlaceholderContent(): void {
    const placeholder = this.shadowRoot!.getElementById('placeholderLayer');
    if (placeholder) {
      placeholder.textContent = this.placeholder;
    }
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
