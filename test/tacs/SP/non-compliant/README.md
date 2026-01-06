# TACs SP (SPECI) Non-Conformes

Ce dossier contient des fichiers SPECI qui ne sont pas conformes aux standards OACI ou NOAA.

## EHAK-282355Z.tac, EHJR-282355Z.tac, ENFB-282350Z.tac

**Problème**: État de la mer (Sea State) et formats de données manquantes non standard

Ces fichiers contiennent des tokens comme :
- `W///H///` - État de la mer avec données manquantes
- `/////////` - Format de données manquantes non reconnu
- `RE//` - Phénomène météo récent avec données manquantes

## USRR-270020Z.tac

**Problème**: État de fermeture de piste non supporté

```
SPECI USRR 270020Z 09008MPS 0400 R07/0450D BLSN VV019 M12/M14 Q1004 R/SNOCLO TEMPO 0500 +SN BLSN
```

Le token `R/SNOCLO` indique une fermeture de piste due à la neige.
Ce champ n'est pas supporté par la grammaire actuelle.
