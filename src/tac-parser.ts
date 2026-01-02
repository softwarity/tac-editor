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

/** Grammar suggestion declaration */
export interface SuggestionDeclaration {
  /** Unique identifier for this suggestion */
  id: string;
  /** Reference to token definition (for style lookup) */
  ref: string;
  /** Fixed text to insert */
  text?: string;
  /** Regex pattern for validation */
  pattern?: string;
  /** Human-readable description */
  description?: string;
  /** Display text (for pattern-based suggestions) */
  placeholder?: string;
  /** Category name (makes this a category with children) */
  category?: string;
  /** Child suggestion IDs (for categories) */
  children?: string[];
  /** Editable region - when present, this part of the token will be selected after insertion */
  editable?: EditableDefinition;
  /** If true, append this text to the previous token (without space) */
  appendToPrevious?: boolean;
  /** If true, skip this item and just move to next token (no text inserted) */
  skipToNext?: boolean;
  /** If true, insert a newline before this token (for multiline formats like VAA) */
  newLineBefore?: boolean;
}

/** @deprecated Use SuggestionDeclaration instead - kept for backward compatibility */
export interface SuggestionDefinition {
  text?: string;
  pattern?: string;
  description?: string;
  type?: string;
  placeholder?: string;
  editable?: EditableDefinition;
  appendToPrevious?: boolean;
  skipToNext?: boolean;
  newLineBefore?: boolean;
  category?: string;
  children?: SuggestionDefinition[];
}

/** Template field definition for structured messages like VAA/TCA */
export interface TemplateField {
  /** Field label (e.g., "DTG:", "VAAC:") */
  label: string;
  /** Token type for the label */
  labelType: string;
  /** Token type for the value */
  valueType: string;
  /** Whether this field is required */
  required?: boolean;
  /** Whether this field can have multiple lines of values */
  multiline?: boolean;
  /** Default/placeholder value */
  placeholder?: string;
  /** Editable region definition */
  editable?: EditableDefinition;
  /** Possible values (for dropdowns/suggestions) */
  suggestions?: SuggestionDefinition[];
  /** Minimum column width for the label (for alignment) */
  labelWidth?: number;
}

/** Template definition for structured message formats */
export interface TemplateDefinition {
  /** Template fields in order */
  fields: TemplateField[];
  /** Label column width (characters) for alignment */
  labelColumnWidth?: number;
}

// ========== Structure Definitions ==========

/** Base structure item */
export interface StructureItem {
  /** Token ID (references tokens definition) or group name */
  id: string;
  /** Cardinality [min, max] where max can be null for unlimited */
  cardinality: [number, number | null];
}

/** Single token reference */
export interface StructureToken extends StructureItem {
  /** If true, parsing stops here */
  terminal?: boolean;
}

/** OneOf choice - one of the tokens must match */
export interface StructureOneOf extends StructureItem {
  /** Array of alternative structures */
  oneOf: StructureNode[];
}

/** Sequence - tokens must appear in order */
export interface StructureSequence extends StructureItem {
  /** Array of structures in sequence */
  sequence: StructureNode[];
}

/** Union type for all structure nodes */
export type StructureNode = StructureToken | StructureOneOf | StructureSequence;

/** Type guard for StructureOneOf */
export function isStructureOneOf(node: StructureNode): node is StructureOneOf {
  return 'oneOf' in node;
}

/** Type guard for StructureSequence */
export function isStructureSequence(node: StructureNode): node is StructureSequence {
  return 'sequence' in node;
}

/** Type guard for StructureToken */
export function isStructureToken(node: StructureNode): node is StructureToken {
  return !('oneOf' in node) && !('sequence' in node);
}

/** Grammar definition */
export interface Grammar {
  name?: string;
  version?: string;
  description?: string;
  identifiers?: string[];
  /** If true, use multiline tokenization (for VAA, TCA with multi-word labels) */
  multiline?: boolean;
  /** If true, use template mode instead of grammar mode */
  templateMode?: boolean;
  /** Template definition for structured formats (VAA, TCA) */
  template?: TemplateDefinition;
  /** Token pattern definitions */
  tokens?: Record<string, TokenDefinition>;
  /** Grammar structure (sequence of tokens, oneOf, nested sequences) */
  structure?: StructureNode[];
  /** Suggestions for autocompletion */
  suggestions?: {
    /** Suggestion declarations (new format) */
    declarations?: SuggestionDeclaration[];
    /** Mapping of token IDs to suggestion IDs */
    after?: Record<string, string[] | SuggestionDefinition[]>;
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
  /** If true, append this text to the previous token (without space) */
  appendToPrevious?: boolean;
  /** If true, skip this item and just move to next token (no text inserted) */
  skipToNext?: boolean;
  /** If true, insert a newline before this token (for multiline formats like VAA) */
  newLineBefore?: boolean;
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
    const normalizedText = text.trim().toUpperCase();
    const tokens = normalizedText.split(/\s+/);
    const firstToken = tokens[0];

    if (!firstToken) return null;

    // Check each grammar for matching identifier
    // Support multi-token identifiers like "VA ADVISORY" or "TC ADVISORY"
    for (const [name, grammar] of this.grammars) {
      if (grammar.identifiers) {
        for (const identifier of grammar.identifiers) {
          // Check if identifier contains spaces (multi-token)
          if (identifier.includes(' ')) {
            // Multi-token identifier - check if text starts with it
            if (normalizedText.startsWith(identifier)) {
              this.currentGrammar = grammar;
              return name;
            }
          } else {
            // Single-token identifier
            if (identifier === firstToken) {
              this.currentGrammar = grammar;
              return name;
            }
          }
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
    // For template-based grammars (VAA, TCA, SWX), use template tokenization
    if (grammar.templateMode) {
      return this._tokenizeTemplate(text, grammar);
    }
    // For other multiline grammars, use multiline tokenization
    if (grammar.multiline) {
      return this._tokenizeMultiline(text, grammar);
    }

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
   * Tokenize multiline structured messages (VAA, TCA)
   * These messages have labels with spaces (e.g., "AVIATION COLOUR CODE:")
   */
  private _tokenizeMultiline(text: string, grammar: Grammar): Token[] {
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
          break;
        }
      }
      if (matched) continue;

      // Try to match single token (up to next whitespace)
      const wordMatch = text.slice(position).match(/^(\S+)/);
      if (wordMatch) {
        const word = wordMatch[1];
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
        position += word.length;
      } else {
        // Should not happen, but safety break
        break;
      }
    }

    return tokens;
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
      // Fallback to multiline tokenization if no template defined
      return this._tokenizeMultiline(text, grammar);
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
   * Get suggestions for a specific token type (using cached tokens)
   * @param tokenType - The type of token to get suggestions for (from suggestions.after)
   * @param prevTokenText - Optional text of the previous token (for CB/TCU filtering)
   * @param supportedTypes - Optional list of supported message types for initial suggestions
   */
  getSuggestionsForTokenType(tokenType: string | null, prevTokenText?: string, supportedTypes?: string[]): Suggestion[] {
    // No grammar loaded - return message type suggestions
    if (!this.currentGrammar) {
      return this._getInitialSuggestions(supportedTypes);
    }

    // No token type - no suggestions
    if (!tokenType) {
      return [];
    }

    const grammar = this.currentGrammar;
    if (!grammar.suggestions || !grammar.suggestions.after) {
      return [];
    }

    const afterRules = grammar.suggestions.after;
    const suggestionRefs = afterRules[tokenType] || [];

    // Check if new format (declarations + string IDs) or old format (inline objects)
    if (grammar.suggestions.declarations && suggestionRefs.length > 0 && typeof suggestionRefs[0] === 'string') {
      return this._buildSuggestionsFromDeclarations(suggestionRefs as string[], prevTokenText || '');
    }

    // Old format - inline SuggestionDefinition objects
    return this._buildSuggestionsLegacy(suggestionRefs as SuggestionDefinition[], prevTokenText || '');
  }

  /**
   * Get style from token definition by ref
   */
  private _getStyleFromRef(ref: string): string {
    const token = this.currentGrammar?.tokens?.[ref];
    return token?.style || 'value';
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
          if (childStyle === 'datetime' && childDecl.pattern?.includes('\\d{6}Z')) {
            childText = this._generateMetarDateTime();
          }

          children.push({
            text: childText,
            description: childDecl.description || '',
            type: childStyle,
            placeholder: childDecl.placeholder,
            editable: childDecl.editable,
            appendToPrevious: childDecl.appendToPrevious,
            skipToNext: childDecl.skipToNext
          });
        }

        suggestions.push({
          text: decl.category,
          description: decl.description || '',
          type: style,
          isCategory: true,
          children
        });
      } else {
        // Regular suggestion
        let displayText = decl.placeholder || decl.text || '';

        // Generate dynamic datetime
        if (style === 'datetime' && decl.pattern?.includes('\\d{6}Z')) {
          displayText = this._generateMetarDateTime();
        }

        suggestions.push({
          text: displayText,
          description: decl.description || '',
          type: style,
          placeholder: decl.placeholder,
          editable: decl.editable,
          appendToPrevious: decl.appendToPrevious,
          skipToNext: decl.skipToNext,
          newLineBefore: decl.newLineBefore
        });
      }
    }

    return suggestions;
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
            type: child.type || 'value',
            placeholder: child.placeholder,
            editable: child.editable,
            appendToPrevious: child.appendToPrevious,
            skipToNext: child.skipToNext
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
   * Map short type names to full identifiers
   * Used for types like VAA -> "VA ADVISORY", TCA -> "TC ADVISORY"
   */
  private _typeToIdentifier(type: string): string {
    const mapping: Record<string, string> = {
      'VAA': 'VA ADVISORY',
      'TCA': 'TC ADVISORY'
    };
    return mapping[type] || type;
  }

  /**
   * Get initial suggestions (message type identifiers)
   * @param supportedTypes - Optional list of supported types to filter suggestions
   */
  private _getInitialSuggestions(supportedTypes?: string[]): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const addedTypes = new Set<string>();

    // Always use supportedTypes if provided - this is the definitive list
    if (supportedTypes && supportedTypes.length > 0) {
      for (const type of supportedTypes) {
        // Map short type to full identifier (e.g., VAA -> "VA ADVISORY")
        const identifier = this._typeToIdentifier(type);

        if (addedTypes.has(identifier)) continue;
        addedTypes.add(identifier);

        // Try to get description from loaded grammar
        let description = this._getTypeDescription(type);
        for (const [, grammar] of this.grammars) {
          if (grammar.identifiers?.includes(identifier) && grammar.name) {
            description = grammar.name;
            break;
          }
        }

        suggestions.push({
          text: identifier,
          description,
          type: 'keyword'
        });
      }
    } else {
      // No supportedTypes provided - use all loaded grammars
      for (const [name, grammar] of this.grammars) {
        if (grammar.identifiers) {
          for (const id of grammar.identifiers) {
            if (addedTypes.has(id)) continue;
            addedTypes.add(id);
            suggestions.push({
              text: id,
              description: grammar.name || name,
              type: 'keyword'
            });
          }
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

    for (let i = 0; i < nonWhitespaceTokens.length; i++) {
      const token = nonWhitespaceTokens[i];
      if (cursorPosition >= token.start && cursorPosition < token.end) {
        tokenBeforeCursor = i > 0 ? nonWhitespaceTokens[i - 1] : null;
        break;
      } else if (cursorPosition >= token.end) {
        tokenBeforeCursor = token;
      }
    }

    // Get suggestions using shared method
    const tokenType = tokenBeforeCursor?.type || null;
    const prevTokenText = tokenBeforeCursor?.text || '';

    return this.getSuggestionsForTokenType(tokenType, prevTokenText);
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
            type: childStyle,
            placeholder: childDecl.placeholder,
            editable: childDecl.editable,
            appendToPrevious: childDecl.appendToPrevious,
            skipToNext: childDecl.skipToNext
          });
        }

        suggestions.push({
          text: decl.category,
          description: decl.description || '',
          type: style,
          isCategory: true,
          children
        });
      } else {
        // Regular suggestion
        const displayText = this._generateDynamicDateTimeText(decl, style);

        suggestions.push({
          text: displayText,
          description: decl.description || '',
          type: style,
          placeholder: decl.placeholder,
          editable: decl.editable,
          appendToPrevious: decl.appendToPrevious,
          skipToNext: decl.skipToNext,
          newLineBefore: decl.newLineBefore
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
      if (decl.pattern?.includes('\\d{6}Z')) {
        // METAR format: DDHHmmZ
        displayText = this._generateMetarDateTime();
      } else if (decl.pattern?.includes('\\d{8}/\\d{4}Z')) {
        // VAA full format: YYYYMMDD/HHmmZ
        displayText = this._generateVaaDateTime();
      } else if (decl.pattern?.includes('\\d{2}/\\d{4}Z')) {
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
            type: child.type || 'value',
            placeholder: child.placeholder,
            editable: child.editable,
            appendToPrevious: child.appendToPrevious,
            skipToNext: child.skipToNext
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
          type: sug.type || 'value',
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
      if (this.currentGrammar.identifiers?.includes('METAR') ||
          this.currentGrammar.identifiers?.includes('SPECI')) {
        this._validateMetarStructure(nonWhitespaceTokens, errors, text);
      }

      // Validate minimum structure for TAF
      if (this.currentGrammar.identifiers?.includes('TAF')) {
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
    if (this.currentGrammar.identifiers?.includes('TAF')) {
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
   * Clear current grammar
   */
  reset(): void {
    this.currentGrammar = null;
  }
}

// Singleton instance
export const parser = new TacParser();
