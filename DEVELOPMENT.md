# Development Guide

This guide explains how to develop and test the `@softwarity/tac-editor` Web Component locally.

## Prerequisites

- Node.js 18+ or 20+
- npm 9+
- Git

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
1. Edit `src/tac-editor.js` or grammar files
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
- Minified and optimized for npm distribution

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

Tests are split across themed files for better maintainability:

| File | Purpose |
|------|---------|
| `rendering.test.js` | Component rendering and display |
| `parsing.test.js` | Grammar parsing and tokenization |
| `suggestions.test.js` | Autocompletion behavior |
| `validation.test.js` | Syntax validation |
| `grammars.test.js` | Individual grammar tests |

## Project Structure

```
tac-editor/
├── src/
│   ├── tac-editor.js           # Main web component
│   ├── tac-editor.css          # Component styles
│   ├── tac-editor.template.js  # HTML template
│   ├── tac-parser.js           # Grammar parser engine
│   └── grammars/               # Grammar definitions
│       ├── metar-speci.json
│       ├── taf.json
│       ├── sigmet.json
│       └── ...
├── test/
│   ├── rendering.test.js
│   ├── parsing.test.js
│   └── fixtures/
│       └── tac-samples.js
├── demo/
│   └── index.html
└── dist/                       # Build output
```

## Adding a New Grammar

1. Create a new JSON file in `src/grammars/`:

```json
{
  "name": "NEW_MESSAGE_TYPE",
  "version": "1.0.0",
  "root": "message",
  "tokens": {
    "identifier": {
      "pattern": "^NEW_MESSAGE_TYPE$",
      "style": "keyword"
    }
  },
  "rules": {
    "message": {
      "sequence": [
        { "token": "identifier", "required": true }
      ]
    }
  }
}
```

2. Register the grammar in `tac-editor.js`:

```javascript
static GRAMMAR_MAP = {
  'METAR': 'metar-speci',
  'SPECI': 'metar-speci',
  'NEW_MESSAGE_TYPE': 'new-message-type',
  // ...
};
```

3. Add tests in `test/grammars.test.js`

## Theme Development

The component supports `color-scheme` and custom CSS properties:

```css
/* Dark theme (default) */
tac-editor {
  --tac-bg: #1e1e1e;
  --tac-text: #d4d4d4;
  --tac-keyword: #569cd6;
}

/* Light theme via color-scheme */
@media (prefers-color-scheme: light) {
  tac-editor {
    --tac-bg: #ffffff;
    --tac-text: #333333;
    --tac-keyword: #0000ff;
  }
}
```

## Debugging Tips

1. **Grammar issues**: Check browser console for parsing errors
2. **Tokenization**: Use `editor.tokens` to inspect parsed tokens
3. **Suggestions**: Use `editor.suggestions` to see current completions
4. **Parser state**: Use `editor.parserState` to debug grammar position
