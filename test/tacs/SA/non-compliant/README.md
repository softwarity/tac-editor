# TACs SA Non-Conformes

Ce dossier contient des fichiers TAC qui ne sont pas conformes aux standards OACI ou NOAA.
Ces fichiers sont utilisés pour documenter les écarts et les erreurs courantes.

## UAAA-270000Z.tac

**Problème**: État de piste (Runway State) non supporté

```
METAR UAAA 270000Z 13003MPS 4500 BR SCT050 BKN100 05/04 Q1016 R88/CLRD65 NOSIG
```

Le token `R88/CLRD65` représente l'état de la piste (Runway State indicator).
Ce champ n'est pas supporté par la grammaire actuelle.
