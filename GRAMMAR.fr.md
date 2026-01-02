# Guide de Rédaction des Grammaires

Ce document décrit comment écrire les fichiers de grammaire pour le composant TAC Editor. Les grammaires définissent la syntaxe, les tokens, les règles de validation et les suggestions pour les messages de météorologie aéronautique.

## Table des matières

1. [Structure des fichiers](#structure-des-fichiers)
2. [Modes de grammaire](#modes-de-grammaire)
3. [Définition des tokens](#définition-des-tokens)
4. [Règles de structure](#règles-de-structure)
5. [Suggestions](#suggestions)
6. [Régions éditables](#régions-éditables)
7. [Valeurs par défaut dynamiques](#valeurs-par-défaut-dynamiques)
8. [Mode Template (VAA/TCA)](#mode-template-vaatca)

---

## Structure des fichiers

Les fichiers de grammaire sont des fichiers JSON situés dans `grammars/`. Chaque fichier suit cette structure :

```json
{
  "name": "TYPE_MESSAGE",
  "version": "1.0.0",
  "description": "Description du format de message",
  "reference": "Référence OMM",
  "identifiers": ["METAR", "SPECI"],
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
| `identifiers` | string[] | Identifiants de type de message qui déclenchent cette grammaire |
| `tokens` | object | Définitions des tokens |
| `structure` | array | Règles de structure (définition du format du message) |
| `suggestions` | object | Suggestions d'autocomplétion |

### Champs optionnels

| Champ | Type | Description |
|-------|------|-------------|
| `description` | string | Description détaillée |
| `reference` | string | Référence OMM ou OACI |
| `multiline` | boolean | Active le mode multiligne |
| `templateMode` | boolean | Active le mode template/colonnes (VAA/TCA) |
| `template` | object | Définition du template (quand templateMode=true) |

---

## Modes de grammaire

### Mode Normal (METAR, TAF, SIGMET)

Parsing séquentiel où les tokens se suivent sur une seule ligne ou avec retour à la ligne automatique.

```json
{
  "identifiers": ["METAR"],
  "tokens": { ... },
  "structure": [ ... ],
  "suggestions": { ... }
}
```

### Mode Template (VAA, TCA)

Disposition en colonnes avec les labels à gauche et les valeurs à droite.

```json
{
  "identifiers": ["VA ADVISORY"],
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
3. Il cherche `suggestions.after[tokenId]` pour obtenir les IDs de suggestions
4. Il résout chaque ID depuis `suggestions.declarations`

```
Texte: "METAR LFPG |"
                  ↑ curseur à la position 11

Tokens en cache: [
  { text: "METAR", id: "identifier", start: 0, end: 5 },
  { text: "LFPG", id: "icao", start: 6, end: 10 }
]

1. Trouve le token avant le curseur (pos 11) → "LFPG" (id: "icao")
2. Cherche suggestions.after["icao"] → ["datetimeSug"]
3. Résout "datetimeSug" depuis declarations
4. Affiche les suggestions de datetime
```

### Structure

Les suggestions utilisent un pattern déclarations + références :

```json
"suggestions": {
  "declarations": [
    { "id": "autoSug", "ref": "auto", "text": "AUTO", "description": "Observation automatique" },
    { "id": "datetimeSug", "ref": "datetime", "placeholder": "160800Z", "description": "Jour/heure" },
    { "id": "lfpg", "ref": "icao", "text": "LFPG", "description": "Paris CDG" },
    { "id": "egll", "ref": "icao", "text": "EGLL", "description": "Londres Heathrow" },
    { "id": "icaoCategory", "ref": "icao", "category": "Localisation OACI", "children": ["lfpg", "egll"] }
  ],
  "after": {
    "identifier": ["icaoCategory"],
    "icao": ["datetimeSug"],
    "datetime": ["autoSug"]
  }
}
```

### Déclarations

Chaque déclaration définit une suggestion réutilisable :

```json
{
  "id": "autoSug",
  "ref": "auto",
  "text": "AUTO",
  "description": "Observation automatique"
}
```

- `id` : Identifiant unique pour cette suggestion
- `ref` : Référence vers une définition de token (le style est hérité de `tokens[ref].style`)

### Suggestion basée sur un pattern

Pour les valeurs qui suivent un pattern mais ne sont pas fixes :

```json
{
  "id": "datetimeSug",
  "ref": "datetime",
  "pattern": "\\d{6}Z",
  "placeholder": "160800Z",
  "description": "Jour et heure JJHHmmZ",
  "editable": {
    "start": 0,
    "end": 6,
    "pattern": "\\d{6}",
    "description": "JJHHmm (6 chiffres)"
  }
}
```

### Catégorie avec enfants

Regrouper les suggestions liées avec `category` et `children` (tableau d'IDs de déclarations) :

```json
{
  "id": "icaoCategory",
  "ref": "icao",
  "category": "Localisation OACI",
  "description": "Codes aéroport",
  "children": ["lfpg", "egll", "eham"]
}
```

Les enfants sont référencés par leur `id`, pas en ligne :

```json
{ "id": "lfpg", "ref": "icao", "text": "LFPG", "description": "Paris CDG" },
{ "id": "egll", "ref": "icao", "text": "EGLL", "description": "Londres Heathrow" }
```

### Propriétés des déclarations

| Propriété | Type | Requis | Description |
|-----------|------|--------|-------------|
| `id` | string | Oui | Identifiant unique |
| `ref` | string | Oui | Référence au token (pour le style) |
| `text` | string | Non | Texte fixe à insérer |
| `pattern` | string | Non | Pattern regex (pour editable) |
| `placeholder` | string | Non | Texte d'affichage pour le pattern |
| `description` | string | Non | Description dans l'infobulle |
| `category` | string | Non | Nom de catégorie (crée un groupe) |
| `children` | string[] | Non | IDs des suggestions enfants |
| `editable` | object | Non | Définition de la région éditable |
| `appendToPrevious` | boolean | Non | Ajouter sans espace |
| `skipToNext` | boolean | Non | Sauter l'élément, passer au suivant |
| `newLineBefore` | boolean | Non | Insérer un saut de ligne avant |

---

## Régions éditables

Les régions éditables définissent les parties sélectionnables/modifiables d'une suggestion.

```json
{
  "id": "windSug",
  "ref": "wind",
  "pattern": "\\d{3}\\d{2}KT",
  "placeholder": "24015KT",
  "description": "Vent dddffKT",
  "editable": {
    "start": 0,
    "end": 5,
    "pattern": "\\d{5}",
    "description": "Direction (3) + Vitesse (2)"
  }
}
```

### Propriétés éditables

| Propriété | Type | Description |
|-----------|------|-------------|
| `start` | number | Position de début (base 0) |
| `end` | number | Position de fin (exclusive) |
| `pattern` | string | Regex de validation |
| `description` | string | Texte d'aide |
| `defaultsFunction` | string | Fonction JS pour les valeurs dynamiques |

Quand l'utilisateur sélectionne cette suggestion :
1. Le texte placeholder est inséré
2. Les caractères de `start` à `end` sont automatiquement sélectionnés
3. L'utilisateur peut taper pour remplacer la sélection

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
  "identifiers": ["VA ADVISORY"],
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

### Ajouter une suggestion de date dynamique

```json
{
  "pattern": "\\d{6}Z",
  "placeholder": "160800Z",
  "type": "datetime",
  "editable": {
    "start": 0,
    "end": 6,
    "defaultsFunction": "() => { const n = new Date(); return [String(n.getUTCDate()).padStart(2,'0') + String(n.getUTCHours()).padStart(2,'0') + String(n.getUTCMinutes()).padStart(2,'0') + 'Z']; }"
  }
}
```

### Créer une catégorie

```json
{
  "category": "Types de nuages",
  "description": "Sélectionner la couverture nuageuse",
  "type": "cloud",
  "children": [
    { "text": "FEW", "description": "1-2 octas", "type": "cloud" },
    { "text": "SCT", "description": "3-4 octas", "type": "cloud" },
    { "text": "BKN", "description": "5-7 octas", "type": "cloud" },
    { "text": "OVC", "description": "8 octas", "type": "cloud" }
  ]
}
```
