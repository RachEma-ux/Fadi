# Module : Collaboration

Responsabilité : accès, commentaires, révisions et synchronisation.

Porte la file de synchronisation (voir `docs/architecture.md`, « Sync and offline, designed from the start »)
et ses quatre états visibles par changement : enregistré localement, synchronisation en cours, enregistré sur
le serveur, conflit nécessitant une décision. La première version cible un seul éditeur actif par projet, avec
consultation et commentaires pour les autres utilisateurs ; les droits sont contrôlés côté serveur, jamais
seulement côté client.

## Statut

`CollaborationModule.tsx` : commentaires du projet (`CommentThread`) et de chaque étape (`StepComments`, pli « Commentaires (n) » dans le Parcours), auteur enregistré et suppression réservée à l'auteur ; journal des révisions relu depuis les dates portées par les données (arbitrages Harmonie et états antérieurs conservés, variantes de programme, transferts, revues, écritures du modèle et des parcelles, documents produits, commentaires) ; accès et synchronisation annoncés tels quels — un propriétaire par projet, écritures serveur avec révision par clé (409 en cas de conflit).

Hors-ligne (`lib/local-store.ts`, `lib/query-persister.ts`, `lib/mutations.ts`, `components/SyncIndicator.tsx`, `public/sw.js`) : file locale IndexedDB des écritures de l'Atelier rejouée au retour du réseau et à l'ouverture suivante, cache local du modèle, cache persistant des requêtes pour relire sans réseau, mutations à clé (saisies, arbitrages, commentaires) mises en pause sans réseau, persistées, restaurées après rechargement et rejouées avec la valeur ou la version lue (refus 409 montré, jamais écrasé), service worker pour l'application et ses moteurs ; indicateur d'état et bandeaux dans l'en-tête du projet.

Reste (Lot 4) : partage du projet (lecture, commentaires, édition), droits, résolution assistée des conflits (relecture et ressaisie manuelles aujourd'hui).
