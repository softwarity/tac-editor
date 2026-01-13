# TACs SP (SPECI) Non-Conformes

Ce dossier contient des fichiers SPECI qui ne sont pas conformes aux standards OACI ou NOAA.

## USRR-270020Z.tac

**Problème**: État de fermeture de piste non supporté

```
SPECI USRR 270020Z 09008MPS 0400 R07/0450D BLSN VV019 M12/M14 Q1004 R/SNOCLO TEMPO 0500 +SN BLSN
```

Le token `R/SNOCLO` indique une fermeture de piste due à la neige.
Ce champ n'est pas supporté par la grammaire actuelle.
