# TACs SA Non-Conformes

Ce dossier contient des fichiers TAC qui ne sont pas conformes aux standards OACI ou NOAA.
Ces fichiers sont utilisés pour documenter les écarts et les erreurs courantes.

## VTUO-270000Z.tac

**Problème**: Double pression (QNH et altimètre)

```
METAR VTUO 270000Z 22003KT 190V360 2000 BR FEW035 25/25 Q1011 A2987 BECMG FM0100 3000 BR
```

Ce METAR thaïlandais contient à la fois :
- `Q1011` (QNH en hPa - format OACI)
- `A2987` (altimètre en pouces de mercure - format NOAA)

Selon les standards :
- OACI : utilise uniquement Q pour le QNH (ex: Q1013)
- NOAA : utilise uniquement A pour l'altimètre (ex: A2987)

Un message conforme ne devrait contenir qu'une seule des deux formes, pas les deux.

## ENFB-280000Z.tac

**Problème**: État de la mer (Sea State) non supporté

```
METAR ENFB 280000Z AUTO 12014KT //// FEW052/// 04/M08 Q1009 W///H52
```

Le token `W///H52` représente l'état de la mer et la hauteur des vagues (Sea State indicator).
Ce champ n'est pas supporté par la grammaire actuelle.

## SBBR-250000Z.tac

**Problème**: Format de nuages non standard

```
METAR SBBR 250000Z 32003KT 290V350 9999 VCTS //////CB 20/19 Q1017
```

Le token `//////CB` utilise des slashes pour indiquer des données manquantes dans le champ nuages.
Format non reconnu par la grammaire.

## SCCH-250000Z.tac

**Problème**: Format de données manquantes non standard

```
METAR SCCH 250000Z AUTO 19009KT 9999 ///////// 20/04 Q1014
```

Le token `/////////` représente des données manquantes mais n'est pas conforme au format standard.

## UAAA-270000Z.tac

**Problème**: État de piste (Runway State) non supporté

```
METAR UAAA 270000Z 13003MPS 4500 BR SCT050 BKN100 05/04 Q1016 R88/CLRD65 NOSIG
```

Le token `R88/CLRD65` représente l'état de la piste (Runway State indicator).
Ce champ n'est pas supporté par la grammaire actuelle.
