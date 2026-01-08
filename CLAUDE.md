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
├── tac-editor-types.ts     # Types and constants
├── tac-editor-undo.ts      # Undo/Redo manager
├── tac-editor.css          # Styles with CSS variables
├── tac-editor.template.ts  # HTML template generator
├── tac-parser.ts           # Grammar-based parser engine
├── tac-parser-types.ts     # Parser types and interfaces
├── tac-parser-structure.ts # Structure tracker for parsing
└── grammars/               # Grammar definitions (JSON)
```

### Grammar Naming Convention

Grammar files follow the pattern: `{tac-code}.{standard}.{locale}.json`

- **tac-code**: The TAC code (sa, sp, ft, fc, ws, wv, wc, wa, fv, fk, fn)
- **standard**: Regional standard (oaci, noaa, russian, etc.)
- **locale**: Language (en, fr, etc.) or "auto" for browser detection

Examples:
- `sa.oaci.en.json` - METAR, OACI standard, English
- `sa.noaa.en.json` - METAR, US (NOAA) standard, English
- `taf.oaci.fr.json` - TAF, OACI standard, French

Grammar files in `grammars/`:
```
├── sa.{standard}.{locale}.json   # METAR (extends report)
├── sp.{standard}.{locale}.json   # SPECI (extends report)
├── report.{standard}.{locale}.json # Base for METAR/SPECI
├── ft.{standard}.{locale}.json   # TAF Long (extends taf)
├── fc.{standard}.{locale}.json   # TAF Short (extends taf)
├── taf.{standard}.{locale}.json  # Base for TAF
├── met.{standard}.{locale}.json  # Base for SIGMET/AIRMET
├── sigmet.{standard}.{locale}.json # SIGMET base (extends met)
├── ws.{standard}.{locale}.json   # SIGMET Weather (extends sigmet)
├── wv.{standard}.{locale}.json   # SIGMET Volcanic Ash
├── wc.{standard}.{locale}.json   # SIGMET Tropical Cyclone
├── wa.{standard}.{locale}.json   # AIRMET (extends met)
├── fv.{standard}.{locale}.json   # VAA (template mode)
├── fk.{standard}.{locale}.json   # TCA (template mode)
└── fn.{standard}.{locale}.json   # SWXA (template mode)
```

### Standard and Locale Fallback

The editor uses a fallback chain when loading grammars:
1. `{name}.{standard}.{locale}.json` - Exact match
2. `{name}.oaci.{locale}.json` - Fallback to OACI standard
3. `{name}.{standard}.en.json` - Fallback to English
4. `{name}.oaci.en.json` - Final fallback

Cross-standard inheritance uses explicit format: `"extends": "report.oaci"` to load the OACI base when defining a US variant.

### Grammar Format

Each grammar file defines:
- **tokens**: Pattern definitions with regex and styling
- **structure**: Sequence and choice rules for syntax structure
- **suggestions**: Context-aware completion hints using `items` and `after` mappings

```json
{
  "name": "METAR/SPECI",
  "version": "1.0.0",
  "identifier": "METAR",
  "tokens": {
    "identifier": {
      "pattern": "^(METAR|SPECI)$",
      "style": "keyword",
      "description": "Message type identifier"
    },
    "icao": {
      "pattern": "^[A-Z]{4}$",
      "style": "location",
      "description": "ICAO airport code"
    }
  },
  "structure": [
    { "id": "identifier", "cardinality": [1, 1] },
    { "id": "icao", "cardinality": [1, 1] }
  ],
  "suggestions": {
    "items": {
      "identifier": [
        { "text": "METAR", "description": "Routine observation" },
        { "text": "SPECI", "description": "Special observation" }
      ],
      "icao": [
        { "text": "LFPG", "description": "Paris CDG" }
      ]
    },
    "after": {
      "start": ["identifier"],
      "identifier": ["icao"]
    }
  }
}
```

**Note**: The `suggestions.items` maps token IDs to arrays of suggestion items. The `suggestions.after` maps token IDs to arrays of next token IDs that should be suggested.

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

| TAC Code | Message Type | Grammar File Pattern |
|----------|--------------|---------------------|
| `SA`     | METAR        | sa.{standard}.{locale}.json |
| `SP`     | SPECI        | sp.{standard}.{locale}.json |
| `FT`     | TAF Long     | ft.{standard}.{locale}.json |
| `FC`     | TAF Short    | fc.{standard}.{locale}.json |
| `WS`     | SIGMET Weather | ws.{standard}.{locale}.json |
| `WV`     | SIGMET VA    | wv.{standard}.{locale}.json |
| `WC`     | SIGMET TC    | wc.{standard}.{locale}.json |
| `WA`     | AIRMET       | wa.{standard}.{locale}.json |
| `FV`     | VAA          | fv.{standard}.{locale}.json |
| `FK`     | TCA          | fk.{standard}.{locale}.json |
| `FN`     | SWXA         | fn.{standard}.{locale}.json |

### Editor Attributes

- **`standard`**: Regional standard ("oaci" default, "noaa" for US/NOAA practices)
- **`lang`**: Locale ("en" default, "fr", or "auto" for browser detection)
- **`message-types`**: Comma-separated list of allowed TAC codes

Grammar files use inheritance via the `extends` property. Inheritance chains:
- METAR/SPECI: `sa`/`sp` → `report`
- TAF: `ft`/`fc` → `taf`
- SIGMET: `ws`/`wc`/`wv` → `sigmet` → `met`
- AIRMET: `wa` → `met`

NOAA variants extend the OACI base explicitly:
- `report.noaa` → `report.oaci`
- `taf.noaa` → `taf.oaci`

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

### SWXA (Space Weather Advisory)
- Space weather phenomena affecting aviation
- Effects: HF COM, SATCOM, GNSS, RADIATION
- Forecasts at +6, +12, +18, +24 hours

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

## Bug Fixing Process

**IMPORTANT**: When fixing bugs, especially provider-related issues:
1. If the first fix attempt doesn't work, **TEST IN THE BROWSER** before claiming it's fixed
2. Use the browser MCP tools to verify the fix actually works
3. Check console logs for errors or debug information
4. Don't assume code changes work - verify them visually

## Testing Strategy

Tests are organized by functionality:
- `rendering.test.js` - Component rendering and display
- `parsing.test.js` - Grammar parsing and tokenization
- `suggestions.test.js` - Autocompletion behavior
- `validation.test.js` - Syntax validation
- `grammars.test.js` - Individual grammar tests

## WMO Documentation Reference

The grammars are based on **WMO-No. 49 Volume II (2018, updated 2021)** - Technical Regulations.
Reference PDF files are located in: `documentation/WMO-No49_Vol-II_2018-upd-2021_Met-Service/`

| Grammar | WMO Table | PDF Pages | Description |
|---------|-----------|-----------|-------------|
| `report.*.json` (SA/SP) | Table A3-2 | 117 | Template for METAR and SPECI |
| `taf.*.json` (FT/FC) | Table A5-1 | 135-137 | Template for TAF |
| `sigmet.*.json`, `wa.*.json` (WS/WV/WC/WA) | Table A6-1A | 152-158 | Template for SIGMET and AIRMET messages |
| `fv.*.json` (FV) | Table A2-1 | 73-76 | Template for advisory message for volcanic ash (VAA) |
| `fk.*.json` (FK) | Table A2-2 | 76-79 | Template for advisory message for tropical cyclones (TCA) |
| `fn.*.json` (FN) | Table A2-3 | 79-84 | Template for advisory message for space weather information (SWXA) |

**Note**: Page numbers refer to the PDF file names, not the printed page numbers in the document.
