<p align="center">
  <a href="https://www.softwarity.io/">
    <img src="https://www.softwarity.io/img/softwarity.svg" alt="Softwarity" height="60">
  </a>
</p>

# @softwarity/tac-editor

<p align="center">
  <a href="https://www.npmjs.com/package/@softwarity/tac-editor">
    <img src="https://img.shields.io/npm/v/@softwarity/tac-editor?color=blue&label=npm" alt="npm version">
  </a>
  <a href="https://bundlephobia.com/package/@softwarity/tac-editor">
    <img src="https://img.shields.io/bundlephobia/minzip/@softwarity/tac-editor?label=size" alt="bundle size">
  </a>
  <a href="https://github.com/softwarity/tac-editor/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
  </a>
  <a href="https://codecov.io/gh/softwarity/tac-editor">
    <img src="https://codecov.io/gh/softwarity/tac-editor/graph/badge.svg" alt="codecov">
  </a>
</p>

A feature-rich, framework-agnostic **Web Component** for editing TAC (Traditional Alphanumeric Codes) aviation meteorology messages with syntax highlighting and intelligent autocompletion.

**[🚀 Try the Live Demo](https://softwarity.github.io/tac-editor/)**

## What are TAC Messages?

TAC (Traditional Alphanumeric Codes) are standardized codes used in aviation meteorology, defined by WMO (World Meteorological Organization) and ICAO (International Civil Aviation Organization):

| Code | Full Name | Description |
|------|-----------|-------------|
| **METAR** | Meteorological Aerodrome Report | Routine aerodrome weather observation |
| **SPECI** | Special Report | Special weather observation (significant changes) |
| **TAF** | Terminal Aerodrome Forecast | Aerodrome weather forecast (9h, 24h, or 30h) |
| **SIGMET** | Significant Meteorological Information | Warning for dangerous en-route weather |
| **AIRMET** | Airmen's Meteorological Information | Weather significant for low-level flights |
| **VAA** | Volcanic Ash Advisory | Volcanic ash cloud information |
| **TCA** | Tropical Cyclone Advisory | Tropical cyclone information |
| **SWXA** | Space Weather Advisory | Space weather effects on aviation |

## Features

- **Multi-Message Support** - METAR, SPECI, TAF, SIGMET, AIRMET, VAA, TCA, SWXA
- **Auto-Detection** - Automatically loads appropriate grammar based on first token
- **Syntax Highlighting** - Token-based coloring with customizable themes
- **Intelligent Autocompletion** - Context-aware suggestions based on grammar rules
- **Real-time Validation** - Immediate feedback on syntax errors
- **Modular Grammars** - Each message type has its own loadable grammar file
- **Word Wrap** - Automatic text wrapping at word boundaries
- **Multi-Standard Support** - OACI/ICAO and NOAA standards
- **Inline Controls** - Support for embedded controls (e.g., map for geometry input)
- **Dark/Light Themes** - Automatic theme detection via `color-scheme`
- **Zero Dependencies** - Pure Web Component, works with any framework
- **Readonly Mode** - Visual indicator when editing is disabled

## Installation

### Option 1: CDN (No build step required)

```html
<!-- Using unpkg -->
<script type="module" src="https://unpkg.com/@softwarity/tac-editor"></script>

<!-- Or using jsDelivr -->
<script type="module" src="https://cdn.jsdelivr.net/npm/@softwarity/tac-editor"></script>
```

### Option 2: NPM (With bundler)

```bash
npm install @softwarity/tac-editor
```

```javascript
import '@softwarity/tac-editor';
```

## Usage

### Basic Usage

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="https://unpkg.com/@softwarity/tac-editor"></script>
</head>
<body>
  <tac-editor placeholder="Enter TAC message (METAR, TAF, SIGMET...)"></tac-editor>
</body>
</html>
```

### With Initial Value

```html
<tac-editor value="METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 NOSIG"></tac-editor>
```

### Loading Specific Message Types

By default, all message types are available. You can restrict to specific ones using WMO TAC codes:

```html
<!-- Only METAR support -->
<tac-editor message-types="SA"></tac-editor>

<!-- METAR and SPECI only -->
<tac-editor message-types="SA,SP"></tac-editor>

<!-- TAF (Long and Short) -->
<tac-editor message-types="FT,FC"></tac-editor>

<!-- All SIGMET variants -->
<tac-editor message-types="WS,WV,WC"></tac-editor>
```

**TAC Code Reference:**
| Code | Message Type |
|------|--------------|
| SA | METAR |
| SP | SPECI |
| FT | TAF Long (30h) |
| FC | TAF Short (12h) |
| WS | SIGMET Weather |
| WV | SIGMET Volcanic Ash |
| WC | SIGMET Tropical Cyclone |
| WA | AIRMET |
| FV | VAA |
| FK | TCA |
| FN | SWXA |

### Listen to Changes

```javascript
const editor = document.querySelector('tac-editor');

// Valid TAC emits change event
editor.addEventListener('change', (e) => {
  console.log('TAC message:', e.detail.value);
  console.log('Message type:', e.detail.type);  // 'METAR', 'TAF', etc.
  console.log('Tokens:', e.detail.tokens);
});

// Syntax error emits error event
editor.addEventListener('error', (e) => {
  console.log('Syntax errors:', e.detail.errors);
});
```

### Programmatic Control

```javascript
const editor = document.querySelector('tac-editor');

// Set value
editor.value = 'TAF LFPG 281100Z 2812/2912 27012KT 9999 SCT040';

// Get current value
console.log(editor.value);

// Get parsed tokens
console.log(editor.tokens);

// Get current suggestions
console.log(editor.suggestions);

// Check validity
console.log(editor.isValid);

// Get detected message type
console.log(editor.messageType);  // 'TAF'
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `''` | The TAC message content |
| `readonly` | Boolean | `false` | Disable editing |
| `message-types` | String | `'all'` | Comma-separated list of TAC codes (SA, SP, FT, FC, WS, WV, WC, WA, FV, FK, FN) |
| `standard` | String | `'oaci'` | Regional standard: `oaci` (ICAO) or `noaa` (US) |
| `lang` | String | `'en'` | Language for descriptions: `en`, `fr`, or `auto` (browser detection) |
| `grammars-url` | String | `'/grammars'` | Base URL for loading grammar files |
| `observation-auto` | Boolean | `false` | Show AUTO entries in METAR/SPECI suggestions |

## Theme Customization

### Using CSS Custom Properties

```css
tac-editor {
  /* Background and text */
  --tac-bg: #1e1e1e;
  --tac-text: #d4d4d4;
  --tac-placeholder: #6e6e6e;
  
  /* Token colors */
  --tac-keyword: #569cd6;       /* METAR, TAF, SIGMET... */
  --tac-location: #4ec9b0;      /* ICAO codes: LFPG, EGLL... */
  --tac-datetime: #ce9178;      /* Date/time: 281030Z */
  --tac-value: #b5cea8;         /* Numeric values */
  --tac-unit: #9cdcfe;          /* Units: KT, MPS, SM... */
  --tac-weather: #c586c0;       /* Weather phenomena: RA, SN, TS... */
  --tac-cloud: #dcdcaa;         /* Cloud types: FEW, SCT, BKN, OVC */
  --tac-remark: #6a9955;        /* Remarks section */
  --tac-error: #f44747;         /* Invalid tokens */
  
  /* UI elements */
  --tac-cursor: #aeafad;
  --tac-selection: rgba(38, 79, 120, 0.5);
  --tac-suggestion-bg: #252526;
  --tac-suggestion-hover: #094771;
}
```

### Automatic Dark/Light Mode

The component respects `color-scheme`:

```css
/* Will use light theme when page prefers light */
:root {
  color-scheme: light dark;
}
```

Or force a specific mode:

```css
tac-editor {
  color-scheme: dark;  /* Always dark */
}
```

## Grammar Files

Grammars are modular JSON files following the naming pattern: `{tac-code}.{standard}.{lang}.json`

```
grammars/
├── sa.oaci.en.json        # METAR (extends report)
├── sp.oaci.en.json        # SPECI (extends report)
├── report.oaci.en.json    # Base grammar for METAR/SPECI
├── ft.oaci.en.json        # TAF Long 30h (extends taf)
├── fc.oaci.en.json        # TAF Short 12h (extends taf)
├── taf.oaci.en.json       # Base grammar for TAF
├── ws.oaci.en.json        # SIGMET Weather (extends sigmet)
├── wv.oaci.en.json        # SIGMET Volcanic Ash (extends sigmet)
├── wc.oaci.en.json        # SIGMET Tropical Cyclone (extends sigmet)
├── sigmet.oaci.en.json    # SIGMET base (extends met)
├── met.oaci.en.json       # Base for SIGMET/AIRMET
├── wa.oaci.en.json        # AIRMET (extends met)
├── fv.oaci.en.json        # Volcanic Ash Advisory (template mode)
├── fk.oaci.en.json        # Tropical Cyclone Advisory (template mode)
└── fn.oaci.en.json        # Space Weather Advisory (template mode)
```

**Naming Convention:**
- `{tac-code}`: WMO TAC code (sa, sp, ft, fc, ws, wv, wc, wa, fv, fk, fn)
- `{standard}`: Regional standard (`oaci` or `noaa`)
- `{lang}`: Language (`en`, `fr`)

**Grammar Inheritance:** Child grammars use the `extends` property to inherit tokens, structure, and suggestions from base grammars. The inheritance chain:
- METAR/SPECI: `sa`/`sp` → `report`
- TAF: `ft`/`fc` → `taf`
- SIGMET: `ws`/`wc`/`wv` → `sigmet` → `met`
- AIRMET: `wa` → `met`

### Custom Grammars

You can load custom grammars:

```javascript
const editor = document.querySelector('tac-editor');
await editor.loadGrammar('custom', {
  name: 'CUSTOM',
  tokens: { /* ... */ },
  rules: { /* ... */ }
});
```

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `change` | `{ value, type, tokens }` | Fired when content changes (valid) |
| `error` | `{ errors }` | Fired when syntax errors detected |
| `suggestion` | `{ suggestions, selected }` | Fired when suggestions change |

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+

## Examples

### METAR Example
```
METAR LFPG 281030Z 27015G25KT 9999 FEW040CB SCT100 12/05 Q1023 TEMPO 3000 TSRA
```

### TAF Example
```
TAF LFPG 281100Z 2812/2912 27012KT 9999 SCT040
    BECMG 2818/2820 18008KT
    TEMPO 2902/2908 3000 BR
```

### SIGMET Example
```
SIGMET LFFF 1 VALID 281200/281600 LFPW-
LFFF PARIS FIR SEV TURB FCST WI N4830 E00230 - N4730 E00330 - N4700 E00200
FL250/350 MOV NE 20KT WKN
```

## Contributing

Contributions are welcome! Please read our [Development Guide](DEVELOPMENT.md) first.

## License

MIT © [Softwarity](https://www.softwarity.io/)
