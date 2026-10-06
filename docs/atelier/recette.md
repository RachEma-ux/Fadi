# Dossier de recette — Atelier Architecture (DrawAll V4.1), lots 0 à 9

Établi le 4 octobre 2026 par le chef de projet (exécution continue décidée en D-010). Ce dossier dit **ce qui est
livré, où en est la preuve, ce que vous pouvez vérifier vous-même, et ce qu'il vous reste à décider**. Rien n'y est
déclaré « disponible » : cet état n'est posé qu'après votre acceptation (R8, D-007).

## 1. Ce qui est livré

| Lot | Contenu | Compte rendu |
| --- | --- | --- |
| 0 | Cadrage, 72 fiches de capacité, mesures de faisabilité (three.js, web-ifc, OCCT, manifold, Yjs, quotas) | `lots/lot-0.md`, `p0-mesures.md` |
| 1 | Modèle typé `packages/atelier-model` : ontologie, identités, propriétés typées, commandes et réducteurs purs, références topologiques, quantités, importeur P.118 à sens unique | `lots/lot-1.md` |
| 2 | API transactionnelle (journal, idempotence, 409 détaillé, annuler / rétablir, boîte de sortie), file locale Dexie | `lots/lot-2.md` |
| 3a / 3b | Nouvel Atelier : cinq repères, palette, plan 2D, objets d'architecture ; 3D WebGL2, pousser / tirer, téléphone, accessibilité | `lots/lot-3a.md`, `lot-3b.md` |
| 4 | Bascule : un seul Atelier, consommateurs rebranchés, ancien moteur supprimé, archive v2 | `lots/lot-4.md` |
| 5 | Documents dérivés (vues, feuilles, tableaux ; PDF / DXF / SVG / CSV au catalogue), contraintes, blocs et composants, toitures, garde-corps, phases | `lots/lot-5.md` |
| 6 | Échanges : IFC 4.3 export validé par IfcOpenShell, import en représentations, import DXF 2D, rapport de fidélité, manifeste du paquet natif | `lots/lot-6.md`, `matrice-echanges.md` |
| 7 | Versions nommées, variantes et fusion par rejeu validé, publications figées, verrous fins, collisions, comparaison de vues | `lots/lot-7.md` |
| 8 | Scripts versionnés (mêmes commandes, mêmes refus), assistant à boucle contrôlée (règles de Fadi, accord explicite) | `lots/lot-8.md` |
| 9 | Recette : essai « calcul tardif » ajouté, aide située relue et testée, fiches mises à jour, protocole T17 / T18, documentation | `lots/lot-9.md`, ce dossier, `protocole-mesures.md` |
| + | Compléments : historique d'un objet, consultation d'un état passé, réutilisation de modèle, références externes ; raccords de murs, coupes remplies en 3D, lasso, fusions successives, vues et nomenclatures déplaçables sur feuille, annotations des coupes et façades | `lots/complements.md` |

Décisions du chef de projet : D-001 à D-135 (`decisions.md`). Fiches : les 71 à l'état « prototype » (code présent,
preuve liée) ; DA-05-11 et DA-21-09 réalisées par les compléments, avec leurs écarts déclarés.

## 2. Contrôles automatiques (état au 4 octobre 2026)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` (dont `scripts/check-module-deps.mjs`, T14) | ✅ |
| `npm test` | ✅ core-geometry 47 · domain-model 95 · **atelier-model 325** · **API 86** · web 60 |
| `npm run build` | ✅ |
| Scénario complet `apps/web/e2e/parcours-scenario.mjs` | ✅ 326 contrôles, « Scénario conforme. » |
| Recette Atelier `atelier-nouveau.mjs` (lots 3–4) | ✅ 41 contrôles |
| Recette documents `atelier-documents.mjs` (lot 5, compléments) | ✅ 21 contrôles |
| Recette échanges `atelier-echanges.mjs` (lot 6) | ✅ 17 contrôles |
| Recette versions `atelier-versions.mjs` (lot 7) | ✅ 24 contrôles |
| Recette automatisation `atelier-automatisation.mjs` (lot 8, éditeur guidé) | ✅ 17 contrôles |
| Recette compléments `atelier-complements.mjs` | ✅ 116 contrôles (captures `10-reprise.png`, `10-reference-externe.png`, `10-coupe-remplie.png`) |
| Corpus IFC validé par IfcOpenShell 0.9.0 (`apps/api/test-corpus/ifc/`) | ✅ petit modèle (référence octet pour octet), P.118, P.118 réimporté puis réexporté |
| Sauvegarde puis restauration vérifiées (`scripts/verify-restore.sh`, T11) | ✅ en CI ; en local sur la base de développement (journal, versions, publications, volumes) |
| axe-core (aucune violation critique ou sérieuse) | ✅ à chaque écran des recettes, ordinateur et téléphone |

Toutes ces étapes tournent dans `.github/workflows/ci.yml` (jobs `validate`, `e2e`, `image`).

## 3. Exigences transversales T01–T20

| Exigence | Preuve | État |
| --- | --- | --- |
| T01 Produit unique | Même compte, même projet : Atelier, Programmation, Documents, Harmonie (scénario complet) | ✅ |
| T02 Identités et représentations liées | Mur modifié → ouvertures, vues, tableaux recalculés (`documents.test.ts`, `commandes.test.ts`) | ✅ |
| T03 Unités et propriétés typées | Grandeur sans unité refusée 400 (`atelier-commands.test.ts`), propriétés typées (`commandes.test.ts`) | ✅ |
| T04 Tolérances et géoréférencement | Repères tagués, conversions explicites ; `IfcMapConversion` depuis le CRS de la parcelle (`echanges.test.ts`, corpus) | ✅ |
| T05 Références topologiques | Scission d'un mur coté → cote « à réparer » (`documents.test.ts`, `atelier-documents.mjs`) | ✅ |
| T06 Transactions et idempotence | Même `requestId` → une seule révision, même réponse (`atelier-commands.test.ts`) | ✅ |
| T07 Dépendances et résultats périmés | Documents « à jour » puis « périmés » après une commande ; production tardive rattachée à sa révision (lot 9) | ✅ |
| T08 Conflits et annulation collaborative | 409 entre deux comptes ; fusion de variante avec conflit explicite (`atelier-versions.mjs`) | ✅ |
| T09 Disponibilité locale | Hors ligne, file locale, reprise (`parcours-scenario.mjs`, `atelier-nouveau.mjs`) | ✅ |
| T10 Droits | 404 / 403 / 423 sur commandes, scripts, versions, verrous fins (`atelier-commands.test.ts`) | ✅ |
| T11 Sauvegarde et restauration | `verify-restore.sh` étendu (journal, versions, publications, volumes) | ✅ |
| T12 Historique et publication | Publication → révision, catalogues et fichiers retrouvés à l'octet (`atelier-commands.test.ts`, `atelier-versions.mjs`) | ✅ |
| T13 Fidélité des échanges | Export IFC → réimport → rapport ; matrice publiée | ✅ |
| T14 Modularité | `scripts/check-module-deps.mjs` dans `npm run typecheck` | ✅ |
| T15 Migrations et catalogues | Import P.118 ; migration idempotente (`db:migrate`, bascule) ; catalogues figés par publication | ✅ |
| T16 Interface stable et accessible | Clavier, axe-core, palette, aide située testée (`nouveau.test.ts`) | ✅ |
| T17 Apprentissage mesuré | **Protocole fourni** (`protocole-mesures.md` §1) ; mesure par vous avec des utilisateurs réels | à mesurer par vous |
| T18 Performance et diagnostic | Lignes `⏱` des recettes (banc de CI, `p0-mesures.md`) ; **protocole** pour vos appareils (`protocole-mesures.md` §2) | à mesurer par vous |
| T19 Scripts et IA contrôlés | Script → mêmes commandes, mêmes refus ; boucle ≤ 3 itérations ; rien d'écrit sans accord | ✅ |
| T20 Validation des analyses | Sans objet (pas de simulation) ; contrôles métier tracés (source, version, résultat) | sans objet |

## 4. Essais de l'Architecture V4 §12

| Essai | Preuve |
| --- | --- |
| Modification de topologie | `commandes.test.ts`, `documents.test.ts` (références conservées ou « à réparer ») |
| Requête répétée | `atelier-commands.test.ts` (idempotence) |
| Deux modifications incompatibles | 409 entre deux comptes (`atelier-commands.test.ts`), second navigateur (`atelier-nouveau.mjs`), conflit de fusion (`atelier-versions.mjs`) |
| Calcul ancien terminé tardivement | `atelier-commands.test.ts` « essais §12 » : production de la révision n livrée après n + 1 → rattachée à n, périmée, sans écraser une production plus récente |
| Export et réimport | Corpus IFC en CI, `atelier-commands.test.ts` « échanges IFC », `atelier-echanges.mjs` |
| Interruption réseau | `parcours-scenario.mjs` (hors ligne, serveur injoignable), `atelier-nouveau.mjs` |
| Publication | `atelier-commands.test.ts` « publication figée (T12) » |
| Restauration | `verify-restore.sh` en CI |
| Navigation et édition | Lignes `⏱` (banc) + vos mesures (`protocole-mesures.md`) |
| Apprentissage | Protocole, mesure externe |

## 5. Ce que vous pouvez vérifier vous-même (parcours guidé, 20 minutes)

1. Importer l'exemple P.118 (page Projets), ouvrir l'Atelier : première modification → copie de travail automatique.
2. Tracer un mur de 4 m (M, clic, 4, Entrée), y poser une porte, annuler / rétablir ; passer en 3D.
3. Mode **Documents** : nouvelle vue en plan du RDC, une feuille A1, produire le PDF ; modifier le mur : la vue passe
   « périmée ». Comparer la vue avec une version nommée (panneau Versions → « Enregistrer », puis « Comparer avec une
   version »).
4. **Exporter → Maquette IFC 4.3** : lire le rapport ; **ouvrir le fichier dans le visualiseur IFC de votre choix**
   (constat attendu de votre part, critère du lot 6). Dans un projet vide avec un niveau : **Importer → Maquette
   IFC…** puis **Plan DXF (2D)…**.
5. Panneau **Versions** : créer une variante, y modifier un mur, revenir au tronc par le lien, modifier un autre
   objet ; depuis la variante, « Préparer la fusion », puis fusionner. Publier ; restaurer la publication.
6. **Automatisation et assistant** : « Feuilles et quantités » → lire les hypothèses → Accepter ; « Annoter les
   réserves Harmonie » ; script « Trame de poteaux » : Essayer, puis Exécuter.
7. Sur téléphone : même projet, onglets du bas (Plan, Projet, Inspecteur, Modifications).

## 6. Décisions qui vous reviennent (cahier §10.1)

| Décision | État | Effet tant qu'elle n'est pas prise |
| --- | --- | --- |
| Acceptation des lots 0 à 9 | à prendre | Les fiches restent « prototype » ; aucune n'est « disponible » |
| Licence OCCT et lot optionnel | ouverte | Pas de B-rep exact (DA-03-01 -d, DA-04 restantes) ; aucune dépendance OCCT dans le dépôt |
| Fournisseur de modèle de langage et clé | ouverte | L'assistant reste déterministe (règles de Fadi) — conforme à D4 |
| Stockage objet et hébergement | ouverte | Les volumes (publications) sont en base derrière une interface ; `docs/deploiement.md` décrit l'hébergement |
| Compte buildingSMART (validation IFC) | ouverte | Conformité IFC **testée** par IfcOpenShell en CI, jamais « certifiée » |
| Ouverture du fichier IFC dans un visualiseur tiers | constat attendu | Critère d'acceptation du lot 6 |
| Refus serveur des commandes sur la référence protégée (D-016) | à trancher | La protection reste côté interface (copie automatique à la première modification) |
| Règles réglementaires ou valeurs structurelles | aucune introduite | R3 : rien n'est inventé ; toute règle viendra de vous, avec sa source |

## 7. Limites connues (non faites, déclarées)

- Atelier : manipulateur 3D — pas de translation verticale pour les murs et poteaux (ils suivent leur niveau ; la
  hauteur passe par Pousser / tirer) ; murs qui se traversent : dessin d'un seul tenant (plan, documents), mais solides
  superposés en 3D et en IFC (pas de découpe).
- Échanges : `XREF` DXF dont le fichier n'est pas joint (signalée, avec le nom du fichier à joindre) ; DWG (format
  fermé, aucune bibliothèque libre retenue).
- Automatisation : génération libre (fournisseur de modèle de langage non choisi, §10.1).
- Mesures T17 / T18 sur utilisateurs et appareils réels : protocole fourni, mesure à faire.
