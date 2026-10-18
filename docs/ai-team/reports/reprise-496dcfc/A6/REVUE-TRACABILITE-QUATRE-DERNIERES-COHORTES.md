# A6 — Traçabilité des quatre dernières cohortes M08

Contrôle statique distinct de la revue sémantique A5. Référence déclarée et vérifiée : **a15d65044ca4454bf3159f4155e51465b2a70a2c**. Lecture par gitshow/revparse, empreintes et comparaisons de citations seulement ; aucun module importé/exécuté, test, DB ou service. Aucun fichier source/cohorte/mapping modifié.

| Cohorte | Entrées | Hashs de sources contrôlés | BlobsGit contrôlés | Lignes exactes | Extraits de plage |
|---|---:|---:|---:|---:|---:|
|A2 unités065–092|13|18|18|521|0|
|A2 unités094–124|13|18|18|585|0|
|A4 E2E074–103|13|67|0|13|54|
|A4 E2E105–125|12|63|0|12|51|

**Zéro discordance de contenu ou d’empreinte** ;73sources Gitdistinctes lues. Les comptes de références ci-dessus peuvent citer plusieurs fois le même fichier ; ils ne représentent ni des tests ni des exigences réalisées. Pour A4, les blobs n’étaient pas déclarés dans les objets de citation : la revue ajoute dans son JSON les identifiantsGit recalculés à partir des octets exacts, sans inventer un champ de preuve au rapport source.

Sept occurrences d’extraits de fichier complet omettent le seul newline terminal présent dans les octetsGit. Elles sont signalées individuellement dans `representation_differences`, avec fichier/plage/SHA ; la comparaison d’empreinte utilise les **octets source exacts**, pas le texte normalisé. Cette différence de représentation n’a été ni masquée, ni transformée en erreur d’oracle, ni corrigée dans les fichiers auteurs.

Le mapping125 garde SHA256 **d8879b4ce71b82ea38352a61d7d2ae025350d8e65ef1b345241f85aa5e159348**, identique à l’originalMission004 et aux déclarations A2. Les références locales au mapping d’A4 correspondent également à cette empreinte.

Complément : `M08-094-124-DELTA-REVUE-A1-A2.json` contrôlé séparément ; son empreinte d’original correspond au fichier094–124 conservé et ses13citations supplémentaires sont exactes. Cela préserve le delta de revue sans réécrire l’original ni choisir ses verdicts à la place d’A5/A0.

REVUE-TRACABILITE-QUATRE-DERNIERES-COHORTES.json contient les quatreempreintesJSON, compteurs, chaque source/commit/blob/hash, les7représentations et la preuve du delta. La validité des lignes ne prouve pas l’équivalence des oracles, leur exécution ou l’acceptation métier. Aucun statut630/mission/gate n’est modifié par A6.
