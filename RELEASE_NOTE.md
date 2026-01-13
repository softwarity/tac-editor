# Release Notes

## Version 1.0.0 - January 2026

### METAR/SPECI (SA/SP) - Production Ready

This release marks the first production-ready version for METAR and SPECI message editing.

#### Features

- **Multi-Grammar Support** - Dynamically loads grammar based on message type detection
- **Syntax Highlighting** - Token-based coloring with configurable themes
- **Intelligent Autocompletion** - Context-aware suggestions based on grammar rules
- **Real-time Validation** - Immediate feedback on syntax errors
- **Word Wrap** - Automatic text wrapping at word boundaries
- **Dark/Light Themes** - Automatic theme detection via `color-scheme`
- **Zero Dependencies** - Pure Web Component, works with any framework

#### Recent Improvements

##### Editable Region Hints
- New `hint` property on editable regions provides contextual help below the input
- Wind elements now show hints: "Direction (°)", "Speed (kt)", "Gust (kt)"
- Wind variation shows hints: "Min direction (°)", "Max direction (°)"

##### User Experience
- Removed current line highlight for cleaner single-line editing
- Improved hint positioning to avoid overlap with selection
- Added tooltip on incomplete tokens (hover to see expected format)
- Added help cursor on incomplete tokens (consistent with error tokens)

##### Bug Fixes
- Fixed wind gust suggestions appearing when gust already present
- Fixed MIN_MAX prefix for wind direction values in suggestions

#### Supported Message Types

| Code | Message Type | Status |
|------|--------------|--------|
| SA | METAR | Production Ready |
| SP | SPECI | Production Ready |
| FT | TAF Long | In Development |
| FC | TAF Short | In Development |
| WS | SIGMET Weather | In Development |
| WV | SIGMET Volcanic Ash | In Development |
| WC | SIGMET Tropical Cyclone | In Development |
| WA | AIRMET | In Development |
| FV | VAA | In Development |
| FK | TCA | In Development |
| FN | SWXA | In Development |

#### Grammar Documentation

- GRAMMAR.en.md and GRAMMAR.fr.md updated with `hint` and `defaultsFunction` properties for editable regions

#### Known Limitations

- NOAA standard variant not yet fully implemented
- Other message types (TAF, SIGMET, AIRMET, VAA, TCA, SWXA) are in development

---

## Future Releases

### Planned for Version 1.1.0
- TAF Long (FT) and TAF Short (FC) support
- Change groups: BECMG, TEMPO, FM, PROB

### Planned for Version 1.2.0
- SIGMET (WS, WV, WC) and AIRMET (WA) support
- Geometry input for areas

### Planned for Version 1.3.0
- Advisory messages: VAA (FV), TCA (FK), SWXA (FN)
- Template mode for structured formats
