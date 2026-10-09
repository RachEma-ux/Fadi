# Dossier de recette — Atelier P2 (DrawAll V4.1), lots P2-0 à P2-8

Établi le 9 octobre 2026 par le chef de projet (exécution continue décidée en D-183, décisions 10.1 déléguées et
consignées une à une, D-184 à D-190). Ce dossier dit **ce qui est livré en P2, où en est la preuve, ce que vous pouvez
vérifier vous-même, et ce qu'il vous reste à décider**. Il complète `recette.md` (lots 0 à 9, acceptés le 8 octobre
2026, D-174) : les fiches P2 sont à l'état **prototype** ; elles passeront à « vérifiée » puis « disponible » après
votre acceptation (R8, cahier P2 §8).

## 1. Ce qui est livré

| Lot | Contenu | Compte rendu | Décision |
| --- | --- | --- | --- |
| P2-0 | Cadrage P2 : 101 fiches, maquette d'activation d'ontologie, bancs OCCT / solveur / scène mixte, porte P1 réduite | `lots/p2-lot-0.md`, `p2-mesures.md` | D-176 à D-182 |
| P2-1 | Noyau exact : `packages/geometry-exact` (occt-wasm, LGPL servi séparément), classe `solide-exact`, recalcul serveur, STEP | `lots/p2-lot-1.md` | D-182, D-183 |
| P2-2 | Ontologie `mechanical` activable par projet : pièces, assemblages, liaisons résolues par le solveur écrit, numérotation, nomenclature, familles, règles, catalogues sourcés ; **porte P1 → P2** sur P.118-M | `lots/p2-lot-2.md` | D-184 |
| P2-3 | Ontologie `structure` : poutres, trames générées après aperçu, plaques, assemblages, soudures, armatures, coulages ; sections de catalogue sourcé | `lots/p2-lot-3.md` | D-185 |
| P2-4 | Ontologies `timber` (ossature de mur et charpente générées après aperçu, CLT, assemblages bois) et `sheetmetal` (plis, développé sourcé) | `lots/p2-lot-4.md` | D-186 |
| P2-5 | Ontologie `mep` : segments routés, raccords, vannes, équipements, supports, connectivité par ports, spécifications, P&ID dérivé, IFC MEP | `lots/p2-lot-5.md` | D-187 |
| P2-6 | Bâtiment P2 (plafond, coque, rampe, échelle, mur-rideau, terrain, réservation, installation de chantier), surfaces libres, opérations exactes surface / patch / congé, coordination entre ontologies, cinématique, inerties | `lots/p2-lot-6.md` | D-188 |
| P2-7 | Annotations de fabrication, cotes tolérancées, étiquettes intelligentes, isométrique, feuilles gabarits, tableaux perçages / ferraillage / débit, nuages de points LAS / XYZ ; DGN / DWG renoncés | `lots/p2-lot-7.md` | D-189, D-179 |
| P2-8 | Graphes visuels de génération contrôlée, règles par ontologie, ce dossier | `lots/p2-lot-8.md` | D-190 |

Fiches : 125 à l'état prototype (P2), 137 disponibles (P1), DA-22-02 renoncée, DA-22-10 sans objet ; index dans
`docs/atelier-cahier-p2.md` annexe B.

## 2. Contrôles automatiques (état au 9 octobre 2026, PR #101 et ses bases #98 à #100)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` (dont `scripts/check-module-deps.mjs` : aucune ontologie n'en importe une autre, T14) | ✅ |
| `npm test` | ✅ core-geometry 47 · domain-model 95 · **atelier-model 467** · **geometry-exact 22** · **API 97** · web 106 |
| `npm run build` (le `.wasm` OCCT reste un fichier séparé, chargé à la demande) | ✅ |
| Scénario complet `parcours-scenario.mjs` (P1 + comptes de documents P2) | ✅ en CI |
| Recettes P1 (`atelier-nouveau`, `atelier-documents`, `atelier-echanges`, `atelier-versions`, `atelier-automatisation`, `atelier-complements`, Planche) | ✅ en CI, non régressées |
| Recette P2-1 `p2-noyau-exact.mjs` | ✅ 14 contrôles |
| Porte P1 → P2 `porte-p1-p2.mjs` (P.118-M : bâtiment + machine dans un même projet) | ✅ 27 contrôles |
| Recette P2-3 `p2-structure.mjs` | ✅ 26 contrôles |
| Recette P2-4 `p2-bois-tolerie.mjs` | ✅ 25 contrôles |
| Recette P2-5 `p2-reseaux.mjs` | ✅ 28 contrôles |
| Recette P2-6 `p2-coordination.mjs` | ✅ 36 contrôles |
| Recette P2-7 `p2-documentation.mjs` | ✅ 25 contrôles |
| Recette P2-8 `p2-automatisation.mjs` | ✅ 23 contrôles |
| Recette de l'interface anglaise `interface-anglais.mjs` (D-163) | ✅ résidus < 2 % |
| Corpus IFC validé par IfcOpenShell (petit modèle, P.118, réimport ; classes P2 : poutres, réseaux, bâtiment P2) | ✅ |
| Aucune constante normative dans les ontologies (tests dédiés : sections, DN, pliage, densités, tolérances) | ✅ |
| axe-core (aucune violation critique ou sérieuse), ordinateur et téléphone | ✅ à chaque recette |

Toutes ces étapes tournent dans `.github/workflows/ci.yml` (jobs `validate`, `e2e`, `image`).

## 3. Exigences transversales T01–T20, rejouées sur P2

| Exigence | Preuve P1 (`recette.md`) | Preuve P2 ajoutée | État |
| --- | --- | --- | --- |
| T01 Produit unique | scénario complet | Ontologies **activées par projet** dans le navigateur ; bâtiment, machine, structure, bois, réseaux dans un même projet P.118 (`porte-p1-p2.mjs`, `p2-coordination.mjs`) ; aucun écran hors de l'Atelier (contrôle « un seul écran » de chaque recette P2) | ✅ |
| T02 Identités et représentations liées | `documents.test.ts` | Trame / ossature générées rattachées à leur hôte ; connexions de réseau rejugées à chaque commande ; collisions entre ontologies et règles par classe recalculées après chaque commande (`batiment-p2.test.ts`, `p2-8-automatisation.test.ts`) | ✅ |
| T03 Unités et propriétés typées | 400 sans unité | Sections, entraxes, diamètres, tolérances, masses volumiques typés `{ value, unit }` ; refus nommés (`atelier-structure.test.ts`, `atelier-documentation.test.ts`) | ✅ |
| T04 Tolérances et géoréférencement | repères tagués | Sommets 3D de réseau en repère local du niveau par définition, point d'un autre repère refusé (relecture P2-5) ; nuage posé par une **origine déclarée** (P2-7) | ✅ |
| T05 Références topologiques | cote « à réparer » | Assemblage bois / support de réseau dont une pièce disparaît → « à réparer » ; ossature régénérée sans doublon (`p2-4`, `p2-5`) | ✅ |
| T06 Transactions et idempotence | même `requestId` | Idem pour les commandes P2 (`atelier-commands.test.ts`), scripts, propositions de graphes (`atelier-automatisation-p2.test.ts`) | ✅ |
| T07 Dépendances et résultats périmés | documents périmés | 19 tableaux et quantités, P&ID, isométrique, feuilles gabarits « à recalculer » annoncés à l'aperçu d'un script ou d'un graphe | ✅ |
| T08 Conflits et annulation collaborative | 409 / fusion | Accord d'une proposition sur une révision périmée : 409 (`atelier-automatisation-p2.test.ts`) ; annuler / rétablir sur les générations (inverse exact) | ✅ |
| T09 Disponibilité locale | hors ligne | Réducteurs P2 identiques navigateur / serveur (ontologies, solveur, règles par classe) ; définitions `graphe` et `regle` déposées par la file locale ; seul le recalcul exact fait autorité côté serveur | ✅ |
| T10 Droits | 404 / 403 / 423 | Lecteur : 403 sur `proposer` ; verrou : 423 sur un script (`atelier-automatisation.mjs`) | ✅ |
| T11 Sauvegarde et restauration | `verify-restore.sh` | Inchangé : les classes et définitions P2 vivent dans les mêmes tables (`atelier_objets`, `atelier_definitions`, `atelier_propositions`) | ✅ |
| T12 Historique et publication | publication figée | Catalogues sourcés et définitions versionnées (`version` +1 à chaque modification) figés par publication | ✅ |
| T13 Fidélité des échanges | IFC → réimport | Matrice complétée pour chaque ontologie (`matrice-echanges.md`) ; IFC MEP, structure, bâtiment P2 réimportés en recette ; STEP AP242 export / import (P2-1) ; DGN / DWG déclarés renoncés | ✅ |
| T14 Modularité | `check-module-deps` | **Aucune ontologie n'importe une autre ontologie** (contrôle ajouté en P2-0, passage par le modèle typé) | ✅ |
| T15 Migrations et catalogues | import P.118 | Catalogues CSV **sourcés** par projet (D-180), vides par défaut ; aucune migration nouvelle (définitions dans la table existante) | ✅ |
| T16 Interface stable et accessible | axe-core | Chaque outil P2 vit dans l'inspecteur (sélection → paramètres → aperçu → contrôle → validation) ; téléphone et axe-core à chaque recette P2 ; interface bilingue | ✅ |
| T17 Apprentissage mesuré | protocole §1 | Protocole inchangé (`protocole-mesures.md` §1) ; tâches P2 à ajouter à votre campagne : activer une ontologie, tracer un réseau, proposer un graphe | à mesurer par vous |
| T18 Performance et diagnostic | lignes `⏱` | Lignes `⏱` des recettes P2 (banc de CI) ; bancs P2-0 (`p2-mesures.md` : OCCT, solveur, scène mixte) ; protocole §2 pour vos appareils | à mesurer par vous |
| T19 Scripts et IA contrôlés | script → mêmes commandes | Générations d'ontologie (trame, ossature, routage) **après aperçu et accord** ; graphes compilés en scripts et soumis à la **même boucle** (essai à blanc, hypothèses, accord), refus nommés sans correction automatique ; règles par ontologie signalées, jamais corrigées | ✅ |
| T20 Validation des analyses | sans objet | Toujours sans simulation : cinématique, inerties (masse volumique **sourcée** seule), coordination et règles sont des contrôles géométriques tracés, jamais des vérifications réglementaires | sans objet |

## 4. Essais de l'Architecture V4 §12 — P2

| Essai | Preuve |
| --- | --- |
| Génération contrôlée | Trame (P2-3), ossature (P2-4), routage (P2-5), graphes (P2-8) : aperçu → accord, idempotence (pas de doublon) |
| Collision entre ontologies | `p2-coordination.mjs` : gaine × mur signalée, exemptée par une réservation accordée, revient si refusée |
| Mécanisme animé | `p2-coordination.mjs` : trajectoire, obstacle ; pivot signé |
| Deux modifications incompatibles | 409 à l'accord d'une proposition périmée (P2-8) ; conflits P1 inchangés |
| Export et réimport | IFC MEP (P2-5), IFC natif bâtiment P2 (P2-6), STEP (P2-1) |
| Navigation et édition | lignes `⏱` des recettes P2 + vos mesures |

## 5. Ce que vous pouvez vérifier vous-même (parcours guidé P2, 30 minutes)

1. Importer l'exemple P.118, ouvrir l'Atelier ; dans le navigateur, section **Ontologies**, cocher *Structure* et
   *Réseaux* : les outils correspondants apparaissent dans la palette ; décocher : ils disparaissent (T01).
2. Palette → **Trame structurelle** : paramètres, **aperçu**, puis **Générer** ; annuler ; regénérer : aucun doublon.
3. Palette → **Segment de réseau** : tracer deux tronçons et un coude ; déplacer un tronçon : la connexion rompue est
   signalée dans Modifications ; le ramener : réparée. Documents → **Schéma de principe (P&ID)**.
4. Inspecteur d'un mur → **Réservation** pour une gaine qui le traverse : la collision « ontologies » disparaît quand
   le statut passe à *accordée*.
5. Panneau **Automatisation et assistant** → **Graphes de génération contrôlée** : choisir « Trame de poteaux
   contrôlée », saisir une section supérieure au pas → *Proposer* : échec nommé, rien d'écrit ; corriger → *Proposer* :
   lire les hypothèses et l'aperçu → **Accepter et exécuter**.
6. **Composer un graphe** : un paramètre, une série, une commande, deux liens → *Enregistrer dans le projet* ; le
   graphe apparaît dans le choix avec la mention (projet).
7. **Règles par ontologie** : une règle sur les murs avec sa source → les murs qui ne la tiennent pas sont signalés
   dans Modifications et sur chaque objet ; rien n'est modifié à votre place.
8. Documents → feuilles gabarits « production béton », « pliage », vue isométrique ; **Exporter → IFC 4.3** et ouvrir
   le fichier dans le visualiseur de votre choix (constat attendu de votre part).
9. Sur téléphone : même projet, mêmes panneaux.

## 6. Décisions qui vous reviennent (cahier P2 §6 et §10.1)

| Décision | État | Effet tant qu'elle n'est pas prise |
| --- | --- | --- |
| Acceptation des lots P2-2 à P2-8 | **à prendre** (P2-0 et P2-1 acceptés, D-182, D-183) | Les 125 fiches P2 restent « prototype » ; les décisions déléguées D-184 à D-190 sont à confirmer ou à amender |
| Fournisseur de modèle de langage et clé | ouverte (inchangée depuis P1) | Génération déterministe seulement : règles de Fadi, scripts, graphes |
| Catalogues sourcés (sections, tubes, essences, tables de pliage) | **D-180** : CSV sourcés, vides par défaut | Sans catalogue, les sections sont saisies ; les développés sans paramètres de pliage sont « non évalués » |
| DWG / DGN | **D-179** : renoncés, déclarés | Aucun échange DWG / DGN |
| Règles de conception (programme, normes citées) | aucune introduite par Fadi | R3 : toute règle vient de vous, avec sa source, par « Règles par ontologie » ou par les nœuds de règle des graphes |
| Projet mixte de référence | **D-181** : P.118-M | Sert de base aux recettes P2 |
| Compte buildingSMART, stockage objet, hébergement, référence protégée | ouvertes (voir `recette.md` §6) | inchangé |

## 7. Limites connues (non faites, déclarées)

Les « Non fait (déclaré) » de chaque compte rendu `lots/p2-lot-N.md` font foi ; en résumé :

- Noyau exact : opérations avancées (lissage, coques, filetages), édition directe des faces.
- Mécanique : tolérances d'assemblage, cinématique dynamique (forces), solveur sur grands assemblages non mesuré.
- Structure, bois, tôlerie : aucune vérification (géométrie seulement) ; assemblages génériques ; pliage sans
  rayons sourcés → non évalué.
- Réseaux : dimensionnement, pertes de charge, électricité (P3).
- Coordination : surfaces de raccord, édition directe de solides exacts, propagation des spécifications.
- Documentation : symboles ISO complets, PMI STEP AP242, E57 / LAZ, reconnaissance de plans dans les nuages.
- Automatisation : import de graphes tiers, nœuds de lecture du modèle, règles entre objets, fournisseur de modèle de
  langage.
- Mesures T17 / T18 sur utilisateurs et appareils réels : protocole fourni, mesure à faire.
