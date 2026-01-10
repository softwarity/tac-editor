# Development Guide

This guide explains how to develop and test the `@softwarity/tac-editor` Web Component locally.

## Prerequisites

- Node.js 18+ or 20+
- npm 9+
- Git
- TypeScript knowledge (the project is written in TypeScript)

## Initial Setup

Clone the repository and install dependencies:

```bash
# Clone the repo
git clone https://github.com/softwarity/tac-editor.git
cd tac-editor

# Install dependencies
npm install
```

## Local Development

### 1. Start Development Server

The easiest way to develop is using Vite's dev server:

```bash
npm run dev
```

This will:
- Start a dev server at `http://localhost:5173`
- Open the demo page (`demo/index.html`) automatically
- Enable hot-module replacement (HMR)
- Watch for file changes and rebuild automatically

**Development workflow:**
1. Edit `src/tac-editor.ts` or grammar files
2. Save the file
3. Browser refreshes automatically
4. Test changes in the demo

### 2. Build for Production

Build the component for distribution:

```bash
npm run build
```

This creates:
- `dist/tac-editor.js` - Production-ready ES module
- `dist/grammars/*.json` - Grammar files
- Minified and optimized via Vite + Terser

### 3. Preview Production Build

Test the production build locally:

```bash
npm run preview
```

This serves the production build at `http://localhost:4173`

## Testing the Component

### Unit Tests

The project uses [@web/test-runner](https://modern-web.dev/docs/test-runner/overview/) with Playwright for unit testing.

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch
```

### Test Organization

Tests are organized by type:

| File | Purpose |
|------|---------|
| `tac-files.test.js` | TAC file validation (538 files: METAR, SPECI, TAF, VAA, TCA) |
| `rendering.test.js` | Component rendering and display |
| `parsing.test.js` | Grammar parsing and tokenization |
| `suggestions.test.js` | Autocompletion behavior |
| `validation.test.js` | Syntax validation |

### TAC Test Files Structure

Test TAC files are organized by type and standard:

```
test/tac-files/
├── SA/                    # METAR
│   ├── oaci/              # OACI/ICAO standard
│   ├── noaa/              # US NOAA standard
│   └── non-compliant/     # Non-compliant samples
├── SP/                    # SPECI
├── FC/                    # TAF Short (12h)
├── FT/                    # TAF Long (30h)
├── WS/                    # SIGMET Weather
├── WV/                    # SIGMET Volcanic Ash
├── WC/                    # SIGMET Tropical Cyclone
├── WA/                    # AIRMET
├── FV/                    # VAA
├── FK/                    # TCA
└── FN/                    # SWXA
```

## Project Structure

```
tac-editor/
├── src/
│   ├── tac-editor.ts           # Main web component
│   ├── tac-editor-types.ts     # Types and constants
│   ├── tac-editor-undo.ts      # Undo/Redo manager
│   ├── tac-editor.css          # Component styles
│   ├── tac-editor.template.ts  # HTML template generator
│   ├── tac-parser.ts           # Grammar-based parser engine
│   ├── tac-parser-types.ts     # Parser types and interfaces
│   ├── tac-parser-structure.ts # Structure tracker for parsing
│   ├── tac-validators.ts       # Token validators
│   └── grammars/               # Grammar definitions (JSON)
│       ├── sa.oaci.en.json     # METAR (OACI, English)
│       ├── sp.oaci.en.json     # SPECI (OACI, English)
│       ├── report.oaci.en.json # Base for METAR/SPECI
│       ├── ft.oaci.en.json     # TAF Long
│       ├── fc.oaci.en.json     # TAF Short
│       ├── taf.oaci.en.json    # Base for TAF
│       ├── ws.oaci.en.json     # SIGMET Weather
│       ├── wv.oaci.en.json     # SIGMET Volcanic Ash
│       ├── wc.oaci.en.json     # SIGMET Tropical Cyclone
│       ├── sigmet.oaci.en.json # SIGMET base
│       ├── wa.oaci.en.json     # AIRMET
│       ├── met.oaci.en.json    # Base for SIGMET/AIRMET
│       ├── fv.oaci.en.json     # VAA (template mode)
│       ├── fk.oaci.en.json     # TCA (template mode)
│       └── fn.oaci.en.json     # SWXA (template mode)
├── test/
│   ├── tac-files.test.js
│   ├── tac-files/              # TAC samples by type
│   └── fixtures/
├── demo/
│   └── index.html
└── dist/                       # Build output
```

## Grammar Naming Convention

Grammar files follow the pattern: `{tac-code}.{standard}.{locale}.json`

- **tac-code**: WMO TAC code (sa, sp, ft, fc, ws, wv, wc, wa, fv, fk, fn)
- **standard**: Regional standard (oaci, noaa)
- **locale**: Language (en, fr)

Examples:
- `sa.oaci.en.json` - METAR, OACI standard, English
- `sa.noaa.en.json` - METAR, US (NOAA) standard, English
- `report.oaci.fr.json` - Base METAR/SPECI, OACI standard, French

## Adding a New Grammar

1. Create a new JSON file in `grammars/` following the naming convention:

```json
{
  "name": "NEW_MESSAGE_TYPE",
  "version": "1.0.0",
  "identifier": "NEWMSG",
  "tokens": {
    "identifier": {
      "pattern": "^NEWMSG$",
      "style": "keyword",
      "description": "Message type identifier"
    },
    "value": {
      "pattern": "^\\d{4}$",
      "style": "value",
      "description": "4-digit value"
    }
  },
  "structure": [
    { "id": "identifier", "cardinality": [1, 1] },
    { "id": "value", "cardinality": [1, 1] }
  ],
  "suggestions": {
    "items": {
      "identifier": [
        { "text": "NEWMSG", "description": "New message type" }
      ],
      "value": [
        { "text": "0000", "description": "Enter 4 digits", "editable": [{ "start": 0, "end": 4 }] }
      ]
    },
    "after": {
      "start": ["identifier"],
      "identifier": ["value"]
    }
  }
}
```

2. Use inheritance for variants:

```json
{
  "name": "NEW_MESSAGE_TYPE Variant",
  "version": "1.0.0",
  "extends": "newmsg",
  "suggestions": {
    "items": {
      "value": [
        { "text": "1234", "description": "Specific variant value" }
      ]
    }
  }
}
```

3. Add tests in `test/tac-files/` with sample TAC messages

## Theme Development

The component supports automatic light/dark mode and custom CSS properties:

```css
/* Token colors (10 generic styles) */
tac-editor {
  --tac-token-keyword: #569cd6;    /* Keywords, identifiers */
  --tac-token-location: #4ec9b0;   /* ICAO codes, FIRs */
  --tac-token-datetime: #ce9178;   /* Date/time values */
  --tac-token-phenomenon: #c586c0; /* Weather phenomena */
  --tac-token-value: #b5cea8;      /* Numeric values */
  --tac-token-geometry: #dcdcaa;   /* Coordinates */
  --tac-token-status: #9cdcfe;     /* Status indicators */
  --tac-token-label: #808080;      /* Template labels */
  --tac-token-free-text: #d4d4d4;  /* Free text */
  --tac-token-trend: #569cd6;      /* Trend markers */
}

/* Background and UI */
tac-editor {
  --tac-bg: #1e1e1e;
  --tac-text: #d4d4d4;
  --tac-cursor: #aeafad;
  --tac-selection: rgba(38, 79, 120, 0.5);
  --tac-error: #f44747;
}
```

External themes can be loaded via CSS files (see `demo/themes/`).

## Debugging Tips

1. **Grammar issues**: Check browser console for parsing errors
2. **Tokenization**: Use `editor.tokens` to inspect parsed tokens
3. **Suggestions**: Use `editor.suggestions` to see current completions
4. **Parser state**: Use `editor.parserState` to debug grammar position
5. **Validation errors**: Check token `error` property for validator messages

## Provider Development

Register custom providers for dynamic suggestions:

```javascript
const editor = document.querySelector('tac-editor');

// Suggestion provider (returns list of suggestions)
editor.registerSuggestionProvider('my-icao-provider', async (context) => {
  const response = await fetch('/api/airports');
  const airports = await response.json();
  return airports.map(a => ({
    text: a.icao,
    description: a.name
  }));
}, { replace: true });

// Action provider (returns single value from external interaction)
editor.registerProvider('my-geometry-provider', async () => {
  const result = await openMapModal();
  return result.coordinates;
});
```

See `GRAMMAR.en.md` for complete provider documentation.
