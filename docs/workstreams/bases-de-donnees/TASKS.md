# Bases de données — Tâches

## À faire

- BD-4b : boîte de la messagerie (`boiteDe`, requêtes par conversation) et accès par projet (`mesProjets`, 1 + N) —
  logique d'accès sensible : à reprendre après mesure `pg_stat_statements` en production.
- BD-3b : ordre des catégories GeoData (`max(ordre) + 10`, ex æquo possibles entre deux gestionnaires simultanés, sans
  effet sur les données) ; journal GeoData encore écrit hors transaction pour les autres actions.

## En cours

- PR unique (branche `ccr-e71fe633-hjxnjf`) : BD-1 (connexions), BD-2 (index), BD-3 (publication GeoData gardée ;
  carte + collection + journal en une transaction, rang sous verrou), BD-4 (reçus de lecture en une instruction ; analyses
  par paquets de 4 ; notifications de l'Atelier sans relire tout l'historique), BD-5 (migration sûre, contraintes NOT
  VALID), BD-6 (observabilité), BD-10 (documentation).

## Terminé

- BD-0 : analyse, plan, Issue #379, dossier de chantier.

## Bloqué

- BD-7 : restauration à un instant donné, conservation appliquée, test mensuel — objectifs RPO / RTO et accord de
  suppression d'anciennes copies : maître d'ouvrage.
- BD-8 : migration avec `fadi_migrator`, sauvegarde avec `fadi_backup` — mots de passe à poser dans `.env.deploy` :
  maître d'ouvrage.
- BD-9 : Atelier, verrou de projet et import IFC — décision section 10.1 : maître d'ouvrage.
- BD-11 : outil de migrations versionnées, index couvrant `geodata_valeurs`, `pg_trgm` — à définir après mesures en
  production.

## Critères de sortie

- PR fusionnée, CI verte ; `admin.schema_applications` et `verifier-contraintes` constatés en préproduction.
- BD-7 à BD-9 décidés ou explicitement reportés par le maître d'ouvrage.
