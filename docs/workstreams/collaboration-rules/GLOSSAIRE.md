# Règles communes de collaboration — glossaire

Vocabulaire commun en français fixé par la décision **CR-D8 (a)** ([DECISIONS.md](DECISIONS.md), CR-R1), qui résout
l'écart **E9** ([PLAN.md](PLAN.md) § 3 : « publication » a deux sens). Source : concept *Collaboration Concept Map*
v1.0, § « Vocabulary » et « Responsibilities ». Ce glossaire fait foi pour les documents, les cahiers, les comptes rendus
et tout **nouveau** texte d'interface. **Les identifiants de code ne changent pas** (option (b) non retenue) ; les
libellés déjà livrés des modules (Atelier, Studio) restent ceux de leurs lots acceptés : la colonne « Dans Fadi »
indique à quoi chaque terme correspond.

## Paquets et dossiers

| Terme | Définition | Dans Fadi (module, code, libellé actuel) | À ne pas confondre avec |
| --- | --- | --- | --- |
| **Paquet de coordination** | Instantané figé d'un modèle partagé avec d'autres projets ou disciplines, pour qu'ils le consultent ou s'y réfèrent ; n'emporte aucune approbation. | Atelier : « publication » (`atelier_publications`, `api:db/schema.ts`, routes `…/atelier/publications`, panneau « Références externes ») | Paquet diffusé (Studio), dossier approuvé |
| **Référence adoptée** | Version précise d'un paquet de coordination qu'un projet a choisi explicitement d'utiliser ; une version plus récente n'est jamais adoptée d'office. | Atelier : référence externe épinglée (`refexterne.rattacher`, état « publication plus récente disponible ») | Mise à jour automatique (inexistante) |
| **Paquet de revue figé** | Ensemble identifié de versions exactes soumis à une revue (relecture, constats), avant toute approbation. | Studio : dossier « en revue » avec manifeste figé (`studio_publications.manifest`, statut de travail `en-revue`) ; revue externe : Organisations phase 4 | Dossier approuvé |
| **Dossier approuvé** | Paquet de revue dont l'Approbateur a validé le manifeste exact ; une source modifiée exige une nouvelle approbation. | Studio : statut de travail `approuve`, empreinte `approved_manifest_hash` | Paquet diffusé |
| **Paquet diffusé** | Dossier approuvé émis par le Diffuseur, figé avec ses fichiers ; il peut être retiré ou remplacé, jamais modifié. | Studio : statut de diffusion `diffuse` (`studio_publications.package`), libellé « Diffuser » | Paquet de coordination |
| **Publication** (mot seul) | **À éviter** dans un texte nouveau : préciser l'un des cinq termes ci-dessus. Dans le code, `publication` reste l'identifiant de l'Atelier (paquet de coordination) et de Studio (dossier). | — | — |

## Responsabilités et droits

| Terme | Définition | Dans Fadi |
| --- | --- | --- |
| **Gardien du projet** | Assure la continuité administrative du projet (partage, transfert, suppression). | Propriétaire (`projects.owner_id`) ; transfert de propriété journalisé |
| **Gardien du contenu** | Veille sur un contenu identifié ; responsabilité **déclarée**, sans aucun droit implicite (E10). | Case « Gardien du contenu » de l'écran des membres (responsabilité `garder` de la participation) |
| **Relecteur** | Vérifie et émet des constats ; n'approuve pas. | Rôle métier `relecteur` (participations) ; constats = observations Studio |
| **Approbateur** | Décide de l'approbation d'un dossier ; affectation **explicite** donnée par le propriétaire (E5). | Case « Approbateur » (rôle par portée `approbateur`, origine `attribution`) ; transition `approuver` / `refuser` |
| **Diffuseur** | Émet (diffuse) ou retire un dossier approuvé ; affectation distincte de celle d’Approbateur, cumulable sur décision explicite (CR-D2 a). | Case « Diffuseur » (rôle `diffuseur`) ; transition `diffuser` / `retirer` |
| **Base d'autorité** | Ce au titre de quoi une action formelle a été permise : rôle de projet ou affectation (CR-D6 a). | `studio_publication_events.authority` ; journal Studio « au titre de … » |
| **Hôte de session** | Organise une réunion en temps réel ; n'obtient aucun droit d'édition, d'approbation ni de diffusion de ce seul fait. | Absent (chantier Temps réel non ouvert) |

## Échanges

| Terme | Définition | Dans Fadi |
| --- | --- | --- |
| **Audience** | Ensemble des personnes qui peuvent lire un message, un commentaire ou une notification. | `equipe` (propriétaire et éditeurs) ou `projet` (tous les membres), case « Visible par les lecteurs » (E1) |
| **Notification** | Événement intermédiaire : ni accusé de réception, ni revue, ni approbation. | Cloche de Fadi (`routes/notifications.ts`) |
| **Fin de participation** | Départ ou retrait d'un participant : accès retiré, réservations libérées, responsabilités listées pour une réattribution explicite ; l'auteur historique n'est jamais réécrit (E6). | Retrait / départ de l'écran des membres ; liste « Responsabilités à réattribuer » |
