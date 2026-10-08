# Lot P2-5 — Réseaux — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-187). Cadre : `docs/atelier-cahier-p2.md` §3.1 (`mep`), §4 (connectivité de réseau sans table de
valeurs), §5 (lot P2-5), §8 ; D-180 (catalogues sourcés). Fiches : DA-12-01 à 14, DA-12-16 à 21, DA-03-16 — à l'état
**prototype**.

Critère du cahier : « tracer un réseau de deux tuyaux et un raccord, la connectivité est vérifiée ; P&ID dérivé ;
IFC » — joué par la recette `apps/web/e2e/p2-reseaux.mjs` (27 contrôles verts) sur P.118-R : réseau d'eau froide routé
depuis l'inspecteur (deux tronçons et un coude connectés en une révision, section du catalogue sourcé par la
spécification), pompe créée depuis l'inspecteur, connexion refusée (sections différentes) par l'outil et par le
serveur, puis acceptée ; connexion rompue par un déplacement et signalée, réparée au retour ; nomenclature, P&ID, IFC
MEP réimporté.

## Fait

| Tâche | Résultat |
| --- | --- |
| Ontologie `mep` activable (T01) | `ONTOLOGIES_ACTIVABLES` = [mechanical, structure, timber, sheetmetal, mep] ; cinq classes refusées tant que l'ontologie n'est pas active ; désactivation refusée tant qu'un objet existe ; aucune ontologie n'en importe une autre (test de source) ; aucun DN, débit ni pression dans le code (test). |
| Modèle `ontologies/mep/` | `sections.ts` (section circulaire ou rectangulaire saisie, ou ligne du catalogue `tubes-raccords.csv` sourcé : diamètre extérieur, épaisseur contrôlée, DN, fluide, matériau, source), `geometrie.ts` (tubes creux et gaines balayés le long d'une polyligne 3D, bras de raccord, corps de vanne, boîte d'équipement, symbole de support, emprises), `connectivite.ts` (`portsDe` : ports dérivés des objets ; `incompatibilites` : système, section à 1 mm, fluides, sens, coïncidence à 5 mm ; `etatConnexions`, `portsLibres`, `reseauxConnexes`), `pid.ts` (schéma dérivé et SVG), `index.ts` (réducteurs `segmentReseau.*`, `raccordReseau.*`, `vanne.*`, `equipementReseau.*`, `supportReseau.*`, `reseau.connecter / deconnecter / connecterProches / router`, `specification.definir / supprimer` ; `controlerReseau` après chaque commande : problèmes « reseau » recalculés, supports orphelins « à réparer »). Classes `segment-reseau`, `raccord-reseau`, `vanne`, `equipement-reseau`, `support-reseau` ; définition `specification` ; relation `connecte`. |
| Routage et spécifications | `reseau.router` : polyligne 3D → tronçons connectés, coude à chaque sommet intermédiaire (ports orientés amont / aval, bras raccourcissant les tronçons), tout dans une révision ; refus nommé d'un tronçon trop court. Spécification : système imposé, fluide et matériau hérités, section du catalogue parmi les désignations admises ; suppression refusée tant qu'elle est suivie. |
| Documents, IFC | Tableau **« Nomenclature de réseau »** (segments, raccords, vannes, équipements, supports ; section, longueur, fluide, matériau, spécification, source, ports et ports libres ; masse non évaluée) ; document **« Schéma de principe (P&ID dérivé) »** (SVG : nœuds, arêtes, ports libres en croix, légende des réseaux connexes et des connexions incompatibles) — deux documents de plus au catalogue (50 / 49). IFC : `IfcPipeSegment` / `IfcDuctSegment` / `IfcCableCarrierSegment`, `IfcPipeFitting` / `IfcDuctFitting` / `IfcCableCarrierFitting`, `IfcValve`, équipements par catégorie, `IfcDiscreteAccessory`, **`IfcDistributionPort` emboîtés (`IfcRelNests`), `IfcRelConnectsPorts`, `IfcDistributionSystem`** par réseau connexe ; pset `Fadi_Reseau` ; matrice complétée. |
| Interface (`apps/web`) | `panneaux/Reseaux.tsx` : outils **Segment de réseau** (sommets « x ; y ; z » ou esquisse sélectionnée, section saisie ou catalogue, spécification, coudes), **Raccord**, **Vanne**, **Équipement de réseau** (ports un par un), **Support de réseau**, **Connexion de réseau** (ports choisis, compatibilité lue avant d'agir, « connecter les ports coïncidents »), **Spécification de réseau** ; fiches avec la table des ports (état, déconnexion) et les problèmes de connectivité. Transverse : le panneau d'un outil d'ontologie reste visible au-dessus de toute sélection ; un synonyme exact d'outil prime sur un libellé qui commence par le mot (« pan » → Panoramique, correction du test CI de P2-4). Rendu plan, accrochage, sélection ; 135 clés anglaises. |
| API (`apps/api`) | `atelier-reseaux.test.ts` : activation, catalogue, spécification pilotée (refus 409 nommé), routage, vanne, pompe, connexion automatique, refus d'une connexion incompatible, rupture par déplacement signalée dans `/problemes` puis réparée, nomenclature CSV, P&ID SVG, IFC et réimport, cascade des supports ; route `GET /documents/atelier/pid.svg` ; comptes de documents (+2). |
| **Recette** (`apps/web/e2e/p2-reseaux.mjs`, en CI) | 27 contrôles verts : activation depuis le navigateur ; catalogue sourcé et spécification ; réseau EF routé depuis l'inspecteur (2 tronçons + 1 coude, 3,9 m et 2,9 m, 2 connexions) ; section DN 50 du catalogue par la spécification ; dessin en plan ; pompe créée depuis l'inspecteur ; connexion refusée par l'outil (« sections différentes », bouton inactif) et par le serveur (409) ; corrigée puis connectée (3 connexions, aucun problème) ; pompe déplacée de 20 mm → problème « ports distants », fiche de la pompe, ramenée → plus rien ; gaine, suspente, clapet ; fiche du tronçon EF 1 (source, 3,9 m, port a libre, port b connecté) ; nomenclature, P&ID (3 segments, 3 nœuds, 5 ports libres), IFC MEP, réimport ; un seul écran, un seul journal, bâtiment inchangé, 390 px, axe-core. |

## Contrôles

- `npm run typecheck` ✅ · tests `atelier-model` 426 (dont 12 `mep.test.ts`), API 93 (dont `atelier-reseaux.test.ts`),
  web 69 ✅ · `npm run build` ✅ · recettes `p2-reseaux.mjs` 27 / 27 et `interface-anglais.mjs` ✅ ici.
- Definition of Done P2 §8 : (1) activation / désactivation par projet ✅ ; (2) aucune ontologie n'en importe une autre
  (test) ✅ ; (3) aucune constante normative (DN, débit, pression : test) ✅ ; (4) matrice IFC complétée ✅ ; (5) fiches
  prototype.

## Relecture de la PR #98 (Codex, 4 constats — corrigés)

| Constat | Correction |
| --- | --- |
| Les sommets de réseau `Point3Reseau` ne portent pas de repère : des coordonnées cadastrales ou géographiques passées par l'API seraient lues comme locales. | Les sommets 3D sont **par définition en repère local du niveau** (documenté sur le type) ; `lireSommets3` refuse désormais tout point étiqueté d'un autre repère (`frame` ≠ `local`) : conversion explicite en amont, jamais de réinterprétation silencieuse (test). |
| Un port d'équipement sans `systeme` devenait un port de tuyauterie (`?? "tuyau"`) : valeur inventée qui pilotait compatibilité, connexion automatique, nomenclature et IFC. | Le système d'un port est **déclaré** : un raccord ou une vanne le transmet à ses ports (c'est le leur), un équipement doit le donner port par port — refus nommé sinon (`PortReseau.systeme` non nul, test). L'outil Équipement l'envoyait déjà. |
| Les bras des raccords étaient maillés sans la rotation `angle` appliquée aux ports : ports et dessin divergeaient pour un raccord tourné. | `maillageRaccordReseau` applique la même rotation en plan que `portsDe` (test : raccord à 90°, bras le long de y). |
| Un segment `b-vers-a` était fléché de a vers b sur le P&ID. | Les extrémités du trait sont inversées pour ce sens (attribut `data-sens` ; test). |

## Non fait (déclaré)

- **Collisions** réseau × bâtiment ou structure et **réservations** : P2-6 (coordination), comme le cahier le prévoit.
- **P&ID** : projection plan avec symboles ; pas de mise en page schématique ni d'instrumentation (P3).
- **Pentes, isolation, raccords et vannes de catalogue** (cotes de bras et face à face sourcées), **propagation** d'une
  spécification ou d'un catalogue modifié aux objets existants : reportés (D-187 i).
- Électricité et automatismes : P3 (seuls les cheminements — chemins de câbles, conduits — sont modélisés).
- Performances des équipements, débits, pressions : jamais évalués.

## Décisions prises (déléguées, D-183)

D-187 (a) à (i) : ontologie et classes, connectivité sans table de valeurs, routage, spécifications, catalogues vides,
P&ID dérivé, correspondances IFC, panneau d'outil d'ontologie au-dessus de la sélection, reports.

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

- Rejouer `p2-reseaux.mjs` ; dans P.118, activer « Réseaux », outil « Segment de réseau », trois sommets et une longueur
  de bras, puis lire la fiche d'un tronçon et le document « Schéma de principe (P&ID) ».
- Fournir le catalogue de tubes et raccords du fournisseur (gabarit `tubes-raccords.csv`) : sans lui, les sections se
  saisissent une à une et aucune spécification ne peut les restreindre.
- Accepter le lot (fiches → « disponible ») ou demander des reprises ; lot suivant de l'exécution continue : P2-6
  (surfaces, bâtiment P2, coordination : collisions entre ontologies et réservations).
