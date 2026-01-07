/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */

// Import types from dedicated module
import {
  MessageTypeConfig,
  TokenDefinition,
  EditableDefinition,
  SuggestionDeclaration,
  SuggestionDefinition,
  TemplateField,
  TemplateDefinition,
  StructureItem,
  StructureToken,
  StructureOneOf,
  StructureSequence,
  StructureNode,
  isStructureOneOf,
  isStructureSequence,
  isStructureToken,
  Grammar,
  Token,
  TokenMatchResult,
  Suggestion,
  ValidationError,
  ValidationResult,
  SuggestionProviderContext,
  ProviderSuggestion,
  SuggestionProviderResult,
  SuggestionProviderFunction,
  SuggestionProviderOptions
} from './tac-parser-types.js';

// Import validator types from shared types
import {
  ValidatorContext,
  ValidatorCallback,
  matchValidatorPattern
} from './tac-editor-types.js';

// Import structure tracker
import { StructureTracker } from './tac-parser-structure.js';

// Re-export all types for backward compatibility
export type {
  MessageTypeConfig,
  TokenDefinition,
  EditableDefinition,
  SuggestionDeclaration,
  SuggestionDefinition,
  TemplateField,
  TemplateDefinition,
  StructureItem,
  StructureToken,
  StructureOneOf,
  StructureSequence,
  StructureNode,
  Grammar,
  Token,
  TokenMatchResult,
  Suggestion,
  ValidationError,
  ValidationResult,
  SuggestionProviderContext,
  ProviderSuggestion,
  SuggestionProviderResult,
  SuggestionProviderFunction,
  SuggestionProviderOptions
};

// Re-export type guards and class
export { isStructureOneOf, isStructureSequence, isStructureToken, StructureTracker };

/**
 * TAC Parser class
 * Grammar-based parser for TAC messages
 */

/** Validator getter function type - returns matching validators for a given context */
export type ValidatorGetter = (
  validatorName: string | null,
  grammarCode: string | null,
  grammarStandard: string | null,
  grammarLang: string | null,
  tokenType: string
) => ValidatorCallback[];

/** Provider getter function type - returns matching provider for a given context */
export type ProviderGetter = (
  providerId: string | null,
  grammarCode: string | null,
  grammarStandard: string | null,
  grammarLang: string | null,
  tokenType: string
) => SuggestionProviderOptions | null;

// Re-export ValidatorContext for backward compatibility
export type { ValidatorContext };

export class TacParser {
  grammars: Map<string, Grammar> = new Map();
  currentGrammar: Grammar | null = null;
  /** Name of the current grammar (key in grammars map) */
  currentGrammarName: string | null = null;
  /** Grammar TAC code (e.g., 'sa', 'ft', 'ws') */
  grammarCode: string | null = null;
  /** Grammar standard (e.g., 'oaci', 'noaa') */
  grammarStandard: string | null = null;
  /** Grammar language (e.g., 'en', 'fr') */
  grammarLang: string | null = null;
  /** Raw (unresolved) grammars before inheritance resolution */
  private _rawGrammars: Map<string, Grammar> = new Map();
  /** Registered suggestion providers by token type */
  private _suggestionProviders: Map<string, SuggestionProviderOptions> = new Map();
  /** Current editor text (set by editor for provider context) */
  private _currentText: string = '';
  /** Current cursor position (set by editor for provider context) */
  private _cursorPosition: number = 0;
  /** Validator getter function (set by editor to provide validator lookup) */
  private _validatorGetter: ValidatorGetter | null = null;
  /** Provider getter function (set by editor to provide pattern-based provider lookup) */
  private _providerGetter: ProviderGetter | null = null;

  /**
   * Set the validator getter function
   * Called by the editor to provide validator lookup capability
   */
  setValidatorGetter(getter: ValidatorGetter): void {
    this._validatorGetter = getter;
  }

  /**
   * Set the provider getter function
   * Called by the editor to provide pattern-based provider lookup capability
   */
  setProviderGetter(getter: ProviderGetter): void {
    this._providerGetter = getter;
  }

  /**
   * Set grammar context (code, standard, lang)
   * Called by the editor when grammar changes
   */
  setGrammarContext(code: string | null, standard: string | null, lang: string | null): void {
    this.grammarCode = code;
    this.grammarStandard = standard;
    this.grammarLang = lang;
  }

  /**
   * Apply validator to a matched token
   * Checks both grammar-defined validators and pattern-based validators
   * @param result - The token match result
   * @param tokenText - The token text value
   * @param position - Position in the text
   * @param grammar - Current grammar
   * @returns TokenMatchResult with validation error if validator fails
   */
  private _applyValidator(
    result: TokenMatchResult,
    tokenText: string,
    position: number,
    grammar: Grammar
  ): TokenMatchResult {
    // Skip if already has an error or no validator getter
    if (result.error || !this._validatorGetter) {
      return result;
    }

    // Get token definition to check for grammar-defined validator name
    const tokenDef = grammar.tokens?.[result.type];
    const validatorName = tokenDef?.validator || null;

    // Get all matching validators (grammar-defined + pattern-based)
    const validators = this._validatorGetter(
      validatorName,
      this.grammarCode,
      this.grammarStandard,
      this.grammarLang,
      result.type
    );

    if (validators.length === 0) {
      return result;
    }

    // Create validation context
    const context: ValidatorContext = {
      tokenValue: tokenText,
      tokenType: result.type,
      fullText: this._currentText,
      position,
      grammarName: this.currentGrammarName,
      grammarCode: this.grammarCode,
      grammarStandard: this.grammarStandard,
      grammarLang: this.grammarLang
    };

    // Call all validators, return first error
    for (const validator of validators) {
      const validationError = validator(context);
      if (validationError) {
        return {
          ...result,
          error: validationError
        };
      }
    }

    return result;
  }

  /**
   * Register a grammar
   * If the grammar has an 'extends' property, inheritance is resolved after all grammars are registered.
   * Call resolveInheritance() after registering all grammars to apply inheritance.
   */
  registerGrammar(name: string, grammar: Grammar): void {
    this._rawGrammars.set(name, grammar);
    // If no inheritance, add directly to resolved grammars
    if (!grammar.extends) {
      this.grammars.set(name, grammar);
    }
  }

  /**
   * Resolve inheritance for all registered grammars.
   * Must be called after all grammars are registered if any use 'extends'.
   */
  resolveInheritance(): void {
    // First pass: copy non-extending grammars
    for (const [name, grammar] of this._rawGrammars) {
      if (!grammar.extends) {
        this.grammars.set(name, grammar);
      }
    }

    // Second pass: resolve inheritance
    for (const [name, grammar] of this._rawGrammars) {
      if (grammar.extends) {
        const resolved = this._resolveGrammarInheritance(grammar, new Set([name]));
        this.grammars.set(name, resolved);
      }
    }
  }

  // ========== Provider System ==========

  /**
   * Register a suggestion provider for a specific token type
   * @param tokenType - The token type to provide suggestions for (e.g., 'firId', 'sequenceNumber')
   * @param options - Provider options including the provider function and mode
   */
  registerSuggestionProvider(tokenType: string, options: SuggestionProviderOptions): void {
    this._suggestionProviders.set(tokenType, options);
  }

  /**
   * Unregister a suggestion provider
   * @param tokenType - The token type to unregister
   */
  unregisterSuggestionProvider(tokenType: string): void {
    this._suggestionProviders.delete(tokenType);
  }

  /**
   * Check if any registered provider has userInteraction: true
   * @returns true if at least one provider requires user interaction
   */
  hasUserInteractionProvider(): boolean {
    for (const options of this._suggestionProviders.values()) {
      if (options.userInteraction === true) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get provider options for a specific token type
   * Checks both name-based providers and pattern-based providers
   * @param tokenType - The token type (provider ID)
   * @param providerId - Optional explicit provider ID
   * @returns Provider options or undefined if no provider registered
   */
  getProviderOptions(tokenType: string, providerId?: string): SuggestionProviderOptions | undefined {
    // 1. Check by explicit provider ID
    if (providerId && this._suggestionProviders.has(providerId)) {
      return this._suggestionProviders.get(providerId);
    }
    // 2. Check by tokenType as provider name
    if (this._suggestionProviders.has(tokenType)) {
      return this._suggestionProviders.get(tokenType);
    }
    // 3. Check pattern-based providers via getter
    if (this._providerGetter) {
      const patternProvider = this._providerGetter(
        providerId || null,
        this.grammarCode,
        this.grammarStandard,
        this.grammarLang,
        tokenType
      );
      if (patternProvider) return patternProvider;
    }
    return undefined;
  }

  /**
   * Check if a provider is registered for a token type
   * Checks both name-based providers and pattern-based providers
   * @param tokenType - The token type to check
   * @param providerId - Optional explicit provider ID
   */
  hasProvider(tokenType: string, providerId?: string): boolean {
    // 1. Check by explicit provider ID
    if (providerId && this._suggestionProviders.has(providerId)) {
      return true;
    }
    // 2. Check by tokenType as provider name
    if (this._suggestionProviders.has(tokenType)) {
      return true;
    }
    // 3. Check pattern-based providers via getter
    if (this._providerGetter) {
      const patternProvider = this._providerGetter(
        providerId || null,
        this.grammarCode,
        this.grammarStandard,
        this.grammarLang,
        tokenType
      );
      if (patternProvider) return true;
    }
    return false;
  }

  /**
   * Get all registered provider token types
   */
  getRegisteredProviders(): string[] {
    return Array.from(this._suggestionProviders.keys());
  }

  /**
   * Get suggestions from a provider (public method for editor to call)
   * @param providerId - The provider ID to fetch from
   * @returns Promise of suggestions array or empty array
   */
  async getProviderSuggestions(providerId: string): Promise<Suggestion[]> {
    const result = await this._getProviderSuggestionsAsync(providerId);
    return result?.suggestions || [];
  }

  /**
   * Update the context for providers (called by editor before getting suggestions)
   * @param text - Current editor text
   * @param cursorPosition - Current cursor position
   */
  updateProviderContext(text: string, cursorPosition: number): void {
    this._currentText = text;
    this._cursorPosition = cursorPosition;
  }

  /**
   * Convert provider suggestions to internal Suggestion format
   * @param providerSuggestions - Suggestions from provider
   * @param prefix - Optional prefix to prepend to each suggestion text
   * @param suffix - Optional suffix to append to each suggestion text
   */
  private _convertProviderSuggestions(providerSuggestions: ProviderSuggestion[], prefix?: string, suffix?: string): Suggestion[] {
    return providerSuggestions.map(ps => ({
      text: (prefix || '') + ps.text + (suffix || ''),
      description: ps.description || '',
      type: ps.type || 'value',
      placeholder: ps.placeholder,
      editable: ps.editable,
      appendToPrevious: ps.appendToPrevious,
      skipToNext: ps.skipToNext,
      newLineBefore: ps.newLineBefore,
      isCategory: ps.isCategory,
      children: ps.children ? this._convertProviderSuggestions(ps.children, prefix, suffix) : undefined
    }));
  }

  /**
   * Get suggestions from provider if registered (async)
   * Checks both name-based providers (from grammar) and pattern-based providers
   * @param tokenType - The token type (provider ID or grammar token ref)
   * @param prefix - Optional prefix to prepend to suggestions (from declaration)
   * @param suffix - Optional suffix to append to suggestions (from declaration)
   * @param providerId - Optional explicit provider ID (from suggestion declaration)
   * @returns Promise of provider suggestions or null if no provider
   */
  private async _getProviderSuggestionsAsync(tokenType: string, prefix?: string, suffix?: string, providerId?: string): Promise<{ suggestions: Suggestion[] | null; replace: boolean } | null> {
    // 1. First try by explicit provider ID (from suggestion declaration)
    let providerOptions = providerId ? this._suggestionProviders.get(providerId) : null;

    // 2. Then try by tokenType as provider name
    if (!providerOptions) {
      providerOptions = this._suggestionProviders.get(tokenType);
    }

    // 3. Finally, try pattern-based provider via getter
    if (!providerOptions && this._providerGetter) {
      providerOptions = this._providerGetter(
        providerId || null,
        this.grammarCode,
        this.grammarStandard,
        this.grammarLang,
        tokenType
      );
    }

    if (!providerOptions) {
      return null;
    }

    // Extract search text (from last whitespace to cursor)
    const textBeforeCursor = this._currentText.substring(0, this._cursorPosition);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const search = lastSpaceIndex === -1
      ? textBeforeCursor
      : textBeforeCursor.substring(lastSpaceIndex + 1);

    const context: SuggestionProviderContext = {
      tokenType,
      search,
      tac: this._currentText,
      cursorPosition: this._cursorPosition,
      grammarName: this.currentGrammarName,
      grammarCode: this.grammarCode,
      grammarStandard: this.grammarStandard,
      grammarLang: this.grammarLang
    };

    // Call provider (may be sync or async)
    const resultOrPromise = providerOptions.provider(context);
    const result = resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;

    // Default replace = true
    const replace = providerOptions.replace !== false;

    // Provider returned null/undefined - no provider suggestions
    if (result === null || result === undefined) {
      // In replace mode, null means no suggestions at all
      if (replace) {
        return { suggestions: [], replace: true };
      }
      // In non-replace mode, null means use only grammar suggestions
      return null;
    }

    return {
      suggestions: this._convertProviderSuggestions(result, prefix, suffix),
      replace
    };
  }

  /**
   * Resolve grammar inheritance recursively
   * @param grammar - The grammar to resolve
   * @param visited - Set of already visited grammar names (to detect cycles)
   */
  private _resolveGrammarInheritance(grammar: Grammar, visited: Set<string>): Grammar {
    if (!grammar.extends) {
      return grammar;
    }

    const parentName = grammar.extends;

    // Check for circular inheritance
    if (visited.has(parentName)) {
      console.warn(`Circular inheritance detected: ${Array.from(visited).join(' -> ')} -> ${parentName}`);
      return grammar;
    }

    // Try to find parent grammar with various key formats:
    // 1. Exact name (e.g., "report")
    // 2. With colon format (e.g., "report.noaa" -> "report:noaa")
    let parent = this._rawGrammars.get(parentName);
    if (!parent && parentName.includes('.')) {
      // Convert "name.standard" to "name:standard" format
      const colonKey = parentName.replace('.', ':');
      parent = this._rawGrammars.get(colonKey);
    }
    if (!parent) {
      console.warn(`Parent grammar '${parentName}' not found for inheritance`);
      return grammar;
    }

    // Resolve parent first (in case it also extends something)
    visited.add(parentName);
    const resolvedParent = this._resolveGrammarInheritance(parent, visited);

    // Deep merge: child overrides parent
    return this._mergeGrammars(resolvedParent, grammar);
  }

  /**
   * Deep merge two grammars (parent and child)
   * Child properties override parent properties
   */
  private _mergeGrammars(parent: Grammar, child: Grammar): Grammar {
    const merged: Grammar = {
      // Scalar properties: child overrides parent
      name: child.name ?? parent.name,
      version: child.version ?? parent.version,
      description: child.description ?? parent.description,
      templateMode: child.templateMode ?? parent.templateMode,
      category: child.category,
      // Don't inherit extends (we've resolved it)
      // identifier: child can override or inherit
      identifier: child.identifier ?? parent.identifier,
      // Template: child overrides entirely if specified
      template: child.template ?? parent.template,
      // Tokens: deep merge (child tokens override/add to parent)
      tokens: {
        ...parent.tokens,
        ...child.tokens
      },
      // Structure: child overrides entirely if specified
      structure: child.structure ?? parent.structure,
      // Suggestions: deep merge
      suggestions: this._mergeSuggestions(parent.suggestions, child.suggestions)
    };

    return merged;
  }

  /**
   * Merge structure arrays by node ID
   * Child nodes replace parent nodes with matching ID
   */
  private _mergeStructure(
    parent: StructureNode[] | undefined,
    child: StructureNode[] | undefined
  ): StructureNode[] | undefined {
    if (!parent && !child) return undefined;
    if (!parent) return child;
    if (!child) return parent;

    // Build a map of child node IDs for quick lookup
    const childNodeMap = new Map<string, StructureNode>();
    for (const node of child) {
      if (node.id) {
        childNodeMap.set(node.id, node);
      }
    }

    // Deep clone and merge parent structure
    const mergeNode = (node: StructureNode): StructureNode => {
      // Check if child has a replacement for this node
      if (node.id && childNodeMap.has(node.id)) {
        return childNodeMap.get(node.id)!;
      }

      // Clone the node and recursively merge children
      const cloned: StructureNode = { ...node };

      if ('sequence' in node && node.sequence) {
        (cloned as any).sequence = node.sequence.map(mergeNode);
      }

      if ('oneOf' in node && node.oneOf) {
        (cloned as any).oneOf = node.oneOf.map(mergeNode);
      }

      return cloned;
    };

    return parent.map(mergeNode);
  }

  /**
   * Merge suggestion definitions
   */
  private _mergeSuggestions(
    parent: Grammar['suggestions'] | undefined,
    child: Grammar['suggestions'] | undefined
  ): Grammar['suggestions'] {
    if (!parent && !child) return undefined;
    if (!parent) return child;
    if (!child) return parent;

    // Merge declarations: child declarations add to or override parent by id
    let mergedDeclarations: SuggestionDeclaration[] | undefined;
    if (parent.declarations || child.declarations) {
      const declMap = new Map<string, SuggestionDeclaration>();

      // Add parent declarations first
      for (const decl of parent.declarations || []) {
        declMap.set(decl.id, decl);
      }

      // Child declarations override
      for (const decl of child.declarations || []) {
        declMap.set(decl.id, decl);
      }

      mergedDeclarations = Array.from(declMap.values());
    }

    // Merge after: child keys override parent keys
    let mergedAfter: Record<string, string[] | SuggestionDefinition[]> | undefined;
    if (parent.after || child.after) {
      mergedAfter = {
        ...parent.after,
        ...child.after
      };
    }

    return {
      declarations: mergedDeclarations,
      after: mergedAfter
    };
  }

  /**
   * Get registered grammar names
   */
  getGrammarNames(): string[] {
    return Array.from(this.grammars.keys());
  }

  /**
   * Detect message type from text and load appropriate grammar
   */
  detectMessageType(text: string): string | null {
    const normalizedText = text.trim().toUpperCase();
    const tokens = normalizedText.split(/\s+/);
    const firstToken = tokens[0];

    if (!firstToken) return null;

    // Check each grammar for matching identifier
    // Support multi-token identifiers like "VA ADVISORY" or "TC ADVISORY"
    for (const [name, grammar] of this.grammars) {
      if (grammar.identifier) {
        // Check if identifier contains spaces (multi-token)
        if (grammar.identifier.includes(' ')) {
          // Multi-token identifier - check if text starts with it
          if (normalizedText.startsWith(grammar.identifier)) {
            this.currentGrammar = grammar;
            this.currentGrammarName = name;
            return name;
          }
        } else {
          // Single-token identifier
          if (grammar.identifier === firstToken) {
            this.currentGrammar = grammar;
            this.currentGrammarName = name;
            return name;
          }
        }
      }
    }

    // Check for SIGMET/AIRMET where identifier is second token (after FIR code)
    // Format: LFFF SIGMET 1 VALID... or LFFF AIRMET 1 VALID...
    const words = normalizedText.split(/\s+/);
    if (words.length >= 2 && /^[A-Z]{4}$/.test(firstToken)) {
      const secondToken = words[1];
      for (const [name, grammar] of this.grammars) {
        if (grammar.identifier === secondToken) {
          this.currentGrammar = grammar;
          this.currentGrammarName = name;
          return name;
        }
      }
    }

    return null;
  }

  /**
   * Tokenize text using current grammar
   */
  tokenize(text: string): Token[] {
    if (!this.currentGrammar) {
      // No grammar loaded, return all as unknown tokens
      return this._tokenizeRaw(text);
    }

    return this._tokenizeWithGrammar(text, this.currentGrammar);
  }

  /**
   * Tokenize without grammar (raw tokens)
   */
  private _tokenizeRaw(text: string): Token[] {
    const tokens: Token[] = [];
    const parts = text.split(/(\s+)/);
    let position = 0;

    for (const part of parts) {
      if (part.length > 0) {
        const isWhitespace = /^\s+$/.test(part);
        tokens.push({
          text: part,
          type: isWhitespace ? 'whitespace' : 'error',
          style: isWhitespace ? 'whitespace' : 'error',
          start: position,
          end: position + part.length,
          error: isWhitespace ? undefined : `Unknown token: ${part}`
        });
        position += part.length;
      }
    }

    return tokens;
  }

  /**
   * Tokenize with grammar rules
   */
  private _tokenizeWithGrammar(text: string, grammar: Grammar): Token[] {
    // For template-based grammars (VAA, TCA, FN), use template tokenization
    if (grammar.templateMode) {
      return this._tokenizeTemplate(text, grammar);
    }

    // Normal mode for all other messages (METAR, SPECI, TAF, SIGMET, AIRMET)
    return this._tokenizeNormal(text, grammar);
  }

  /**
   * Tokenize normal mode messages (METAR, SPECI, TAF, SIGMET, AIRMET)
   * Handles both single-word and multi-word tokens with structure-aware matching
   */
  private _tokenizeNormal(text: string, grammar: Grammar): Token[] {
    const tokens: Token[] = [];
    let position = 0;
    const grammarTokens = grammar.tokens || {};

    // Build a list of multi-word patterns sorted by length (longest first)
    const multiWordPatterns: { pattern: string; tokenName: string; tokenDef: TokenDefinition }[] = [];
    for (const [tokenName, tokenDef] of Object.entries(grammarTokens)) {
      if (tokenDef.pattern) {
        // Extract literal multi-word patterns from regex
        let patternStr = tokenDef.pattern.replace(/^\^/, '').replace(/\$$/, '');
        // Remove escape characters (e.g., \+ -> +)
        patternStr = patternStr.replace(/\\(.)/g, '$1');
        // If pattern looks like a literal (no complex regex) and has spaces
        if (/^[A-Z0-9\s\-\+:\/]+$/i.test(patternStr) && patternStr.includes(' ')) {
          multiWordPatterns.push({ pattern: patternStr, tokenName, tokenDef });
        }
      }
    }
    // Sort by length descending to match longest patterns first
    multiWordPatterns.sort((a, b) => b.pattern.length - a.pattern.length);

    // Use StructureTracker for context-aware token matching
    const tracker = grammar.structure
      ? new StructureTracker(grammar.structure, grammarTokens)
      : null;

    while (position < text.length) {
      // Check for whitespace (including newlines)
      const whitespaceMatch = text.slice(position).match(/^(\s+)/);
      if (whitespaceMatch) {
        tokens.push({
          text: whitespaceMatch[1],
          type: 'whitespace',
          start: position,
          end: position + whitespaceMatch[1].length
        });
        position += whitespaceMatch[1].length;
        continue;
      }

      // Try to match multi-word patterns first
      let matched = false;
      for (const { pattern, tokenName, tokenDef } of multiWordPatterns) {
        const remaining = text.slice(position).toUpperCase();
        if (remaining.startsWith(pattern)) {
          const actualText = text.slice(position, position + pattern.length);
          tokens.push({
            text: actualText,
            type: tokenName,
            style: tokenDef.style || tokenName,
            start: position,
            end: position + pattern.length,
            description: tokenDef.description
          });
          position += pattern.length;
          matched = true;
          // Advance tracker position if this matched
          if (tracker) {
            tracker.tryMatch(tokenName);
          }
          break;
        }
      }
      if (matched) continue;

      // Try to match single token (up to next whitespace)
      const wordMatch = text.slice(position).match(/^(\S+)/);
      if (wordMatch) {
        const word = wordMatch[1];
        // Structure-aware matching using tracker
        let tokenInfo = this._matchTokenWithTracker(word, grammar, tracker);
        // Apply semantic validation if validator is defined
        tokenInfo = this._applyValidator(tokenInfo, word, position, grammar);
        tokens.push({
          text: word,
          type: tokenInfo.type,
          style: tokenInfo.style,
          start: position,
          end: position + word.length,
          error: tokenInfo.error,
          description: tokenInfo.description
        });
        position += word.length;
        // Advance tracker on successful match
        if (!tokenInfo.error && tracker) {
          tracker.tryMatch(tokenInfo.type);
        }
      } else {
        // Should not happen, but safety break
        break;
      }
    }

    return tokens;
  }

  /**
   * Match token using StructureTracker for context-aware matching
   */
  private _matchTokenWithTracker(
    text: string,
    grammar: Grammar,
    tracker: StructureTracker | null
  ): TokenMatchResult {
    const tokens = grammar.tokens || {};

    // Tokens that should only match when explicitly expected (catch-all patterns)
    const catchAllTokens = new Set(['remarkContent']);

    // If we have a tracker, try expected tokens first (context-aware)
    if (tracker) {
      const expectedTokenIds = tracker.getExpectedTokenIds();

      for (const tokenId of expectedTokenIds) {
        const tokenDef = tokens[tokenId];

        if (tokenDef?.pattern) {
          const regex = new RegExp(tokenDef.pattern);
          if (regex.test(text)) {
            return {
              type: tokenId,
              style: tokenDef.style || tokenId,
              description: tokenDef.description
            };
          }
        }

        if (tokenDef?.values && tokenDef.values.includes(text.toUpperCase())) {
          return {
            type: tokenId,
            style: tokenDef.style || tokenId,
            description: tokenDef.description
          };
        }
      }

      // If we have expected tokens but none matched, try other tokens
      // but exclude catch-all tokens that would match anything
      for (const [tokenName, tokenDef] of Object.entries(tokens)) {
        // Skip catch-all tokens - they should only match when expected
        if (catchAllTokens.has(tokenName)) {
          continue;
        }

        if (tokenDef.pattern) {
          const regex = new RegExp(tokenDef.pattern);
          if (regex.test(text)) {
            return {
              type: tokenName,
              style: tokenDef.style || tokenName,
              description: tokenDef.description
            };
          }
        }

        if (tokenDef.values && tokenDef.values.includes(text.toUpperCase())) {
          return {
            type: tokenName,
            style: tokenDef.style || tokenName,
            description: tokenDef.description
          };
        }
      }

      // No match found - return error
      return {
        type: 'error',
        style: 'error',
        error: `Unexpected token: ${text}`
      };
    }

    // No tracker - fall back to regular pattern matching (check all tokens)
    return this._matchToken(text, grammar, 0);
  }

  /**
   * Flatten grammar structure into a linear sequence of expected token IDs
   * This handles nested sequences and oneOf choices
   */
  private _flattenStructure(structure: StructureNode[]): string[] {
    const result: string[] = [];

    const processNode = (node: StructureNode) => {
      // Add the node's ID if it exists
      if (node.id) {
        result.push(node.id);
      }

      // Process nested sequence
      if (isStructureSequence(node)) {
        for (const child of node.sequence) {
          processNode(child);
        }
      }

      // Process oneOf choices - add all possible tokens
      if (isStructureOneOf(node)) {
        for (const choice of node.oneOf) {
          processNode(choice);
        }
      }
    };

    for (const node of structure) {
      processNode(node);
    }

    return result;
  }

  /**
   * Structure-aware token matching: tries expected token first, then falls back to pattern matching
   */
  private _matchTokenStructureAware(
    text: string,
    grammar: Grammar,
    expectedTokens: string[],
    structureIndex: number
  ): TokenMatchResult {
    const tokens = grammar.tokens || {};

    // First, try to match the expected token(s) from structure
    // Look ahead more positions to account for optional tokens and oneOf alternatives in flattened structure
    for (let i = structureIndex; i < Math.min(structureIndex + 15, expectedTokens.length); i++) {
      const expectedTokenId = expectedTokens[i];
      const tokenDef = tokens[expectedTokenId];

      if (tokenDef?.pattern) {
        const regex = new RegExp(tokenDef.pattern);
        if (regex.test(text)) {
          return {
            type: expectedTokenId,
            style: tokenDef.style || expectedTokenId,
            description: tokenDef.description
          };
        }
      }

      if (tokenDef?.values && tokenDef.values.includes(text.toUpperCase())) {
        return {
          type: expectedTokenId,
          style: tokenDef.style || expectedTokenId,
          description: tokenDef.description
        };
      }
    }

    // Fall back to regular pattern matching (check all tokens)
    return this._matchToken(text, grammar, 0);
  }

  /**
   * Tokenize template-based messages (VAA, TCA, SWX)
   * These messages have fixed labels and editable values
   * Parses line-by-line and matches labels from the template definition
   */
  private _tokenizeTemplate(text: string, grammar: Grammar): Token[] {
    const tokens: Token[] = [];
    const template = grammar.template;
    const grammarTokens = grammar.tokens || {};

    if (!template) {
      // Fallback to normal tokenization if no template defined
      return this._tokenizeNormal(text, grammar);
    }

    const labelWidth = template.labelColumnWidth || 22;
    const lines = text.split('\n');
    let position = 0;

    // Build label lookup from template fields
    const labelMap = new Map<string, TemplateField>();
    for (const field of template.fields) {
      labelMap.set(field.label.toUpperCase(), field);
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineStart = position;

      // First line is the identifier
      if (lineIndex === 0) {
        const trimmed = line.trim();
        if (trimmed) {
          // Add leading whitespace if any
          const leadingWs = line.match(/^(\s*)/)?.[1] || '';
          if (leadingWs) {
            tokens.push({
              text: leadingWs,
              type: 'whitespace',
              start: position,
              end: position + leadingWs.length
            });
            position += leadingWs.length;
          }

          // Add identifier token
          const identifierInfo = this._matchToken(trimmed, grammar, 0);
          tokens.push({
            text: trimmed,
            type: identifierInfo.type,
            style: identifierInfo.style || 'keyword',
            start: position,
            end: position + trimmed.length,
            description: identifierInfo.description
          });
          position += trimmed.length;
        }
      } else {
        // Parse label: value line
        const trimmed = line.trim();

        if (!trimmed) {
          // Empty line - just whitespace
          if (line.length > 0) {
            tokens.push({
              text: line,
              type: 'whitespace',
              start: position,
              end: position + line.length
            });
            position += line.length;
          }
        } else {
          // Try to find a matching label
          let labelMatched = false;

          for (const [labelText, field] of labelMap) {
            const upperLine = trimmed.toUpperCase();
            if (upperLine.startsWith(labelText)) {
              // Found a label match
              const actualLabel = trimmed.substring(0, labelText.length);
              const valueStart = labelText.length;
              const value = trimmed.substring(valueStart).trim();

              // Add leading whitespace
              const leadingWs = line.match(/^(\s*)/)?.[1] || '';
              if (leadingWs) {
                tokens.push({
                  text: leadingWs,
                  type: 'whitespace',
                  start: position,
                  end: position + leadingWs.length
                });
                position += leadingWs.length;
              }

              // Add label token
              const labelTokenDef = grammarTokens[field.labelType];
              tokens.push({
                text: actualLabel,
                type: field.labelType,
                style: labelTokenDef?.style || 'label',
                start: position,
                end: position + actualLabel.length,
                description: labelTokenDef?.description || field.label
              });
              position += actualLabel.length;

              // Add whitespace between label and value
              const labelEndInLine = line.indexOf(actualLabel) + actualLabel.length;
              const valueStartInLine = line.indexOf(value, labelEndInLine);
              if (valueStartInLine > labelEndInLine) {
                const midWs = line.substring(labelEndInLine, valueStartInLine);
                if (midWs) {
                  tokens.push({
                    text: midWs,
                    type: 'whitespace',
                    start: position,
                    end: position + midWs.length
                  });
                  position += midWs.length;
                }
              }

              // Add value token(s)
              if (value) {
                // Tokenize the value part
                const valueTokens = this._tokenizeValue(value, field, grammar, position);
                tokens.push(...valueTokens);
                position += value.length;
              }

              labelMatched = true;
              break;
            }
          }

          if (!labelMatched) {
            // No label found - this might be a continuation line or unknown content
            // Add leading whitespace
            const leadingWs = line.match(/^(\s*)/)?.[1] || '';
            if (leadingWs) {
              tokens.push({
                text: leadingWs,
                type: 'whitespace',
                start: position,
                end: position + leadingWs.length
              });
              position += leadingWs.length;
            }

            // Check if this looks like a continuation (starts with significant whitespace)
            if (leadingWs.length >= labelWidth / 2) {
              // Treat as continuation value
              const valueTokens = this._tokenizeValueWords(trimmed, grammar, position);
              tokens.push(...valueTokens);
              position += trimmed.length;
            } else {
              // Unknown line - tokenize word by word
              const words = trimmed.split(/(\s+)/);
              for (const word of words) {
                if (!word) continue;
                if (/^\s+$/.test(word)) {
                  tokens.push({
                    text: word,
                    type: 'whitespace',
                    start: position,
                    end: position + word.length
                  });
                } else {
                  const tokenInfo = this._matchToken(word, grammar, 0);
                  tokens.push({
                    text: word,
                    type: tokenInfo.type,
                    style: tokenInfo.style,
                    start: position,
                    end: position + word.length,
                    error: tokenInfo.error,
                    description: tokenInfo.description
                  });
                }
                position += word.length;
              }
            }
          }
        }
      }

      // Add newline if not last line
      if (lineIndex < lines.length - 1) {
        tokens.push({
          text: '\n',
          type: 'whitespace',
          start: position,
          end: position + 1
        });
        position += 1;
      }
    }

    return tokens;
  }

  /**
   * Tokenize a value part of a template field
   */
  private _tokenizeValue(value: string, field: TemplateField, grammar: Grammar, startPos: number): Token[] {
    const tokens: Token[] = [];
    const grammarTokens = grammar.tokens || {};
    const valueTokenDef = grammarTokens[field.valueType];

    // Check if the entire value matches the value type pattern
    if (valueTokenDef?.pattern) {
      const regex = new RegExp(valueTokenDef.pattern);
      if (regex.test(value)) {
        tokens.push({
          text: value,
          type: field.valueType,
          style: valueTokenDef.style || 'value',
          start: startPos,
          end: startPos + value.length,
          description: valueTokenDef.description
        });
        return tokens;
      }
    }

    // Value doesn't match as a whole - tokenize word by word
    return this._tokenizeValueWords(value, grammar, startPos);
  }

  /**
   * Tokenize value words individually
   */
  private _tokenizeValueWords(value: string, grammar: Grammar, startPos: number): Token[] {
    const tokens: Token[] = [];
    const parts = value.split(/(\s+)/);
    let pos = startPos;

    for (const part of parts) {
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        tokens.push({
          text: part,
          type: 'whitespace',
          start: pos,
          end: pos + part.length
        });
      } else {
        const tokenInfo = this._matchToken(part, grammar, 0);
        tokens.push({
          text: part,
          type: tokenInfo.type,
          style: tokenInfo.style,
          start: pos,
          end: pos + part.length,
          error: tokenInfo.error,
          description: tokenInfo.description
        });
      }
      pos += part.length;
    }

    return tokens;
  }

  /**
   * Match a token against grammar definitions
   */
  private _matchToken(text: string, grammar: Grammar, ruleIndex: number): TokenMatchResult {
    const tokens = grammar.tokens || {};

    // Check all token patterns
    for (const [tokenName, tokenDef] of Object.entries(tokens)) {
      if (tokenDef.pattern) {
        const regex = new RegExp(tokenDef.pattern);
        if (regex.test(text)) {
          return {
            type: tokenName,
            style: tokenDef.style || tokenName,
            description: tokenDef.description
          };
        }
      }

      // Check literal values
      if (tokenDef.values && tokenDef.values.includes(text.toUpperCase())) {
        return {
          type: tokenName,
          style: tokenDef.style || tokenName,
          description: tokenDef.description
        };
      }
    }

    // No match found - mark as error
    return {
      type: 'error',
      style: 'error',
      error: `Unknown token: ${text}`
    };
  }

  /**
   * Get suggestions based on current position
   * @param text - The current text
   * @param cursorPosition - The cursor position
   * @param supportedTypes - Optional list of supported message types for initial suggestions
   * @deprecated Use getSuggestionsForTokenType with cached tokens instead
   */
  async getSuggestions(text: string, cursorPosition: number, supportedTypes?: string[]): Promise<Suggestion[]> {
    if (!this.currentGrammar) {
      this.detectMessageType(text);
    }

    if (!this.currentGrammar) {
      // Return initial message type suggestions
      return this._getInitialSuggestions(supportedTypes);
    }

    return await this._getContextualSuggestions(text, cursorPosition);
  }

  /**
   * Get suggestions for a specific token type (async to support async providers)
   * @param tokenType - The type of token to get suggestions for (from suggestions.after)
   * @param prevTokenText - Optional text of the previous token (for CB/TCU filtering)
   * @param supportedTypes - Optional list of supported message types for initial suggestions (MessageTypeConfig[] or string[])
   */
  async getSuggestionsForTokenType(tokenType: string | null, prevTokenText?: string, supportedTypes?: MessageTypeConfig[] | string[]): Promise<Suggestion[]> {
    // No grammar loaded - return message type suggestions
    if (!this.currentGrammar) {
      return this._getInitialSuggestions(supportedTypes);
    }

    const grammar = this.currentGrammar;
    const lookupKey = tokenType ?? 'start';

    // Get suggestion IDs from after rules
    let suggestionIds: string[] = [];
    if (grammar.suggestions && grammar.suggestions.after) {
      const afterRules = grammar.suggestions.after;
      suggestionIds = (afterRules[lookupKey] || []) as string[];
    }

    // No suggestions found - fall back to initial suggestions if at start
    if (suggestionIds.length === 0 && tokenType === null) {
      return this._getInitialSuggestions(supportedTypes);
    }

    // Build suggestions with provider injection
    // For each declaration, check if its ref has a registered provider
    const result: Suggestion[] = [];
    const prevTokenEndsWithCBorTCU = /CB$|TCU$/.test(prevTokenText || '');

    // Count how many different suggestion IDs we have (to decide if category is needed)
    const hasMultipleSuggestionTypes = suggestionIds.length > 1;

    for (const id of suggestionIds) {
      const decl = this._getDeclarationById(id);
      if (!decl) continue;

      // Filter out CB/TCU suggestions if previous token already ends with CB or TCU
      if (prevTokenEndsWithCBorTCU && decl.appendToPrevious && (decl.text === 'CB' || decl.text === 'TCU')) {
        continue;
      }

      const style = this._getStyleFromRef(decl.ref);

      // Check if this declaration has a provider defined (by ID or pattern)
      // DON'T call the provider now - just create a category that will load on click
      const tokenRef = decl.ref || '';
      if (this.hasProvider(tokenRef, decl.provider)) {
        // Provider is registered - create a category that will fetch data when opened
        const providerOptions = this.getProviderOptions(tokenRef, decl.provider);
        const customLabel = providerOptions?.label;
        const tokenDescription = decl.ref && this.currentGrammar?.tokens?.[decl.ref]?.description;

        if (hasMultipleSuggestionTypes) {
          // Multiple suggestion types - create a category
          // Use custom label from provider options if set, otherwise use grammar description
          result.push({
            text: customLabel || tokenDescription || decl.description || decl.text || '',
            description: '',
            ref: decl.ref,
            isCategory: true,
            children: [{ text: '', description: 'Loading...', selectable: false }], // Placeholder
            provider: decl.provider,
            editable: decl.editable,
            placeholder: decl.placeholder
          });
        } else {
          // Single suggestion type - create a suggestion that triggers provider
          let displayText = decl.placeholder || decl.text || '';
          const pattern = this._getPatternFromRef(decl.ref);
          if (style === 'datetime' && pattern?.includes('\\d{6}Z')) {
            displayText = this._generateMetarDateTime();
          }
          result.push({
            text: displayText,
            description: decl.description || '',
            ref: decl.ref,
            placeholder: decl.placeholder,
            editable: decl.editable,
            appendToPrevious: decl.appendToPrevious,
            skipToNext: decl.skipToNext,
            newLineBefore: decl.newLineBefore,
            switchGrammar: decl.switchGrammar,
            provider: decl.provider,
            auto: decl.auto
          });
        }
        continue; // Skip the else block below since we handled the provider case
      }

      // No provider registered - build regular suggestion
      // Check if this is a category with children
      if (decl.category && decl.children) {
        const children: Suggestion[] = [];
        for (const childId of decl.children) {
          const childDecl = this._getDeclarationById(childId);
          if (!childDecl) continue;
          const childStyle = this._getStyleFromRef(childDecl.ref);
          let childText = childDecl.placeholder || childDecl.text || '';
          const childPattern = this._getPatternFromRef(childDecl.ref);
          if (childStyle === 'datetime' && childPattern?.includes('\\d{6}Z')) {
            childText = this._generateMetarDateTime();
          }
          children.push({
            text: childText,
            description: childDecl.description || '',
            ref: childDecl.ref,
            placeholder: childDecl.placeholder,
            editable: childDecl.editable,
            appendToPrevious: childDecl.appendToPrevious,
            skipToNext: childDecl.skipToNext,
            auto: childDecl.auto
          });
        }
        result.push({
          text: decl.category,
          description: decl.description || '',
          ref: decl.ref,
          isCategory: true,
          children: this._sortSuggestions(children)
        });
      } else {
        // Regular suggestion without provider
        let displayText = decl.placeholder || decl.text || '';
        const declPattern = this._getPatternFromRef(decl.ref);
        if (style === 'datetime' && declPattern?.includes('\\d{6}Z')) {
          displayText = this._generateMetarDateTime();
        }
        result.push({
          text: displayText,
          description: decl.description || '',
          ref: decl.ref,
          placeholder: decl.placeholder,
          editable: decl.editable,
          appendToPrevious: decl.appendToPrevious,
          skipToNext: decl.skipToNext,
          newLineBefore: decl.newLineBefore,
          switchGrammar: decl.switchGrammar,
          provider: decl.provider,
          auto: decl.auto
        });
      }
    }

    // Sort suggestions: editable (generic entry) first, then categories, then others
    return this._sortSuggestions(result);
  }

  /**
   * Get style from token definition by ref
   */
  private _getStyleFromRef(ref: string): string {
    const token = this.currentGrammar?.tokens?.[ref];
    return token?.style || 'value';
  }

  /**
   * Get pattern from token definition by ref
   */
  private _getPatternFromRef(ref: string): string | undefined {
    const token = this.currentGrammar?.tokens?.[ref];
    return token?.pattern;
  }

  /**
   * Get declaration by ID
   */
  private _getDeclarationById(id: string): SuggestionDeclaration | undefined {
    return this.currentGrammar?.suggestions?.declarations?.find(d => d.id === id);
  }

  /**
   * Build Suggestion objects from declaration IDs (new format)
   */
  private _buildSuggestionsFromDeclarations(suggestionIds: string[], prevTokenText: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const prevTokenEndsWithCBorTCU = /CB$|TCU$/.test(prevTokenText);

    for (const id of suggestionIds) {
      const decl = this._getDeclarationById(id);
      if (!decl) continue;

      // Filter out CB/TCU suggestions if previous token already ends with CB or TCU
      if (prevTokenEndsWithCBorTCU && decl.appendToPrevious && (decl.text === 'CB' || decl.text === 'TCU')) {
        continue;
      }

      const style = this._getStyleFromRef(decl.ref);

      // Check if this is a category with children
      if (decl.category && decl.children) {
        const children: Suggestion[] = [];

        for (const childId of decl.children) {
          const childDecl = this._getDeclarationById(childId);
          if (!childDecl) continue;

          const childStyle = this._getStyleFromRef(childDecl.ref);
          let childText = childDecl.placeholder || childDecl.text || '';

          // Generate dynamic datetime
          const childPattern = this._getPatternFromRef(childDecl.ref);
          if (childStyle === 'datetime' && childPattern?.includes('\\d{6}Z')) {
            childText = this._generateMetarDateTime();
          }

          children.push({
            text: childText,
            description: childDecl.description || '',
            ref: childDecl.ref,
            placeholder: childDecl.placeholder,
            editable: childDecl.editable,
            appendToPrevious: childDecl.appendToPrevious,
            skipToNext: childDecl.skipToNext,
            auto: childDecl.auto
          });
        }

        suggestions.push({
          text: decl.category,
          description: decl.description || '',
          ref: decl.ref,
          isCategory: true,
          children: this._sortSuggestions(children)
        });
      } else {
        // Regular suggestion
        let displayText = decl.placeholder || decl.text || '';

        // Generate dynamic datetime
        const declPattern = this._getPatternFromRef(decl.ref);
        if (style === 'datetime' && declPattern?.includes('\\d{6}Z')) {
          displayText = this._generateMetarDateTime();
        }

        suggestions.push({
          text: displayText,
          description: decl.description || '',
          ref: decl.ref,
          placeholder: decl.placeholder,
          editable: decl.editable,
          appendToPrevious: decl.appendToPrevious,
          skipToNext: decl.skipToNext,
          newLineBefore: decl.newLineBefore,
          switchGrammar: decl.switchGrammar,
          provider: decl.provider,
          auto: decl.auto
        });
      }
    }

    // Sort suggestions: editable (generic entry) first, then categories, then others
    return this._sortSuggestions(suggestions);
  }

  /**
   * Sort suggestions to put generic/editable entries first
   * This allows manual input to be the first option, with specific values as alternatives
   */
  private _sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
    return suggestions.sort((a, b) => {
      // Editable suggestions (generic entry for manual input) come first
      const aEditable = a.editable ? 0 : 1;
      const bEditable = b.editable ? 0 : 1;
      if (aEditable !== bEditable) return aEditable - bEditable;

      // Categories with children come after editable but before regular items
      const aCategory = a.isCategory ? 0 : 1;
      const bCategory = b.isCategory ? 0 : 1;
      return aCategory - bCategory;
    });
  }

  /**
   * Build Suggestion objects from SuggestionDefinition array (legacy format)
   * @deprecated Use declarations format instead
   */
  private _buildSuggestionsLegacy(suggestionDefs: SuggestionDefinition[], prevTokenText: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const prevTokenEndsWithCBorTCU = /CB$|TCU$/.test(prevTokenText);

    for (const sug of suggestionDefs) {
      // Filter out CB/TCU suggestions if previous token already ends with CB or TCU
      if (prevTokenEndsWithCBorTCU && sug.appendToPrevious && (sug.text === 'CB' || sug.text === 'TCU')) {
        continue;
      }

      // Check if this is a category with children (submenu)
      if ((sug as { category?: string }).category && (sug as { children?: SuggestionDefinition[] }).children) {
        const categorySug = sug as { category: string; description?: string; type?: string; children: SuggestionDefinition[] };
        const children: Suggestion[] = [];

        for (const child of categorySug.children) {
          let childText = child.placeholder || child.text || '';
          if (child.type === 'datetime' && child.pattern?.includes('\\d{6}Z')) {
            childText = this._generateMetarDateTime();
          }
          children.push({
            text: childText,
            description: child.description || '',
            placeholder: child.placeholder,
            editable: child.editable,
            appendToPrevious: child.appendToPrevious,
            skipToNext: child.skipToNext
          });
        }

        suggestions.push({
          text: categorySug.category,
          description: categorySug.description || '',
          isCategory: true,
          children: this._sortSuggestions(children)
        });
      } else {
        // Regular suggestion
        // Generate dynamic text for datetime patterns
        let displayText = sug.placeholder || sug.text || '';

        // Check if this is a datetime suggestion (DDHHmmZ pattern)
        if (sug.type === 'datetime' && sug.pattern?.includes('\\d{6}Z')) {
          displayText = this._generateMetarDateTime();
        }

        suggestions.push({
          text: displayText,
          description: sug.description || '',
          placeholder: sug.placeholder,
          editable: sug.editable,
          appendToPrevious: sug.appendToPrevious,
          skipToNext: sug.skipToNext,
          newLineBefore: sug.newLineBefore
        });
      }
    }

    // Sort suggestions: editable (generic entry) first, then categories, then others
    return this._sortSuggestions(suggestions);
  }

  /**
   * Map type names to TAC identifiers
   * Handles various input formats: TAC codes, display names, etc.
   */
  private _typeToIdentifier(type: string): string {
    const mapping: Record<string, string> = {
      // TAC codes to identifiers
      'VAA': 'VA ADVISORY',
      'TCA': 'TC ADVISORY',
      'FV': 'VA ADVISORY',
      'FK': 'TC ADVISORY'
    };
    return mapping[type] || type;
  }

  /** Message types that start with FIR code instead of the identifier */
  private static readonly SECOND_WORD_IDENTIFIER_TYPES = ['SIGMET', 'AIRMET'];

  /**
   * Find child grammars that extend a parent grammar
   * @param parentName - Name of the parent grammar
   * @returns Map of category to grammars
   */
  private _findChildGrammars(parentName: string): Map<string, Grammar[]> {
    const categoryMap = new Map<string, Grammar[]>();

    for (const [, grammar] of this.grammars) {
      if (grammar.extends === parentName && grammar.category) {
        const existing = categoryMap.get(grammar.category) || [];
        existing.push(grammar);
        categoryMap.set(grammar.category, existing);
      }
    }

    return categoryMap;
  }

  /**
   * Build category submenu for SIGMET/AIRMET with optional sub-categories (WS/WV/WC)
   * @param upperType - The message type (SIGMET or AIRMET)
   * @param grammarName - The grammar name (sigmet or airmet)
   */
  private _buildSecondWordTypeSubmenu(upperType: string, grammarName: string): Suggestion {
    const grammar = this.grammars.get(grammarName);
    const categoryDescription = this._getTypeDescription(upperType);

    // Check for child grammars with categories (e.g., sigmet-ws, sigmet-wv, sigmet-wc)
    const childCategories = this._findChildGrammars(grammarName);

    if (childCategories.size > 0) {
      // Build nested submenus for each category (WS, WV, WC)
      const categoryChildren: Suggestion[] = [];

      for (const [category, grammars] of childCategories) {
        // Use the first grammar of this category
        const categoryGrammar = grammars[0];
        const categoryFullName = categoryGrammar.name || `${upperType} ${category}`;

        // Build FIR suggestions for this category
        const firChildren: Suggestion[] = [];

        // Get start suggestions from the category grammar
        if (categoryGrammar.suggestions?.after?.start && categoryGrammar.suggestions.declarations) {
          const startRefs = categoryGrammar.suggestions.after.start;
          if (Array.isArray(startRefs) && startRefs.length > 0) {
            // Temporarily set currentGrammar to build suggestions
            const prevGrammar = this.currentGrammar;
            this.currentGrammar = categoryGrammar;
            const typeSuggestions = this._buildSuggestionsFromDeclarations(startRefs as string[], '');
            this.currentGrammar = prevGrammar;
            firChildren.push(...typeSuggestions);
          }
        }

        // Add common FIR fallbacks if needed
        if (firChildren.length === 0) {
          firChildren.push({
            text: `AAAA ${upperType}`,
            description: `${categoryFullName} (enter FIR code)`,
            editable: [{ start: 0, end: 4 }]
          });
        }

        // Add common FIRs
        const commonFirs = ['LFFF', 'LFPG', 'EGTT', 'EDGG'];
        for (const fir of commonFirs) {
          const firText = `${fir} ${upperType}`;
          if (!firChildren.some(c => c.text === firText)) {
            firChildren.push({
              text: firText,
              description: `${fir} FIR ${categoryFullName}`,
              });
          }
        }

        categoryChildren.push({
          text: category,
          description: categoryGrammar.description || categoryFullName,
          isCategory: true,
          children: firChildren
        });
      }

      return {
        text: upperType,
        description: categoryDescription,
        isCategory: true,
        children: categoryChildren
      };
    }

    // No child categories - use flat structure (legacy behavior)
    const children: Suggestion[] = [];

    if (grammar?.suggestions?.after?.start && grammar.suggestions.declarations) {
      const startRefs = grammar.suggestions.after.start;
      if (Array.isArray(startRefs) && startRefs.length > 0) {
        const prevGrammar = this.currentGrammar;
        this.currentGrammar = grammar;
        const typeSuggestions = this._buildSuggestionsFromDeclarations(startRefs as string[], '');
        this.currentGrammar = prevGrammar;
        children.push(...typeSuggestions);
      }
    }

    if (children.length === 0) {
      children.push({
        text: `AAAA ${upperType}`,
        description: `${upperType} message (enter FIR code)`,
        editable: [{ start: 0, end: 4 }]
      });
    }

    const commonFirs = ['LFFF', 'LFPG', 'EGTT', 'EDGG'];
    for (const fir of commonFirs) {
      const firText = `${fir} ${upperType}`;
      if (!children.some(c => c.text === firText)) {
        children.push({
          text: firText,
          description: `${fir} FIR ${upperType}`
        });
      }
    }

    return {
      text: upperType,
      description: categoryDescription,
      isCategory: true,
      children: children
    };
  }

  /**
   * Build a category with FIR suggestions for a single SIGMET/AIRMET config
   * The category is shown directly in the main menu (SIGMET, SIGMET TC, SIGMET VA, AIRMET)
   */
  private _buildFirSubmenuForConfig(config: MessageTypeConfig): Suggestion {
    const children: Suggestion[] = [];
    const grammar = this.grammars.get(config.grammar);

    // Try to get FIR suggestions from grammar's start suggestions
    if (grammar?.suggestions?.after?.start && grammar.suggestions.declarations) {
      const startRefs = grammar.suggestions.after.start;
      if (Array.isArray(startRefs) && startRefs.length > 0) {
        const prevGrammar = this.currentGrammar;
        this.currentGrammar = grammar;
        const typeSuggestions = this._buildSuggestionsFromDeclarations(startRefs as string[], '');
        this.currentGrammar = prevGrammar;
        // Add tacCode to each suggestion
        for (const sug of typeSuggestions) {
          sug.tacCode = config.tacCode;
          children.push(sug);
        }
      }
    }

    // Fallback if no suggestions from grammar - generic FIR entry
    if (children.length === 0) {
      // Determine the keyword (SIGMET or AIRMET)
      const keyword = config.name.toUpperCase().includes('SIGMET') ? 'SIGMET' : 'AIRMET';
      children.push({
        text: `AAAA ${keyword}`,
        description: `${config.name} (enter FIR code)`,
        tacCode: config.tacCode,
        editable: [{ start: 0, end: 4 }]
      });
    }

    return {
      text: config.name,
      description: config.description,
      isCategory: true,
      tacCode: config.tacCode,
      children: children
    };
  }

  /**
   * Get initial suggestions (message type names + FIR codes for SIGMET/AIRMET)
   * @param supportedTypes - Optional list of supported types (MessageTypeConfig[] or string[])
   */
  private _getInitialSuggestions(supportedTypes?: MessageTypeConfig[] | string[]): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const addedTacCodes = new Set<string>();

    // All message types shown directly in the menu
    if (supportedTypes && supportedTypes.length > 0) {
      // Check if we have MessageTypeConfig[] or string[]
      const isConfigArray = typeof supportedTypes[0] === 'object';

      if (isConfigArray) {
        // New format: MessageTypeConfig[] with full info
        // All message types are direct suggestions - grammar handles what comes next
        for (const config of supportedTypes as MessageTypeConfig[]) {
          // Use tacCode for deduplication
          if (addedTacCodes.has(config.tacCode)) continue;
          addedTacCodes.add(config.tacCode);

          const suggestion: Suggestion = {
            text: config.name,
            description: config.description,
              tacCode: config.tacCode
          };

          // Mark as category if it has sub-menu (SIGMET, AIRMET)
          // This shows a chevron in the UI
          if (config.hasSubMenu) {
            suggestion.isCategory = true;
          }

          suggestions.push(suggestion);
        }
      } else {
        // Legacy format: string[] (type names)
        let hasSecondWordTypes = false;
        for (const type of supportedTypes as string[]) {
          const upperType = type.toUpperCase();

          // Check if this is a second-word identifier type (SIGMET, AIRMET)
          if (TacParser.SECOND_WORD_IDENTIFIER_TYPES.includes(upperType)) {
            hasSecondWordTypes = true;
            continue; // Don't add SIGMET/AIRMET as initial suggestions - they start with FIR
          }

          // Map short type to full identifier (e.g., VAA -> "VA ADVISORY")
          const identifier = this._typeToIdentifier(type);

          if (addedTacCodes.has(identifier)) continue;
          addedTacCodes.add(identifier);

          // Try to get description from loaded grammar
          let description = this._getTypeDescription(type);
          for (const [, grammar] of this.grammars) {
            if (grammar.identifier === identifier && grammar.name) {
              description = grammar.name;
              break;
            }
          }

          suggestions.push({
            text: identifier,
            description,
          });
        }

        // If we have SIGMET/AIRMET in supported types, create category submenus
        if (hasSecondWordTypes) {
          for (const type of supportedTypes as string[]) {
            const upperType = type.toUpperCase();
            if (!TacParser.SECOND_WORD_IDENTIFIER_TYPES.includes(upperType)) continue;

            const grammarName = upperType.toLowerCase();
            suggestions.push(this._buildSecondWordTypeSubmenu(upperType, grammarName));
          }
        }
      }
    } else {
      // No supportedTypes provided - use all loaded grammars
      let hasSecondWordTypes = false;
      for (const [name, grammar] of this.grammars) {
        if (grammar.identifier) {
          const id = grammar.identifier;
          // Skip SIGMET/AIRMET identifiers
          if (TacParser.SECOND_WORD_IDENTIFIER_TYPES.includes(id)) {
            hasSecondWordTypes = true;
            continue;
          }
          if (addedTacCodes.has(id)) continue;
          addedTacCodes.add(id);
          suggestions.push({
            text: id,
            description: grammar.name || name,
          });
        }
      }

      // Add SIGMET/AIRMET category submenus if those grammars are loaded
      if (hasSecondWordTypes) {
        for (const grammarName of ['sigmet', 'airmet']) {
          if (!this.grammars.has(grammarName)) continue;
          const upperType = grammarName.toUpperCase();
          suggestions.push(this._buildSecondWordTypeSubmenu(upperType, grammarName));
        }
      }
    }

    return suggestions;
  }

  /**
   * Get description for a message type
   */
  private _getTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      'METAR': 'Meteorological Aerodrome Report',
      'SPECI': 'Special Meteorological Report',
      'TAF': 'Terminal Aerodrome Forecast',
      'SIGMET': 'Significant Meteorological Information',
      'AIRMET': 'Airmen\'s Meteorological Information',
      'VAA': 'Volcanic Ash Advisory',
      'TCA': 'Tropical Cyclone Advisory'
    };
    return descriptions[type] || type;
  }

  /**
   * Get contextual suggestions based on grammar state
   * @deprecated Use getSuggestionsForTokenType with cached tokens instead
   */
  private async _getContextualSuggestions(text: string, cursorPosition: number): Promise<Suggestion[]> {
    const grammar = this.currentGrammar;
    if (!grammar || !grammar.suggestions) {
      return [];
    }

    // Tokenize full text to get all tokens
    const allTokens = this.tokenize(text);
    const nonWhitespaceTokens = allTokens.filter(t => t.type !== 'whitespace');

    // Find which token the cursor is in or after
    let tokenBeforeCursor: Token | null = null;

    for (let i = 0; i < nonWhitespaceTokens.length; i++) {
      const token = nonWhitespaceTokens[i];
      if (cursorPosition >= token.start && cursorPosition < token.end) {
        tokenBeforeCursor = i > 0 ? nonWhitespaceTokens[i - 1] : null;
        break;
      } else if (cursorPosition >= token.end) {
        tokenBeforeCursor = token;
      }
    }

    // Get suggestions using shared method (async for provider support)
    const tokenType = tokenBeforeCursor?.type || null;
    const prevTokenText = tokenBeforeCursor?.text || '';

    return await this.getSuggestionsForTokenType(tokenType, prevTokenText);
  }

  /**
   * Get suggestions for a template field based on its label type
   * Used in template mode (VAA, TCA) to provide field-specific suggestions
   * @param labelType - The labelType from the template field definition
   */
  getTemplateSuggestions(labelType: string): Suggestion[] {
    const grammar = this.currentGrammar;
    if (!grammar || !grammar.suggestions || !grammar.suggestions.after) {
      return [];
    }

    const suggestionRefs = grammar.suggestions.after[labelType];
    if (!suggestionRefs || suggestionRefs.length === 0) {
      return [];
    }

    // Check if new format (declarations + string IDs) or old format (inline objects)
    if (grammar.suggestions.declarations && suggestionRefs.length > 0 && typeof suggestionRefs[0] === 'string') {
      return this._buildTemplateSuggestionsFromDeclarations(suggestionRefs as string[]);
    }

    // Old format - inline SuggestionDefinition objects
    return this._buildTemplateSuggestionsLegacy(suggestionRefs as SuggestionDefinition[]);
  }

  /**
   * Build template suggestions from declaration IDs (new format)
   */
  private _buildTemplateSuggestionsFromDeclarations(suggestionIds: string[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const id of suggestionIds) {
      const decl = this._getDeclarationById(id);
      if (!decl) continue;

      const style = this._getStyleFromRef(decl.ref);

      // Check if this is a category with children
      if (decl.category && decl.children) {
        const children: Suggestion[] = [];

        for (const childId of decl.children) {
          const childDecl = this._getDeclarationById(childId);
          if (!childDecl) continue;

          const childStyle = this._getStyleFromRef(childDecl.ref);
          let childText = this._generateDynamicDateTimeText(childDecl, childStyle);

          children.push({
            text: childText,
            description: childDecl.description || '',
            ref: childDecl.ref,
            placeholder: childDecl.placeholder,
            editable: childDecl.editable,
            appendToPrevious: childDecl.appendToPrevious,
            skipToNext: childDecl.skipToNext,
            auto: childDecl.auto
          });
        }

        suggestions.push({
          text: decl.category,
          description: decl.description || '',
          ref: decl.ref,
          isCategory: true,
          children
        });
      } else {
        // Regular suggestion
        const displayText = this._generateDynamicDateTimeText(decl, style);

        suggestions.push({
          text: displayText,
          description: decl.description || '',
          ref: decl.ref,
          placeholder: decl.placeholder,
          editable: decl.editable,
          appendToPrevious: decl.appendToPrevious,
          skipToNext: decl.skipToNext,
          newLineBefore: decl.newLineBefore,
          provider: decl.provider,
          auto: decl.auto
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate dynamic datetime text based on pattern and description
   */
  private _generateDynamicDateTimeText(decl: SuggestionDeclaration, style: string): string {
    let displayText = decl.placeholder || decl.text || '';

    if (style === 'datetime') {
      const pattern = this._getPatternFromRef(decl.ref);
      if (pattern?.includes('\\d{6}Z')) {
        // METAR format: DDHHmmZ
        displayText = this._generateMetarDateTime();
      } else if (pattern?.includes('\\d{8}/\\d{4}Z')) {
        // VAA full format: YYYYMMDD/HHmmZ
        displayText = this._generateVaaDateTime();
      } else if (pattern?.includes('\\d{2}/\\d{4}Z')) {
        // VAA day/time format: DD/HHmmZ
        const desc = decl.description?.toLowerCase() || '';
        if (desc.includes('+6h') || desc.includes('+6 h')) {
          displayText = this._generateVaaDayTime(6);
        } else if (desc.includes('+12h') || desc.includes('+12 h')) {
          displayText = this._generateVaaDayTime(12);
        } else if (desc.includes('+18h') || desc.includes('+18 h')) {
          displayText = this._generateVaaDayTime(18);
        } else {
          displayText = this._generateVaaDayTime(0);
        }
      }
    }

    return displayText;
  }

  /**
   * Build template suggestions from SuggestionDefinition array (legacy format)
   * @deprecated Use declarations format instead
   */
  private _buildTemplateSuggestionsLegacy(suggestionDefs: SuggestionDefinition[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const sug of suggestionDefs) {
      // Check if this is a category with children (submenu)
      if ((sug as { category?: string }).category && (sug as { children?: SuggestionDefinition[] }).children) {
        const categorySug = sug as { category: string; description?: string; type?: string; children: SuggestionDefinition[] };
        const children: Suggestion[] = [];

        for (const child of categorySug.children) {
          let childText = child.placeholder || child.text || '';
          if (child.type === 'datetime' && child.pattern?.includes('\\d{6}Z')) {
            childText = this._generateMetarDateTime();
          }
          children.push({
            text: childText,
            description: child.description || '',
            placeholder: child.placeholder,
            editable: child.editable,
            appendToPrevious: child.appendToPrevious,
            skipToNext: child.skipToNext
          });
        }

        suggestions.push({
          text: categorySug.category,
          description: categorySug.description || '',
          isCategory: true,
          children: this._sortSuggestions(children)
        });
      } else {
        // Regular suggestion
        let displayText = sug.placeholder || sug.text || '';

        // Check if this is a datetime suggestion and generate dynamic date
        if (sug.type === 'datetime') {
          if (sug.pattern?.includes('\\d{6}Z')) {
            displayText = this._generateMetarDateTime();
          } else if (sug.pattern?.includes('\\d{8}/\\d{4}Z')) {
            displayText = this._generateVaaDateTime();
          } else if (sug.pattern?.includes('\\d{2}/\\d{4}Z')) {
            const desc = sug.description?.toLowerCase() || '';
            if (desc.includes('+6h') || desc.includes('+6 h')) {
              displayText = this._generateVaaDayTime(6);
            } else if (desc.includes('+12h') || desc.includes('+12 h')) {
              displayText = this._generateVaaDayTime(12);
            } else if (desc.includes('+18h') || desc.includes('+18 h')) {
              displayText = this._generateVaaDayTime(18);
            } else {
              displayText = this._generateVaaDayTime(0);
            }
          }
        }

        suggestions.push({
          text: displayText,
          description: sug.description || '',
          placeholder: sug.placeholder,
          editable: sug.editable,
          appendToPrevious: sug.appendToPrevious,
          skipToNext: sug.skipToNext,
          newLineBefore: sug.newLineBefore
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate current datetime in METAR format (DDHHmmZ)
   * Rounded to nearest 30 minutes (00 or 30)
   */
  private _generateMetarDateTime(): string {
    const now = new Date();
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = now.getUTCMinutes();

    // Round to nearest 30 minutes
    const roundedMinutes = minutes < 15 ? '00' : minutes < 45 ? '30' : '00';
    const adjustedHours = minutes >= 45
      ? ((now.getUTCHours() + 1) % 24).toString().padStart(2, '0')
      : hours;

    // Handle day rollover if hour wrapped to 00
    const adjustedDay = (minutes >= 45 && now.getUTCHours() === 23)
      ? ((now.getUTCDate() % 31) + 1).toString().padStart(2, '0')
      : day;

    return `${adjustedDay}${adjustedHours}${roundedMinutes}Z`;
  }

  /**
   * Generate current datetime in VAA full format (YYYYMMDD/HHmmZ)
   */
  private _generateVaaDateTime(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = now.getUTCMinutes().toString().padStart(2, '0');
    return `${year}${month}${day}/${hours}${minutes}Z`;
  }

  /**
   * Generate current datetime in VAA day/time format (DD/HHmmZ)
   * @param hoursOffset - Optional offset in hours (e.g., 6, 12, 18 for forecasts)
   */
  private _generateVaaDayTime(hoursOffset: number = 0): string {
    const now = new Date(Date.now() + hoursOffset * 60 * 60 * 1000);
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = hoursOffset > 0 ? '00' : now.getUTCMinutes().toString().padStart(2, '0');
    return `${day}/${hours}${minutes}Z`;
  }

  /**
   * Validate TAC message
   * Checks for:
   * 1. Token-level errors (unknown tokens)
   * 2. Required fields presence (identifier, icao, datetime, etc.)
   * 3. Basic structure validation
   */
  validate(text: string): ValidationResult {
    const tokens = this.tokenize(text);
    const errors: ValidationError[] = [];
    const nonWhitespaceTokens = tokens.filter(t => t.type !== 'whitespace');

    // Check for token-level errors
    for (const token of tokens) {
      if (token.error || token.type === 'error') {
        errors.push({
          message: token.error || `Unknown token: ${token.text}`,
          position: token.start,
          token: token.text
        });
      }
    }

    // If we have a grammar, validate required structure
    if (this.currentGrammar && nonWhitespaceTokens.length > 0) {
      // Check for required tokens
      const requiredTokens = this._getRequiredTokens();

      for (const required of requiredTokens) {
        const found = nonWhitespaceTokens.some(t => t.type === required.type);
        if (!found) {
          errors.push({
            message: `Missing required field: ${required.description || required.type}`,
            position: text.length,
            token: ''
          });
        }
      }

      // Validate minimum structure for METAR/SPECI
      if (this.currentGrammar.identifier === 'METAR' ||
          this.currentGrammar.identifier === 'SPECI') {
        this._validateMetarStructure(nonWhitespaceTokens, errors, text);
      }

      // Validate minimum structure for TAF
      if (this.currentGrammar.identifier === 'TAF') {
        this._validateTafStructure(nonWhitespaceTokens, errors, text);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get list of required tokens from grammar
   */
  private _getRequiredTokens(): Array<{ type: string; description?: string }> {
    if (!this.currentGrammar) return [];

    // For template-based grammars (VAA, TCA, SWX), get required fields from template
    if (this.currentGrammar.templateMode && this.currentGrammar.template) {
      const required: Array<{ type: string; description?: string }> = [
        { type: 'identifier', description: 'Message type identifier' }
      ];
      // Add required template fields
      for (const field of this.currentGrammar.template.fields) {
        if (field.required) {
          required.push({
            type: field.labelType,
            description: field.label.replace(/:$/, '')
          });
        }
      }
      return required;
    }

    // For TAF
    if (this.currentGrammar.identifier === 'TAF') {
      return [
        { type: 'identifier', description: 'Message type (TAF)' },
        { type: 'icao', description: 'ICAO location code' },
        { type: 'issueTime', description: 'Issue date/time group' }
      ];
    }

    // For METAR/SPECI
    return [
      { type: 'identifier', description: 'Message type (METAR/SPECI)' },
      { type: 'icao', description: 'ICAO location code' },
      { type: 'datetime', description: 'Date/time group' }
    ];
  }

  /**
   * Validate METAR-specific structure
   */
  private _validateMetarStructure(
    tokens: Token[],
    errors: ValidationError[],
    text: string
  ): void {
    if (tokens.length === 0) return;

    // First token must be METAR or SPECI
    if (tokens[0].type !== 'identifier') {
      errors.push({
        message: 'Message must start with METAR or SPECI',
        position: 0,
        token: tokens[0].text
      });
    }

    // Check if we have NIL - then nothing else is needed
    const hasNil = tokens.some(t => t.type === 'nil');
    if (hasNil) {
      // NIL message only needs identifier, icao, datetime, NIL
      return;
    }

    // For non-NIL messages, check for additional required elements
    const hasWind = tokens.some(t => t.type === 'wind' || t.type === 'windVariation' || t.type === 'windNotAvailable');
    const hasVisibilityOrCavok = tokens.some(t =>
      t.type === 'visibility' || t.type === 'cavok' || t.type === 'visibilityNotAvailable' ||
      t.type === 'visibilitySM' || t.type === 'visibilitySMNotAvailable'
    );
    const hasTemperature = tokens.some(t => t.type === 'temperature' || t.type === 'temperatureNotAvailable' || t.type === 'temperatureDewpointMissing');
    const hasPressure = tokens.some(t => t.type === 'pressure' || t.type === 'pressureInches' ||
      t.type === 'pressureNotAvailable' || t.type === 'pressureInchesNotAvailable');

    if (!hasWind) {
      errors.push({
        message: 'Missing wind information',
        position: text.length,
        token: ''
      });
    }

    if (!hasVisibilityOrCavok) {
      errors.push({
        message: 'Missing visibility or CAVOK',
        position: text.length,
        token: ''
      });
    }

    if (!hasTemperature) {
      errors.push({
        message: 'Missing temperature/dew point',
        position: text.length,
        token: ''
      });
    }

    if (!hasPressure) {
      errors.push({
        message: 'Missing pressure (QNH)',
        position: text.length,
        token: ''
      });
    }
  }

  /**
   * Validate TAF-specific structure
   */
  private _validateTafStructure(
    tokens: Token[],
    errors: ValidationError[],
    text: string
  ): void {
    if (tokens.length === 0) return;

    // First token must be TAF
    if (tokens[0].type !== 'identifier') {
      errors.push({
        message: 'Message must start with TAF',
        position: 0,
        token: tokens[0].text
      });
    }

    // Check if we have NIL - then nothing else is needed
    const hasNil = tokens.some(t => t.type === 'nil');
    if (hasNil) {
      return;
    }

    // Check if we have CNL - then nothing else is needed after validity period
    const hasCnl = tokens.some(t => t.type === 'cnl');
    if (hasCnl) {
      // Just need identifier, icao, issueTime, validityPeriod, CNL
      const hasValidityPeriod = tokens.some(t => t.type === 'validityPeriod');
      if (!hasValidityPeriod) {
        errors.push({
          message: 'Missing validity period before CNL',
          position: text.length,
          token: ''
        });
      }
      return;
    }

    // For non-NIL/non-CNL messages, check for required elements
    const hasValidityPeriod = tokens.some(t => t.type === 'validityPeriod');
    const hasWind = tokens.some(t => t.type === 'wind');
    const hasVisibilityOrCavok = tokens.some(t =>
      t.type === 'visibility' || t.type === 'cavok' || t.type === 'visibilityNotAvailable' ||
      t.type === 'visibilitySM' || t.type === 'visibilitySMNotAvailable'
    );
    const hasCloud = tokens.some(t =>
      t.type === 'cloud' || t.type === 'nsc' || t.type === 'verticalVisibility' || t.type === 'skyClear'
    );

    if (!hasValidityPeriod) {
      errors.push({
        message: 'Missing validity period',
        position: text.length,
        token: ''
      });
    }

    if (!hasWind) {
      errors.push({
        message: 'Missing wind information',
        position: text.length,
        token: ''
      });
    }

    if (!hasVisibilityOrCavok) {
      errors.push({
        message: 'Missing visibility or CAVOK',
        position: text.length,
        token: ''
      });
    }

    if (!hasCloud && !tokens.some(t => t.type === 'cavok')) {
      errors.push({
        message: 'Missing cloud information or NSC',
        position: text.length,
        token: ''
      });
    }
  }

  /**
   * Set the current grammar by name (for speculative grammar loading)
   * @param grammarName - The name of the grammar to set as current
   */
  setGrammar(grammarName: string): void {
    const grammar = this.grammars.get(grammarName);
    if (grammar) {
      this.currentGrammar = grammar;
      this.currentGrammarName = grammarName;
    }
  }

  /**
   * Clear current grammar
   */
  reset(): void {
    this.currentGrammar = null;
    this.currentGrammarName = null;
  }

  /**
   * Clear all loaded grammars (for standard/locale changes)
   */
  clearGrammars(): void {
    this.currentGrammar = null;
    this.currentGrammarName = null;
    this.grammars.clear();
    this._rawGrammars.clear();
  }
}

// Singleton instance
export const parser = new TacParser();
