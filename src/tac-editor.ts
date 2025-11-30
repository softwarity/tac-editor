/**
 * @softwarity/tac-editor
 * A TAC (Traditional Alphanumeric Codes) editor Web Component
 * for aviation meteorology messages (METAR, SPECI, TAF, SIGMET, VAA, TCA)
 *
 * Monaco-like architecture with virtualized rendering
 */

import styles from './tac-editor.css?inline';
import { getTemplate } from './tac-editor.template.js';
import { TacParser, Token, Suggestion, ValidationError, Grammar } from './tac-parser.js';

// Version injected by Vite build
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

// ========== Message Type Configuration ==========

/** Mapping from message type identifier to grammar file name */
const MESSAGE_TYPE_TO_GRAMMAR: Record<string, string> = {
  'METAR': 'metar-speci',
  'SPECI': 'metar-speci',
  'TAF': 'taf',
  'SIGMET': 'sigmet',
  'AIRMET': 'airmet',
  'VAA': 'vaa',
  'TCA': 'tca'
};

/** All known message types */
const ALL_MESSAGE_TYPES = Object.keys(MESSAGE_TYPE_TO_GRAMMAR);

// ========== Type Definitions ==========

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

  // ========== Theme ==========
  themes: ThemeSettings = { dark: {}, light: {} };

  // ========== Mouse State ==========
  private _isSelecting: boolean = false;

  // ========== Undo/Redo History ==========
  private _undoStack: Array<{ lines: string[]; cursorLine: number; cursorColumn: number }> = [];
  private _redoStack: Array<{ lines: string[]; cursorLine: number; cursorColumn: number }> = [];
  private _maxHistory: number = 100;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ========== Observed Attributes ==========
  static get observedAttributes(): string[] {
    return ['readonly', 'value', 'placeholder', 'dark-selector', 'grammars-url', 'lang', 'types'];
  }

  // ========== Lifecycle ==========
  connectedCallback(): void {
    this.render();
    this.updateThemeCSS();
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
      case 'dark-selector':
        this.updateThemeCSS();
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
          this._loadGrammarForType(this._getFirstToken());
        }
        break;
      case 'types':
        // Types changed - re-render to update suggestions
        this.renderViewport();
        break;
    }
  }

  // ========== Properties ==========
  get readonly(): boolean {
    return this.hasAttribute('readonly');
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

  /** Get the supported message types */
  get types(): string[] {
    const attr = this.getAttribute('types');
    if (!attr) return ALL_MESSAGE_TYPES;
    try {
      const parsed = JSON.parse(attr);
      return Array.isArray(parsed) ? parsed : ALL_MESSAGE_TYPES;
    } catch {
      return ALL_MESSAGE_TYPES;
    }
  }

  set types(val: string[]) {
    this.setAttribute('types', JSON.stringify(val));
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
      e.preventDefault(); // Prevent text selection in viewport
      this._isSelecting = true;
      this.handleMouseDown(e);
      hiddenTextarea.focus();
    });

    viewport.addEventListener('click', (e: MouseEvent) => {
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

    // Suggestions click
    suggestionsContainer.addEventListener('click', (e: MouseEvent) => this.handleSuggestionClick(e));

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

  /** Get the first token (message type identifier) from current text */
  private _getFirstToken(): string | null {
    const text = this.value.trim();
    if (!text) return null;
    const firstWord = text.split(/\s+/)[0]?.toUpperCase();
    return firstWord || null;
  }

  /**
   * Load grammar for a detected message type
   * @param typeIdentifier - The message type identifier (e.g., 'METAR', 'TAF')
   * @returns Promise that resolves to true if grammar was loaded successfully
   */
  private async _loadGrammarForType(typeIdentifier: string | null): Promise<boolean> {
    if (!typeIdentifier) return false;

    // Check if this type is supported
    if (!this.types.includes(typeIdentifier)) {
      return false;
    }

    // Get the grammar name for this type
    const grammarName = MESSAGE_TYPE_TO_GRAMMAR[typeIdentifier];
    if (!grammarName) return false;

    // Check if grammar is already loaded
    if (this._loadedGrammars.has(grammarName)) {
      return true;
    }

    // Avoid duplicate loading
    if (this._pendingGrammarLoad) {
      return this._pendingGrammarLoad;
    }

    this._pendingGrammarLoad = this._loadLocalizedGrammar(grammarName);
    const result = await this._pendingGrammarLoad;
    this._pendingGrammarLoad = null;

    return result;
  }

  /**
   * Load localized grammar with fallback chain
   * Each locale has its own complete grammar file (not just translations)
   * This allows for regional variations in weather codes, formats, etc.
   * e.g., for lang="fr-FR": tries metar-speci.fr-FR.json → metar-speci.fr.json → metar-speci.json
   */
  private async _loadLocalizedGrammar(grammarName: string): Promise<boolean> {
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
            // Support JS module format (for dev servers that transform JSON)
            const text = await response.text();
            if (text.startsWith('export default ')) {
              try {
                grammar = JSON.parse(text.replace(/^export default /, '').replace(/;$/, ''));
              } catch (parseError) {
                console.warn(`Grammar parse error for ${url}:`, parseError, 'Response was:', text.substring(0, 100));
                continue;
              }
            } else {
              try {
                grammar = JSON.parse(text);
              } catch (parseError) {
                console.warn(`Grammar parse error for ${url}:`, parseError, 'Response was:', text.substring(0, 100));
                continue;
              }
            }
          }
          this.parser.registerGrammar(grammarName, grammar as Grammar);
          this._loadedGrammars.add(grammarName);

          // Re-tokenize if we have content
          if (this.value) {
            this._tokenize();
            this.renderViewport();
            this._updateStatus();
          }
          return true;
        } else {
          console.warn(`Grammar fetch failed for ${url}: ${response.status}`);
        }
      } catch (e) {
        console.warn(`Grammar fetch error for ${url}:`, e);
        // Continue to next fallback
      }
    }

    return false;
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
   * Load grammar from URL with locale fallback
   */
  async loadGrammarFromUrl(name: string): Promise<boolean> {
    return this._loadLocalizedGrammar(name);
  }

  // ========== Value Management ==========
  setValue(text: string | null | undefined): void {
    if (text === null || text === undefined) text = '';
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

    this._detectMessageType();
    this._tokenize();
    this.updatePlaceholderVisibility();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();
  }

  clear(): void {
    this.lines = [''];
    this.cursorLine = 0;
    this.cursorColumn = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this._messageType = null;
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
  }

  focus(): void {
    const textarea = this.shadowRoot!.getElementById('hiddenTextarea') as HTMLTextAreaElement;
    textarea?.focus();
  }

  // ========== Message Type Detection ==========
  private _detectMessageType(): void {
    const firstToken = this._getFirstToken();

    if (!firstToken) {
      this._messageType = null;
      this.parser.reset();
      this._lastGrammarLoadPromise = null;
      return;
    }

    // Check if this is a known message type
    const grammarName = MESSAGE_TYPE_TO_GRAMMAR[firstToken];
    if (grammarName && this.types.includes(firstToken)) {
      // Try to load grammar if not already loaded
      if (!this._loadedGrammars.has(grammarName)) {
        // Trigger async grammar load and store promise
        this._lastGrammarLoadPromise = this._loadGrammarForType(firstToken).then(loaded => {
          if (loaded) {
            // Re-detect and re-tokenize after grammar is loaded
            const detectedType = this.parser.detectMessageType(this.value);
            this._messageType = detectedType;
            this._tokenize();
            this.renderViewport();
            this._updateStatus();
          }
          return loaded;
        });
      } else {
        // Grammar already loaded, just detect
        const detectedType = this.parser.detectMessageType(this.value);
        this._messageType = detectedType;
        this._lastGrammarLoadPromise = Promise.resolve(true);
      }
    } else {
      this._messageType = null;
      this._lastGrammarLoadPromise = null;
    }
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
    this._tokens = this.parser.tokenize(this.value);
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

    // Save state BEFORE making changes
    this._saveToHistory();

    // Clear selection if any before inserting
    if (this.selectionStart && this.selectionEnd) {
      this.deleteSelection();
    }

    // Insert the typed text at cursor position
    this.insertText(inputValue);

    // Clear textarea after processing
    textarea.value = '';

    this._afterEdit();
  }

  handleKeyDown(e: KeyboardEvent): void {
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
        this._hideSuggestions();
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

    // Handle Enter
    if (e.key === 'Enter') {
      e.preventDefault();
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

    // Select all
    if (e.key === 'a' && isCtrl) {
      e.preventDefault();
      this.selectAll();
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
    this._detectMessageType();
    this._tokenize();
    this.updatePlaceholderVisibility();
    this.renderViewport();
    this._updateStatus();
    this._updateSuggestions();
    this._emitChange();
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

    if (this.cursorColumn > 0) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] =
        line.substring(0, this.cursorColumn - 1) + line.substring(this.cursorColumn);
      this.cursorColumn--;
    } else if (this.cursorLine > 0) {
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

    const line = this.lines[this.cursorLine];
    if (this.cursorColumn < line.length) {
      this.lines[this.cursorLine] =
        line.substring(0, this.cursorColumn) + line.substring(this.cursorColumn + 1);
    } else if (this.cursorLine < this.lines.length - 1) {
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
  moveCursorLeft(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this.cursorColumn > 0) {
      this.cursorColumn--;
    } else if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorColumn = this.lines[this.cursorLine].length;
    }

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

    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorUp(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
    }

    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorDown(selecting: boolean = false): void {
    if (selecting) this._startSelection();

    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorColumn = Math.min(this.cursorColumn, this.lines[this.cursorLine].length);
    }

    if (selecting) this._updateSelection();
    else this._clearSelection();
  }

  moveCursorHome(selecting: boolean = false, toDocument: boolean = false): void {
    if (selecting) this._startSelection();

    if (toDocument) {
      this.cursorLine = 0;
    }
    this.cursorColumn = 0;

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
    this.selectionStart = { line: 0, column: 0 };
    const lastLine = this.lines.length - 1;
    this.selectionEnd = { line: lastLine, column: this.lines[lastLine].length };
    this.cursorLine = lastLine;
    this.cursorColumn = this.lines[lastLine].length;
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
  handleMouseDown(e: MouseEvent): void {
    const pos = this._getPositionFromMouse(e);
    this.cursorLine = pos.line;
    this.cursorColumn = pos.column;

    if (e.shiftKey && this.selectionStart) {
      this._updateSelection();
    } else {
      this.selectionStart = { line: pos.line, column: pos.column };
      this.selectionEnd = null;
    }

    this.renderViewport();
  }

  handleMouseMove(e: MouseEvent): void {
    if (!this._isSelecting) return;

    const pos = this._getPositionFromMouse(e);
    this.cursorLine = pos.line;
    this.cursorColumn = pos.column;
    this.selectionEnd = { line: pos.line, column: pos.column };

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
    // Delay hiding suggestions to allow click
    setTimeout(() => this._hideSuggestions(), 150);
    this.renderViewport();
  }

  // ========== Scroll Handling ==========
  handleScroll(): void {
    const viewport = this.shadowRoot!.getElementById('viewport')!;
    this.scrollTop = viewport.scrollTop;

    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      this.renderViewport();
    });
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
      const highlightedContent = this._highlightLine(lineText, lineTokens, i);

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

      result += `<span class="${tokenClass}">${this._escapeHtml(tokenText)}</span>`;

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
  private _updateSuggestions(force: boolean = false): void {
    // Get current word being typed (filter text)
    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const match = beforeCursor.match(/(\S*)$/);
    const currentWord = match ? match[1].toUpperCase() : '';

    // If suggestions popup is already open, filter existing suggestions
    if (this._showSuggestions && this._unfilteredSuggestions.length > 0) {
      this._suggestionFilter = currentWord;
      this._filterSuggestions();
      return;
    }

    // Calculate cursor position in text
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1; // +1 for newline
    }
    cursorPos += this.cursorColumn;

    const newSuggestions = this.parser.getSuggestions(this.value, cursorPos, this.types);
    this._unfilteredSuggestions = newSuggestions;
    this._suggestionFilter = currentWord;
    this._selectedSuggestion = 0;

    if (newSuggestions.length > 0 && (force || this._shouldShowSuggestions())) {
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
    // Calculate cursor position in text
    let cursorPos = 0;
    for (let i = 0; i < this.cursorLine; i++) {
      cursorPos += this.lines[i].length + 1;
    }
    cursorPos += this.cursorColumn;

    // Get suggestions from parser
    this._suggestions = this.parser.getSuggestions(this.value, cursorPos, this.types);
    this._selectedSuggestion = 0;

    if (this._suggestions.length > 0) {
      this._showSuggestions = true;
      this._renderSuggestions();
      this._positionSuggestions();
    } else {
      // No suggestions available - could show a message or just do nothing
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
    container.style.maxHeight = '200px';
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
      this._unfilteredSuggestions = this._suggestionMenuStack.pop()!;
      this._suggestions = [...this._unfilteredSuggestions];
      this._suggestionFilter = '';
      this._selectedSuggestion = 0;
      this._renderSuggestions();
    }
  }

  private _applySuggestion(suggestion: Suggestion): void {
    if (!suggestion) return;

    // If we're in editable mode and selecting a default value, apply it differently
    if (this._currentEditable && suggestion.type === 'default') {
      this._applyEditableDefault(suggestion.text);
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

    // Save state BEFORE making changes
    this._saveToHistory();

    const line = this.lines[this.cursorLine] || '';
    const beforeCursor = line.substring(0, this.cursorColumn);
    const afterCursor = line.substring(this.cursorColumn);

    // Find word boundary - prefix before cursor
    const prefixMatch = beforeCursor.match(/(\S*)$/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const insertPos = this.cursorColumn - prefix.length;

    // Find word boundary - suffix after cursor (the rest of the current token)
    const suffixMatch = afterCursor.match(/^(\S*)/);
    const suffix = suffixMatch ? suffixMatch[1] : '';

    // Build new line - remove entire token (prefix + suffix) and insert suggestion
    const afterToken = afterCursor.substring(suffix.length);
    const hasEditable = suggestion.editable && suggestion.editable.start !== undefined && suggestion.editable.end !== undefined;

    // Determine if we need to add a space after the inserted text:
    // - Don't add space if token has editable region (user will continue editing)
    // - Don't add space if afterToken already starts with whitespace
    // - Add space otherwise to separate from next token
    const afterStartsWithSpace = /^\s/.test(afterToken);
    const needsTrailingSpace = !hasEditable && !afterStartsWithSpace;
    const insertedText = suggestion.text + (needsTrailingSpace ? ' ' : '');

    this.lines[this.cursorLine] =
      line.substring(0, insertPos) + insertedText + afterToken;

    // Clear suggestion state to force fetching new suggestions
    this._suggestionMenuStack = [];
    this._showSuggestions = false;
    this._unfilteredSuggestions = [];
    this._suggestionFilter = '';

    // Handle editable region - select it for immediate editing
    if (hasEditable) {
      const editable = suggestion.editable!;
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
        pattern: editable.pattern,
        suffix: suggestion.text.substring(editable.end),
        defaultsFunction: editable.defaultsFunction
      };
    } else {
      // No editable - just move cursor after the inserted token
      this.cursorColumn = insertPos + insertedText.length;
      this.selectionStart = null;
      this.selectionEnd = null;
      this._currentEditable = null;
    }

    this._detectMessageType();
    this._tokenize();
    this.updatePlaceholderVisibility();
    this.renderViewport();
    this._updateStatus();
    this._emitChange();

    // Show defaults suggestions if editable has them, otherwise auto-open suggestions for next token
    if (hasEditable) {
      const defaults = this._getEditableDefaults();
      if (defaults.length > 0) {
        setTimeout(() => {
          this._showEditableDefaults(defaults);
        }, 50);
      }
    } else {
      setTimeout(() => {
        this._updateSuggestions(true);
      }, 50);
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

  /** Get default values for current editable region (from defaultsFunction) */
  private _getEditableDefaults(): string[] {
    if (!this._currentEditable) return [];

    const { defaultsFunction } = this._currentEditable;

    // Evaluate the function if present
    if (defaultsFunction) {
      try {
        // Create and execute the function
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return (${defaultsFunction})()`) as () => string[];
        const result = fn();
        if (Array.isArray(result)) {
          return result;
        }
      } catch (e) {
        console.warn('Error evaluating defaultsFunction:', e);
      }
    }

    return [];
  }

  /** Show editable defaults as suggestions */
  private _showEditableDefaults(defaults: string[]): void {
    if (defaults.length === 0) return;

    // Create suggestions from defaults
    this._suggestions = defaults.map(value => ({
      text: value,
      description: 'Default value',
      type: 'default'
    }));
    this._unfilteredSuggestions = [...this._suggestions];
    this._selectedSuggestion = 0;
    this._showSuggestions = true;
    this._suggestionFilter = '';

    this._renderSuggestions();
    this._positionSuggestions();
  }

  /** Apply a default value to the current editable region */
  private _applyEditableDefault(value: string): void {
    if (!this._currentEditable) return;

    const { editableStart, editableEnd, suffix } = this._currentEditable;

    // Calculate line and column for the editable region
    const pos = this._absoluteToLineColumn(editableStart);
    const line = this.lines[pos.line] || '';

    // Replace the editable part with the new value
    const beforeEditable = line.substring(0, pos.column);
    const afterEditable = line.substring(pos.column + (editableEnd - editableStart));

    this.lines[pos.line] = beforeEditable + value + suffix + afterEditable.substring(suffix.length);

    // Move cursor after the inserted value + suffix
    this.cursorColumn = pos.column + value.length + suffix.length;
    this.selectionStart = null;
    this.selectionEnd = null;
    this._currentEditable = null;

    this._hideSuggestions();
    this._afterEdit();
  }

  // ========== Status Bar ==========
  private _updateStatus(): void {
    const statusType = this.shadowRoot!.getElementById('statusType');
    const statusInfo = this.shadowRoot!.getElementById('statusInfo');

    if (statusType) {
      if (this._messageType) {
        const grammar = this.parser.currentGrammar;
        statusType.textContent = grammar?.name || this._messageType.toUpperCase();
      } else {
        statusType.textContent = 'TAC';
      }
    }

    if (statusInfo) {
      const validation = this.parser.validate(this.value);
      if (this.value.trim().length > 0) {
        if (validation.valid) {
          statusInfo.textContent = '✓ Valid';
          statusInfo.className = 'status-info valid';
        } else {
          statusInfo.textContent = `✗ ${validation.errors.length} error(s)`;
          statusInfo.className = 'status-info invalid';
        }
      } else {
        statusInfo.textContent = '';
        statusInfo.className = 'status-info';
      }
    }
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

  // ========== Theme ==========

  /**
   * Update dynamic theme CSS based on dark-selector attribute.
   */
  updateThemeCSS(): void {
    const darkSelector = this.getAttribute('dark-selector') || '.dark';
    const darkRule = this._parseSelectorToHostRule(darkSelector);

    let themeStyle = this.shadowRoot!.getElementById('theme-styles') as HTMLStyleElement | null;
    if (!themeStyle) {
      themeStyle = document.createElement('style');
      themeStyle.id = 'theme-styles';
      // Insert after the main stylesheet so theme variables take precedence
      const mainStyle = this.shadowRoot!.querySelector('style');
      if (mainStyle && mainStyle.nextSibling) {
        this.shadowRoot!.insertBefore(themeStyle, mainStyle.nextSibling);
      } else {
        this.shadowRoot!.appendChild(themeStyle);
      }
    }

    // Light theme defaults (default theme)
    const lightDefaults: ThemeConfig = {
      'tac-bg': '#ffffff',
      'tac-text': '#333333',
      'tac-placeholder': '#999999',
      'tac-border': '#e0e0e0',
      'tac-cursor': '#333333',
      'tac-selection': 'rgba(173, 214, 255, 0.5)',
      'tac-current-line': 'rgba(0, 0, 0, 0.04)',
      'tac-keyword': '#0000ff',
      'tac-location': '#267f99',
      'tac-datetime': '#a31515',
      'tac-value': '#098658',
      'tac-unit': '#001080',
      'tac-weather': '#af00db',
      'tac-cloud': '#795e26',
      'tac-visibility': '#0070c1',
      'tac-wind': '#af00db',
      'tac-pressure': '#098658',
      'tac-temperature': '#a31515',
      'tac-remark': '#008000',
      'tac-trend': '#0000ff',
      'tac-geometry': '#795e26',
      'tac-error': '#d32f2f',
      'tac-warning': '#ff8c00',
      'tac-unknown': '#333333',
      'tac-suggestion-bg': '#f3f3f3',
      'tac-suggestion-border': '#c8c8c8',
      'tac-suggestion-hover': '#0060c0',
      'tac-suggestion-text': '#333333',
      'tac-suggestion-desc': '#717171',
      'tac-status-bg': '#007acc',
      'tac-status-text': '#ffffff'
    };

    // Dark theme defaults
    const darkDefaults: ThemeConfig = {
      'tac-bg': '#1e1e1e',
      'tac-text': '#d4d4d4',
      'tac-placeholder': '#6e6e6e',
      'tac-border': '#3c3c3c',
      'tac-cursor': '#aeafad',
      'tac-selection': 'rgba(38, 79, 120, 0.5)',
      'tac-current-line': 'rgba(255, 255, 255, 0.04)',
      'tac-keyword': '#569cd6',
      'tac-location': '#4ec9b0',
      'tac-datetime': '#ce9178',
      'tac-value': '#b5cea8',
      'tac-unit': '#9cdcfe',
      'tac-weather': '#c586c0',
      'tac-cloud': '#dcdcaa',
      'tac-visibility': '#4fc1ff',
      'tac-wind': '#c586c0',
      'tac-pressure': '#b5cea8',
      'tac-temperature': '#f48771',
      'tac-remark': '#6a9955',
      'tac-trend': '#569cd6',
      'tac-geometry': '#d7ba7d',
      'tac-error': '#f44747',
      'tac-warning': '#cca700',
      'tac-unknown': '#d4d4d4',
      'tac-suggestion-bg': '#252526',
      'tac-suggestion-border': '#454545',
      'tac-suggestion-hover': '#094771',
      'tac-suggestion-text': '#d4d4d4',
      'tac-suggestion-desc': '#808080',
      'tac-status-bg': '#007acc',
      'tac-status-text': '#ffffff'
    };

    const generateVars = (obj: ThemeConfig): string =>
      Object.entries(obj)
        .map(([k, v]) => `--${k}: ${v};`)
        .join('\n        ');

    const lightTheme = { ...lightDefaults, ...this.themes.light };
    const darkTheme = { ...darkDefaults, ...this.themes.dark };

    const css = `:host {
        ${generateVars(lightTheme)}
      }
      ${darkRule} {
        ${generateVars(darkTheme)}
      }`;

    themeStyle.textContent = css;
  }

  /**
   * Convert a CSS selector to a :host or :host-context rule.
   */
  private _parseSelectorToHostRule(selector: string): string {
    if (!selector) return ':host([data-color-scheme="dark"])';
    // Simple class selector without spaces → apply directly to host
    if (selector.startsWith('.') && !selector.includes(' ')) {
      return `:host(${selector})`;
    }
    // Complex selector → use host-context for ancestor matching
    return `:host-context(${selector})`;
  }

  /**
   * Programmatically set theme colors.
   */
  setTheme(theme: ThemeSettings): void {
    if (theme.dark) this.themes.dark = { ...this.themes.dark, ...theme.dark };
    if (theme.light) this.themes.light = { ...this.themes.light, ...theme.light };
    this.updateThemeCSS();
  }

  /**
   * Reset theme to defaults.
   */
  resetTheme(): void {
    this.themes = { dark: {}, light: {} };
    this.updateThemeCSS();
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
