# M08-PATH-009 à 015 — comparaison statique A2

Référence : `a15d65044ca4454bf3159f4155e51465b2a70a2c`. Quatre fiches intégralement lues, acceptation historique D-174 conservée. Aucun test, DB ou service exécuté.

47 attendus décomposés : 4 present, 18 partiel, 25 absent. Les préconditions P118 et l’admission rectangle/cercle ne valent pas acceptation de fiche. Les absences sont limitées aux candidats et au complément core-geometry indiqué dans le JSON.

| Entrée | Périmètre | Limite principale |
|---|---|---|
|009|Profils unité|Rectangle/cercle explicitement extrudés ; polygone simple partiel, auto-sécant absent.|
|010|Mode esquisse E2E|Recette murs/Porte, ni mode ni R10 ; axe desktop1440 au lieu1536 et mobile hors mode.|
|011|Constructions unité|Rapporteur30° partiel ; axes cercle et filtres non démontrés.|
|012|Axes E2E|CopieP118 seule présente ; niveau Essai20m, pas mezzanine/axe/tableau surfaces.|
|013|Hachures unité|Intervalles génériques core-geometry partiels ; pas motif hachure complet.|
|014|Hachures E2E|CopieP118 présente ; undo/redo et second navigateur autres objets.|
|015|Façade API|Plan/feuille/tableau voisin ; pas production façade ni refus lecteur403 document.|

Le JSON donne chaque sous-attendu, preuve brute, SHA et empreinte. Atomicité/inverse génériques et autorisations/409 ne prouvent pas les obligations des outils. Le test livraison tardive porte un tableau de murs, sans interleaving réel démontré d’une production façade. Aucun chemin historique remplacé. Revue A5 requise avant consolidation A0.
