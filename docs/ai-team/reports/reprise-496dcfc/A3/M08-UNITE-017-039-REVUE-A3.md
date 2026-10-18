# M08 — unité017–039 : revue indépendante A3

Référence immuable `a15d65044ca4454bf3159f4155e51465b2a70a2c` ; **12entrées/109attendus**, lecture statique sans aucun test/runtime/DB/API/E2E. L’analyse porte sur fixtures, paramètres et assertions effectivement présents, après confrontation aux clauses unité et Suivi/décisions. PR171/CLASSIF1 n’est pas utilisée comme preuve.

Les qualifications A2 restent10présents/48partiels/46absents/4anciens-attendus-supersédés/1nonconclu. Elles sont recevables comme rapprochements bornés. **Les48partiels ne constituent pas48obligations partiellement validées** : A2 confirme que preuve voisine et socle générique sont du support indirect seulement. Le JSON sous-classe chaque attendu et donne109analyses A3 distinctes.

Intégrité documentaire complémentaire : 20sources, 569citations/498uniques, zéro écart. Ce contrôle d’ancrage n’est pas la revue sémantique et n’est pas un test produit.

| Entrée | Attendus revus | Présents A2 | Partiels A2 | Absents A2 | Supersédés / nonconclu |
|---|---:|---:|---:|---:|---:|
| M08-PATH-017 | 11 | 1 | 6 | 4 | 0 / 0 |
| M08-PATH-019 | 9 | 1 | 5 | 2 | 1 / 0 |
| M08-PATH-021 | 7 | 0 | 3 | 4 | 0 / 0 |
| M08-PATH-023 | 10 | 1 | 2 | 6 | 1 / 0 |
| M08-PATH-025 | 13 | 1 | 3 | 8 | 1 / 0 |
| M08-PATH-027 | 9 | 1 | 5 | 2 | 0 / 1 |
| M08-PATH-029 | 10 | 2 | 5 | 3 | 0 / 0 |
| M08-PATH-031 | 6 | 0 | 3 | 3 | 0 / 0 |
| M08-PATH-033 | 10 | 0 | 7 | 3 | 0 / 0 |
| M08-PATH-035 | 8 | 1 | 3 | 3 | 1 / 0 |
| M08-PATH-037 | 7 | 2 | 2 | 3 | 0 / 0 |
| M08-PATH-039 | 9 | 0 | 4 | 5 | 0 / 0 |

## Relecture des décisions

- **M08-PATH-019 / D-060** : Confirme supersession de l’ancien refus général de copier pièce. Copie avec codes garder/vider/suivant explicites ; ne pas supprimer la prescription historique ou prétendre que toutes les copies de pièce sont vérifiées ici. Preuves `docs/atelier/decisions.md` lignes 64 et Suivi de la fiche ligne34.
- **M08-PATH-023 / D-146** : Confirme supersession de l’ancien refus général du miroir de cornièreL. L prend un indicateur miroir, T/U ont une orientation propre ; ne pas transformer cette décision en réussite des tests absents de ces candidats. Preuves `docs/atelier/decisions.md` lignes 150 et Suivi de la fiche ligne33.
- **M08-PATH-025 / D-088** : Confirme supersession du refus général d’échelle escalier. Axe échelonné, dimensions typées conservées ; seul le cas positif effectivement asserté est attribuable, pas une validation de confort/réglementation. Preuves `docs/atelier/decisions.md` lignes 92 et Suivi de la fiche ligne31.
- **M08-PATH-035 / D-043 et D-073** : Confirme supersession du refus général rayon0, restreinte à ligne–ligne. Jonction d’angle sans arc à rayon0. D073 garde le refus avec un arc ; aucun refus ne doit être supprimé en bloc. Preuves `docs/atelier/decisions.md` lignes 47,77 et Suivi de la fiche ligne30.
- **M08-PATH-027 / D-116** : Confirme non conclu pour l’attendu générique rectangle toujours rectangle. etirerFenetre et son test attendent un polygone ; la fiche initiale exigeait rectangle. D116 ne prouve pas le comportement de l’ancien etirer sur rectangle : ne pas généraliser la supersession, conserver le manque ciblé. Preuves `docs/atelier/decisions.md` lignes 120 et Suivi de la fiche ligne34.

## Confrontation par attendu

### M08-PATH-017 — docs/atelier/fiches/DA-02-01.md

- **M08-PATH-017-A01 / present** — Mur et porte déplacés : t inchangé : La fixture fixe la porte à0,25 et cette valeur est comparée après le déplacement effectif du mur ; cet oracle précis est bien présent. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-017-A02 / partiel** — Distance de porte inchangée : Le centre après déplacement est vérifié, sans comparaison de la distance à une extrémité hôte avant/après. Ne pas déduire cette seconde invariance du seul centre. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-017-A03 / partiel** — Inverse coordonnées bit à bit : Le transfert de niveau exerce bien déplacer puis son inverse, mais ne teste pas les coordonnées horizontales du cas demandé ; le JSON exact cité concerne un autre lot. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-017-A04 / partiel** — Vecteur nul refusé : Le manipulateur ne produit aucune commande pour un geste nul ; ce comportement UI pur ne vaut pas refus du réducteur. Un transfert de niveau avec dx=dy=0 est un autre cas D039. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-017-A05 / partiel** — Cible autre niveau refusée : La boîte de manipulation renvoie null pour un niveau différent ; cela ne prouve pas le refus atomique d’une commande portant une sélection multiniveau. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-017-A06 / partiel** — Calque verrouillé refusé : Le verrou est exercé lors de création d’un mur, pas lors du déplacement d’une cible déjà existante ; support de principe uniquement. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-017-A07 / partiel** — Sélection mixte : un seul lot : Le lot vertical contient mur et poteau ; l’unicité du lot est visible à l’appel, pas un journal serveur ni le cas horizontal de la fiche. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-017-A08 / absent** — Jonctions rompues listées : Aucun diagnostic de jonction rompue n’est comparé dans les candidats, malgré les cas positifs de déplacement. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-017-A09 / absent** — Pièce désalignée listée : Détecter une pièce et son aire ailleurs ne teste pas le diagnostic de désalignement après déplacement. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-017-A10 / absent** — Cotation : référence conservée : Le rattachement de cote est préparé dans la fixture ; aucune assertion ne le retrouve après le déplacement. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-017-A11 / absent** — Cotation : valeur recalculée : La cote n’a pas de valeur mesurée après déplacement dans le test. Sa simple présence initiale est insuffisante. Support : aucun oracle ciblé dans périmètre candidat.

### M08-PATH-019 — docs/atelier/fiches/DA-02-02.md

- **M08-PATH-019-A01 / partiel** — Copie mur avec porte : deux murs : Les deux IDs créés et l’ancien hôte sont contrôlés ; l’ensemble final des murs n’est pas dénombré exactement. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-019-A02 / partiel** — Copie mur avec porte : deux portes : Une porte créée et l’ouverture de l’ancien mur sont visibles, sans assertion globale de deux portes au total. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-019-A03 / partiel** — Position t égale sur copie : Le nouvel hôte et le centre copié sont contrôlés, sans assertion de position t comparée entre original et copie. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-019-A04 / present** — Repere absent sur copie : Le repère de la copie est explicitement null. Il s’agit de l’absence métier, pas de l’absence de la clé dans le JSON. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-019-A05 / absent** — Poteau : statutConception absent : Le titre «sans statut» ne contient pas d’assertion sur statutConception d’une copie de poteau ; ne pas lui attribuer ce contrôle. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-019-A06 / absent** — Cotation rattachée copiée libre : Pas de copie d’une cote rattachée ni comparaison des références de sa copie dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-019-A07 / partiel** — Même enveloppe mêmes IDs de copie : La déterminisation observée sur création de mur ne rejoue pas la même enveloppe de copier ; oracle ciblé absent. Support : socle générique, oracle spécifique absent.
- **M08-PATH-019-A08 / partiel** — Inverse supprime exactement copies : L’inverse du lot création ne démontre pas la suppression exacte des seules copies produites par copier. Support : socle générique, oracle spécifique absent.
- **M08-PATH-019-A09 / non_applicable** — Piece refusée : D060 et le Suivi de la fiche autorisent explicitement la copie de pièce avec politiques de code ; l’ancien refus général reste historique, pas rétabli. Support : prescription historique supersédée dans sa portée.

### M08-PATH-021 — docs/atelier/fiches/DA-02-03.md

- **M08-PATH-021-A01 / partiel** — Mur90 autoura : b tourné tolérance : Une ligne est tournée à90° dans le complément et ses coordonnées sont comparées ; ce n’est pas le mur autour de son a demandé. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-021-A02 / absent** — Porte t inchangé après rotation : Position de porte après déplacement ne démontre pas t après rotation de son hôte. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-021-A03 / absent** — Poteau angle+90 : Le test de rotation ne crée et ne contrôle aucun poteau avec son angle augmenté. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-021-A04 / absent** — Angle0 refusé : Le geste de déplacement nul du manipulateur ne teste pas la rotation d’angle0. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-021-A05 / absent** — Angle360 refusé : Pas de commande de rotation360° dans les candidats ; aucun oracle de refus ne peut être attribué. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-021-A06 / partiel** — Inverse rotation valeurs bit à bit : Un inverse de création ou d’une autre opération ne restitue pas ici l’état avant rotation ; oracle ciblé absent. Support : socle générique, oracle spécifique absent.
- **M08-PATH-021-A07 / partiel** — Écart aperçu/validé sous tolérance : Le calcul d’angle aperçu et l’application d’une commande sont présents, mais objets définis ne borne aucun écart géométrique aperçu/validé. Support : même fonction/famille ou sous-assertion, scénario incomplet.

### M08-PATH-023 — docs/atelier/fiches/DA-02-04.md

- **M08-PATH-023-A01 / partiel** — Mur(1,0)(3,0) miroir x0→(-1,0)(-3,0) : Les extrémités d’un mur symétrisé autour de x=2 sont exactes ; la fixture x=0 et les coordonnées négatives du cahier diffèrent. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-023-A02 / absent** — Alignement gauche devient droite : Ni alignement gauche/droite ni son basculement ne sont comparés dans le test de miroir. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A03 / absent** — Corps image miroir : Les points d’axe contrôlés ne sont pas un oracle sur le corps épais réfléchi. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A04 / absent** — Porte t inchangé miroir : Le miroir ne comporte aucune assertion sur la position t de l’ouverture hébergée. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A05 / present** — Cote face-gauche à réparer : La référence face-gauche initiale est retrouvée à-réparer avec proposition face-droite explicite ; cas ciblé couvert statiquement. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-023-A06 / absent** — Original gardé image neuve : Le test fait un miroir en place ; il ne conserve pas un original tout en créant son image neuve. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A07 / absent** — Original gardé références intactes : Pas de miroir-copie ni comparaison de conservation des références de l’original. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A08 / non_applicable** — Poteau L refusé : D146 décrit la cornièreL et son indicateur miroir, confirmé par le SuiviD146. L’ancien refus de toute cornièreL est supersédé, sans conclure que tous ses cas sont testés ici. Support : prescription historique supersédée dans sa portée.
- **M08-PATH-023-A09 / absent** — Axe dégénéré refusé : Aucune commande avec axe dégénéré et refus attendu dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-023-A10 / partiel** — Inverse miroir bit à bit : Le miroir n’est pas inversé dans le scénario ; le socle inverse d’un autre lot est indirect. Support : socle générique, oracle spécifique absent.

### M08-PATH-025 — docs/atelier/fiches/DA-02-05.md

- **M08-PATH-025-A01 / partiel** — Carré facteur2 côtés doublés : Le complément double une ligne et contrôle un point ; les quatre côtés d’un carré ne sont pas comparés. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-025-A02 / absent** — Coin centre reste fixe : Le centre choisi n’est pas retrouvé comme coin de l’objet résultat dans une assertion dédiée. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A03 / present** — Mur épaisseur inchangée : L’épaisseur0,2 est comparée après échelle facteur2 du mur ; l’invariance précise est assertée. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-025-A04 / absent** — Mur hauteur inchangée : Le titre parle des dimensions mais seule l’épaisseur du mur est comparée, pas sa hauteur. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A05 / absent** — Porte t inchangé échelle : Le scénario échelle ne crée aucune porte dont t serait comparé après opération. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A06 / absent** — Poteau point échelonné : Aucun point de poteau n’est comparé après l’échelle dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A07 / absent** — Poteau section inchangée : Aucune section de poteau ne fait l’objet de cette invariance après échelle. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A08 / partiel** — Facteur0 refusé : Une saisie de facteur0 est rejetée par le manipulateur ; pas une commande échelle0 soumise au réducteur. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-025-A09 / absent** — Facteur-1 refusé : Pas de facteur négatif exercé avec refus dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A10 / absent** — Facteur1 refusé : Pas de facteur1 exercé avec refus dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A11 / non_applicable** — Escalier refusé : D088 autorise l’axe de l’escalier à être mis à l’échelle ; le test positif actuel le fait. Ne pas restaurer le refus historique de toute échelle escalier. Support : prescription historique supersédée dans sa portée.
- **M08-PATH-025-A12 / absent** — Facteur longueur voulu/actuel : Facteur2 calculé par geste ne démontre pas le quotient explicite longueur voulue/actuelle du mode référence. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-025-A13 / partiel** — Inverse échelle bit à bit : L’inverse générique ailleurs ne restitue pas le résultat de l’échelle de ce scénario. Support : socle générique, oracle spécifique absent.

### M08-PATH-027 — docs/atelier/fiches/DA-02-06.md

- **M08-PATH-027-A01 / partiel** — Mur4 porte1 : b à3, distance1 t1/3 : Le test étire b à8 et conserve le centre de porte à1 ; ni le raccourcissement à3 ni t=1/3 ne sont comparés. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-027-A02 / absent** — a étiré : distance àb conservée : L’extrémité a n’est pas étirée dans le candidat, donc aucune conservation de distance à b n’y est testée. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-027-A03 / partiel** — Fenêtre contient mur : translation : D116 traduit un cercle entièrement pris et étire partiellement un mur ; cela ne teste pas un mur entièrement contenu par la fenêtre. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-027-A04 / absent** — Mur entièrement fenêtré t inchangé : Le maintien de distance sur un mur étiré ne remplace pas t invariant pour un mur entièrement translaté. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-027-A05 / partiel** — Porte1.4 dans mur1 : à réparer : Le signal à-réparer est contrôlé pour porte0,8 et mur1,2 ; le cas métrique porte1,4/mur1 n’est pas exercé. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-027-A06 / present** — Porte hors emprise non supprimée : Après étirement trop court, l’occurrence porte reste explicitement définie ; non-suppression réellement assertée. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-027-A07 / nonconclu** — Rectangle toujours rectangle : Le SuiviD116 introduit etirerFenetre et le test attend forme=polygone. La fiche antérieure exige rectangle pour une autre portée ; ne pas conclure la conformité ni supprimer globalement cet ancien attendu. Support : portée non résolue, aucun verdict de conformité.
- **M08-PATH-027-A08 / partiel** — Polygone auto-sécant refusé : Le refus de contour croisé concerne etirerFenetre sur une dalle, pas le polygone de l’ancien chemin. Le refus ciblé reste non démontré. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-027-A09 / partiel** — Inverse étirement bit à bit : L’inverse de etirerFenetre est profond et exact pour son scénario ; ne pas l’attribuer à l’ancien etirer ou à des bits IEEE non mesurés. Support : autre opération ou primitive voisine, support indirect seulement.

### M08-PATH-029 — docs/atelier/fiches/DA-02-07.md

- **M08-PATH-029-A01 / partiel** — Ligne coupée deux arêtes clic milieu : deux lignes : La gommeAlt produit deux morceaux ; l’appel n’est pas transformer.ajuster. Ce rapprochement ne teste pas l’oracle Ajuster. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-029-A02 / partiel** — Longueurs deux tronçons vérifiables : Les coordonnées des deux morceaux de gomme sont utiles, sans démontrer les longueurs du résultat ajuster demandé. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-029-A03 / absent** — Une arête : tronçon jusqu’à extrémité : Pas de cas ajustement avec une seule arête comparant le tronçon gardé. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-029-A04 / absent** — Aucune intersection refusée : Le message de raccord multiple sans jointure ne prouve pas le refus ajuster sans intersection. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-029-A05 / absent** — Cercle devient arc angles attendus : Pas de transformation cercle→arc avec comparaison des angles pour ajuster. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-029-A06 / partiel** — Porte tronçon retiré à réparer : La porte à-réparer appartient au test d’étirement ; elle n’est pas dans un tronçon retiré par ajuster. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-029-A07 / partiel** — Porte non supprimée ajustement : La non-suppression après étirement n’exerce pas la non-suppression après retrait de tronçon. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-029-A08 / present** — Scission cote à réparer : Le scénario de scission met explicitement la cotation à-réparer ; cette sous-clause de la ligne unité est présente, sans couvrir ajuster complet. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-029-A09 / present** — Scission deux propositions : Les propositions de référence sont comparées aux deux nouveaux murs ; cas scission ciblé de la clause présent. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-029-A10 / partiel** — Inverse restaure IDs et valeurs ajustement : Le complément inverse une scission multi-positions ; il n’inverse pas la suppression de tronçon par ajuster. Support : autre opération ou primitive voisine, support indirect seulement.

### M08-PATH-031 — docs/atelier/fiches/DA-02-08.md

- **M08-PATH-031-A01 / partiel** — Ligne frontière extrémité intersection : Le complément prolonge par longueur, sans frontière ; le test de jointure mur utilise une autre commande. Aucun oracle frontière de prolonger complet. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-031-A02 / absent** — Arc angleFin recalculé prolongement : Pas d’arc prolongé ni d’angleFin comparé dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-031-A03 / partiel** — Mur porte distance extrémité fixe : La conservation de porte lors d’étirement est un autre réducteur ; pas preuve de prolonger mur. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-031-A04 / absent** — Frontière absente refusée : D043 autorise longueur sans frontière mais ne dispense pas d’une longueur ET d’une limite absentes. Aucun refus de cette entrée incomplète n’est asserté. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-031-A05 / absent** — Extrémité déjà posée refusée : Pas de prolongement sans effet avec extrémité déjà sur limite et refus comparé. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-031-A06 / partiel** — Inverse prolonger bit à bit : Aucun inverse du prolongement réalisé ici ; le test inverse générique reste un mécanisme voisin. Support : socle générique, oracle spécifique absent.

### M08-PATH-033 — docs/atelier/fiches/DA-02-09.md

- **M08-PATH-033-A01 / partiel** — Ligne décaléed parallèle distance d : Un premier point de ligne décalée est exact ; ni second point ni distance parallèle de toute la ligne n’est comparée. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-033-A02 / partiel** — Rectangle côtés±d : L’aire d’un carré par inwardOffset est un test d’algorithme distinct, sans commande décaler-rectangle ni comparaison de ses côtés. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-033-A03 / partiel** — Cercle rayonr+d : Le clic hors du cercle choisit extérieur, mais la commande n’est pas appliquée pour comparer le rayon r+d. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-033-A04 / partiel** — Cercle rayonr-d : Le clic dedans choisit intérieur, sans appliquer le résultat ni comparer le rayon r-d. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-033-A05 / absent** — r-d≤0 refusé : Pas d’entrée décalage de cercle avec rayon résultant nul/négatif et refus asserté. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-033-A06 / partiel** — Convexe résultat égal inwardOffset : inwardOffset a son propre résultat attendu ; le résultat de la commande n’est pas comparé à ce référent. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-033-A07 / partiel** — PolygoneL distance intérieure excessive refusée : Refus de non-convexitéL dans le noyau ≠ refus de distance excessive du décalage général. Oracle ciblé absent. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-033-A08 / absent** — Mur décalé porte copiée : Le copier-mur testé ailleurs ne crée pas une porte lors du décalage de son mur. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-033-A09 / absent** — Repere porte décalée vide : Le repère null est une assertion de copier, pas de porte nouvellement décalée. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-033-A10 / partiel** — Même enveloppe mêmesIDs décalage : Le déterminisme de création de mur ne rejoue pas l’enveloppe décaler. Support : socle générique, oracle spécifique absent.

### M08-PATH-035 — docs/atelier/fiches/DA-02-10.md

- **M08-PATH-035-A01 / partiel** — Deux lignes perpendiculaires rayonr : arc quart : Le résultat est un arc et son centre est vérifié ; ni balayage de90° ni rayon effectif de cet arc ne sont comparés. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-035-A02 / absent** — Tangence aux deux lignes : Aucune comparaison de tangente ou des points de contact avec les deux lignes. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-035-A03 / present** — Centre distancer chaque ligne : Avec les axes y=0 et x=4, centre(3,1) et rayon demandé1, les deux distances se déduisent des coordonnées comparées à1e-9 ; portée de la fixture seulement. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-035-A04 / partiel** — Parallèles refusées raccord : L’intersection de parallèles renvoie null dans core ; aucun refus de transformer.raccorder ne s’y substitue. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-035-A05 / absent** — Rayon maximal calculé : Aucun rayon maximal calculé ni refus à une valeur excessive n’est comparé. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-035-A06 / non_applicable** — Rayon nul refusé : D043 et son test créent une jonction de lignes de rayon0 sans arc ; D073 conserve le refus avec arc. Seul l’ancien refus général est supersédé. Support : prescription historique supersédée dans sa portée.
- **M08-PATH-035-A07 / partiel** — Inverse raccord restitue extrémités : L’inverse d’un autre lot ne rétablit pas ici les extrémités avant raccord. Support : socle générique, oracle spécifique absent.
- **M08-PATH-035-A08 / absent** — Inverse supprime arc : Pas d’inverse du raccord avec vérification de disparition de son arc. Support : aucun oracle ciblé dans périmètre candidat.

### M08-PATH-037 — docs/atelier/fiches/DA-02-11.md

- **M08-PATH-037-A01 / present** — Perpendiculairesd=d : longueur d√2 : Les extrémités exactes(3,0)/(4,1) pour d=1 impliquent une longueur√2 ; preuve géométrique du cas, pas benchmark d’une fonction longueur. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-037-A02 / present** — Chanfrein45° : Le même vecteur(1,1) impose45° pour ce cas perpendiculaire. Ne pas exiger un champ angle différent pour reconnaître cette équivalence numérique. Support : oracle ciblé direct ou équivalence numérique explicite.
- **M08-PATH-037-A03 / absent** — Mode distance-angle équivalent : Le mode distance-angle n’est pas comparé au mode deux distances. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-037-A04 / partiel** — Lignes parallèles refusées chanfrein : Le test de primitives parallèles ne soumet pas une commande chanfrein et ne prouve pas son refus. Support : autre opération ou primitive voisine, support indirect seulement.
- **M08-PATH-037-A05 / absent** — Distance maximale calculée : Aucune distance maximale admissible n’est comparée ni motivée par un refus. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-037-A06 / partiel** — Inverse restaure extrémités : L’inverse d’une création dans un autre lot ne rétablit pas les extrémités modifiées par chanfrein. Support : socle générique, oracle spécifique absent.
- **M08-PATH-037-A07 / absent** — Inverse supprime segment : Aucun inverse chanfrein suivi d’une assertion que le segment créé a disparu. Support : aucun oracle ciblé dans périmètre candidat.

### M08-PATH-039 — docs/atelier/fiches/DA-02-12.md

- **M08-PATH-039-A01 / partiel** — Réseau3×2 : cinq copies : Trois copies d’un poteau en rangée sont dénombrées ; ce n’est pas cinq copies d’une grille3×2. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-039-A02 / partiel** — Positions cinq copies grille attendues : Le dernier point à15,0 est comparé ; les cinq positions complètes de la grille demandée ne le sont pas. Support : même fonction/famille ou sous-assertion, scénario incomplet.
- **M08-PATH-039-A03 / absent** — Polaire4 à360 :90/180/270 : Pas de réseau polaire4/360° comparant les trois angles dans les candidats. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-039-A04 / absent** — Polaire3 à180 :90/180 : Pas de réseau polaire3/180° comparant90° et180°. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-039-A05 / absent** — Pas nul refusé : Aucune répétition à pas nul avec refus asserté. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-039-A06 / absent** — Plafond dépassé refusé : Pas de dépassement de plafond de répétition avec refus comparé. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-039-A07 / absent** — Répétition mur porte2×(mur+porte) : Le réseau exercé ne contient que poteau ; copier un mur avec sa porte ailleurs ne prouve pas leur réseau. Support : aucun oracle ciblé dans périmètre candidat.
- **M08-PATH-039-A08 / partiel** — Même enveloppe mêmesIDs réseau : Le déterminisme du générateur lors d’une création ne rejoue pas le même réseau. Support : socle générique, oracle spécifique absent.
- **M08-PATH-039-A09 / partiel** — Inverse supprime exactement copiesréseau : Pas d’inverse du réseau à supprimer exactement ; inverse générique d’une autre opération seulement. Support : socle générique, oracle spécifique absent.

## Réserves et reprise

- Les48partiels ne doivent être additionnés ni à des obligations exécutées ni à une couverture fonctionnelle. Le sous-classement A3 distingue scénario incomplet d’autre opération/socle générique.
- toThrow seul sans comparaison profonde après refus ne démontre pas atomicité. Inverse profond/JSON d’un autre lot ne démontre pas inverse de chaque transformation, ni une comparaison binaire IEEE des flottants.
- Une assertion de point peut avoir une conséquence numérique exacte (√2/45° pour le chanfrein). Ne pas exiger un nom de test ou champ superflu, mais limiter la conséquence à la fixture effectivement comparée.
- Prescriptions historiques/D174 conservées ; la présente analyse n’annule pas l’acceptation antérieure et n’accepte aucun lot nouveau.
- Absence bornée aux deux candidats du mapping et compléments identifiés ; les autres tests nommés par Suivi ne deviennent pas absents du dépôt, simplement non attribués par cette comparaison.
- Aucun test relancé, aucune CI transférée, aucun code de test corrigé pour cet exercice.

A5 QA des réserves/supersessions/indépendance ; A0 consolide au suivi canonique sans sommer les partiels comme réalisés et conserve prochaine action des manques.

A3 a conservé les sourcesa15 dans un dossier de travail séparé pour la lecture, sans modifier le checkout, les fiches ou les décisions. A0 seul intègre au suivi ; aucune nouvelle acceptation fonctionnelle ou exécution déclarée.
