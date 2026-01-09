# Guide de Rédaction des Grammaires

Ce document décrit comment écrire les fichiers de grammaire pour le composant TAC Editor. Les grammaires définissent la syntaxe, les tokens, les règles de validation et les suggestions pour les messages de météorologie aéronautique.

## Table des matières

1. [Structure des fichiers](#structure-des-fichiers)
2. [Héritage des grammaires](#héritage-des-grammaires)
3. [Modes de grammaire](#modes-de-grammaire)
4. [Définition des tokens](#définition-des-tokens)
5. [Règles de structure](#règles-de-structure)
6. [Suggestions](#suggestions)
7. [Régions éditables](#régions-éditables)
8. [Système de Providers](#système-de-providers-fournisseurs)
9. [Valeurs par défaut dynamiques](#valeurs-par-défaut-dynamiques)
10. [Mode Template (VAA/TCA)](#mode-template-vaatca)
11. [Validateurs de Tokens](#validateurs-de-tokens)

---

## Structure des fichiers

Les fichiers de grammaire sont des fichiers JSON situés dans `grammars/`. Chaque fichier suit cette structure :

```json
{
  "name": "TYPE_MESSAGE",
  "version": "1.0.0",
  "description": "Description du format de message",
  "identifier": "METAR",
  "tokens": { ... },
  "structure": [ ... ],
  "suggestions": { ... }
}
```

### Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom de la grammaire pour l'affichage |
| `version` | string | Version sémantique |
| `identifier` | string | Identifiant de type de message qui déclenche cette grammaire |
| `tokens` | object | Définitions des tokens |
| `structure` | array | Règles de structure (définition du format du message) |
| `suggestions` | object | Suggestions d'autocomplétion |

### Champs optionnels

| Champ | Type | Description |
|-------|------|-------------|
| `description` | string | Description détaillée |
| `multiline` | boolean | Active le mode multiligne |
| `templateMode` | boolean | Active le mode template/colonnes (VAA/TCA) |
| `template` | object | Définition du template (quand templateMode=true) |
| `extends` | string | Nom de la grammaire parente pour l'héritage |
| `category` | string | Catégorie pour le regroupement (ex: "WS", "WV", "WC") |

---

## Héritage des grammaires

Les grammaires peuvent hériter d'une grammaire parente via la propriété `extends`. Cela permet de créer des variantes spécialisées qui partagent les tokens, la structure et les suggestions communes avec le parent.

### Fonctionnement de l'héritage

Quand une grammaire spécifie `extends: "nomParent"` :

1. **Tokens** : Les tokens enfant sont fusionnés avec les tokens parent. Les tokens enfant remplacent les tokens parent de même nom.
2. **Structure** : Si l'enfant définit une `structure`, elle remplace entièrement celle du parent. Sinon, la structure du parent est héritée.
3. **Suggestions** :
   - Les items sont fusionnés par ID de token (les items enfant remplacent les items parent pour le même ID de token)
   - Les règles after sont fusionnées (les clés enfant remplacent les clés parent)
4. **Propriétés scalaires** : Les valeurs enfant remplacent les valeurs parent (name, version, description, etc.)

### Exemple : Variantes SIGMET

La grammaire de base SIGMET contient tous les tokens et la structure complète. Les grammaires spécialisées en héritent :

**Grammaire de base (sigmet.oaci.fr.json)** :
```json
{
  "name": "SIGMET",
  "version": "1.0.0",
  "identifier": "SIGMET",
  "tokens": { /* tous les tokens SIGMET */ },
  "structure": [ /* structure complète */ ],
  "suggestions": {
    "items": { /* toutes les suggestions de phénomènes par ID de token */ },
    "after": { /* toutes les règles de transition */ }
  }
}
```

**Grammaire spécialisée (ws.oaci.fr.json)** :
```json
{
  "name": "SIGMET WS",
  "version": "1.0.0",
  "description": "SIGMET pour phénomènes météo significatifs (hors VA et TC)",
  "extends": "sigmet",
  "category": "WS",
  "suggestions": {
    "items": {
      "sigmet": [
        {
          "text": "AAAA SIGMET",
          "description": "Message SIGMET WS (entrer code FIR)",
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

### Propriété category

La propriété `category` regroupe les grammaires associées dans le sous-menu de suggestions de l'éditeur. Par exemple :

- `ws.fr.json` : `"category": "WS"` (Significant Weather - Phénomènes significatifs)
- `wv.fr.json` : `"category": "WV"` (Volcanic Ash - Cendres volcaniques)
- `wc.fr.json` : `"category": "WC"` (Tropical Cyclone - Cyclones tropicaux)

Cela crée une structure de sous-menus imbriqués :

```
SIGMET ▶
  ├── WS ▶ AAAA SIGMET, LFFF SIGMET, ...
  ├── WV ▶ AAAA SIGMET, LFFF SIGMET, ...
  └── WC ▶ AAAA SIGMET, LFFF SIGMET, ...
```

### Résolution de l'héritage

Le parser résout l'héritage quand `resolveInheritance()` est appelé après l'enregistrement de toutes les grammaires :

```javascript
const parser = new TacParser();

// Enregistrer toutes les grammaires (parent et enfants)
parser.registerGrammar('sigmet', sigmetGrammar);
parser.registerGrammar('ws', sigmetWsGrammar);
parser.registerGrammar('wv', sigmetWvGrammar);
parser.registerGrammar('wc', sigmetWcGrammar);

// Résoudre l'héritage pour toutes les grammaires
parser.resolveInheritance();
```

### Détection des héritages circulaires

Le parser détecte et signale les chaînes d'héritage circulaires :

```javascript
// Ceci déclencherait un avertissement :
// grammaireA extends grammaireB
// grammaireB extends grammaireA
```

---

## Modes de grammaire

### Mode Normal (METAR, TAF, SIGMET)

Parsing séquentiel où les tokens se suivent sur une seule ligne ou avec retour à la ligne automatique.

```json
{
  "identifier": "METAR",
  "tokens": { ... },
  "structure": [ ... ],
  "suggestions": { ... }
}
```

### Mode Template (VAA, TCA)

Disposition en colonnes avec les labels à gauche et les valeurs à droite.

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

## Définition des tokens

Les tokens sont les éléments de base. Chaque token a un pattern (regex) et un style.

```json
"tokens": {
  "identifier": {
    "pattern": "^(METAR|SPECI)$",
    "style": "keyword",
    "description": "Identifiant du type de message"
  },
  "icao": {
    "pattern": "^[A-Z]{4}$",
    "style": "location",
    "description": "Code OACI de l'aéroport"
  },
  "datetime": {
    "pattern": "^\\d{6}Z$",
    "style": "datetime",
    "description": "Jour et heure JJHHmmZ"
  }
}
```

### Propriétés des tokens

| Propriété | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `pattern` | string | Oui | Expression régulière (ancrée avec ^ et $) |
| `style` | string | Oui | Suffixe de classe CSS pour la coloration |
| `description` | string | Non | Description lisible |

### Styles disponibles

| Style | Description | Exemple |
|-------|-------------|---------|
| `keyword` | Mots-clés et identifiants | METAR, SPECI, NIL |
| `location` | Codes de localisation | LFPG, EGLL |
| `datetime` | Valeurs date/heure | 160800Z |
| `wind` | Information vent | 24015KT |
| `visibility` | Valeurs de visibilité | 9999, CAVOK |
| `weather` | Phénomènes météo | +TSRA, BR |
| `cloud` | Couches nuageuses | FEW020, SCT040CB |
| `value` | Valeurs génériques | 1536M |
| `label` | Labels (mode template) | DTG:, VAAC: |
| `trend` | Indicateurs de tendance | BECMG, TEMPO |
| `supplementary` | Données supplémentaires | QNH, RMK |
| `remark` | Contenu des remarques | RMK... |

---

## Règles de structure

Le tableau `structure` définit le format attendu du message en utilisant un pattern d'union discriminée.

### Types de nœuds

Les nœuds de structure utilisent des unions discriminées basées sur la présence de propriétés spécifiques :

| Type de nœud | Discriminant | Description |
|--------------|--------------|-------------|
| **StructureToken** | A seulement `id` | Référence une définition de token |
| **StructureOneOf** | A `id` + `oneOf` | Choix entre alternatives |
| **StructureSequence** | A `id` + `sequence` | Groupe imbriqué de nœuds |

Tous les nœuds partagent :
- `id` : Identifiant (nom du token pour StructureToken, nom du groupe pour les autres)
- `cardinality` : Occurrences `[min, max]`

### Structure basique

```json
"structure": [
  { "id": "identifier", "cardinality": [1, 1] },
  { "id": "correction", "cardinality": [0, 1] },
  { "id": "icao", "cardinality": [1, 1] },
  { "id": "datetime", "cardinality": [1, 1] }
]
```

### Cardinalité

La cardinalité utilise la notation `[min, max]` pour définir combien de fois un token peut apparaître :

| Cardinalité | Signification |
|-------------|---------------|
| `[0, 1]` | Optionnel, une fois maximum |
| `[1, 1]` | Obligatoire, exactement une fois |
| `[0, 5]` | Optionnel, jusqu'à 5 fois |
| `[1, 5]` | Obligatoire, jusqu'à 5 fois |
| `[0, null]` | Optionnel, illimité |
| `[1, null]` | Obligatoire, illimité |

**Note** : La cardinalité est toujours requise (pas de valeur par défaut).

### Propriétés communes

| Propriété | Type | Requis | Description |
|-----------|------|--------|-------------|
| `id` | string | Oui | Nom du token ou identifiant de groupe |
| `cardinality` | [number, number\|null] | Oui | Occurrences min et max |
| `terminal` | boolean | Non | Termine le parsing si correspondance |
| `oneOf` | array | Non* | Choix entre alternatives (StructureOneOf) |
| `sequence` | array | Non* | Groupe de nœuds imbriqué (StructureSequence) |

*La présence de `oneOf` ou `sequence` détermine le type de nœud.

### Choix (oneOf)

Quand plusieurs tokens sont valides à une position, utilisez `oneOf` avec un groupe nommé :

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

### Séquences imbriquées

Structures complexes avec séquences imbriquées nommées :

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

### Tokens répétitifs

Pour les tokens qui peuvent apparaître plusieurs fois :

```json
{ "id": "rvr", "cardinality": [0, 4] },
{ "id": "weather", "cardinality": [0, 3] },
{ "id": "cloud", "cardinality": [1, 4] },
{ "id": "remarkContent", "cardinality": [0, null] }
```

---

## Suggestions

Les suggestions fournissent les options d'autocomplétion basées sur le token avant le curseur.

### Comment ça fonctionne

1. L'éditeur maintient un cache des tokens parsés (mis à jour à chaque modification du texte)
2. Avec la position du curseur, il trouve le token juste avant le curseur
3. Il cherche `suggestions.after[tokenId]` pour obtenir la liste des IDs de tokens suivants
4. Il résout les suggestions depuis `suggestions.items[tokenId]` pour chaque ID de token

```
Texte: "METAR LFPG |"
                  ↑ curseur à la position 11

Tokens en cache: [
  { text: "METAR", id: "identifier", start: 0, end: 5 },
  { text: "LFPG", id: "icao", start: 6, end: 10 }
]

1. Trouve le token avant le curseur (pos 11) → "LFPG" (id: "icao")
2. Cherche suggestions.after["icao"] → ["datetime"]
3. Cherche suggestions.items["datetime"] pour les suggestions
4. Affiche les suggestions de datetime
```

### Structure

Les suggestions utilisent un pattern `items` + `after` :

```json
"suggestions": {
  "items": {
    "identifier": [
      { "text": "METAR", "description": "Observation de routine" },
      { "text": "SPECI", "description": "Observation spéciale" }
    ],
    "icao": [
      { "text": "LFPG", "description": "Paris CDG" },
      { "text": "EGLL", "description": "Londres Heathrow" }
    ],
    "datetime": [
      {
        "text": "160800Z",
        "description": "Jour et heure JJHHmmZ",
        "editable": [{ "start": 0, "end": 6 }]
      }
    ],
    "auto": [
      { "text": "AUTO", "description": "Observation automatique" }
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

- **`items`** : Associe les IDs de tokens aux tableaux de suggestions
- **`after`** : Associe les IDs de tokens aux tableaux d'IDs de tokens suivants

### Éléments de suggestion

Chaque élément dans `suggestions.items[tokenId]` définit une suggestion :

```json
{
  "text": "AUTO",
  "description": "Observation automatique"
}
```

### Suggestion avec régions éditables

Pour les valeurs qui suivent un pattern mais nécessitent une saisie utilisateur :

```json
{
  "text": "160800Z",
  "description": "Jour et heure JJHHmmZ",
  "editable": [
    {
      "start": 0,
      "end": 6
    }
  ]
}
```

La propriété `editable` est maintenant un **tableau** de régions éditables, permettant plusieurs parties éditables dans une seule suggestion.

### Catégorie avec enfants

Regrouper les suggestions liées avec `type: "category"` :

```json
{
  "type": "category",
  "text": "Localisation OACI",
  "description": "Codes aéroport",
  "children": [
    { "text": "LFPG", "description": "Paris CDG" },
    { "text": "EGLL", "description": "Londres Heathrow" },
    { "text": "EHAM", "description": "Amsterdam Schiphol" }
  ]
}
```

Les enfants sont définis en ligne dans le tableau `children`.

### Propriétés des éléments de suggestion

| Propriété | Type | Requis | Description |
|-----------|------|--------|-------------|
| `text` | string | Oui | Texte à insérer |
| `description` | string | Non | Description dans l'infobulle |
| `editable` | array | Non | Tableau de définitions de régions éditables |
| `type` | string | Non | Types spéciaux : "skip", "category", "switchGrammar" |
| `children` | array | Non | Suggestions enfants (pour type: "category") |
| `provider` | string | Non | ID du fournisseur externe pour les suggestions |
| `prefix` | string | Non | Préfixe à ajouter aux suggestions du fournisseur |
| `suffix` | string | Non | Suffixe à ajouter aux suggestions du fournisseur |

### Types de suggestions spéciaux

#### Type Skip

Sauter cette suggestion et passer à la suivante :

```json
{
  "type": "skip",
  "text": "---",
  "description": "Sauter ce champ"
}
```

#### Type Category

Crée un sous-menu avec des enfants :

```json
{
  "type": "category",
  "text": "Phénomènes météo",
  "children": [
    { "text": "+TSRA", "description": "Orage fort avec pluie" },
    { "text": "-RA", "description": "Pluie légère" }
  ]
}
```

#### Type Switch Grammar

Basculer vers une variante de grammaire différente :

```json
{
  "type": "switchGrammar",
  "text": "SIGMET WS",
  "description": "Basculer vers SIGMET Weather",
  "grammarId": "ws"
}
```

### Propriétés des définitions de tokens

Note : La propriété `appendToPrevious` est maintenant définie sur la **définition du token** (dans `tokens`), pas sur la suggestion :

```json
"tokens": {
  "correction": {
    "pattern": "^COR$",
    "style": "keyword",
    "description": "Indicateur de correction",
    "appendToPrevious": true
  }
}
```

---

## Régions éditables

Les régions éditables définissent les parties sélectionnables/modifiables d'une suggestion. La propriété `editable` est un **tableau** de définitions de régions, permettant plusieurs parties éditables.

```json
{
  "text": "24015KT",
  "description": "Vent dddffKT",
  "editable": [
    {
      "start": 0,
      "end": 5
    }
  ]
}
```

### Régions éditables multiples

Pour les suggestions avec plusieurs parties éditables :

```json
{
  "text": "N4830 E00230",
  "description": "Coordonnées",
  "editable": [
    { "start": 1, "end": 5 },
    { "start": 7, "end": 12 }
  ]
}
```

### Propriétés des régions éditables

| Propriété | Type | Description |
|-----------|------|-------------|
| `start` | number | Position de début (base 0) |
| `end` | number | Position de fin (exclusive) |

Quand l'utilisateur sélectionne cette suggestion :
1. Le texte est inséré
2. Les caractères de `start` à `end` de la première région éditable sont automatiquement sélectionnés
3. L'utilisateur peut taper pour remplacer la sélection

---

## Système de Providers (Fournisseurs)

Le système de providers permet d'injecter des données externes dans l'éditeur TAC. Il existe deux types de providers :

1. **Suggestion Providers** : Fournissent des suggestions d'autocomplétion dynamiques (codes ICAO, noms de volcans, FIR, etc.)
2. **Action Providers** : Fournissent des valeurs via une interaction externe (ex: saisie de géométrie sur une carte)

---

### 1. Suggestion Providers

Les Suggestion Providers fournissent des listes de suggestions dynamiques pour l'autocomplétion.

#### Déclaration dans la grammaire

Dans le fichier JSON de grammaire, un élément de suggestion référence un provider via la propriété `provider` :

```json
{
  "text": "NOM VOLCAN",
  "description": "Nom du volcan",
  "provider": "vaa-volcano-name",
  "editable": [{ "start": 0, "end": 10 }]
}
```

#### Propriétés des éléments de suggestion pour les providers

| Propriété | Type | Description |
|-----------|------|-------------|
| `provider` | string | ID unique du provider à utiliser |
| `prefix` | string | Préfixe ajouté à chaque suggestion du provider |
| `suffix` | string | Suffixe ajouté à chaque suggestion du provider |
| `text` | string | Texte affiché si aucun provider n'est enregistré (placeholder) |

#### Exemples de préfixe et suffixe

| Cas d'usage | Provider retourne | Config grammaire | Texte final |
|-------------|-------------------|------------------|-------------|
| MWO location | `LFPW` | `suffix: "-"` | `LFPW-` |
| FIR SIGMET | `LFFF` | `suffix: " SIGMET"` | `LFFF SIGMET` |
| FIR AIRMET | `LFFF` | `suffix: " AIRMET"` | `LFFF AIRMET` |
| Code avec préfixe | `LFPG` | `prefix: "AD "` | `AD LFPG` |

Cette séparation permet :
- **Providers** : retourner des données brutes réutilisables
- **Grammaires** : définir le formatage spécifique au contexte

#### Enregistrement d'un Suggestion Provider (JavaScript)

```javascript
const editor = document.querySelector('tac-editor');

// Enregistrement d'un provider synchrone
const unsubscribe = editor.registerSuggestionProvider(
  'vaa-volcano-name',
  (context) => {
    // Retourne un tableau de suggestions
    return [
      { text: 'KARYMSKY', description: 'Kamchatka, Russia' },
      { text: 'ETNA', description: 'Sicily, Italy' },
      { text: 'STROMBOLI', description: 'Aeolian Islands, Italy' }
    ];
  },
  { replace: true }  // Remplace les suggestions de la grammaire (défaut: true)
);

// Pour désinscrire le provider plus tard
unsubscribe();
```

#### Provider asynchrone

```javascript
editor.registerSuggestionProvider(
  'sigmet-fir-name',
  async (context) => {
    // Appel API asynchrone
    const response = await fetch('/api/fir-list');
    const firs = await response.json();

    return firs.map(fir => ({
      text: fir.code,
      description: fir.name
    }));
  },
  { replace: true }
);
```

#### Contexte passé au provider

Le provider reçoit un objet `context` avec les informations suivantes :

```typescript
interface SuggestionProviderContext {
  tokenType: string;      // Type de token déclenchant la suggestion
  currentText: string;    // Texte complet de l'éditeur
  cursorPosition: number; // Position du curseur
  grammarName: string;    // Nom de la grammaire active
  prevTokenText?: string; // Texte du token précédent (si disponible)
}
```

#### Format de retour des suggestions

```typescript
interface ProviderSuggestion {
  text: string;              // Texte à insérer
  description?: string;      // Description affichée
  type?: string;             // Type pour le style (ex: 'location', 'datetime')
  editable?: {               // Région éditable après insertion
    start: number;
    end: number;
    pattern?: string;
    description?: string;
  };
  appendToPrevious?: boolean; // Ajouter sans espace
  skipToNext?: boolean;       // Passer au suivant automatiquement
  newLineBefore?: boolean;    // Saut de ligne avant
  children?: ProviderSuggestion[]; // Sous-suggestions (pour catégories)
  isCategory?: boolean;       // Si true, affiche un sous-menu
}
```

#### Option `replace`

L'option `replace` contrôle comment les suggestions du provider sont combinées avec celles de la grammaire :

| `replace` | Comportement |
|-----------|--------------|
| `true` (défaut) | Les suggestions du provider **remplacent** celles de la grammaire |
| `false` | Les suggestions du provider sont **ajoutées** après le placeholder |

```javascript
// Mode replace (défaut) - seules les suggestions du provider apparaissent
editor.registerSuggestionProvider('my-provider', (ctx) => [...], { replace: true });

// Mode append - placeholder + suggestions provider + suggestions grammaire
editor.registerSuggestionProvider('my-provider', (ctx) => [...], { replace: false });
```

---

### 2. Action Providers

Les Action Providers permettent d'obtenir une valeur via une interaction externe, comme la saisie d'une géométrie sur une carte.

#### Déclaration dans la grammaire

```json
{
  "text": "N4830 E00230 - N4900 E00300 - ...",
  "description": "Saisir la géométrie sur la carte",
  "provider": "geometry-polygon"
}
```

#### Enregistrement d'un Action Provider (JavaScript)

```javascript
// Provider qui ouvre une carte pour saisir une géométrie
editor.registerProvider('geometry-polygon', async () => {
  // Ouvre une carte modale
  const result = await openMapModal({ type: 'polygon' });

  if (result.cancelled) {
    return null; // Annulé - insère le placeholder
  }

  // Retourne la géométrie formatée
  return result.coordinates;
});
```

#### Différence avec Suggestion Providers

| Aspect | Suggestion Provider | Action Provider |
|--------|---------------------|-----------------|
| Déclenchement | Popup autocomplétion | Sélection d'une suggestion avec `provider` |
| Retour | Liste de suggestions | Une seule valeur |
| UI | Liste dans l'éditeur | Externe (modale, carte, etc.) |
| État éditeur | Normal | Passe en état "waiting" |

#### Gestion de l'état "waiting"

Quand un Action Provider est appelé, l'éditeur passe en état "waiting" :

```javascript
// L'éditeur émet un événement quand il entre/sort de l'état waiting
editor.addEventListener('state-change', (e) => {
  console.log('État:', e.detail.state); // 'editing' ou 'waiting'
  console.log('Provider:', e.detail.providerType); // Type du provider en attente
});

// L'utilisateur peut annuler l'attente
editor.cancelWaiting();
```

---

### 3. Providers existants dans les grammaires

Voici les providers référencés dans les grammaires actuelles :

| Provider ID | Utilisé dans | Description |
|-------------|--------------|-------------|
| `taf-aerodrome-location-indicator` | TAF | Codes ICAO des aérodromes |
| `report-aerodrome-location-indicator` | METAR/SPECI | Codes ICAO des aérodromes |
| `sigmet-mwo-location-indicator` | SIGMET | Indicateurs MWO |
| `sigmet-fir-name` | SIGMET | Noms des FIR |
| `sigmet-va-volcano-name` | SIGMET WV | Noms de volcans (SIGMET) |
| `sigmet-tc-cyclone-name` | SIGMET WC | Noms de cyclones (SIGMET) |
| `airmet-fir-location-indicator` | AIRMET | Indicateurs FIR AIRMET |
| `vaa-volcano-name` | VAA | Noms de volcans (VAA) |
| `tca-cyclone-name` | TCA | Noms de cyclones (TCA) |

---

### 4. Exemple complet : Provider de noms de volcans

**Grammaire (fv.oaci.fr.json)** :
```json
"suggestions": {
  "items": {
    "volcanoName": [
      {
        "text": "NOM VOLCAN",
        "description": "Nom du volcan",
        "provider": "vaa-volcano-name",
        "editable": [{ "start": 0, "end": 10 }]
      }
    ]
  },
  "after": {
    "vaEruption": ["volcanoName"]
  }
}
```

**Application** :
```javascript
// Données des volcans (pourrait venir d'une API)
const volcanoDatabase = [
  { name: 'KARYMSKY', location: 'Kamchatka, Russia', lat: 54.05, lon: 159.45 },
  { name: 'ETNA', location: 'Sicily, Italy', lat: 37.75, lon: 15.00 },
  { name: 'STROMBOLI', location: 'Aeolian Islands, Italy', lat: 38.79, lon: 15.21 },
  { name: 'SAKURAJIMA', location: 'Kyushu, Japan', lat: 31.58, lon: 130.67 }
];

// Enregistrement du provider
editor.registerSuggestionProvider(
  'vaa-volcano-name',
  (context) => {
    return volcanoDatabase.map(v => ({
      text: v.name,
      description: v.location,
      type: 'location'
    }));
  },
  { replace: true }
);
```

**Résultat** : Quand l'utilisateur atteint le champ du nom de volcan, il voit une liste de suggestions avec les noms et localisations.

---

## Valeurs par défaut dynamiques

Utilisez `defaultsFunction` pour générer des valeurs par défaut contextuelles à l'exécution.

### Exemple simple (Date/Heure courante)

```json
{
  "editable": {
    "start": 0,
    "end": 6,
    "pattern": "\\d{6}",
    "description": "JJHHmm",
    "defaultsFunction": "() => { const now = new Date(); const d = String(now.getUTCDate()).padStart(2, '0'); const h = String(now.getUTCHours()).padStart(2, '0'); const m = String(now.getUTCMinutes()).padStart(2, '0'); return [d + h + m + 'Z']; }"
  }
}
```

### Retourner plusieurs options

```json
{
  "defaultsFunction": "() => { const now = new Date(); const d = String(now.getUTCDate()).padStart(2, '0'); const h = String(now.getUTCHours()).padStart(2, '0'); return [d + h + '00Z', d + h + '30Z']; }"
}
```

### Retourner des catégories

```json
{
  "defaultsFunction": "() => { return [{ text: 'TAF Court', isCategory: true, children: [{ text: '0606/0612', description: 'validité 6h', type: 'datetime' }] }]; }"
}
```

### Types de retour de fonction

La fonction peut retourner :

1. **Tableau de chaînes** : Suggestions simples
   ```javascript
   return ['160800Z', '160830Z'];
   ```

2. **Tableau d'objets Suggestion** : Avec descriptions
   ```javascript
   return [
     { text: '160800Z', description: 'Heure actuelle', type: 'datetime' },
     { text: '160900Z', description: '+1 heure', type: 'datetime' }
   ];
   ```

3. **Catégories avec enfants** : Suggestions groupées
   ```javascript
   return [{
     text: 'TAF Court',
     isCategory: true,
     children: [
       { text: '0606/0612', description: '6h', type: 'datetime' }
     ]
   }];
   ```

---

## Mode Template (VAA/TCA)

Le mode template crée une disposition à deux colonnes avec les labels fixes à gauche et les valeurs éditables à droite.

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

### Propriétés du template

| Propriété | Type | Description |
|-----------|------|-------------|
| `labelColumnWidth` | number | Largeur de la colonne label en caractères |
| `fields` | array | Définitions des champs |

### Propriétés des champs

| Propriété | Type | Description |
|-----------|------|-------------|
| `label` | string | Label du champ (ex: "DTG:") |
| `labelType` | string | Type de token pour le style du label |
| `valueType` | string | Type de token pour le style de la valeur |
| `required` | boolean | Le champ est-il obligatoire ? |
| `placeholder` | string | Exemple de valeur affiché quand vide |
| `multiline` | boolean | Autoriser plusieurs lignes pour la valeur |

### Suggestions de template

Les suggestions pour les champs template sont définies dans `suggestions.templateFields` :

```json
"suggestions": {
  "templateFields": {
    "DTG:": [
      {
        "pattern": "\\d{8}/\\d{4}Z",
        "placeholder": "20080923/0130Z",
        "description": "Date/heure AAAAMMJJ/HHmmZ",
        "type": "datetime",
        "editable": {
          "start": 0,
          "end": 14,
          "pattern": "\\d{8}/\\d{4}",
          "description": "Date et heure complètes",
          "defaultsFunction": "() => { const now = new Date(); ... return [formatted]; }"
        }
      }
    ],
    "VAAC:": [
      { "text": "TOKYO", "description": "VAAC Tokyo", "type": "location" },
      { "text": "WASHINGTON", "description": "VAAC Washington", "type": "location" }
    ]
  }
}
```

### Rendu de sortie

Le mode template s'affiche ainsi :

```
VA ADVISORY
DTG:                  20080923/0130Z
VAAC:                 TOKYO
VOLCANO:              KARYMSKY 300130
PSN:                  N5403 E15927
```

La colonne label (22 caractères) est en lecture seule ; seules les valeurs sont éditables.

---

## Validateurs de Tokens

Les validateurs effectuent une validation sémantique sur les tokens et affichent les messages d'erreur sous forme d'infobulles. Ils vont au-delà de la correspondance regex pour valider les règles métier.

### Définir un validateur dans la grammaire

Ajoutez la propriété `validator` à une définition de token :

```json
"tokens": {
  "validityPeriod": {
    "pattern": "^\\d{4}\\/\\d{4}$",
    "style": "datetime",
    "description": "Période de validité JJHH/JJHH",
    "validator": "DDHH/DDHH-short"
  }
}
```

### Validateurs intégrés

| Nom du validateur | Description | Exemple d'erreur |
|-------------------|-------------|------------------|
| `DDHH/DDHH-short` | Validité TAF Court (≤12h) | "TAF Short validity must be ≤12 hours (got 18h)" |
| `DDHH/DDHH-long` | Validité TAF Long (12-30h) | "TAF Long validity must be >12 hours (got 6h)" |

### Créer des validateurs personnalisés

Les validateurs personnalisés sont définis dans `src/tac-validators.ts` :

```typescript
export const MyCustomValidator: BuiltinValidator = {
  name: 'my-validator-name',
  pattern: 'grammarCode.*.*.tokenType',  // Pattern de correspondance
  validate: (value: string, context: ValidatorContext) => {
    // Retourne un message d'erreur si invalide
    if (/* validation échoue */) {
      return 'Message d\'erreur affiché dans l\'infobulle';
    }
    // Retourne null si valide
    return null;
  }
};

// Enregistrer dans le tableau BUILTIN_VALIDATORS
export const BUILTIN_VALIDATORS: BuiltinValidator[] = [
  // ... validateurs existants
  MyCustomValidator
];
```

### Contexte du validateur

Le validateur reçoit un objet contexte :

```typescript
interface ValidatorContext {
  grammarCode: string;   // ex: 'fc', 'ft', 'ws'
  standard: string;      // ex: 'oaci', 'noaa'
  locale: string;        // ex: 'en', 'fr'
  tokenType: string;     // Type du token validé
}
```

### Correspondance de patterns

Les validateurs utilisent des patterns pour cibler des combinaisons grammaire/token spécifiques :

| Pattern | Correspond à |
|---------|--------------|
| `fc.*.*.validityPeriod` | Période de validité TAF Court (tout standard/locale) |
| `ft.*.*.validityPeriod` | Période de validité TAF Long |
| `*.oaci.*.icao` | Tokens ICAO dans les grammaires OACI |
| `ws.*.*.phenomenon` | Tokens de phénomène SIGMET WS |

### Affichage des erreurs

Quand un validateur retourne une erreur :
1. Le token est surligné avec un style d'erreur (soulignement ondulé)
2. Survoler le token affiche le message d'erreur en infobulle
3. L'erreur est incluse dans la propriété `error` du token

---

## Bonnes pratiques

1. **Utiliser des patterns ancrés** : Toujours utiliser `^` et `$` dans les patterns de tokens
2. **Fournir des descriptions** : Aider les utilisateurs à comprendre chaque token
3. **Grouper les suggestions liées** : Utiliser les catégories pour l'organisation
4. **Ajouter des régions éditables** : Pour les saisies basées sur des patterns
5. **Utiliser les valeurs dynamiques** : Pour les champs date/heure
6. **Suivre les conventions OMM** : Référencer la documentation officielle
7. **Tester avec des messages réels** : Valider contre des données aéronautiques réelles

---

## Exemples

### Ajouter un nouveau token

```json
"tokens": {
  "monNouveauToken": {
    "pattern": "^NOUVEAU\\d{3}$",
    "style": "keyword",
    "description": "Nouveau token personnalisé"
  }
}
```

### Ajouter un élément de suggestion avec région éditable

```json
"suggestions": {
  "items": {
    "datetime": [
      {
        "text": "160800Z",
        "description": "Jour et heure JJHHmmZ",
        "editable": [{ "start": 0, "end": 6 }]
      }
    ]
  },
  "after": {
    "icao": ["datetime"]
  }
}
```

### Créer une catégorie

```json
{
  "type": "category",
  "text": "Types de nuages",
  "description": "Sélectionner la couverture nuageuse",
  "children": [
    { "text": "FEW", "description": "1-2 octas" },
    { "text": "SCT", "description": "3-4 octas" },
    { "text": "BKN", "description": "5-7 octas" },
    { "text": "OVC", "description": "8 octas" }
  ]
}
```

### Extrait de grammaire complet

```json
{
  "name": "Exemple de grammaire",
  "version": "1.0.0",
  "identifier": "EXEMPLE",
  "tokens": {
    "identifier": {
      "pattern": "^EXEMPLE$",
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
        { "text": "EXEMPLE", "description": "Type de message exemple" }
      ],
      "value": [
        { "text": "0000", "description": "Entrer 4 chiffres", "editable": [{ "start": 0, "end": 4 }] }
      ]
    },
    "after": {
      "start": ["identifier"],
      "identifier": ["value"]
    }
  }
}
```
