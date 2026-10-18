# Revue statique de tableau_registre — A3

Source Claude `32267bf0536ad6b8f4fde546b4b96932b90254b1` : les deux fichiers incoming sont identiques aux blobs du commit. Aucun import du module, test, CLI ou application du delta exécuté.

**Avis : tests synthétiques autorisables après revue A0, mais aucune application réelle par `--ecrire` recommandée dans cet état.** Aucun P0 observé ;3P1,5P2,1P3 sur outil documentaire. Les anomalies concernent conservation/états/preuves et sûreté d’écriture, pas une connexion DB présente.

## Constats

### REG-P1-01 — P1 — Écriture directe et concurrence après validation

main lit le registre, valide le delta, le modifie en mémoire puis Path.write_text ouvre/tronque la destination. Aucun verrou, relecture CAS avant remplacement, destination temporaire sécurisée, fsync ou protocole de reprise. Une panne pendant écriture peut laisser un JSON partiel ; une mise à jour concurrente entre read et write peut être perdue même avec hash fourni.

Sources : `tableau_registre.py:203–219`.

**Suite proposée :** Proposer une opération documentaire transactionnelle revue séparément : verrou de writer, CAS obligatoire sur octets courants, nouvelle représentation validée avant toute mutation et stratégie de remplacement/reprise définie. Aucun --ecrire actuel sur registre canonique.

**Limite :** Aucun essai IO effectué ; chemin de code lu seulement.

### REG-P1-02 — P1 — Hash de base facultatif et preuves récentes écrasables

valider_delta accepte base_register_sha256 absent ou None. statut_avant ne protège pas une ligne dont statut est inchangé mais tests/conformite/suite/blocage/preuves ont évolué. appliquer_delta remplace ces champs à partir du delta ancien sans comparer leur contenu/version. Les preuves sont ajoutées mais pas protégées contre ajout de constat périmé ; historique ancien non effacé, état courant peut être dégradé.

Sources : `tableau_registre.py:139–140,153,180–184`.

**Suite proposée :** Exiger hash complet du registre courant et précondition de ligne/valeurs complètes ; rebase explicite sur le nouveau snapshot et maintien de tous les champs/proofs plus récents. Le registre HEAD2076 a déjà un hash différent du snapshot817 par active_preparations, même sans changement des tâches.

**Limite :** Contre-exemple raisonné, pas exécuté : statut identique, nouveau tests courant, ancien delta sans hash remplace tests.

### REG-P1-03 — P1 — Deux acceptations G0 non protégées

Le refus de nouvelle cible Accepté ne refuse pas un delta partant de Accepté vers En cours/Bloqué/Vérifié. appliquer_delta remet condition_verifiee à false par défaut, y compris pour un état historique protégé. CAD-DEC-01 et G0-03 acceptés au snapshot peuvent donc perdre leur état/P630 par delta ordinaire. Aucun contrôle des deux IDs/actes/nature G0 n’existe.

Sources : `tableau_registre.py:153–159,184`.

**Suite proposée :** Refuser mutation des IDs/actes/clôtures G0 acceptés hors décision explicite de révision et préserver leurs preuves intégralement. Test synthétique sur ces deux IDs exacts et vérification avant/après.

**Limite :** Contre-exemple raisonné non exécuté : statut_avant Accepté, statut En cours, cloture absent passe les contrôles de transitions actuels.

### REG-P2-04 — P2 — Sept états requis, seulement cinq reconnus

STATUTS omet À faire et Implémenté ; STATUTS_DELTA les refuse. resume affiche seulement5 états et controler les déclare inconnus. Cela contredit PR-07 et le manuel qui permet À faire lorsque le contrat est défini sans exécution.

Sources : `tableau_registre.py:29–31,56–68,76,155`.

**Suite proposée :** Aligner vocabulaire/compteurs/regex sur les7 états sans remapper silencieusement les historiques ni assimiler préparation à implémentation. Tant que non corrigé, mes propositions À faire ne doivent pas être converties artificiellement en En cours.

**Limite :** Aucun delta d’état appliqué par A3.

### REG-P2-05 — P2 — Exactitude des203 et conservation du corpus non contrôlées

controler vérifie630 entrées distinctes, pas leur ensemble exact contre missions/checklist ni les203 du blob a460fb3. Il ne valide pas texte source/ligne/propriétaire/mission/versions, ni cohérence profonde du schéma. Le flux --delta n’appelle même pas controler sur son entrée/sortie. JSON duplicate keys et champs inconnus ne sont pas refusés.

Sources : `tableau_registre.py:71–88,135–169,207–219`.

**Suite proposée :** Avant toute intégration, comparer exact630/203 avec sources autoritaires, conserver tous les owners, descriptions, preuves et attributs non ciblés ; validation stricte entrée/delta/sortie et pas de nouvelles pertes. Les203 sont égaux au snapshot par mon rapprochement séparé, pas par cet outil.

**Limite :** Les630 IDs synthétiques T-000..T-629 des tests ne constituent pas cette preuve canonique.

### REG-P2-06 — P2 — Preuve documentaire de Vérifié trop permissive

Pour Vérifié, true + une preuve contenant type/fichier-ou-url/limite suffisent. Ni existence/contenu/SHA, source de décision, condition de clôture, sens du test, fraîcheur, autorité de revue ou cohérence des champs ne sont démontrés. Une URL arbitraire ou r.md inexistant peut soutenir Vérifié et augmenter P630.

Sources : `tableau_registre.py:160–169,184–192`.

**Suite proposée :** Traiter validation comme schéma de proposition, jamais preuve de réalisation ; imposer revue A0/A5 de la condition ciblée et des liens immuables au SHA. Tests négatifs preuve absente/factice/ancienne et interdiction de promotion sémantique automatique.

**Limite :** L’outil ne coche effectivement aucune checklist ; ce bon point ne suffit pas à autoriser le statut Vérifié.

### REG-P2-07 — P2 — Contrôle cohérent plus faible que son message

Index M08 optionnel ; aucune exigence125 IDs uniques/ensemble exact. Contrôle de chemin seulement exists, chemins absolus/traversal possibles ; absence des mentions P630 ou revue125 dans checkpoints non refusée. Les expressions regex peuvent aussi traiter un compteur historique comme courant. Aucun scan de liens profonds ni preuves de ces contenus.

Sources : `tableau_registre.py:94–126,228–233`.

**Suite proposée :** Nommer précisément la portée du contrôle ; vérifier champs/IDs/chemins attendus et ancrage sous racine, distinguer section courante/historique et exiger marqueurs requis. Ne pas annoncer cohérence totale sur l’absence d’un index.

**Limite :** test_controle_coherent passe structurellement sans index M08 ; test_index_m08 couvre un chemin manquant seulement.

### REG-P2-08 — P2 — API mutable et CLI insuffisamment bornés

appliquer_delta modifie le dict fourni sans validation interne ; propriété A0 est un libellé, pas contrôle d’autorité. --root et --delta sont chemins arbitraires ; read/write suit les symlinks. --ecrire sans delta est ignoré plutôt que refusé. Pas de bornes de taille/types strictes, certains types inattendus peuvent lever AttributeError non capturée.

Sources : `tableau_registre.py:172–200,234`.

**Suite proposée :** Usage seulement sur snapshots approuvés, entrées synthétiques pour tests, chemins bornés et owner unique ; ne pas exposer la fonction d’application comme API sûre. Toute future CLI de mutation doit valider de nouveau et refuser les modes ambigus.

**Limite :** Pas de code applicatif/SQL/connexion présent ; risques circonscrits aux fichiers documentaires ciblés.

### REG-P3-09 — P3 — Journalisation non expurgée des entrées et portée des tests

Aucun secret littéral ou lecteur d’environnement identifié dans les deux fichiers, ni subprocess/socket/DB/HTTP. Mais stderr peut afficher valeurs de statut/ID/erreur/path issues du delta ; ce n’est pas un scanner ou une garantie d’absence de secret. Tests11 cas n’appellent pas main ni --ecrire, utilisent tempfile avec nettoyage de leur seul répertoire.

Sources : `tableau_registre.py:151–169,210–212,234–235 ; test_tableau_registre.py:16–37`.

**Suite proposée :** Fixtures exclusivement synthétiques, sources relues et hashes figés, environnement Python isolé et pycache désactivé ; limiter les logs avant publication. Ne pas conclure sûreté d’écriture/atomicité depuis ces11 tests purs.

**Limite :** Aucun test exécuté dans cette revue ; aucune prétention sur des résultats de la source Claude.

## Effets lus et conditions d’essai

- **module_import** : Définitions/constantes/imports stdlib, aucun IO de registre au top-level ; bloc main gardé __name__. Import de module applicatif interdit, mais pas présent.
- **cli_read_only** : Lecture JSON registre, quatre checkpoints, indexM08 éventuel et exists sur références ; impression stdout/stderr. Pas de sous-processus/HTTP/SQL importé ni appelé identifié.
- **cli_write** : Seul --delta + --ecrire déclenche Path.write_text du registre ; pas écriture STATUS/HANDOFF ou checklist ; pas atomicité assurée.
- **tests** : TemporaryDirectory, quatre checkpoint.md synthétiques et index/fichiers de test ; cleanup de son répertoire propre en tearDown. Aucune lecture du registre réel par les tests fournis ; main non appelé.
- **secrets** : Pas de valeur secrète identifiée dans source ; pas d’accès env/credential. Logs non expurgés : ne fournir aucune donnée sensible et relire toute publication.

Les **11 tests** existants sont lus, pas exécutés. Ils utilisent630 IDs inventés et une seule acceptation synthétique ; ils ne prouvent ni correspondance aux203 IDs réels, ni préservation des deux actesG0, ni atomicité ou concurrence du CLI. Les appels directs à appliquer_delta portent des copies mémoire ; aucun essai de --ecrire.

Commande future proposée : Python absolu avec `-I -S -B -m unittest discover -s <scratch-deux-sources-hashées> -p test_tableau_registre.py -v`, environnement propre et TMPDIR privé jetable. La copie ne contient que les deux fichiers relus. Aucun fichier canonique en écriture, pas de --delta/--ecrire, pas de test API/DB/E2E. Les protections Python de chargement et pycache ne sont pas un confinement OS. Le nettoyage TemporaryDirectory ne vise que son répertoire synthétique identifié.

## Tests de non-régression à proposer, pas écrits ni exécutés

- CAS obligatoire y compris base absent/None ; modification de preuve au même statut puis écriture refusée.
- Deux G0 CAD-DEC-01/G0-03 inchangés (statut/proofs/clôture/actes) malgré delta courant contradictoire.
- Échec d’écriture partielle et mise à jour concurrente après validation : ancien fichier intact, aucun écrasement.
- Conservation exacte630 IDs/203 ciblés, owner/mission/source/historique/attrs et tous les champs hors delta.
- Sept états dont À faire/Implémenté ; aucun remapping d’Accepté ou d’un historique.
- Schéma strict, valeurs/types malformés, JSON doublons, limites taille, path/symlink/traversal refusés.
- Preuve inexistante/ancienne/incohérente, doublon ou déduction d’acceptation refusés.
- Index125/IDs requis, références bornées et marqueurs courants manquants ; historiques non pris pour état présent.
- CLI lecture seule sans écriture y compris pycache, refus --ecrire sans delta et validation appliquée à l’entrée/sortie.

## Conservation du suivi

A0 seul peut modifier le registre et les checkpoints. Aucun delta généré/appliqué par A3. La qualification203 et les2 acceptationsG0 restent à protéger par un vrai diff d’IDs et de champs, pas par le seul nombre630 ou une égalité de statut. Les acceptations exactes sont CAD-DEC-01 et G0-03 ; leur portée est cadrage documentaireG0, aucune acceptation métier/G1–G4. Les preuves déjà présentes doivent être conservées, et tout hash périmé rebasé sur le snapshot courant.

Les sources, empreintes, citations exactes, liste des tests et effets détaillés sont dans le JSON. Aucun secret trouvé dans la source lue, sans garantie générale sur des entrées futures ou des logs qui reprennent leurs valeurs.
