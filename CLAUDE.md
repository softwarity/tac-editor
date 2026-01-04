# CLAUDE.md - TAC Editor Web Component

This file provides guidance to Claude Code when working with this repository.

## Code Style Guidelines

- **Comments in code**: Always in English
- **Communication with user**: In French
- **Variable/function names**: In English (standard convention)
- **Indentation**: 2 spaces (not tabs)

## Documentation to Maintain

When modifying grammar-related functionality, keep the following documentation files up to date:

- **GRAMMAR.en.md**: Grammar specification guide in English
- **GRAMMAR.fr.md**: Grammar specification guide in French

These files document:
- Grammar file structure (tokens, sequence, suggestions)
- Normal mode vs Template mode (VAA/TCA)
- Editable regions and `defaultsFunction` for dynamic defaults
- Best practices for writing grammars

**Important**: Any changes to the grammar system (new properties, new features, behavior changes) must be reflected in both documentation files.

## Project Overview

**@softwarity/tac-editor** is a feature-rich TAC (Traditional Alphanumeric Codes) editor Web Component for aviation meteorology messages. It provides syntax highlighting, intelligent autocompletion, and support for multiple message types (METAR, SPECI, TAF, SIGMET, AIRMET, VAA, TCA).

### Current Version Status

- **Version**: 1.0.0
- **Tests**: TBD
- **Coverage**: TBD
- **Build**: Production-ready via Vite + Terser

### Key Features

1. **Multi-Grammar Support**: Dynamically loads grammar based on message type detection
2. **Syntax Highlighting**: Token-based coloring with configurable themes
3. **Intelligent Autocompletion**: Context-aware suggestions based on grammar rules
4. **Inline Controls**: Support for embedded controls (e.g., map for geometry input)
5. **Grammar Validation**: Real-time validation of TAC syntax
6. **Theme System**: Full customization with dark/light mode support (color-scheme aware)
7. **Modular Grammars**: Each message type (METAR, TAF, SIGMET, etc.) has its own grammar file

## Architecture

### File Structure

```
src/
├── tac-editor.ts           # Main web component
├── tac-editor.css          # Styles with CSS variables
├── tac-editor.template.ts  # HTML template generator
├── tac-parser.ts           # Grammar-based parser engine
└── grammars/               # Grammar definitions (JSON, named by TAC code)
    ├── sa.{locale}.json       # METAR (extends metar)
    ├── sp.{locale}.json       # SPECI (extends metar)
    ├── metar.{locale}.json    # Base for METAR/SPECI
    ├── ft.{locale}.json       # TAF Long (extends taf)
    ├── fc.{locale}.json       # TAF Short (extends taf)
    ├── taf.{locale}.json      # Base for TAF
    ├── met.{locale}.json      # Base for SIGMET/AIRMET (common tokens)
    ├── sigmet.{locale}.json   # SIGMET base (extends met)
    ├── ws.{locale}.json       # SIGMET Weather (extends sigmet)
    ├── wv.{locale}.json       # SIGMET Volcanic Ash (extends sigmet)
    ├── wc.{locale}.json       # SIGMET Tropical Cyclone (extends sigmet)
    ├── wa.{locale}.json       # AIRMET (extends met)
    ├── fv.{locale}.json       # VAA (template mode)
    └── fk.{locale}.json       # TCA (template mode)
```

### Grammar Format

Each grammar file defines:
- **tokens**: Pattern definitions with regex and styling
- **rules**: Sequence and choice rules for syntax structure
- **suggestions**: Context-aware completion hints

```json
{
  "name": "METAR/SPECI",
  "version": "1.0.0",
  "root": "message",
  "tokens": {
    "identifier": {
      "pattern": "^(METAR|SPECI)$",
      "style": "keyword",
      "description": "Message type identifier"
    }
  },
  "rules": {
    "message": {
      "sequence": [
        { "token": "identifier", "required": true },
        { "token": "icao", "required": true }
      ]
    }
  }
}
```

### Core Data Model

```javascript
// ========== Model (Source of Truth) ==========
this.value = '';              // Current TAC message text
this.grammar = null;          // Loaded grammar definition
this.tokens = [];             // Parsed tokens from current value

// ========== Parser State ==========
this.parserState = {
  position: 0,                // Current position in grammar tree
  expectedTokens: [],         // Valid next tokens
  errors: []                  // Validation errors
};

// ========== Suggestions ==========
this.suggestions = [];        // Current autocomplete suggestions
this.selectedSuggestion = 0;  // Currently highlighted suggestion

// ========== View State ==========
this.cursorPosition = 0;      // Cursor position in text
this.selectionStart = null;   // Selection start position
this.selectionEnd = null;     // Selection end position
```

### Message Type Detection

The editor uses WMO TAC codes for message types. The `message-types` attribute accepts:

| TAC Code | Message Type | Grammar File |
|----------|--------------|--------------|
| `SA`     | METAR        | sa.{locale}.json |
| `SP`     | SPECI        | sp.{locale}.json |
| `FT`     | TAF Long     | ft.{locale}.json |
| `FC`     | TAF Short    | fc.{locale}.json |
| `WS`     | SIGMET Weather | ws.{locale}.json |
| `WV`     | SIGMET VA    | wv.{locale}.json |
| `WC`     | SIGMET TC    | wc.{locale}.json |
| `WA`     | AIRMET       | wa.{locale}.json |
| `FV`     | VAA          | fv.{locale}.json |
| `FK`     | TCA          | fk.{locale}.json |

Grammar files use inheritance via the `extends` property. Inheritance chains:
- METAR/SPECI: `sa`/`sp` → `metar`
- TAF: `ft`/`fc` → `taf`
- SIGMET: `ws`/`wc`/`wv` → `sigmet` → `met`
- AIRMET: `wa` → `met`

## Supported TAC Message Types

### METAR/SPECI (Routine/Special Observation)
- Aerodrome routine/special meteorological reports
- Wind, visibility, weather, clouds, temperature, pressure

### TAF (Terminal Aerodrome Forecast)
- Aerodrome forecasts with change groups
- BECMG, TEMPO, FM, PROB groups

### SIGMET (Significant Meteorological Information)
- Significant weather phenomena
- Geometry: polygons, corridors, FIR-based areas

### AIRMET (Airmen's Meteorological Information)
- Weather significant to low-level flights
- Similar structure to SIGMET

### VAA (Volcanic Ash Advisory)
- Volcanic ash cloud information
- Trajectory forecasts

### TCA (Tropical Cyclone Advisory)
- Tropical cyclone information
- Position, movement, intensity

## Theme Customization

The component uses CSS custom properties for theming:

```css
tac-editor {
  --tac-bg: #1e1e1e;
  --tac-text: #d4d4d4;
  --tac-keyword: #569cd6;
  --tac-location: #4ec9b0;
  --tac-datetime: #ce9178;
  --tac-value: #b5cea8;
  --tac-unit: #9cdcfe;
  --tac-weather: #c586c0;
  --tac-error: #f44747;
}
```

## Development Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Build for production
npm run test      # Run unit tests
npm run test:watch # Run tests in watch mode
```

**Note**: The dev server is typically already running at http://localhost:5173 - do NOT try to start it again.

## Testing Strategy

Tests are organized by functionality:
- `rendering.test.js` - Component rendering and display
- `parsing.test.js` - Grammar parsing and tokenization
- `suggestions.test.js` - Autocompletion behavior
- `validation.test.js` - Syntax validation
- `grammars.test.js` - Individual grammar tests
