# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 1 : cotation et annotations

Demande du maître d'ouvrage du 27 novembre 2026 (9 h 08, heure suisse) : « Implimenter l'entrée 2 de la Feuille de route
en trois cas du catalogue : Amélioration d'un élément existant 116 ». Regroupement en 8 lots accepté (« Implimente »,
9 h 15) ; maquettes du lot 1 (`analyses/catalogue-extensions/cas-2/lot-1/lot1-1..4.png`) validées le même jour.

## Ce qui est livré (21 entrées)

| n° | Entrée | Où |
|---|---|---|
| 1 | Chaîne dont la somme affichée diffère du total : total en rouge, liste dans Info modèle « Contrôle des chaînes » | `cotes.ts` `chainesDeCotes`, `controlerCotes` ; vue ; Info modèle |
| 3 | Cote de niveau rapportée au ±0,00 du projet ou à l'altitude NGF (« NGF ? » tant que l'altitude n'est pas déclarée dans Emplacement) | outil Cotation, option « Niveau » |
| 7 | Cotes associées aux sommets dans les groupes et composants ouverts (chemin du contexte) | `cotation.ts`, `positionSommet` |
| 8 | Cote orpheline : tracé en tirets rouges, Info entité, sélection des orphelines | `pointsCote`, Info entité |
| 14 | « ≈ » devant une valeur de cote arrondie, valeur pleine au survol et dans Info entité | `formaterLongueurCote`, infobulle |
| 24 | Cotes préservées à travers les opérations : un sommet recréé à la même position (solide, épaississement) est réassocié | `suivreAnnotations` (fin de chaque opération) |
| 28 | Au doigt : loupe d'accrochage (Cotation, Texte) et pavé numérique de la Cotation | vue (`planche-loupe`), `planche-pave` |
| 30 | Cote de pente en pourcentage, flèche dans le sens de la descente | option « Pente » |
| 31 | Plage gardée saisie par l'utilisateur ; une opération qui en sort une cote est signalée, jamais corrigée | Info entité, message de la Planche |
| 42 | Direction mesurée : alignée, horizontale, verticale, axe X / Y / Z | Info entité |
| 57 | Extrémités et alignement d'Info modèle appliqués au dessin des cotes | `dessinerCote` |
| 60 | Format : mètres, mètres avec mm en exposant, centimètres sans unité | Info modèle « Format » |
| 64 | Info entité d'une cote : valeur, association, texte forcé | `panneau-info-cote.tsx` |
| 65 | L'ancre d'un texte à repère suit l'entité désignée | `suivreAnnotations` |
| 80 | Décalage de la ligne de cote saisi au champ Mesures pendant la pose | outil Cotation |
| 81 | Styles de cote nommés, appliqués cote par cote ou à toutes les cotes | Info modèle, Info entité |
| 94 | Numérotation en série par niveau, dans l'ordre de lecture | panneau « Numérotation », commandes `numerotation` (Alt+F6) et `numeroter-serie` (Alt+F7) |
| 96 | Cote trop courte : valeur et extrémités basculées à l'extérieur des lignes d'attache | `dessinerCote` (`LARGEUR_MIN_INTERIEUR_PX`) |
| 97 | Cote pilotante : la valeur saisie déplace le second sommet coté, la géométrie connectée suit | Info entité « Valeur (pilotante) » |
| 102 | Cotes en chaîne d'un seul geste, avec la cote totale | option « En chaîne » |
| 107 | Mesure du Rapporteur transformée en cote angulaire | option « Cote angulaire » du Rapporteur |

## Écarts déclarés

- Numérotation (n° 94) : la Planche n'a pas encore de types d'objets ni de niveaux nommés. Les familles sont les noms
  de définition (sans « #n ») et un niveau rassemble les objets dont la base est à moins de 2 m de la plus basse
  (convention de rangement, `HAUTEUR_TRANCHE_NIVEAU`, et non une donnée de projet). Les niveaux nommés viendront du cas 4.
- Styles (n° 81) : application « par vue » non faite, les scènes relèvent du lot 4 ; un style s'applique cote par cote
  ou à toutes les cotes.
- « ≈ » (n° 14) : appliqué aux cotes seulement, pas au Mètre ni aux autres valeurs.
- Pavé numérique (n° 28) : effacer porte l'icône Tabler « backspace » (règle : aucun caractère Unicode comme icône).
- Aucun seuil réglementaire n'est fourni : une plage gardée est toujours saisie par l'utilisateur.

## Contrôles

`npm run typecheck`, `npm test`, `npm run build` passés avant le commit ; recettes de bout en bout par la CI de la PR.
