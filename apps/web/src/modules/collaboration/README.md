# Module : Collaboration

Responsabilité : accès, commentaires, révisions et synchronisation.

Porte la file de synchronisation (voir `docs/architecture.md`, « Sync and offline, designed from the start »)
et ses quatre états visibles par changement : enregistré localement, synchronisation en cours, enregistré sur
le serveur, conflit nécessitant une décision. La première version cible un seul éditeur actif par projet, avec
consultation et commentaires pour les autres utilisateurs ; les droits sont contrôlés côté serveur, jamais
seulement côté client.

## Statut

`CollaborationModule.tsx` : commentaires du projet (`CommentThread`) et de chaque étape (`StepComments`, pli « Commentaires (n) » dans le Parcours), auteur enregistré et suppression réservée à l'auteur ; journal des révisions relu depuis les dates portées par les données (arbitrages Harmonie et états antérieurs conservés, variantes de programme, transferts, revues, écritures du modèle et des parcelles, documents produits, commentaires) ; accès réel (propriétaire, votre rôle, membres) et synchronisation annoncés tels quels — écritures serveur avec révision par clé (409 en cas de conflit).

Partage (`MembersPanel`, API `routes/members.ts`, droits dans `lib/owned-project.ts`) : le propriétaire invite des comptes existants par leur adresse (aucun courriel envoyé, aucun compte créé), change leur rôle, les retire ; un membre peut quitter le projet. Un **lecteur** lit tout le dossier, commente, exporte et copie ; un **éditeur** modifie aussi ; le propriétaire seul partage et supprime. Chaque route déclare le besoin qu'elle a (`read` / `comment` / `write` / `owner`) et le serveur relit le rôle à chaque requête (404 sans accès, 403 motivé si le rôle ne suffit pas) ; l'écran ne fait que ne pas proposer ce qui serait refusé (`lib/access.ts` → `useProjectAccess`, `components/WriteFieldset.tsx`, Atelier en lecture seule, bandeau « Projet partagé en lecture », « Projets partagés avec vous » dans la liste). Les membres travaillent sur le même projet : chaque transaction de relecture-réécriture verrouille d'abord la ligne du projet (`lockProject`, `FOR UPDATE`) pour qu'aucune écriture simultanée ne s'efface, puis le contrôle de version (409) départage les lectures périmées.

Hors-ligne (`lib/local-store.ts`, `lib/query-persister.ts`, `lib/mutations.ts`, `components/SyncIndicator.tsx`, `public/sw.js`) : file locale IndexedDB des écritures de l'Atelier rejouée au retour du réseau et à l'ouverture suivante, cache local du modèle, cache persistant des requêtes pour relire sans réseau, mutations à clé (saisies, arbitrages, commentaires) mises en pause sans réseau, persistées, restaurées après rechargement et rejouées avec la valeur ou la version lue (refus 409 montré, jamais écrasé), service worker pour l'application et ses moteurs ; indicateur d'état et bandeaux dans l'en-tête du projet.

Conflits (`components/ConflictPanel.tsx`) : chaque refus 409 est montré côte à côte avec l'état du serveur — saisie (champ, valeur du serveur, votre saisie : « Garder le serveur » / « Reprendre ma saisie »), arbitrage (votre arbitrage face à la version courante : « Réappliquer sur la version courante »), modèle de l'Atelier (copie de secours : « Garder le serveur » / « Reprendre ma version »). Reprendre renvoie la même écriture fondée sur l'état courant ; rien n'est fusionné automatiquement, rien n'est écrasé sans décision.

Reste (Lot 4) : verrou d'édition optionnel (« un seul éditeur actif » — aujourd'hui deux éditeurs simultanés sont départagés par le contrôle de version, jamais perdus), notifications d'invitation, transfert de propriété.
