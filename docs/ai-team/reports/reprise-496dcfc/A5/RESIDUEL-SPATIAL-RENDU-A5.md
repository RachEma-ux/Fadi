# A5 — quatre résiduels spatial/rendu

Exactement C.1-01, C.1-07, C.2-02 et C.2-05. Réemploi LOT-C/M17, AC004/EX097–098, mêmes38oracles et10PERF ; aucun catalogue supplémentaire ni mesure.

## C.1-01

Mesurer les recherches spatiales actuelles sur le corpus avant optimisation.

- baseline : ScèneS3partielle et cas densités/superpositions/intersections/références liées ajoutés dans futur corpus autorisé. Oracle : Référence simple produit listecibles/points/classement avant toute optimisation ; conserver traces ambiguës et choix tolérance déclaré. Refus : Point différent malgré meilleurp95 élimine comparaison ; cas sans référence stable reste nonconclu.
- environnement : Build/SHA/matériel/GPUdriver/navigateur/mémoire/écran/cache/réseau/opérations/répétitions/outliers/méthode consignés. Oracle : EX097 reproduction possible sur données/version identiques ; CPUrenderer≠GPU etSwiftShader≠GPUphysique. Refus : Champmatériel manquant ou budgetnonadopté : pas conclusion performance, validité géométrique reste examinable.
- tailles : 100/10000/100000primitives illustratives, pas capacité annoncée. Oracle : Identifier densité/corpus et mesurer seulement au banc autorisé ; AC004/EX098 priment vitesse. Refus : Aucun seuil scènepetite ouengagementcapacité inventé.

Contrat projection/effets/mapping et tolérances applicables décidés, souslotautorisé aprèsportesapplicables ; budgetDEC13 seulementavant verdict vitesse dépendant. Aucun G2/G3 adopté ici.

## C.1-07

Conserver la possibilité d’un balayage simple sur petite scène lorsqu’il est plus approprié.

- deux-chemins : Même requête est dirigée séparément vers balayage simple et broadphaseindex puis narrowphase référence identique. Oracle : Comparerdeux sorties au même oracle indépendant : mêmes objectId/points/priorités/tolérances/départages. Refus : Deux résultats identiques entre eux mais tousdeux faux faceoracle : échec, pas équivalence acquise.
- fallback : Indexinvalide,nonconstruit,périmé ou grandschangements ; reconstruire oubasculer vers balayage. Oracle : Chemin référence correct sur mêmes données/droits, résultat porte sourceRevision ; sélection stratégie et raison tracées. Refus : Ne pas retourner résultatancien ni élargir tolérance. Indexpérimé ne constitue pas sourcevérité.
- maintenance : Insertion/suppression/modification calque/refliée/droit ; mêmes instantanés consultés par deuxchemins. Oracle : AC004 : aucune ciblesupprimée/nonautorisée, nouvelle cible attendue visible à bonne révision ; ambiguïté explicite. Refus : Heuristique petiteseuil scène nonmesurée : choixstratégie reste ouvert, ne bloque pas définitiongéométrique.

Contrat projection/effets/mapping et tolérances applicables décidés, souslotautorisé aprèsportesapplicables ; budgetDEC13 seulementavant verdict vitesse dépendant. Aucun G2/G3 adopté ici.

## C.2-02

Conserver les tables de picking après batching et instanciation.

- suppression : Supprimer objetB au milieu de batch A/B/C puis effectuer même pick. Oracle : Mapping drawId/triangle/instance→objectId+sourceRevision reconstruit ; B jamaisretourné etA/Cgardentleursidentités. Refus : Ancien indexB pointant C : refusmapping/génération périmée, jamaisfausse sélection.
- reordonnancement : Réordonner objets/lots sans changer contenu canonique. Oracle : Mêmes objets sélectionnés au même point sous nouvelle génération ; aucun objectId assigné selon positionancienne. Refus : Ordre GPU ne réécrit niID niquantité ; résultatanciennegénération refusé.
- rebatch : Changer style/calque/règlelot et fusionner/scinder leslots. Oracle : Deux objets partageant lot gardent mapping univoque ; sélection,masquesetdroits parobjet corrects. Refus : Mauvaiseidentité masquée par mêmegéométrie : échec éliminatoire.
- instance : Deux occurrences partageant géométrie avec transformationsdistinctes. Oracle : instanceId résout chaque objectId propriétaireet contexte ; même géométrie n’estpas même objet. Refus : Supprimeruneinstance ne remetpas indexancienneinstance surautre ; aucun transfert sélectionsilencieux.

Contrat projection/effets/mapping et tolérances applicables décidés, souslotautorisé aprèsportesapplicables ; budgetDEC13 seulementavant verdict vitesse dépendant. Aucun G2/G3 adopté ici.

## C.2-05

Prévoir un recalcul plus large lorsque l’exactitude l’exige.

- source-inconnue : Effetcommande sans sourceRevisionId fiable ou dirtiness non justifiable. Oracle : Reconstruction pluslarge/complète de sourcecanonique identifiée ; anciennesdonnées restent marquées périmées jusqu’à résultat validé. Refus : Pas actualisationpartielle guessed, pas invalidationcanonique pour gagner FPS.
- topologie : Commande change géométrie/hôte/référence/topologie. Oracle : EffetsEX010 consommés, mapping/index/projections concernés invalidés ; comparaisonau brasrebuild complet sur même révision et oracle. Refus : Ancienneface/triangle ne devient pas nouvelle référence silencieusement ; ambiguïté signalée/refusée au contratM17.
- version : Worker/calcul rend résultat rN pendant têteavance rN+1 ; changement versioncontrat/génération. Oracle : Engagement seulement si contexte/base/versions encore compatibles selon contrat ; snapshot épinglé historique peut rester consultable avec étiquette. Refus : Anciencalcul ne remplace jamais courant ; historiquevalide≠courant, rejetne signifie pas destructionhistorique.
- comparatif : BrasA invalidationincrémentale etbrasB reconstructiontotale à étatcanonique identique. Oracle : Comparer picking/snapping/dimensions/quantités/objets exportés/inverse/conflits parEX098, puis coûtsPERF06 séparés. Refus : Gaintemps sans égalitéfonctionnelle éliminatoire ; résultatnonéquivalent déclenche rollbackrebuild, sans donnéesmodifiées.

Contrat projection/effets/mapping et tolérances applicables décidés, souslotautorisé aprèsportesapplicables ; budgetDEC13 seulementavant verdict vitesse dépendant. Aucun G2/G3 adopté ici.

Seuils/tolérances non fixés par ce dossier. Résultat disponible et coût oracle séparés ; deuxbras PERF06 ; historiqueépinglé distinct obsolètecourant. Aucun code/test/runtime/moteur/API/DB/registre/gate modifié ou exécuté.
