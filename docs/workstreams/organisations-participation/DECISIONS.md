# Organisations, participation et revue externe — Décisions

Journal du chantier. Les décisions héritées de la gestion des comptes (D-1 à D-7, UM-1 à UM-24) restent dans
[`../users-management/DECISIONS.md`](../users-management/DECISIONS.md) et ne sont pas recopiées ici.

## Décisions du maître d'ouvrage

- **OP-0 — Ouverture du chantier (2026-10-23).** Le maître d'ouvrage confirme l'ouverture du chantier « Organisations,
  participation et revue externe ». Cette ouverture lève le report UM-1 pour ce chantier. Priorité : participants,
  invitations acceptées, revue externe. Il demande le cadrage et le plan d'implémentation. Le même jour, il y ajoute
  l'écran du journal d'activité et l'historique (phase 3 bis du plan), et décide de fondre dans ce plan le second cadrage
  rédigé par la session d'exploitation plutôt que d'ouvrir une seconde Issue et une seconde PR.

- **OP-1 — Validation du plan et décisions du point d'arrêt 🛑 0 (2026-10-23).** Le maître d'ouvrage valide le plan
  ([PLAN.md](PLAN.md)) et répond à l'annexe A :
  - recommandations adoptées : OP-D1 (a) organisation propriétaire facultative ; OP-D2 (a) invitation acceptée pour tous,
    fin de l'ajout direct d'un compte existant (UM-8) — appliquée en phase 3 ; OP-D4 (b) saisie libre déclarée en attendant
    ses listes ; OP-D5 (a) ; OP-D6 (a) ; OP-D8 (a) ; OP-D10 (a) ; OP-D11 (a) ; OP-D12 (a) ; OP-D13 (a) ;
  - **OP-D3 (c)** : les six rôles métier du concept (Lecteur, Concepteur, Relecteur, Coordinateur, Approbateur,
    Diffuseur) attribués par portée ; `lecteur` → Lecteur, `editeur` → Concepteur, sans perte d'accès ;
  - **OP-D7 (a)** : un participant externe peut approuver, par une affectation d'approbation explicite et nominative,
    distincte de la relecture ;
  - **OP-D9** : contacts sans compte autorisés ; nom, organisation, fonction, e-mail et téléphone professionnels ;
    coordonnées visibles des seuls responsables du projet ; aucune invitation implicite. **Durée de conservation : à
    fixer par le maître d'ouvrage** (aucune purge automatique n'est livrée avant).

- **OP-2 — Conservation des contacts et courriels de préproduction (2026-10-24).** Réponse du maître d'ouvrage
  (« OK pour les deux »), transmise par la session d'exploitation :
  - **OP-D9, durée de conservation** : un contact sans compte est conservé pendant la durée du projet et **2 ans après sa
    clôture**, puis effacé automatiquement ; il est effacé plus tôt à la demande de la personne. Réserve : d'éventuelles
    obligations légales de conservation (par exemple la garantie décennale) sont à vérifier par le conseil juridique du
    maître d'ouvrage. L'effacement n'est pas livré en phase 1 : tâche de la phase 2 (PLAN.md, tâche 6), qui dépend d'un
    état « clos » du projet, absent du modèle actuel.
  - **OP-D12, révision de OP-1** : la préproduction **envoie réellement** les courriels (expéditeur
    `noreply@fadimmo.com`, SMTP Infomaniak), jamais vers les domaines réservés aux essais (`example.com`, `example.net`,
    `example.org`, `*.test`, `*.invalid`, `*.example`, `localhost`) : pour eux, le lien reste affiché. Réalisé hors de ce
    chantier, dans une PR distincte (UM-28 : transmission SMTP dans `deploy/preprod` et filtre du mailer) ; l'ouverture de la
    revue externe en production exige toujours un envoi de courriels configuré.

## Décisions en attente

- Avis juridique sur les obligations de conservation des contacts (réserve d'OP-2).
- 🛑 1 : revue du modèle et de la migration de la phase 1 avant la phase 2.
