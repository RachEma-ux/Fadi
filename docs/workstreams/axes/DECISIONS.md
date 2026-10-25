# Axes et repères — décisions

Décisions du chantier `axes` (Issue #296). Le concept de référence est `Fadi Concept/Fadi Concept - Axes.md` (1.0,
Issue #260) ; ses propositions du § 13 ne sont pas des décisions tant qu'elles ne sont pas consignées ici.

## AX-D1 — Délégation totale réactivée (25 octobre 2026)

Le maître d'ouvrage écrit, le 25 octobre 2026 : « Réactive la délégation totale. Va dans *Fadi Concept - Axes.docx*,
analyse-le, évalue son plan d'implémentation, crée ton propre plan d'implémentation, exécute-le non stop de A à Z sans
t'arrêter pour me demander. »

Conséquences : le chef de projet (Claude) prend les décisions de produit et d'architecture du chantier, les consigne
ici (AX-D2 et suivantes), enchaîne les lots AX-0 à AX-5 sans acceptation intermédiaire, chacun fusionné CI verte
avec son compte rendu (`lots/`). La délégation ne couvre que ce chantier ; elle s'éteint à la clôture d'AX-5. Elle ne
lève aucune règle d'`AGENTS.md` (21 étapes, données non inventées, frontières de modules, règle d'or, bilinguisme).

## AX-D2 — Périmètre : le Sandbox seul porte la barre « Axes et repères »

Le seul module de Fadi qui dessine en 3D avec un repère de saisie est le Sandbox (`packages/sandbox-planche-model`,
`apps/web/src/modules/sandbox`). Le Studio n'a pas d'outil de dessin 3D (sa vue 3D est une visionneuse) et sa planche
2D est un document 2D indépendant (invariant 5 du concept). La copie de la Planche de l'Atelier
(`apps/web/src/modules/atelier/nouveau`, paquet `@parcours/planche-model`) appartient au chantier Atelier clos (D-193) :
elle n'est pas modifiée. AX18 est donc vérifié comme « frontières tenues » (aucun import croisé, le Studio inchangé) et
AX19 comme « le dessin 2D du Studio reste indépendant » (test d'architecture), sans barre Axes dans le Studio.

## AX-D3 — Le contexte de travail sort de l'historique de géométrie

Le repère de travail, le plan de travail et son verrou forment le **contexte de travail**, personnel, tenu hors de
l'historique Annuler / Rétablir : changer de repère n'est plus une opération de géométrie (écart déclaré au relevé
SketchUp « l'action se défait avec Undo »). « Repère précédent » parcourt un historique de contextes de session (au plus
20 entrées) ; Annuler ne touche que la géométrie (AX07). Le contexte est mémorisé par Planche dans ce navigateur
(stockage local, comme les autres préférences d'affichage), jamais dans le document partagé.

## AX-D4 — Migration du repère unique

Un document qui porte l'ancien `annotations.repere` le garde intact (aucune réécriture, aucune coordonnée modifiée) ; à
l'ouverture, il devient le contexte de travail actif si ce navigateur n'en mémorise pas d'autre pour cette Planche.
Les repères **enregistrés** (phase B) vivent dans `annotations.reperes` ; un document sans repère garde le repère du
modèle (AX09).

## AX-D5 — Tolérances

Une seule source : `TOLERANCES_REPERE` (modèle pur). Direction : norme minimale 1e-9 m, colinéarité refusée quand le
sinus de l'angle entre les deux directions est inférieur à 1e-6 ; base acceptée si `|‖u‖−1| ≤ 1e-9`, produits scalaires
croisés ≤ 1e-9 et déterminant > 0 (main droite). Tolérances relatives aux directions, donc indépendantes de l'échelle :
testées de 1e-6 m à 1e7 m d'origine (AX20).

## AX-D6 — Raccourcis des nouvelles commandes

Toutes les combinaisons Alt + Maj + lettre sont prises ; les nouvelles commandes prennent **Alt + Maj + chiffre**, lues
sur la touche physique (`Digit0`–`Digit9`, indépendantes d'AZERTY / QWERTY), plus **F4** et **Maj + F4** (libres :
aucune n'est réservée par Chrome ni Firefox). Placer les axes garde **Maj + Y**. Ctrl + Alt est exclu (AltGr des
claviers européens). Le test d'unicité du registre et la liste des combinaisons réservées par le navigateur
s'appliquent.

## AX-D7 — Mode Instantané seul jusqu'à AX-5

Un alignement sur une face, une arête ou un composant enregistre un instantané (mode « Instantané », défaut du
concept). Le mode « Lié » arrive en AX-5 avec un état de santé explicite (sain / périmé / manquant) et une mise à jour
seulement sur commande : jamais de rattachement deviné à une autre face (AX13).

## AX-D8 — Composants miroirs ou biais

L'édition d'origine de composant refuse, avec explication, une occurrence dont la transformation est réfléchie
(déterminant < 0) ou non orthogonale (biais, échelle non uniforme) : aucune conversion silencieuse en un autre objet.
Une occurrence à échelle uniforme est acceptée.

## AX-D9 — Collaboration

Le Sandbox est local et mono-utilisateur (aucun serveur, aucun partage de document hors fichiers exportés) : AX15
(deux utilisateurs, rejeu hors ligne) est **sans objet** pour ce chantier et le restera tant que le Sandbox n'a pas de
persistance partagée. Le contexte de travail est personnel par construction (AX-D3).

## AX-D10 — Échanges

Export OBJ, STL et IFC : choix explicite « Coordonnées du modèle » (défaut) ou « Repère de travail » (coordonnées
exprimées dans le repère actif, origine et unité affichées). « Coordonnées d'origine » n'est offert que pour une
Planche dont l'import a consigné sa correspondance (unité source et facteur) ; sinon il est grisé avec son motif.
Aucune correspondance géographique n'est inventée.
