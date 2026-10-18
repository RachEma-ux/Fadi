# A6 — Revue finale statique de la proposition G2 à six sources

Étude A3 G2-FAISABILITE-HARNESS-A3.json/.md figée relue et annexeA0 révisée contrôlée. Référence des sourcesGit : **5e0285d37f23c7c539502664036f0a2ff0986409**. Les36sources ont leurs empreintes confrontées aux octetsGit ou artefactsinstallés explicitement non attribués àGit ;201citations contrôlées indépendamment (**151lignes exactes et50extraits àoffset exact**). Empreinte du binaireesbuild existant vérifiée sans l’exécuter. AucuneCLI/help, résolution/import de module, compilation, typecheck, test ouPOC lancé.

Conclusion : **dossier recevable pour une question bornée, pas garantie opérationnelle ni autorisation G1/G2/code/POC**. Les anciennes revues restent intactes. JSONjoint contient toutes les empreintes et réserves.

## Proposition effectivement relue

Six sources futures proposées, dont supervisor.py ; aucun fichier expérimental créé. Chaînecandidate : esbuildLinuxx64 installé→stdout borné→artefact inédit→Node direct/node:test. SupervisorPythonstdlib propriétaire des sorties et des enfants, sans nouveaupackage/configVitest/workflow. Les variantesVitest/TSX et leurs effets ne sont pas retenues par défaut ; l’étude distingue leurs risques au lieu de prétendre --no-cache ou variablesvides suffisants.

L’annexe explicite bien comme **préconditions non démontrées** : confinementréseau/FS effectif, racine/parents/uid/droits et absence d’autreswriters, ouvertures ancrées et exclusives sans overwrite, arrêt de l’arbre propre et délai30sglobal supervisé. Elle interdit installation, conteneur/service ou élargissementpermissions implicite si ces garanties manquent ; même accord futur de développement n’autoriserait pas l’exécution sans satisfaire ces préconditions.

Les limites16fichiers/1MioJSONouartefact/8Miocumulésincluantlogs/profondeur32/1000objets/10000points/3invocationsséquentielles sont présentées comme **propositions de confinement**, non mesures de coûtStudio ni limites opérationnelles éprouvées. A6 n’approuve pas leur adéquation par lecture de texte.

## Réserves précises à porter dans la demande

1. **FS/uid/writers** : dir_fd/O_NOFOLLOW ne neutralisent pas un autre acteur autorisé à déplacer les parents. La racine finale et les droits/écrivains doivent être attestés au contexte exact ; aucunchmod/chown/montage/service n’est implicitement permis pour les obtenir. La créationexclusive et le rejet de destinationexistante doivent couvrir sorties/rapports/artefact, sans renameécrasant ni cleanupimplicite.
2. **Réseau** : nettoyerl’environnement, choisir un binaire ou limiterlesimports ne prouve pas l’interdictiondessockets/IPC. Le contexteexécution doit disposer d’un confinement effectif vérifiable selon le périmètre autorisé ; aucun réseau/appel réel tenté ici et aucun contournementproxy demandé.
3. **Arbre/30s** : superviseur peut lui-mêmebloquer enIO/parsing. L’arrêt doit couvrir toussespropresdescendants, stdout/stderr bornés et fin observée, sans signalerunPIDréutilisé ou un servicepartagé. Timer du calcul et kill seul ne prouvent pas ce résultat ; aucune garantie30sobtenue revendiquée.
4. **Comptage du typecheck** : le plafond3invocationsenfants décrit compilation/production/relecture ; l’étude propose aussi CMD-TSC et l’annexe mentionne typecheckpertinent. Avantaccord, préciser s’il s’agit d’une préparation séparément bornée ou d’une phase à compter dans le budgetglobal. Ne pas ajouter silencieusementunquatrièmeenfant ou supprimer le typecheck pour faire tenir le nombre3.
5. **Protocole et binaire** : phases/relecture, allowlistlecture, plateforme/hash/argv et comptages des octetsUTF8, artefacts/logs/espacetechnique doivent être figés. Le codeGonatif et sesIO ne sont pas audités exhaustivement ; présence/hash ne prouve ni exécutioncompatible ni confinement. Aucun téléchargement de repli/loader/service permis tacitement.
6. **CI** : aucunePR ou synchronisation future ne doit lancer lesjobsavecservices avant autorisation d’une stratégiepure exacte et vérifiée. L’annexe n’autorise pas de modificationworkflow maintenant, ni fusion/mainpush.

## Versions des documents conservées

L’étudeA3 cite une version antérieure de l’annexeA0, SHA2563de688104e96a64d4126f4dca1320dc6b07eca008aa6ae0df65a881ff9a86d75. L’annexe révisée relue par cette revue porte **3183b3309413542d50c119eec5ec38e290989f831ad944fc635f0c103d6e5e2c**. Cette différence est attendue après l’intégration de la variante à sixsources : conserver les deuxréférences, ne pas écraserl’empreintehistoriqueA3 ou prétendre qu’elle vise déjà le dernierdocument. GrapheA2 hash4f57e852… inchangé.

Prochaineaction : A0 précise la place du typecheck et soumet le lot/fichiers/IO/bornes/préconditions/exclusions exacts ; aucune nouvelleétudevague ou validation automatique. Les décisionsG1/G2 et l’exécution restent distinctes de la réception documentaire de cette revue.
