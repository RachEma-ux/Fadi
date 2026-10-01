# Module : Collaboration

Responsabilité : accès, commentaires, révisions et synchronisation.

Porte la file de synchronisation (voir `docs/architecture.md`, « Sync and offline, designed from the start »)
et ses quatre états visibles par changement : enregistré localement, synchronisation en cours, enregistré sur
le serveur, conflit nécessitant une décision. La première version cible un seul éditeur actif par projet, avec
consultation et commentaires pour les autres utilisateurs ; les droits sont contrôlés côté serveur, jamais
seulement côté client.

## Statut

Pas encore implémenté. C'est le cœur du Lot 4 (« Continuité du travail ») — dépend d'un backend fonctionnel
(Lot 2/3) et du protocole de synchronisation, qui reste à concevoir (file locale, Dexie/IndexedDB, contrôle de
révision, règles de conflit explicites).
