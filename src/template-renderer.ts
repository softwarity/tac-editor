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
export class TemplateRenderer {
  private _template: TemplateDefinition | null = null;
  private _state: TemplateState | null = null;
  private _identifier: string = '';

  /**
   * Initialize with a template definition
   */
  initialize(template: TemplateDefinition, identifier: string): void {
    this._template = template;
    this._identifier = identifier;
    this._state = this._createInitialState(template);
  }

  /**
   * Get current template state
   */
  get state(): TemplateState | null {
    return this._state;
  }

  /**
   * Get the message identifier (e.g., "VA ADVISORY")
   */
  get identifier(): string {
    return this._identifier;
  }

  /**
   * Check if template mode is active
   */
  get isActive(): boolean {
    return this._template !== null && this._state !== null;
  }

  /**
   * Create initial state from template
   */
  private _createInitialState(template: TemplateDefinition): TemplateState {
    // Calculate label column width
    const labelColumnWidth = template.labelColumnWidth ||
      Math.max(...template.fields.map(f => f.label.length)) + 2;

    const fields: RenderedField[] = template.fields.map((field, index) => ({
      field,
      lineIndex: index + 1, // Line 0 is the identifier
      labelStart: 0,
      labelEnd: field.label.length,
      valueStart: labelColumnWidth,
      valueEnd: labelColumnWidth,
      value: '',
      additionalLines: undefined
    }));

    return {
      template,
      fields,
      focusedFieldIndex: 0,
      labelColumnWidth
    };
  }

  /**
   * Generate the full text content from current state
   */
  generateText(): string {
    if (!this._state) return '';

    const lines: string[] = [this._identifier];
    const { labelColumnWidth, fields } = this._state;

    for (const renderedField of fields) {
      const { field, value, additionalLines } = renderedField;

      // Pad label to column width
      const paddedLabel = field.label.padEnd(labelColumnWidth);
      lines.push(paddedLabel + value);

      // Add additional lines for multiline values
      if (additionalLines && additionalLines.length > 0) {
        const padding = ' '.repeat(labelColumnWidth);
        for (const extraLine of additionalLines) {
          lines.push(padding + extraLine);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse text back into template state
   * Extracts values from existing VAA text and maps them to template fields
   */
  parseText(text: string): void {
    if (!this._template || !this._state) return;

    const lines = text.split('\n');
    if (lines.length === 0) return;

    // Build a map of label -> value from the input text
    // Each label is on its own line, followed by value (may span multiple lines)
    const labelValues = new Map<string, { value: string; additionalLines: string[] }>();

    // Get all labels for quick lookup
    const allLabels = this._state.fields.map(f => f.field.label);

    let i = 1; // Skip first line (identifier)
    while (i < lines.length) {
      const line = lines[i].trimStart();

      // Find which label this line starts with (if any)
      let foundLabel: string | null = null;
      for (const label of allLabels) {
        if (line.startsWith(label)) {
          foundLabel = label;
          break;
        }
      }

      if (foundLabel) {
        // Extract value after the label
        const labelPos = lines[i].indexOf(foundLabel);
        const valueStart = labelPos + foundLabel.length;
        const value = lines[i].substring(valueStart).trim();

        // Collect additional lines that belong to this field
        const additionalLines: string[] = [];
        i++;

        // Continue collecting lines until we hit another label or end
        while (i < lines.length) {
          const nextLine = lines[i].trimStart();

          // Check if this line starts with any label
          let isNewLabel = false;
          for (const label of allLabels) {
            if (nextLine.startsWith(label)) {
              isNewLabel = true;
              break;
            }
          }

          if (isNewLabel) {
            break; // This line belongs to a new field
          }

          // This is a continuation line
          additionalLines.push(lines[i].trim());
          i++;
        }

        labelValues.set(foundLabel, { value, additionalLines });
      } else {
        i++;
      }
    }

    // Now map the parsed values to our template fields
    for (const field of this._state.fields) {
      const parsed = labelValues.get(field.field.label);
      if (parsed) {
        field.value = parsed.value;
        field.additionalLines = parsed.additionalLines.length > 0 ? parsed.additionalLines : undefined;
      }
    }
  }

  /**
   * Get the field at a given line and column position
   */
  getFieldAtPosition(line: number, column: number): RenderedField | null {
    if (!this._state) return null;

    for (const field of this._state.fields) {
      if (field.lineIndex === line) {
        return field;
      }
      // Check additional lines
      if (field.additionalLines) {
        for (let i = 0; i < field.additionalLines.length; i++) {
          if (field.lineIndex + 1 + i === line) {
            return field;
          }
        }
      }
    }
    return null;
  }

  /**
   * Check if position is in the label column (read-only)
   */
  isInLabelColumn(line: number, column: number): boolean {
    if (!this._state || line === 0) return line === 0; // Identifier line
    return column < this._state.labelColumnWidth;
  }

  /**
   * Move focus to next field
   */
  focusNextField(): RenderedField | null {
    if (!this._state) return null;

    if (this._state.focusedFieldIndex < this._state.fields.length - 1) {
      this._state.focusedFieldIndex++;
    }
    return this._state.fields[this._state.focusedFieldIndex];
  }

  /**
   * Move focus to previous field
   */
  focusPreviousField(): RenderedField | null {
    if (!this._state) return null;

    if (this._state.focusedFieldIndex > 0) {
      this._state.focusedFieldIndex--;
    }
    return this._state.fields[this._state.focusedFieldIndex];
  }

  /**
   * Get currently focused field
   */
  getFocusedField(): RenderedField | null {
    if (!this._state) return null;
    return this._state.fields[this._state.focusedFieldIndex];
  }

  /**
   * Set field value
   */
  setFieldValue(fieldIndex: number, value: string): void {
    if (!this._state || fieldIndex < 0 || fieldIndex >= this._state.fields.length) {
      return;
    }
    this._state.fields[fieldIndex].value = value;
  }

  /**
   * Reset the template renderer
   */
  reset(): void {
    this._template = null;
    this._state = null;
    this._identifier = '';
  }

  /**
   * Tokenize the template content for syntax highlighting
   */
  tokenize(): Token[] {
    if (!this._state) return [];

    const tokens: Token[] = [];
    const text = this.generateText();
    const lines = text.split('\n');
    let position = 0;
    let lineIndex = 0;

    // Identifier token
    if (lines.length > 0) {
      tokens.push({
        text: this._identifier,
        type: 'identifier',
        style: 'keyword',
        start: 0,
        end: this._identifier.length,
        description: 'Message type identifier'
      });
      position = this._identifier.length + 1; // +1 for newline
      lineIndex = 1;
    }

    // Field tokens
    for (const field of this._state.fields) {
      if (lineIndex >= lines.length) break;

      const line = lines[lineIndex];
      const lineStart = position;

      // Label token - covers full label including colon
      const labelText = field.field.label;
      tokens.push({
        text: labelText,
        type: field.field.labelType,
        style: 'label',
        start: lineStart,
        end: lineStart + labelText.length,
        description: field.field.label
      });

      // Padding token (spaces between label and value) - style as label to keep consistent color
      const paddingLength = this._state.labelColumnWidth - labelText.length;
      if (paddingLength > 0) {
        tokens.push({
          text: ' '.repeat(paddingLength),
          type: 'padding',
          style: 'label',
          start: lineStart + labelText.length,
          end: lineStart + this._state.labelColumnWidth,
          description: ''
        });
      }

      // Value token (after padding)
      const valueStart = lineStart + this._state.labelColumnWidth;
      const valueText = field.value;
      if (valueText) {
        tokens.push({
          text: valueText,
          type: field.field.valueType,
          style: 'value',
          start: valueStart,
          end: valueStart + valueText.length,
          description: field.field.placeholder?.value
        });
      }

      position += line.length + 1; // +1 for newline
      lineIndex++;

      // Handle additional lines for multiline values
      if (field.additionalLines && field.additionalLines.length > 0) {
        for (const extraLine of field.additionalLines) {
          if (lineIndex >= lines.length) break;

          const extraLineStart = position;

          // Padding for continuation lines
          tokens.push({
            text: ' '.repeat(this._state.labelColumnWidth),
            type: 'padding',
            style: 'label',
            start: extraLineStart,
            end: extraLineStart + this._state.labelColumnWidth,
            description: ''
          });

          // Value token for continuation
          if (extraLine) {
            tokens.push({
              text: extraLine,
              type: field.field.valueType,
              style: 'value',
              start: extraLineStart + this._state.labelColumnWidth,
              end: extraLineStart + this._state.labelColumnWidth + extraLine.length,
              description: field.field.placeholder?.value
            });
          }

          position += lines[lineIndex].length + 1;
          lineIndex++;
        }
      }
    }

    return tokens;
  }
}
