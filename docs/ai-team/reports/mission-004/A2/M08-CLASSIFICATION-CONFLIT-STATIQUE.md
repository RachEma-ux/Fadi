# M08 — Conflit de contrat classification confirmé statiquement

**P2 — Conflit confirmé par lecture du code et des décisions ; aucune reproduction runtime.** Sur la référence PR169 `a15d65044ca4454bf3159f4155e51465b2a70a2c`, `affecterClassification` remplace inconditionnellement la propriété canonique `classeIfc` par la correspondance de la classe Fadi, provenance `regle`, statut `verifiee` (`organisation.ts:436`). L'instruction est après les branches code présent et code=null : elle s'applique aux deux parcours qui atteignent cette instruction, puis la propriété entre dans l'état retourné (`:439`). Une valeur saisie ou importée existante peut donc être remplacée ; une propriété absente peut être créée. Ce sont les conséquences du flux statique, sans preuve qu'un utilisateur ou une base particulière ait rencontré le cas.

Le routeur pur de commandes appelle ce réducteur pour `id` et pour chaque membre de `ids` (`commandes/index.ts:292–303`). Le périmètre potentiel inclut l'affectation individuelle et le lot par règle, sous réserve des validations amont. Il ne s'agit pas d'une simple métadonnée de projection : la valeur est placée dans `etat.objets[id].proprietes` retourné.

Les empreintes, blobs Git et citations brutes exactes sont dans `M08-CLASSIFICATION-CONFLIT-STATIQUE.json`. Les références ci-dessous portent toutes sur le même SHA, photographie de PR169, sans prétendre une fusion dans main.

| Source | Portée relue | Conclusion |
|---|---|---|
| DA-06-08:11,15,17,19,24 | Classe IFC non déduite de la classe Fadi ; correspondance d'export distincte ; déclaration saisie/importée conservée, incohérence signalée | Contredit l'affectation systématique canonique avec statut vérifié |
| D-065, décisions:69 | Référentiel chargé valide code/libellé ; sans référentiel code déclaré ; contrôle croisé non traité | Le statut vérifié du code valide n'autorise pas une nouvelle classe IFC vérifiée ; aucune autorisation explicite de cette substitution |
| D-111, décisions:115 | Comparaison dérivée, déclaration jamais corrigée, rien écrit au modèle, export annexe C conservé | Le diagnostic de correspondance ne justifie pas d'écraser la déclaration |
| D-112, décisions:116 | Proposition puis application explicite d'un lot de codes ; mêmes contrôles ; jamais d'office | Autorise le lot de codes, aucune règle supplémentaire de substitution `classeIfc` énoncée |
| D-174, décisions:178 | Acceptation des lots, statuts disponibles et preuves inchangées ; limites maintenues | Acceptation historique préservée ; ne réécrit pas les prescriptions de classification et ne vaut pas autorisation du nouveau correctif |
| `annexe-c.ts:62–73` | Contrôle dérivé lit la déclaration, signale l'écart et ignore les objets importés d'IFC pour ce contrôle | Séparation de responsabilités existante et réutilisable, pas à remplacer |
| `commandes.test.ts:279–282` | Oracle attend explicitement classe IFC calculée et vérifiée après code Uniclass ; retrait ne vérifie que disparition du code | Oracle entretient le conflit ; présence du test n'est pas validation du contrat |
| `annexe-c.test.ts:22–30` | Déclaration IfcDoor du mur conservée après contrôle, export IFCWALL et rapport d'écart | Oracle complémentaire cohérent D-111, mais ne combine pas contrôle et nouvelle affectation/retrait du code externe |

D-065, D-111, D-112 et D-174 n'ont pas à être remis au vote pour réaffirmer leur texte. Ce constat prépare une demande d'autorisation d'un correctif borné du comportement et de ses oracles, pas une nouvelle décision normative ni une suppression d'acceptation historique.

## Lot proposé à autoriser séparément

**Objet :** rendre l'affectation et le retrait de codes de classification externes neutres pour la déclaration canonique `classeIfc`, en respectant les contrats ci-dessus. A3 serait seul auteur du code ; A2 contrôle le contrat, A5 les oracles indépendants et A0 le périmètre/revue. Cette proposition n'autorise aucune implémentation.

Périmètre candidat minimal : `packages/atelier-model/src/commandes/organisation.ts`, oracle existant `commandes/commandes.test.ts`, scénarios purs complémentaires dans le périmètre classification/annexe C, et seulement les assertions réellement dépendantes identifiées avant édition. Le dispatcher `commandes/index.ts` et le contrôle/export servent de références de non-régression ; aucune modification présumée nécessaire. Pas de modification des fiches, décisions, normes, mapping125, moteur IFC, schéma DB, API physique ou UI par défaut. Toute extension doit être explicitement ajoutée au périmètre autorisé.

Critères proposés pour tests **purs**, après autorisation :

1. Objet sans déclaration `classeIfc` : affecter puis retirer un code n'en crée aucune ; code/libellé/provenance/statut suivent D-065, y compris refus du code inconnu dans référentiel chargé.
2. Objet avec déclaration saisie ou importée : valeur, provenance, statut et attributs inconnus conservés à l'identique après affectation, remplacement et retrait du code ; couvrir déclaration cohérente et incohérente avec l'annexe C.
3. Même invariance dans lot `ids`, sans toucher les objets exclus, avec refus atomique si un objet ou un code est invalide ; vérifier effets et inverse exact, répétabilité à partir du même état.
4. `controleClassesIfc` reste dérivé, sans mutation ; déclaration incohérente conservée et signalée ; politique d'export annexe C et conservation des objets importés non régressées. Une validation de code de référentiel ne certifie jamais une classe IFC.
5. Actualiser l'oracle contradictoire sans affaiblir les autres assertions ; produire SHA/corpus/commande/résultat et revue A5. Aucun test API/E2E ou DB réelle inclus dans ce lot pur.

**Risques et limites :** des consommateurs peuvent compter sur l'ancienne propriété calculée ; les inventorier avant code. Le correctif ne doit pas effacer des déclarations ni inventer leur provenance. Les propriétés déjà écrites dans des données existantes ne sont pas réparables par supposition : distinguer déclaration réelle et ancienne valeur calculée demanderait preuves et inventaire séparés. Aucun nettoyage, migration, requalification automatique ou réécriture d'historique autorisé. Le correctif ne prétend pas réaliser toute la classification de types/héritage/IFC décrite dans la fiche.

**Retour arrière proposé :** restaurer le build compatible si nécessaire, sans migration ni réécriture de données ; conserver le corpus, les preuves et les nouvelles déclarations. Évaluer avant réalisation les anciens clients et commandes hors ligne. Si une reprise des données devient nécessaire, soumettre un lot distinct avec mapping et récupération ; ne pas masquer l'écart en réécrivant la décision ou l'oracle uniquement.

État final : **P2 contrat confirmé statiquement, correctif à autoriser ; zéro test exécuté, zéro modification applicative ou documentaire historique.**
