# TODO - TAC Editor

## Prochaines tâches

### 1. Intégration Map pour géométries

Objectif : Permettre la saisie de géométries (polygones, corridors, cercles) via une carte interactive pour les SIGMET/AIRMET.

- [ ] Créer un Action Provider `geometry-polygon` pour SIGMET/AIRMET
- [ ] Intégrer un composant carte (Leaflet, MapLibre, ou OpenLayers)
- [ ] Permettre le dessin de :
  - [ ] Polygones (WI area)
  - [ ] Corridors (WTN corridor)
  - [ ] Cercles (WTN radius)
  - [ ] Lignes (N OF LINE, S OF LINE)
- [ ] Formater les coordonnées en format TAC :
  - Exemple : `N4830 E00230 - N4900 E00300 - N4845 E00345`
- [ ] Gérer l'état "waiting" de l'éditeur pendant la saisie carte
- [ ] Afficher la FIR de contexte sur la carte (si disponible)

### 2. ✅ Revue des styles/tokens (FAIT)

**Principe clé** : Les styles doivent être **génériques** et non liés à une grammaire spécifique. On veut des couleurs cohérentes mais pas un arc-en-ciel bling-bling.

> **Complété le 2025-01-05** - Voir section "Fait récemment" pour les détails.

#### Problème actuel

Les styles actuels sont trop nombreux et liés au METAR :
- `wind`, `visibility`, `cloud` → trop spécifiques METAR
- `trend`, `supplementary`, `remark` → pourraient être regroupés
- Pas de style pour géométrie, statut, etc.

#### Analyse des grammaires - Regroupement proposé

Après analyse de toutes les grammaires (METAR, TAF, SIGMET, AIRMET, VAA, TCA), voici les **7 styles génériques** proposés :

| Style | Description | Exemples |
|-------|-------------|----------|
| `keyword` | Identifiants de message, mots-clés structurels | METAR, SPECI, TAF, SIGMET, AIRMET, NIL, AUTO, COR, AMD, CNL, BECMG, TEMPO, FM, PROB |
| `location` | Tout identifiant géographique | LFPG, LFFF FIR, ETNA, GLORIA, TOKYO VAAC, MIAMI TCAC |
| `datetime` | Dates, heures, périodes de validité | 041200Z, 0412/0512, 20250104/1200Z |
| `phenomenon` | Phénomènes météo et dangers | TS, +TSRA, SEV TURB, MOD ICE, VA CLD, TC, FG, BR, SN |
| `value` | Valeurs numériques, mesures | 9999, 24015KT, FL350, 1500M, SCT040, -05/M08 |
| `geometry` | Coordonnées, directions, zones | N4830 E00230, WI, NE, S OF N48, ENTIRE FIR |
| `status` | État, mouvement, évolution | OBS, FCST, MOV NE 20KT, STNR, NC, WKN, INTSF |

#### Mapping des anciens styles vers les nouveaux

| Ancien style | Nouveau style |
|--------------|---------------|
| `keyword` | `keyword` |
| `location` | `location` |
| `datetime` | `datetime` |
| `wind` | `value` |
| `visibility` | `value` |
| `weather` | `phenomenon` |
| `cloud` | `value` |
| `value` | `value` |
| `label` | `keyword` (ou garder pour template) |
| `trend` | `keyword` |
| `supplementary` | `value` |
| `remark` | `value` |

#### Tokens par grammaire → Style générique

**METAR/SPECI** :
- `identifier` (METAR, SPECI) → `keyword`
- `icao` (LFPG) → `location`
- `datetime` (041200Z) → `datetime`
- `wind` (24015KT) → `value`
- `visibility` (9999) → `value`
- `weather` (+TSRA, FG) → `phenomenon`
- `cloud` (SCT040CB) → `value`
- `temperature` (15/08) → `value`
- `qnh` (Q1013) → `value`
- `trend` (BECMG, TEMPO) → `keyword`

**TAF** :
- `taf` (TAF) → `keyword`
- `icao` → `location`
- `validity` (0412/0512) → `datetime`
- `wind`, `visibility`, `weather`, `cloud` → idem METAR
- `changeGroup` (BECMG, TEMPO, FM, PROB) → `keyword`

**SIGMET/AIRMET** :
- `sigmet`, `airmet` → `keyword`
- `firId`, `firName`, `mwoId` → `location`
- `sequenceNumber` → `value`
- `validity` → `datetime`
- `phenomenon` (OBSC TS, SEV TURB, VA CLD) → `phenomenon`
- `obs`, `fcst` → `status`
- `coordinates` (N4830 E00230) → `geometry`
- `movement` (MOV NE 20KT, STNR) → `status`
- `intensity` (NC, WKN, INTSF) → `status`
- `level` (FL350, SFC/FL200) → `value`

**VAA/TCA** :
- Labels (DTG:, VAAC:) → `keyword` ou `label` (à décider)
- `volcanoName`, `cycloneName` → `location`
- `position` (N5403 E15927) → `geometry`
- `movement` → `status`
- `ashCloud`, `forecast` → `phenomenon`

#### Variables CSS finales

```css
:host {
  /* 7 couleurs max - palette sobre */

  /* Mode sombre (défaut) */
  --tac-token-keyword: #569cd6;    /* bleu - structure */
  --tac-token-location: #4ec9b0;   /* cyan - lieux */
  --tac-token-datetime: #ce9178;   /* orange - temps */
  --tac-token-phenomenon: #c586c0; /* violet - phénomènes */
  --tac-token-value: #b5cea8;      /* vert clair - valeurs */
  --tac-token-geometry: #dcdcaa;   /* jaune - géométrie */
  --tac-token-status: #9cdcfe;     /* bleu clair - statut */
}

/* Mode clair - via prefers-color-scheme ou classe .light */
@media (prefers-color-scheme: light) {
  :host(:not(.dark)) {
    --tac-token-keyword: #0000ff;    /* bleu foncé */
    --tac-token-location: #008080;   /* teal */
    --tac-token-datetime: #a31515;   /* rouge brique */
    --tac-token-phenomenon: #800080; /* violet foncé */
    --tac-token-value: #098658;      /* vert foncé */
    --tac-token-geometry: #795e26;   /* marron */
    --tac-token-status: #0070c1;     /* bleu moyen */
  }
}

:host(.light) {
  --tac-token-keyword: #0000ff;
  --tac-token-location: #008080;
  --tac-token-datetime: #a31515;
  --tac-token-phenomenon: #800080;
  --tac-token-value: #098658;
  --tac-token-geometry: #795e26;
  --tac-token-status: #0070c1;
}
```

#### Tâches

- [ ] Définir les 7 styles génériques dans le CSS
- [ ] Gérer le mode light/dark :
  - [ ] Détecter `prefers-color-scheme` automatiquement
  - [ ] Permettre le forçage via classe `.light` ou `.dark`
  - [ ] Définir une palette lisible pour chaque mode
  - [ ] Tester le contraste (accessibilité WCAG AA minimum)
- [ ] Migrer tous les tokens des grammaires vers les nouveaux styles
- [ ] Supprimer les anciens styles spécifiques (wind, visibility, cloud, etc.)
- [ ] Tester le rendu sur tous les types de messages
- [ ] Documenter les variables CSS dans GRAMMAR.md

### 3. Tests approfondis

- [ ] METAR : tous les éléments (vent, visibilité, temps, nuages, tendances)
- [ ] SPECI : idem METAR
- [ ] TAF : validité Court/Long, groupes BECMG/TEMPO/FM/PROB
- [ ] SIGMET WS : phénomènes météo (OBSC TS, SEV TURB, etc.)
- [ ] SIGMET WV : cendres volcaniques, nom volcan via provider
- [ ] SIGMET WC : cyclones tropicaux, nom cyclone via provider
- [ ] AIRMET : tous les phénomènes (MOD TURB, MOD ICE, etc.)
- [ ] VAA : mode template, tous les champs
- [ ] TCA : mode template, tous les champs

### 4. Améliorations futures

- [x] Validation en temps réel avec messages d'erreur (validateurs TAF Short/Long)
- [ ] Export/Import de messages
- [ ] Historique des messages saisis
- [ ] Mode lecture seule avec highlighting
- [ ] Support mobile (touch events)
- [ ] Accessibilité (ARIA, navigation clavier)

---

## Audit du code (2026-01-08)

### Code mort supprimé

- [x] `TemplateDefinition` - import inutilisé (`tac-editor.ts:11`)
- [x] `_loadGrammarForType()` - fonction jamais appelée (~30 lignes)
- [x] `matchValidatorPattern` - import inutilisé (`tac-parser.ts:50`)
- [x] `_mergeStructure()` - fonction jamais appelée (~45 lignes)
- [x] `_flattenStructure()` - fonction jamais appelée (~30 lignes)
- [x] `_matchTokenStructureAware()` - fonction jamais appelée (~40 lignes)
- [x] `lineStart` - variable déclarée mais jamais lue
- [x] `ruleIndex` - paramètre inutilisé dans `_matchToken()`
- [x] `_buildFirSubmenuForConfig()` - fonction jamais appelée (~45 lignes)

**Impact** : ~2kB de réduction du bundle (118.17 kB → 116.22 kB)

### Points de complexité identifiés (à refactorer)

| Fichier | Fonction | Lignes | Problème |
|---------|----------|--------|----------|
| `tac-editor.ts` | `_applySuggestion()` | ~200 | Trop de branches (skip, category, editable, tacCode, switchGrammar, provider, template, appendToPrevious, newLineBefore) |
| `tac-editor.ts` | `_handleSuggestionsKeyDown()` | ~65 | Switch avec beaucoup de cas |
| `tac-editor.ts` | `renderViewport()` | ~150 | Logique de rendu complexe |
| `tac-parser.ts` | `_tokenizeTemplate()` | ~250 | Parsing ligne par ligne avec beaucoup de conditions |
| `tac-parser.ts` | `_buildSuggestionsFromItems()` | ~150 | Logique récursive complexe |

**Recommandation** : Extraire des sous-fonctions pour réduire la complexité cyclomatique.

### Points de sécurité identifiés

| Niveau | Fichier | Ligne | Problème | Recommandation |
|--------|---------|-------|----------|----------------|
| ⚠️ MOYEN | `tac-editor.ts` | 4180 | `new Function()` exécute `defaultsFunction` des grammaires | Valider/sandboxer le code ou utiliser une liste blanche de fonctions |
| ✅ OK | `tac-editor.ts` | divers | `innerHTML` utilisé | `_escapeHtml()` est défini et semble utilisé correctement |

**Note** : La fonction `defaultsFunction` vient des fichiers JSON de grammaire. Si ces fichiers sont contrôlés par le développeur, le risque est faible. Si les grammaires peuvent être chargées depuis des sources externes non fiables, c'est une vulnérabilité d'injection de code.

### Non-conformité WMO / Fonctionnalités manquantes

| Type | Problème | WMO Ref |
|------|----------|---------|
| ❌ SIGMET/AIRMET | Géométries (polygones, corridors, cercles) non implémentées | Table A6-1A |
| ❌ SIGMET/AIRMET | Coordonnées saisies manuellement, pas de carte | - |
| ⚠️ SIGMET WS | Grammaires incomplètes (fichiers en non-compliant) | Table A6-1A |
| ⚠️ SIGMET WV | Grammaires incomplètes | Table A6-1A |
| ⚠️ SIGMET WC | Grammaires incomplètes | Table A6-1A |
| ⚠️ AIRMET | Grammaires incomplètes | Table A6-1A |
| ⚠️ SWXA | Template mode implémenté mais non testé en profondeur | Table A2-3 |

### Cache amélioré (implémenté)

- [x] Support de `cache: boolean | number | 'minute' | 'hour' | 'day'`
- [x] Expiration par TTL (nombre de millisecondes)
- [x] Expiration par alignement horaire (`'minute'`, `'hour'`, `'day'`)
- [x] Demo mise à jour avec `cache: 'hour'` pour le provider Wind

---

## Fait récemment

### 2026-01-09

- [x] **Word Wrap automatique** :
  - [x] Retour à la ligne automatique aux limites de mots
  - [x] Mesure dynamique de la largeur des caractères (`_measureCharWidth()`)
  - [x] Navigation curseur haut/bas sur lignes visuelles wrappées
  - [x] Popup suggestions positionnée correctement sur lignes wrappées
  - [x] Font monospace forcée pour assurer la cohérence du calcul

- [x] **Audit documentation** :
  - [x] Mise à jour README.md (SWXA, word wrap, multi-standard)
  - [x] Vérification CLAUDE.md (538 tests validés)
  - [x] Mise à jour DEVELOPMENT.md (TypeScript, nouvelle structure grammaires)
  - [x] Vérification GRAMMAR.en.md et GRAMMAR.fr.md

### 2026-01-08

- [x] **Validateurs TAF Short/Long** :
  - [x] Création de `TAFShortValidityValidator` (validité ≤12h)
  - [x] Création de `TAFLongValidityValidator` (validité 12-30h)
  - [x] Propriété `validator` sur les tokens dans la grammaire
  - [x] Affichage des erreurs en tooltip (soulignement ondulé)
  - [x] Fix du maintien de la grammaire switchée pendant l'édition
  - [x] Documentation des validateurs dans GRAMMAR.en.md et GRAMMAR.fr.md

- [x] **defaultsFunction sur les suggestions** :
  - [x] Support de `defaultsFunction` directement sur les items de suggestion
  - [x] Génération dynamique des périodes de validité TAF (6h, 9h, 12h, etc.)
  - [x] Mise à jour de toutes les grammaires avec les defaultsFunction

### 2025-01-06

- [x] **Step-by-step pour les nuages (clouds)** :
  - [x] Tokens intermédiaires : `cloudAmount` (FEW/SCT/BKN/OVC), `cloudBase` (amount+height)
  - [x] Suggestions step-by-step : amount → height → type (CB/TCU/skip)
  - [x] `appendToPrevious: true` pour coller les parties sans espace
  - [x] `skipToNext: true` pour passer au token suivant sans rien insérer
  - [x] Appliqué aux 3 grammaires : EN, FR, NOAA

- [x] **Step-by-step pour wind/RVR/temp** - ⚠️ ANNULÉ :
  - Implémenté puis retiré car trop confus (ex: "360", "270" sans contexte après la date)
  - Décision : garder les suggestions classiques éditables pour ces tokens

- [x] **Organisation des fichiers TAC de test** :
  - [x] Structure par type (SA, SP, FC, FT, WS, WV, WC, WA, FV, FK)
  - [x] Sous-dossiers par standard : `oaci/`, `noaa/`, `non-compliant/`
  - [x] 852 fichiers TAC triés au total
  - [x] README.md dans chaque dossier `non-compliant/` avec explications en français

- [x] **Mise à jour des tests TAC** :
  - [x] `web-test-runner.config.js` : plugin tacFilesPlugin adapté à la nouvelle structure
  - [x] `tac-files.test.js` : tests par type et standard (oaci/noaa séparés)
  - [x] Tests de validation par paste fonctionnels
  - [x] SA: 19 oaci + 3 noaa ✓
  - [x] SP: 18 oaci + 1 noaa ✓
  - [x] FC: 120 oaci ✓
  - [x] FT: 371 oaci ✓
  - [x] FV: 1 oaci ✓
  - [x] FK: 3 oaci ✓
  - [x] WS/WV/WC/WA: en non-compliant (grammaires incomplètes)

### 2025-01-05

- [x] **Revue complète des styles/tokens** :
  - [x] 10 styles génériques : keyword, location, datetime, phenomenon, value, geometry, status, label, free-text, trend
  - [x] Thème par défaut IntelliJ (Light/Darcula) intégré dans tac-editor.css
  - [x] Système de thèmes externes : VS Code, Monokai, GitHub, Solarized
  - [x] Mode light/dark automatique via `light-dark()` CSS
  - [x] Demo avec sélecteur de thèmes et modal CSS
  - [x] Migration de toutes les grammaires vers les nouveaux styles
  - [x] Approche `<link>` + `fetch()` pour compatibilité Vite/non-Vite

### 2025-01-04

- [x] Ajout provider `vaa-volcano-name` pour VAA
- [x] Ajout provider `tca-cyclone-name` pour TCA
- [x] Correction des placeholders (KARYMSKY → NOM VOLCAN, GLORIA → CYCLONE NAME)
- [x] AIRMET coché par défaut dans la démo
- [x] Documentation complète du système de providers (GRAMMAR.fr.md, GRAMMAR.en.md)
- [x] Refactoring TAF : entrée unique "TAF" avec choix Court/Long à la validité
- [x] Fix bug popup suggestions après suppression de sélection

---

## Notes techniques

### Providers existants

| Provider ID | Grammaire | Description |
|-------------|-----------|-------------|
| `taf-aerodrome-location-indicator` | TAF | Codes ICAO aérodromes |
| `report-aerodrome-location-indicator` | METAR/SPECI | Codes ICAO aérodromes |
| `sigmet-mwo-location-indicator` | SIGMET | Indicateurs MWO |
| `sigmet-fir-name` | SIGMET | Noms des FIR |
| `sigmet-va-volcano-name` | SIGMET WV | Noms de volcans |
| `sigmet-tc-cyclone-name` | SIGMET WC | Noms de cyclones |
| `airmet-fir-location-indicator` | AIRMET | Indicateurs FIR |
| `vaa-volcano-name` | VAA | Noms de volcans |
| `tca-cyclone-name` | TCA | Noms de cyclones |

### Providers à créer

| Provider ID | Grammaire | Description |
|-------------|-----------|-------------|
| `geometry-polygon` | SIGMET/AIRMET | Saisie polygone sur carte |
| `geometry-corridor` | SIGMET/AIRMET | Saisie corridor sur carte |
| `geometry-circle` | SIGMET/AIRMET | Saisie cercle sur carte |
