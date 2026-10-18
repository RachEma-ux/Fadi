# Liaison des neuf NAV aux fixtures synthétiques — Mission004

Préparation sous D01/D07 ; D02 reporte les options avancées, aucun codeStudio ou recette navigateur exécuté. UX-S0 reste le contexte minimal synthétique défini par A4, distinct des scènesS1–S7 ; le jeu `syn-pavillon/syn-study-01/syn-variant-A/syn-revision-01` fournit des identifiants fictifs, pas des routes implémentées.

| NAV canonique | Fixture à combiner avec UX-S0 | TEST associés | Oracle positif/négatif décisif |
|---|---|---|---|
| NAV-001 entréeStudio | S1/S6 |016/017 |Studio aprèsProjets, nomaccessible/clavier/actif corrects ; contexteinterdit ne révèle rien. Placement D07 spécifié, pasimplémenté. |
| NAV-002 ouvertureautonome | S1/S5 |001/002 |2D sans3D et3D sansesquisse ; aucune étapeParcours créée/validée et aucun détourAtelier forcé. |
| NAV-003 sélectionexplicite | S6 |001/035 |Absenceprojet/étude→choixautorisé ; projetinterdit/refus ne crée pas objetorphelin. |
| NAV-004 URL/retour/reprise | S6/S7 |018/021/035/036 |Projet/étude/variante/révision exactement restaurés si autorisés ; mélanged’IDs/autreprojet refusé serveur et caches. |
| NAV-005 domaines/planches | S1/S5/S6 |001/002/019 |Quatre domaines ; planches2D/3D seulement Dessin/modélisation ; profilnechange ni donnéesni droits. |
| NAV-006 identitécontexte | S2/S6 |003/009/010/018/030/038 |Bandeauexact, révisionhistorique immuable ; approbation≠publication, cumuluniquementexplicitementconfiguré. |
| NAV-007 protectionactions | S1/S6/S7 |011/013/021/036 |Geste/sauvegarde/file protégés lorsnavigation/plein écran ; annulation/reconnexion ne perd pas commande. |
| NAV-008 erreurrécupérable | S5/S7 |014/015/020/037 |Workercrash/outilsnoncachés/chargementéchoué indiqués clairement ; barreFadi et retours accessibles sansfausssuccès. |
| NAV-009 coexistence | S1/S2/S4/S6/S7 |SuiteFadi existante ciblée |Accueil/Projets/21étapesParcours/Atelier/Collaboration et fonctionsindustrielles conservés ; aucune recettehistorique promue auSHA futur. |

Environnements de recette prescrits : desktop/mobile physique à identifier, clavier/tactile, FR/EN, entrée/sortieplein écran explicites ; versionsbrowser/écran/zoom/accessibilité/caches/réseau tracées. A4 fournit `NAV-M004.json` et `CONTRAT-NAV-M004.md`. Les tests mentionnés restent **Non exécuté** ; les IDs liés sont des liens proposés à revue, pas de nouvelles preuves.

Sources quantifiées : TEST009/010 mur6×3×0,2m et ouverture1×2,1puis1,2m→net3,180puis3,096m³ ; TEST016profil20outils sansinitialisationmoteursrares ; TEST03750cycles, seuilmémoire encoreDEC13. Aucun délai/latence/taillecapacité ajouté comme exigence sans décision. Les autres dimensions sont des choix synthétiques explicites d’oracle mathématique.
