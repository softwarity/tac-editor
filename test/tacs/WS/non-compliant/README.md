# TACs WS (SIGMET Weather) Non-Conformes

Ce dossier contient des fichiers SIGMET météo qui ne sont pas conformes aux standards OACI.

## Problèmes courants

### Format de coordonnées non standard

Plusieurs fichiers utilisent des formats de coordonnées non conformes :
- `E04341-N4006` au lieu de `N4006 E04341`
- `50NM` au lieu du format standard de distance

### Grammaire SIGMET incomplète

La grammaire SIGMET actuelle ne supporte pas encore tous les formats de messages.
Ces fichiers seront réintégrés une fois la grammaire complétée.

## Fichiers concernés

- CZEG-*.tac - Format canadien avec distances en NM
- EDGG-*.tac - Format allemand
- LGGG-*.tac - Format grec
- UBBB-*.tac - Format azerbaïdjanais
- UDDD-*.tac - Format arménien
- Et autres...
