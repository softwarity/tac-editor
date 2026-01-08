# Grammar Specification Guide

This document describes how to write grammar files for the TAC Editor component. Grammars define the syntax, tokens, validation rules, and suggestions for aviation meteorology messages.

## Table of Contents

1. [File Structure](#file-structure)
2. [Grammar Inheritance](#grammar-inheritance)
3. [Grammar Modes](#grammar-modes)
4. [Tokens Definition](#tokens-definition)
5. [Structure Rules](#structure-rules)
6. [Suggestions](#suggestions)
7. [Editable Regions](#editable-regions)
8. [Provider System](#provider-system)
9. [Dynamic Defaults](#dynamic-defaults)
10. [Template Mode (VAA/TCA)](#template-mode-vaatca)
11. [Token Validators](#token-validators)

---

## File Structure

Grammar files are JSON files located in `grammars/`. Each file follows this structure:

```json
{
  "name": "MESSAGE_TYPE",
  "version": "1.0.0",
  "description": "Description of the message format",
  "identifier": "METAR",
  "tokens": { ... },
  "structure": [ ... ],
  "suggestions": { ... }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Grammar name for display |
| `version` | string | Semantic version |
| `identifier` | string | Message type identifier that triggers this grammar |
| `tokens` | object | Token definitions |
| `structure` | array | Structure rules (message format definition) |
| `suggestions` | object | Autocompletion suggestions |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Detailed description |
| `multiline` | boolean | Enable multiline mode |
| `templateMode` | boolean | Enable template/column mode (VAA/TCA) |
| `template` | object | Template definition (when templateMode=true) |
| `extends` | string | Parent grammar name for inheritance |
| `category` | string | Category for grouped grammars (e.g., "WS", "WV", "WC") |

---

## Grammar Inheritance

Grammars can inherit from a parent grammar using the `extends` property. This allows creating specialized variants that share common tokens, structure, and suggestions with the parent.

### How Inheritance Works

When a grammar specifies `extends: "parentName"`:

1. **Tokens**: Child tokens are merged with parent tokens. Child tokens override parent tokens with the same name.
2. **Structure**: If the child defines a `structure`, it replaces the parent's entirely. Otherwise, the parent's structure is inherited.
3. **Suggestions**:
   - Items are merged by token ID (child items override parent items for the same token ID)
   - After rules are merged (child keys override parent keys)
4. **Scalar properties**: Child values override parent values (name, version, description, etc.)

### Example: SIGMET Variants

The base SIGMET grammar contains all tokens and the full structure. Specialized grammars inherit from it:

**Base grammar (sigmet.oaci.en.json)**:
```json
{
  "name": "SIGMET",
  "version": "1.0.0",
  "identifier": "SIGMET",
  "tokens": { /* all SIGMET tokens */ },
  "structure": [ /* full structure */ ],
  "suggestions": {
    "items": { /* all phenomenon suggestions by token ID */ },
    "after": { /* all transition rules */ }
  }
}
```

**Specialized grammar (ws.oaci.en.json)**:
```json
{
  "name": "SIGMET WS",
  "version": "1.0.0",
  "description": "SIGMET for significant weather (excluding VA and TC)",
  "extends": "sigmet",
  "category": "WS",
  "suggestions": {
    "items": {
      "sigmet": [
        {
          "text": "AAAA SIGMET",
          "description": "SIGMET WS message (enter FIR code)",
          "editable": [{ "start": 0, "end": 4 }]
        }
      ]
    },
    "after": {
      "start": ["sigmet"],
      "fir": ["obscTs", "embdTs", "frqTs", "sqlTs", "sevTurb", "sevIce", "sevMtw", "hvyDs", "hvySs"]
    }
  }
}
```

### Category Property

The `category` property groups related grammars in the editor's suggestion submenu. For example:

- `ws.en.json`: `"category": "WS"` (Significant Weather)
- `wv.en.json`: `"category": "WV"` (Volcanic Ash)
- `wc.en.json`: `"category": "WC"` (Tropical Cyclone)

This creates a nested submenu structure:

```
SIGMET ▶
  ├── WS ▶ AAAA SIGMET, LFFF SIGMET, ...
  ├── WV ▶ AAAA SIGMET, LFFF SIGMET, ...
  └── WC ▶ AAAA SIGMET, LFFF SIGMET, ...
```

### Resolving Inheritance

The parser resolves inheritance when `resolveInheritance()` is called after all grammars are registered:

```javascript
const parser = new TacParser();

// Register all grammars (including parent and children)
parser.registerGrammar('sigmet', sigmetGrammar);
parser.registerGrammar('ws', sigmetWsGrammar);
parser.registerGrammar('wv', sigmetWvGrammar);
parser.registerGrammar('wc', sigmetWcGrammar);

// Resolve inheritance for all grammars
parser.resolveInheritance();
```

### Circular Inheritance Detection

The parser detects and warns about circular inheritance chains:

```javascript
// This would trigger a warning:
// grammarA extends grammarB
// grammarB extends grammarA
```

---

## Grammar Modes

### Normal Mode (METAR, TAF, SIGMET)

Sequential parsing where tokens follow each other on a single line or with automatic wrapping.

```json
{
  "identifier": "METAR",
  "tokens": { ... },
  "structure": [ ... ],
  "suggestions": { ... }
}
```

### Template Mode (VAA, TCA)

Column-based layout with labels on the left and values on the right.

```json
{
  "identifier": "VA ADVISORY",
  "multiline": true,
  "templateMode": true,
  "template": {
    "labelColumnWidth": 22,
    "fields": [ ... ]
  },
  "tokens": { ... },
  "suggestions": { ... }
}
```

---

## Tokens Definition

Tokens are the basic building blocks. Each token has a pattern (regex) and a style.

```json
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
  },
  "datetime": {
    "pattern": "^\\d{6}Z$",
    "style": "datetime",
    "description": "Day and time DDHHmmZ"
  }
}
```

### Token Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `pattern` | string | Yes | Regular expression (anchored with ^ and $) |
| `style` | string | Yes | CSS class suffix for highlighting |
| `description` | string | No | Human-readable description |

### Available Styles

| Style | Description | Example |
|-------|-------------|---------|
| `keyword` | Keywords and identifiers | METAR, SPECI, NIL |
| `location` | Location codes | LFPG, EGLL |
| `datetime` | Date/time values | 160800Z |
| `wind` | Wind information | 24015KT |
| `visibility` | Visibility values | 9999, CAVOK |
| `weather` | Weather phenomena | +TSRA, BR |
| `cloud` | Cloud layers | FEW020, SCT040CB |
| `value` | Generic values | 1536M |
| `label` | Labels (template mode) | DTG:, VAAC: |
| `trend` | Trend indicators | BECMG, TEMPO |
| `supplementary` | Supplementary data | QNH, RMK |
| `remark` | Remarks content | RMK... |

---

## Structure Rules

The `structure` array defines the expected format of the message using a discriminated union pattern.

### Node Types

Structure nodes use discriminated unions based on the presence of specific properties:

| Node Type | Discriminant | Description |
|-----------|--------------|-------------|
| **StructureToken** | Has `id` only | References a token definition |
| **StructureOneOf** | Has `id` + `oneOf` | Choice between alternatives |
| **StructureSequence** | Has `id` + `sequence` | Nested group of nodes |

All nodes share:
- `id`: Identifier (token name for StructureToken, group name for others)
- `cardinality`: `[min, max]` occurrences

### Basic Structure

```json
"structure": [
  { "id": "identifier", "cardinality": [1, 1] },
  { "id": "correction", "cardinality": [0, 1] },
  { "id": "icao", "cardinality": [1, 1] },
  { "id": "datetime", "cardinality": [1, 1] }
]
```

### Cardinality

Cardinality uses the notation `[min, max]` to define how many times a token can appear:

| Cardinality | Meaning |
|-------------|---------|
| `[0, 1]` | Optional, at most once |
| `[1, 1]` | Required, exactly once |
| `[0, 5]` | Optional, up to 5 times |
| `[1, 5]` | Required, up to 5 times |
| `[0, null]` | Optional, unlimited |
| `[1, null]` | Required, unlimited |

**Note**: Cardinality is always required (no default value).

### Common Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Token name or group identifier |
| `cardinality` | [number, number\|null] | Yes | Min and max occurrences |
| `terminal` | boolean | No | Ends parsing if matched |
| `oneOf` | array | No* | Choice between alternatives (StructureOneOf) |
| `sequence` | array | No* | Nested node group (StructureSequence) |

*Presence of `oneOf` or `sequence` determines the node type.

### Choice (oneOf)

When multiple tokens are valid at a position, use `oneOf` with a named group:

```json
{
  "id": "visibilityGroup",
  "oneOf": [
    { "id": "visibility", "cardinality": [1, 1] },
    { "id": "visibilityNotAvailable", "cardinality": [1, 1] },
    { "id": "visibilitySM", "cardinality": [1, 1] }
  ],
  "cardinality": [1, 1]
}
```

### Nested Sequences

Complex structures with named nested sequences:

```json
{
  "id": "mainContent",
  "oneOf": [
    { "id": "nil", "terminal": true, "cardinality": [1, 1] },
    {
      "id": "body",
      "sequence": [
        { "id": "auto", "cardinality": [0, 1] },
        { "id": "wind", "cardinality": [1, 1] },
        { "id": "visibility", "cardinality": [1, 1] }
      ],
      "cardinality": [1, 1]
    }
  ],
  "cardinality": [1, 1]
}
```

### Repeating Tokens

For tokens that can appear multiple times:

```json
{ "id": "rvr", "cardinality": [0, 4] },
{ "id": "weather", "cardinality": [0, 3] },
{ "id": "cloud", "cardinality": [1, 4] },
{ "id": "remarkContent", "cardinality": [0, null] }
```

---

## Suggestions

Suggestions provide autocompletion options based on the token before the cursor.

### How It Works

1. The editor maintains a cache of parsed tokens (updated on each text change)
2. Using cursor position, it finds the token immediately before the cursor
3. It looks up `suggestions.after[tokenId]` to get the list of next token IDs
4. It resolves suggestion items from `suggestions.items[tokenId]` for each token ID

```
Text: "METAR LFPG |"
                 ↑ cursor at position 11

Cached tokens: [
  { text: "METAR", id: "identifier", start: 0, end: 5 },
  { text: "LFPG", id: "icao", start: 6, end: 10 }
]

1. Find token before cursor (pos 11) → "LFPG" (id: "icao")
2. Look up suggestions.after["icao"] → ["datetime"]
3. Look up suggestions.items["datetime"] for suggestion items
4. Show datetime suggestions
```

### Structure

Suggestions use an `items` + `after` pattern:

```json
"suggestions": {
  "items": {
    "identifier": [
      { "text": "METAR", "description": "Routine observation" },
      { "text": "SPECI", "description": "Special observation" }
    ],
    "icao": [
      { "text": "LFPG", "description": "Paris CDG" },
      { "text": "EGLL", "description": "London Heathrow" }
    ],
    "datetime": [
      {
        "text": "160800Z",
        "description": "Day and time DDHHmmZ",
        "editable": [{ "start": 0, "end": 6 }]
      }
    ],
    "auto": [
      { "text": "AUTO", "description": "Automated observation" }
    ]
  },
  "after": {
    "start": ["identifier"],
    "identifier": ["icao"],
    "icao": ["datetime"],
    "datetime": ["auto"]
  }
}
```

- **`items`**: Maps token IDs to arrays of suggestion items
- **`after`**: Maps token IDs to arrays of next token IDs that should be suggested

### Suggestion Items

Each item in `suggestions.items[tokenId]` defines a suggestion:

```json
{
  "text": "AUTO",
  "description": "Automated observation"
}
```

### Pattern-based Suggestion with Editable Regions

For values that follow a pattern but need user input:

```json
{
  "text": "160800Z",
  "description": "Day and time DDHHmmZ",
  "editable": [
    {
      "start": 0,
      "end": 6
    }
  ]
}
```

The `editable` property is now an **array** of editable regions, allowing multiple editable parts within a single suggestion.

### Category with Children

Group related suggestions using `type: "category"`:

```json
{
  "type": "category",
  "text": "ICAO Location",
  "description": "Airport codes",
  "children": [
    { "text": "LFPG", "description": "Paris CDG" },
    { "text": "EGLL", "description": "London Heathrow" },
    { "text": "EHAM", "description": "Amsterdam Schiphol" }
  ]
}
```

Children are defined inline in the `children` array.

### Suggestion Item Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | string | Yes | Text to insert |
| `description` | string | No | Tooltip description |
| `editable` | array | No | Array of editable region definitions |
| `type` | string | No | Special types: "skip", "category", "switchGrammar" |
| `children` | array | No | Child suggestions (for type: "category") |
| `provider` | string | No | External provider ID for suggestions |
| `prefix` | string | No | Prefix to prepend to provider suggestions |
| `suffix` | string | No | Suffix to append to provider suggestions |

### Special Suggestion Types

#### Skip Type

Skip this suggestion and move to next:

```json
{
  "type": "skip",
  "text": "---",
  "description": "Skip this field"
}
```

#### Category Type

Creates a submenu with children:

```json
{
  "type": "category",
  "text": "Weather Phenomena",
  "children": [
    { "text": "+TSRA", "description": "Heavy thunderstorm with rain" },
    { "text": "-RA", "description": "Light rain" }
  ]
}
```

#### Switch Grammar Type

Switch to a different grammar variant:

```json
{
  "type": "switchGrammar",
  "text": "SIGMET WS",
  "description": "Switch to Weather SIGMET",
  "grammarId": "ws"
}
```

### Token Definition Properties

Note: The `appendToPrevious` property is now defined on the **token definition** (in `tokens`), not on the suggestion:

```json
"tokens": {
  "correction": {
    "pattern": "^COR$",
    "style": "keyword",
    "description": "Correction indicator",
    "appendToPrevious": true
  }
}
```

---

## Editable Regions

Editable regions define selectable/modifiable parts of a suggestion. The `editable` property is an **array** of region definitions, allowing multiple editable parts.

```json
{
  "text": "24015KT",
  "description": "Wind dddffKT",
  "editable": [
    {
      "start": 0,
      "end": 5
    }
  ]
}
```

### Multiple Editable Regions

For suggestions with multiple editable parts:

```json
{
  "text": "N4830 E00230",
  "description": "Coordinates",
  "editable": [
    { "start": 1, "end": 5 },
    { "start": 7, "end": 12 }
  ]
}
```

### Editable Region Properties

| Property | Type | Description |
|----------|------|-------------|
| `start` | number | Start position (0-based) |
| `end` | number | End position (exclusive) |

When the user selects this suggestion:
1. The text is inserted
2. Characters from `start` to `end` of the first editable region are automatically selected
3. User can type to replace the selection

---

## Provider System

The provider system allows injecting external data into the TAC editor. There are two types of providers:

1. **Suggestion Providers**: Supply dynamic autocompletion suggestions (ICAO codes, volcano names, FIRs, etc.)
2. **Action Providers**: Supply values through external interaction (e.g., geometry input from a map)

---

### 1. Suggestion Providers

Suggestion Providers supply dynamic suggestion lists for autocompletion.

#### Grammar Declaration

In the grammar JSON file, a suggestion item references a provider via the `provider` property:

```json
{
  "text": "VOLCANO NAME",
  "description": "Volcano name",
  "provider": "vaa-volcano-name",
  "editable": [{ "start": 0, "end": 12 }]
}
```

#### Suggestion Item Properties for Providers

| Property | Type | Description |
|----------|------|-------------|
| `provider` | string | Unique provider ID to use |
| `prefix` | string | Prefix added to each provider suggestion |
| `suffix` | string | Suffix added to each provider suggestion |
| `text` | string | Text shown if no provider is registered (acts as placeholder) |

#### Prefix and Suffix Examples

| Use Case | Provider Returns | Grammar Config | Final Text |
|----------|------------------|----------------|------------|
| MWO location | `LFPW` | `suffix: "-"` | `LFPW-` |
| FIR SIGMET | `LFFF` | `suffix: " SIGMET"` | `LFFF SIGMET` |
| FIR AIRMET | `LFFF` | `suffix: " AIRMET"` | `LFFF AIRMET` |
| Code with prefix | `LFPG` | `prefix: "AD "` | `AD LFPG` |

This separation allows:
- **Providers** to return raw, reusable data
- **Grammars** to define context-specific formatting

#### Registering a Suggestion Provider (JavaScript)

```javascript
const editor = document.querySelector('tac-editor');

// Register a synchronous provider
const unsubscribe = editor.registerSuggestionProvider('vaa-volcano-name', {
  provider: (context) => {
    // Return an array of suggestions
    return [
      { text: 'KARYMSKY', description: 'Kamchatka, Russia' },
      { text: 'ETNA', description: 'Sicily, Italy' },
      { text: 'STROMBOLI', description: 'Aeolian Islands, Italy' }
    ];
  },
  replace: true  // Replace grammar suggestions (default: true)
});

// To unregister the provider later
unsubscribe();
```

#### Async Provider

```javascript
editor.registerSuggestionProvider('sigmet-fir-name', {
  provider: async (context) => {
    // Async API call
    const response = await fetch('/api/fir-list');
    const firs = await response.json();

    return firs.map(fir => ({
      text: fir.code,
      description: fir.name
    }));
  },
  replace: true
});
```

#### Context Passed to Provider

The provider receives a `context` object with the following information:

```typescript
interface SuggestionProviderContext {
  tokenType: string;      // Token type triggering the suggestion
  currentText: string;    // Full editor text
  cursorPosition: number; // Cursor position
  grammarName: string;    // Active grammar name
  prevTokenText?: string; // Previous token text (if available)
}
```

#### Suggestion Return Format

```typescript
interface ProviderSuggestion {
  text: string;              // Text to insert
  description?: string;      // Displayed description
  type?: string;             // Type for styling (e.g., 'location', 'datetime')
  editable?: {               // Editable region after insertion
    start: number;
    end: number;
    pattern?: string;
    description?: string;
  };
  appendToPrevious?: boolean; // Append without space
  skipToNext?: boolean;       // Automatically move to next
  newLineBefore?: boolean;    // Line break before
  children?: ProviderSuggestion[]; // Sub-suggestions (for categories)
  isCategory?: boolean;       // If true, shows a submenu
}
```

#### The `replace` Option

The `replace` option controls how provider suggestions are combined with grammar suggestions:

| `replace` | Behavior |
|-----------|----------|
| `true` (default) | Provider suggestions **replace** grammar suggestions |
| `false` | Provider suggestions are **added** after the placeholder |

```javascript
// Replace mode (default) - only provider suggestions appear
editor.registerSuggestionProvider('my-provider', {
  provider: (ctx) => [...],
  replace: true
});

// Append mode - placeholder + provider suggestions + grammar suggestions
editor.registerSuggestionProvider('my-provider', {
  provider: (ctx) => [...],
  replace: false
});
```

---

### 2. Action Providers

Action Providers allow obtaining a value through external interaction, such as geometry input from a map.

#### Grammar Declaration

```json
{
  "text": "N4830 E00230 - N4900 E00300 - ...",
  "description": "Draw geometry on map",
  "provider": "geometry-polygon"
}
```

#### Registering an Action Provider (JavaScript)

```javascript
// Provider that opens a map for geometry input
editor.registerProvider('geometry-polygon', async () => {
  // Open a modal map
  const result = await openMapModal({ type: 'polygon' });

  if (result.cancelled) {
    return null; // Cancelled - inserts placeholder
  }

  // Return formatted geometry
  return result.coordinates;
});
```

#### Difference from Suggestion Providers

| Aspect | Suggestion Provider | Action Provider |
|--------|---------------------|-----------------|
| Trigger | Autocomplete popup | Selecting a suggestion with `provider` |
| Return | List of suggestions | Single value |
| UI | List in editor | External (modal, map, etc.) |
| Editor state | Normal | Enters "waiting" state |

#### Handling the "waiting" State

When an Action Provider is called, the editor enters "waiting" state:

```javascript
// Editor emits event when entering/exiting waiting state
editor.addEventListener('state-change', (e) => {
  console.log('State:', e.detail.state); // 'editing' or 'waiting'
  console.log('Provider:', e.detail.providerType); // Provider type being awaited
});

// User can cancel waiting
editor.cancelWaiting();
```

---

### 3. Existing Providers in Grammars

Here are the providers referenced in current grammars:

| Provider ID | Used In | Description |
|-------------|---------|-------------|
| `taf-aerodrome-location-indicator` | TAF | Aerodrome ICAO codes |
| `report-aerodrome-location-indicator` | METAR/SPECI | Aerodrome ICAO codes |
| `sigmet-mwo-location-indicator` | SIGMET | MWO indicators |
| `sigmet-fir-name` | SIGMET | FIR names |
| `sigmet-va-volcano-name` | SIGMET WV | Volcano names (SIGMET) |
| `sigmet-tc-cyclone-name` | SIGMET WC | Cyclone names (SIGMET) |
| `airmet-fir-location-indicator` | AIRMET | AIRMET FIR indicators |
| `vaa-volcano-name` | VAA | Volcano names (VAA) |
| `tca-cyclone-name` | TCA | Cyclone names (TCA) |

---

### 4. Complete Example: Volcano Name Provider

**Grammar (fv.oaci.en.json)**:
```json
"suggestions": {
  "items": {
    "volcanoName": [
      {
        "text": "VOLCANO NAME",
        "description": "Volcano name",
        "provider": "vaa-volcano-name",
        "editable": [{ "start": 0, "end": 12 }]
      }
    ]
  },
  "after": {
    "vaEruption": ["volcanoName"]
  }
}
```

**Application**:
```javascript
// Volcano data (could come from an API)
const volcanoDatabase = [
  { name: 'KARYMSKY', location: 'Kamchatka, Russia', lat: 54.05, lon: 159.45 },
  { name: 'ETNA', location: 'Sicily, Italy', lat: 37.75, lon: 15.00 },
  { name: 'STROMBOLI', location: 'Aeolian Islands, Italy', lat: 38.79, lon: 15.21 },
  { name: 'SAKURAJIMA', location: 'Kyushu, Japan', lat: 31.58, lon: 130.67 }
];

// Register the provider
editor.registerSuggestionProvider('vaa-volcano-name', {
  provider: (context) => {
    return volcanoDatabase.map(v => ({
      text: v.name,
      description: v.location,
      type: 'location'
    }));
  },
  replace: true
});
```

**Result**: When the user reaches the volcano name field, they see a suggestion list with names and locations.

---

## Dynamic Defaults

Use `defaultsFunction` to generate context-aware default values at runtime.

### Simple Example (Current Date/Time)

```json
{
  "editable": {
    "start": 0,
    "end": 6,
    "pattern": "\\d{6}",
    "description": "DDHHmm",
    "defaultsFunction": "() => { const now = new Date(); const d = String(now.getUTCDate()).padStart(2, '0'); const h = String(now.getUTCHours()).padStart(2, '0'); const m = String(now.getUTCMinutes()).padStart(2, '0'); return [d + h + m + 'Z']; }"
  }
}
```

### Returning Multiple Options

```json
{
  "defaultsFunction": "() => { const now = new Date(); const d = String(now.getUTCDate()).padStart(2, '0'); const h = String(now.getUTCHours()).padStart(2, '0'); return [d + h + '00Z', d + h + '30Z']; }"
}
```

### Returning Categories

```json
{
  "defaultsFunction": "() => { return [{ text: 'Short TAF', isCategory: true, children: [{ text: '0606/0612', description: '6h validity', type: 'datetime' }] }]; }"
}
```

### Function Return Types

The function can return:

1. **Array of strings**: Simple suggestions
   ```javascript
   return ['160800Z', '160830Z'];
   ```

2. **Array of Suggestion objects**: With descriptions
   ```javascript
   return [
     { text: '160800Z', description: 'Current time', type: 'datetime' },
     { text: '160900Z', description: '+1 hour', type: 'datetime' }
   ];
   ```

3. **Categories with children**: Grouped suggestions
   ```javascript
   return [{
     text: 'Short TAF',
     isCategory: true,
     children: [
       { text: '0606/0612', description: '6h', type: 'datetime' }
     ]
   }];
   ```

---

## Template Mode (VAA/TCA)

Template mode creates a two-column layout with fixed labels on the left and editable values on the right.

### Configuration

```json
{
  "identifier": "VA ADVISORY",
  "multiline": true,
  "templateMode": true,
  "template": {
    "labelColumnWidth": 22,
    "fields": [
      {
        "label": "DTG:",
        "labelType": "dtgLabel",
        "valueType": "dtgValue",
        "required": true,
        "placeholder": "20080923/0130Z"
      },
      {
        "label": "VAAC:",
        "labelType": "vaacLabel",
        "valueType": "vaacValue",
        "required": true,
        "placeholder": "TOKYO"
      }
    ]
  }
}
```

### Template Properties

| Property | Type | Description |
|----------|------|-------------|
| `labelColumnWidth` | number | Width of label column in characters |
| `fields` | array | Field definitions |

### Field Properties

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Field label (e.g., "DTG:") |
| `labelType` | string | Token type for label styling |
| `valueType` | string | Token type for value styling |
| `required` | boolean | Whether field is mandatory |
| `placeholder` | string | Example value shown when empty |
| `multiline` | boolean | Allow multiple lines for value |

### Template Suggestions

Suggestions for template fields are defined in `suggestions.templateFields`:

```json
"suggestions": {
  "templateFields": {
    "DTG:": [
      {
        "pattern": "\\d{8}/\\d{4}Z",
        "placeholder": "20080923/0130Z",
        "description": "Date/time YYYYMMDD/HHmmZ",
        "type": "datetime",
        "editable": {
          "start": 0,
          "end": 14,
          "pattern": "\\d{8}/\\d{4}",
          "description": "Full date and time",
          "defaultsFunction": "() => { const now = new Date(); ... return [formatted]; }"
        }
      }
    ],
    "VAAC:": [
      { "text": "TOKYO", "description": "Tokyo VAAC", "type": "location" },
      { "text": "WASHINGTON", "description": "Washington VAAC", "type": "location" }
    ]
  }
}
```

### Rendered Output

Template mode renders as:

```
VA ADVISORY
DTG:                  20080923/0130Z
VAAC:                 TOKYO
VOLCANO:              KARYMSKY 300130
PSN:                  N5403 E15927
```

The label column (22 chars) is read-only; only values are editable.

---

## Token Validators

Validators perform semantic validation on tokens and display error messages as tooltips. They go beyond regex pattern matching to validate business rules.

### Defining a Validator in Grammar

Add the `validator` property to a token definition:

```json
"tokens": {
  "validityPeriod": {
    "pattern": "^\\d{4}\\/\\d{4}$",
    "style": "datetime",
    "description": "Validity period DDHH/DDHH",
    "validator": "DDHH/DDHH-short"
  }
}
```

### Built-in Validators

| Validator Name | Description | Error Example |
|----------------|-------------|---------------|
| `DDHH/DDHH-short` | TAF Short validity (≤12h) | "TAF Short validity must be ≤12 hours (got 18h)" |
| `DDHH/DDHH-long` | TAF Long validity (12-30h) | "TAF Long validity must be >12 hours (got 6h)" |

### Creating Custom Validators

Custom validators are defined in `src/tac-validators.ts`:

```typescript
export const MyCustomValidator: BuiltinValidator = {
  name: 'my-validator-name',
  pattern: 'grammarCode.*.*.tokenType',  // Pattern matching
  validate: (value: string, context: ValidatorContext) => {
    // Return error message string if invalid
    if (/* validation fails */) {
      return 'Error message displayed in tooltip';
    }
    // Return null if valid
    return null;
  }
};

// Register in BUILTIN_VALIDATORS array
export const BUILTIN_VALIDATORS: BuiltinValidator[] = [
  // ... existing validators
  MyCustomValidator
];
```

### Validator Context

The validator receives a context object:

```typescript
interface ValidatorContext {
  grammarCode: string;   // e.g., 'fc', 'ft', 'ws'
  standard: string;      // e.g., 'oaci', 'noaa'
  locale: string;        // e.g., 'en', 'fr'
  tokenType: string;     // Token type being validated
}
```

### Pattern Matching

Validators use patterns to match specific grammar/token combinations:

| Pattern | Matches |
|---------|---------|
| `fc.*.*.validityPeriod` | TAF Short validity period (any standard/locale) |
| `ft.*.*.validityPeriod` | TAF Long validity period |
| `*.oaci.*.icao` | ICAO tokens in OACI standard grammars |
| `ws.*.*.phenomenon` | SIGMET WS phenomenon tokens |

### Error Display

When a validator returns an error:
1. The token is highlighted with an error style (wavy underline)
2. Hovering over the token shows the error message as a tooltip
3. The error is included in the token's `error` property

---

## Best Practices

1. **Use anchored patterns**: Always use `^` and `$` in token patterns
2. **Provide descriptions**: Help users understand each token
3. **Group related suggestions**: Use categories for organization
4. **Add editable regions**: For pattern-based inputs
5. **Use dynamic defaults**: For date/time fields
6. **Follow WMO conventions**: Reference official documentation
7. **Test with real messages**: Validate against actual aviation data

---

## Examples

### Adding a New Token

```json
"tokens": {
  "myNewToken": {
    "pattern": "^NEW\\d{3}$",
    "style": "keyword",
    "description": "New custom token"
  }
}
```

### Adding a Suggestion Item with Editable Region

```json
"suggestions": {
  "items": {
    "datetime": [
      {
        "text": "160800Z",
        "description": "Day and time DDHHmmZ",
        "editable": [{ "start": 0, "end": 6 }]
      }
    ]
  },
  "after": {
    "icao": ["datetime"]
  }
}
```

### Creating a Category

```json
{
  "type": "category",
  "text": "Cloud Types",
  "description": "Select cloud coverage",
  "children": [
    { "text": "FEW", "description": "1-2 oktas" },
    { "text": "SCT", "description": "3-4 oktas" },
    { "text": "BKN", "description": "5-7 oktas" },
    { "text": "OVC", "description": "8 oktas" }
  ]
}
```

### Complete Grammar Snippet

```json
{
  "name": "Example Grammar",
  "version": "1.0.0",
  "identifier": "EXAMPLE",
  "tokens": {
    "identifier": {
      "pattern": "^EXAMPLE$",
      "style": "keyword"
    },
    "value": {
      "pattern": "^\\d{4}$",
      "style": "value"
    }
  },
  "structure": [
    { "id": "identifier", "cardinality": [1, 1] },
    { "id": "value", "cardinality": [1, 1] }
  ],
  "suggestions": {
    "items": {
      "identifier": [
        { "text": "EXAMPLE", "description": "Example message type" }
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
