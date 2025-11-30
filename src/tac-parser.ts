/**
 * TAC Parser - Grammar-based parser engine
 * Handles tokenization, validation, and suggestion generation
 */

// ========== Type Definitions ==========

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
  /** JavaScript function (as string) that returns an array of default values dynamically */
  defaultsFunction?: string;
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

/** Token match result */
interface TokenMatchResult {
  type: string;
  style?: string;
  description?: string;
  error?: string;
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
export class TacParser {
  grammars: Map<string, Grammar> = new Map();
  currentGrammar: Grammar | null = null;

  /**
   * Register a grammar
   */
  registerGrammar(name: string, grammar: Grammar): void {
    this.grammars.set(name, grammar);
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
    const firstToken = text.trim().split(/\s+/)[0]?.toUpperCase();

    if (!firstToken) return null;

    // Check each grammar for matching identifier
    for (const [name, grammar] of this.grammars) {
      if (grammar.identifiers && grammar.identifiers.includes(firstToken)) {
        this.currentGrammar = grammar;
        return name;
      }
    }

    return null;
  }

  /**
   * Tokenize text using current grammar
   */
  tokenize(text: string): Token[] {
    if (!this.currentGrammar) {
      // Try to detect grammar first
      this.detectMessageType(text);
    }

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
    const tokens: Token[] = [];
    const parts = text.split(/(\s+)/);
    let position = 0;
    let ruleIndex = 0;

    for (const part of parts) {
      if (part.length === 0) continue;

      const isWhitespace = /^\s+$/.test(part);

      if (isWhitespace) {
        tokens.push({
          text: part,
          type: 'whitespace',
          start: position,
          end: position + part.length
        });
      } else {
        // Try to match against grammar tokens
        const tokenInfo = this._matchToken(part, grammar, ruleIndex);
        tokens.push({
          text: part,
          type: tokenInfo.type,
          style: tokenInfo.style,
          start: position,
          end: position + part.length,
          error: tokenInfo.error,
          description: tokenInfo.description
        });

        if (!tokenInfo.error) {
          ruleIndex++;
        }
      }

      position += part.length;
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
   */
  getSuggestions(text: string, cursorPosition: number, supportedTypes?: string[]): Suggestion[] {
    if (!this.currentGrammar) {
      this.detectMessageType(text);
    }

    if (!this.currentGrammar) {
      // Return initial message type suggestions
      return this._getInitialSuggestions(supportedTypes);
    }

    return this._getContextualSuggestions(text, cursorPosition);
  }

  /**
   * Get initial suggestions (message type identifiers)
   * @param supportedTypes - Optional list of supported types to filter suggestions
   */
  private _getInitialSuggestions(supportedTypes?: string[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // If we have registered grammars, use their identifiers
    if (this.grammars.size > 0) {
      for (const [name, grammar] of this.grammars) {
        if (grammar.identifiers) {
          for (const id of grammar.identifiers) {
            // Filter by supported types if provided
            if (!supportedTypes || supportedTypes.includes(id)) {
              suggestions.push({
                text: id,
                description: grammar.name || name,
                type: 'keyword'
              });
            }
          }
        }
      }
    }

    // If no grammars loaded yet, suggest based on supported types
    if (suggestions.length === 0 && supportedTypes) {
      for (const type of supportedTypes) {
        suggestions.push({
          text: type,
          description: this._getTypeDescription(type),
          type: 'keyword'
        });
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
   */
  private _getContextualSuggestions(text: string, cursorPosition: number): Suggestion[] {
    const grammar = this.currentGrammar;
    if (!grammar || !grammar.suggestions) {
      return [];
    }

    // Tokenize full text to get all tokens
    const allTokens = this.tokenize(text);
    const nonWhitespaceTokens = allTokens.filter(t => t.type !== 'whitespace');

    // Find which token the cursor is in or after
    let tokenBeforeCursor: Token | null = null;
    let isInsideToken = false;

    for (let i = 0; i < nonWhitespaceTokens.length; i++) {
      const token = nonWhitespaceTokens[i];
      if (cursorPosition >= token.start && cursorPosition <= token.end) {
        // Cursor is inside this token
        isInsideToken = true;
        // Use the token BEFORE this one for suggestions
        tokenBeforeCursor = i > 0 ? nonWhitespaceTokens[i - 1] : null;
        break;
      } else if (cursorPosition > token.end) {
        // Cursor is after this token
        tokenBeforeCursor = token;
      }
    }

    // Find applicable suggestions based on context
    const suggestions: Suggestion[] = [];
    const afterRules = grammar.suggestions.after || {};

    // Determine which suggestions to show
    let suggestionDefs: SuggestionDefinition[] = [];

    if (tokenBeforeCursor && afterRules[tokenBeforeCursor.type]) {
      // Have a valid previous token - suggest what comes after it
      suggestionDefs = afterRules[tokenBeforeCursor.type];
    } else if (!tokenBeforeCursor) {
      // No token before cursor (beginning of text or inside first token)
      // Show initial suggestions
      suggestionDefs = grammar.suggestions.initial || [];
    }

    // Build suggestion list
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
            type: child.type || 'value',
            placeholder: child.placeholder,
            editable: child.editable
          });
        }

        suggestions.push({
          text: categorySug.category,
          description: categorySug.description || '',
          type: categorySug.type || 'category',
          isCategory: true,
          children
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
          type: sug.type || 'value',
          placeholder: sug.placeholder,
          editable: sug.editable
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
      if (this.currentGrammar.identifiers?.includes('METAR') ||
          this.currentGrammar.identifiers?.includes('SPECI')) {
        this._validateMetarStructure(nonWhitespaceTokens, errors, text);
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
    // For METAR/SPECI, these are always required
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
    const hasWind = tokens.some(t => t.type === 'wind' || t.type === 'windVariation');
    const hasVisibilityOrCavok = tokens.some(t =>
      t.type === 'visibility' || t.type === 'cavok'
    );
    const hasTemperature = tokens.some(t => t.type === 'temperature');
    const hasPressure = tokens.some(t => t.type === 'pressure' || t.type === 'pressureInches');

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
   * Clear current grammar
   */
  reset(): void {
    this.currentGrammar = null;
  }
}

// Singleton instance
export const parser = new TacParser();
