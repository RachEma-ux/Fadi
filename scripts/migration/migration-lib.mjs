/**
 * Simulation de migration vers Studio V1 (MIG-01 à MIG-10, MIG-COEX-03/04/06) — logique PURE : recensement des lignes
 * lues, classement par règles sourcées, correspondance des identités, documents Studio simulés, contrôles prévus et
 * rapport (JSON + Markdown). Aucune base, aucun fichier, aucun réseau ici : la lecture (transaction READ ONLY) est dans
 * `lecture.mjs`, la ligne de commande dans `simuler-migration.mjs`.
 *
 * Mandat (Studio/Fadi_Studio_Plan_Implementation_V1_0.md §8, Checklist §8.1–8.3) : la simulation ne transforme RIEN.
 * Elle décrit ce qu'une migration ferait, ce qu'elle perdrait, ce qu'elle ne sait pas trancher et ce qu'elle ne sait
 * pas convertir. Les objets non convertibles restent dans leurs tables d'origine (jamais supprimés) et sont listés un à
 * un ; une erreur partielle est rattachée à son élément et comptée par projet, jamais fondue dans un taux global.
 *
 * Exigence, hypothèse et recommandation restent distinctes : une règle est **sourcée** (fichiers du dépôt qui fixent
 * les deux formats) ou marquée **non évaluée** ; une conversion qui dépend d'un choix non décidé (repère, cote de base,
 * structure étude / variante — DEC-03, MIG-COEX-02) ne s'applique que sous une hypothèse déclarée par l'opérateur, et
 * l'hypothèse est écrite dans le rapport. Aucune valeur absente n'est remplacée par un défaut : elle est « non évaluée ».
 *
 * Données privées : aucun courriel, mot de passe, contenu de fichier ni texte libre d'annotation n'entre dans le
 * rapport (longueurs et empreintes seulement) ; les noms de calques et de fichiers de publication sont remplacés par
 * une empreinte courte (`nomMasque`). Seul le chemin local d'un export de file illisible, fourni par l'opérateur, est
 * cité pour qu'il puisse le retrouver.
 */
import { createHash } from 'node:crypto';

export const VERSION_RAPPORT = 'fadi-migration-simulation/1';
export const STATUTS = Object.freeze(['compatible', 'convertible', 'ambigu', 'non-convertible']);

/** Classes Atelier (packages/atelier-model/src/ontologie.ts, `CLASSES`) — dérive contrôlée par simulation-studio.test.mjs. */
export const CLASSES_ATELIER = Object.freeze([
  'mur', 'porte', 'fenetre', 'ouverture', 'dalle', 'toiture', 'escalier', 'piece', 'espace', 'zone', 'poteau', 'solide',
  'esquisse', 'reference-plan', 'cotation', 'texte', 'etiquette', 'annotation-fabrication', 'nuage-de-points',
  'bloc-occurrence', 'garde-corps', 'objet-importe', 'solide-exact', 'piece-mecanique', 'assemblage', 'liaison', 'poutre',
  'trame', 'plaque', 'assemblage-structurel', 'soudure', 'armature', 'coulage', 'element-bois', 'ossature', 'panneau-clt',
  'assemblage-bois', 'tole', 'segment-reseau', 'raccord-reseau', 'vanne', 'equipement-reseau', 'support-reseau', 'plafond',
  'coque', 'rampe', 'echelle', 'mur-rideau', 'terrain', 'reservation', 'installation-chantier', 'surface-libre',
]);
/** Formes d'esquisse (packages/atelier-model/src/modele.ts, `FormeEsquisse`). */
export const FORMES_ESQUISSE = Object.freeze(['ligne', 'polyligne', 'arc', 'cercle', 'rectangle', 'polygone', 'spline', 'construction', 'hachure', 'ellipse']);
/** Unités et repères connus du modèle Atelier (packages/atelier-model/src/unites.ts). */
export const UNITES_CONNUES = Object.freeze(['m', 'm2', 'deg']);
export const REPERES_CONNUS = Object.freeze(['local', 'cadastral', 'geographic']);
/** Contrat du brouillon hors ligne Studio (apps/web/src/modules/studio/hors-ligne/contrats.ts, persistance.ts). */
export const FORMAT_EXPORT_FILE_LOCALE = 'fadi-studio-file-locale/1';
export const VERSION_BROUILLON_COURANTE = 1;

/**
 * Hypothèses de simulation. `structure-cible` et `correspondance-explicite` s'appliquent toujours (la simulation doit
 * ranger ses objets quelque part et n'a pas le droit de présumer la continuité des identifiants) ; les deux autres ne
 * s'appliquent que déclarées par l'opérateur (`--hypothese <id>`). Aucune n'est une décision.
 */
export const HYPOTHESES = Object.freeze({
  'structure-cible': {
    toujours: true,
    texte: "Une étude simulée par projet, une variante simulée par niveau Atelier, une révision simulée par variante (DEC-03 et MIG-COEX-02 non décidés : structure de simulation seulement).",
  },
  'correspondance-explicite': {
    toujours: true,
    texte: "Nouvelles identités dérivées (empreinte de l'ancienne) et table de correspondance explicite ; la continuité des identifiants n'est pas présumée (MIG-COEX-02 non décidé).",
  },
  'repere-local-identite': {
    toujours: false,
    texte: "Le repère « local » de l'Atelier (bâtiment, m) et le repère « local-2d » de Studio (m) coïncident (même origine, mêmes axes) : aucune correspondance n'est déclarée dans le dépôt.",
  },
  'base-elevation-niveau': {
    toujours: false,
    texte: "La cote de base d'un mur Studio est l'élévation de son niveau Atelier (atelier_niveaux.elevation) ; aucune règle du dépôt ne la fixe.",
  },
});

const S = (fichier, symbole) => ({ fichier, symbole });

/**
 * Règles de classement. `evaluation` : « sourcée » (les deux formats sont fixés par les fichiers cités) ou « non évalué »
 * (correspondance jamais étudiée : l'élément est ambigu, conservé et signalé). `hypotheses` : requises pour convertir.
 */
export const REGLES = Object.freeze({
  'R-PROJET': { statut: 'compatible', evaluation: 'sourcée', motif: "Le projet est repris tel quel : une étude Studio référence projects(id).", sources: [S('apps/api/src/db/init.sql', 'studio_studies.project_id')] },
  'R-MEMBRES': { statut: 'compatible', evaluation: 'sourcée', motif: "Les droits Studio passent par loadProjectAccess, qui lit la vue project_effective_access ; un partage (ligne de la vue de compatibilité project_members) est une participation portant le rôle de partage de portée projet, écrit par grantShare (lot OP-PONT de l'Issue #262, pont op_sync_access retiré).", sources: [S('apps/api/src/lib/owned-project.ts', 'projectEffectiveAccess'), S('apps/api/src/db/init.sql', 'access_granted_by'), S('apps/api/src/lib/project-access-db.ts', 'grantShare')] },
  'R-VOLUME': { statut: 'compatible', evaluation: 'sourcée', motif: "Volumes immuables adressés par SHA-256, table commune.", sources: [S('apps/api/src/lib/atelier-versions.ts', 'rangerVolume')] },
  'R-STUDIO': { statut: 'compatible', evaluation: 'sourcée', motif: "Donnée déjà Studio (D-0 : Studio V1 est le seul Studio).", sources: [S('apps/api/src/db/init.sql', 'studio_*')] },
  'R-NIVEAU': { statut: 'ambigu', evaluation: 'sourcée', motif: "studio-document/1 n'a pas de niveau : la simulation range le niveau dans une variante simulée (hypothèse structure-cible) ; élévation et hauteur ne sont portées par aucun champ du document.", sources: [S('packages/atelier-model/src/studio/composition/types.ts', 'StudioDocument'), S('apps/api/src/db/init.sql', 'atelier_niveaux')] },
  'R-LIGNE': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite'], motif: "Esquisse « ligne » à deux points → line (start, end).", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsEsquisse'), S('packages/atelier-model/src/studio/objets/ligne.ts', 'StudioLine')] },
  'R-POLYLIGNE': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite'], motif: "Polyligne ou polygone → polyline (closed, bulges : un renflement par segment, convention DXF des deux côtés ; renflement absent = segment droit des deux côtés, complété par des zéros comme transformation déclarée).", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsEsquisse.renflements'), S('packages/atelier-model/src/geometrie.ts', 'pointsPolyligne'), S('packages/atelier-model/src/studio/objets/polyligne.ts', 'StudioPolyline')] },
  'R-POLYLIGNE-RENFLEMENTS': { statut: 'ambigu', evaluation: 'sourcée', motif: "Polyligne dont la liste de renflements dépasse le nombre de segments : l'Atelier ignore le surplus, Studio exige un renflement par segment — tronquer serait un choix non décidé.", sources: [S('packages/atelier-model/src/geometrie.ts', 'pointsPolyligne'), S('packages/atelier-model/src/studio/objets/polyligne.ts', 'StudioPolyline')] },
  'R-CERCLE': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite'], motif: "Cercle (centre, rayon en m) → circle.", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsEsquisse'), S('packages/atelier-model/src/studio/objets/cercle.ts', 'StudioCircle')] },
  'R-ARC': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite'], motif: "Arc : degrés → radians ramenés dans [0 ; 2π[, même sens direct de début à fin.", sources: [S('packages/atelier-model/src/geometrie.ts', 'pointsArc'), S('packages/atelier-model/src/studio/objets/arc.ts', 'StudioArc')] },
  'R-ARC-AMBIGU': { statut: 'ambigu', evaluation: 'sourcée', motif: "Arc à angles de début et de fin égaux (l'Atelier trace un tour complet) ou balayage d'au moins 360° (plusieurs tours) : un arc Studio couvre moins d'un tour — cercle ou arc, choix non décidé.", sources: [S('packages/atelier-model/src/geometrie.ts', 'pointsArc'), S('packages/atelier-model/src/studio/objets/arc.ts', 'StudioArc')] },
  'R-RECTANGLE': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite'], motif: "Rectangle aux côtés parallèles aux axes (égalité exacte des coordonnées) → rectangle (origin, width, height).", sources: [S('packages/atelier-model/src/blocs-places.ts', 'forme rectangle'), S('packages/atelier-model/src/studio/objets/rectangle.ts', 'StudioRectangle')] },
  'R-RECTANGLE-TOURNE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Rectangle tourné : studio rectangle est aligné sur les axes ; une polyligne fermée en changerait le type — choix non décidé.", sources: [S('packages/atelier-model/src/studio/objets/rectangle.ts', 'StudioRectangle')] },
  'R-ESQUISSE-SANS-CIBLE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Forme sans type Studio (spline, ellipse, hachure, construction) : l'approcher serait une perte de géométrie.", sources: [S('packages/atelier-model/src/studio/objets/index.ts', 'STUDIO_TYPES_OBJETS')] },
  'R-TEXTE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Studio exige la hauteur et la justification du texte ; l'Atelier n'en porte pas : valeurs requises non évaluées, aucun défaut.", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsTexte'), S('packages/atelier-model/src/studio/objets/texte.ts', 'StudioText')] },
  'R-COTATION': { statut: 'ambigu', evaluation: 'non évalué', motif: "Cote : la convention de signe du décalage (Atelier) face à l'offset Studio n'a pas été comparée.", sources: [] },
  'R-MUR': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite', 'base-elevation-niveau'], motif: "Mur droit à hauteur saisie → wall ; alignement gauche → right, axe → center, droite → left (l'Atelier aligne l'axe sur la face nommée, Studio nomme le côté du corps).", sources: [S('packages/atelier-model/src/geometrie.ts', 'facesMur'), S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioWall')] },
  'R-MUR-COURBE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Mur courbe : l'axe d'un mur Studio n'a que des segments droits.", sources: [S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioWall.axis')] },
  'R-MUR-HAUTEUR': { statut: 'ambigu', evaluation: 'sourcée', motif: "Hauteur non évaluée ou liée au niveau haut : Studio exige une hauteur saisie strictement positive.", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsMur.hauteur'), S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioWall.height')] },
  'R-OUVERTURE': { statut: 'convertible', evaluation: 'sourcée', hypotheses: ['repere-local-identite', 'base-elevation-niveau'], motif: "Ouverture hébergée par un mur converti → opening ; l'Atelier pose `position` au CENTRE de la baie (paramètre le long de l'axe), Studio au BORD DE DÉBUT : position Studio = paramètre × longueur de l'axe − largeur / 2 ; largeur, hauteur, allège reprises ; porte / fenêtre déclarées par la classe.", sources: [S('packages/atelier-model/src/modele.ts', 'ParamsOuverture'), S('packages/atelier-model/src/versions.ts', 'collisions'), S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioOpening'), S('packages/atelier-model/src/studio/architecture/geometrie.ts', 'placerOuverture')] },
  'R-OUVERTURE-INCOMPLETE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Ouverture sans allège saisie, à haut cintré, ou dont le mur hôte n'est pas converti.", sources: [S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioOpening')] },
  'R-SANS-CIBLE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Classe sans équivalent dans studio-document/1 (formes 2D, cotes, annotations, solides libres, murs et ouvertures).", sources: [S('packages/atelier-model/src/studio/composition/types.ts', 'StudioDocument'), S('packages/atelier-model/src/ontologie.ts', 'CLASSES')] },
  'R-CLASSE-INCONNUE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Classe absente de l'ontologie Atelier : ligne illisible pour la simulation.", sources: [S('packages/atelier-model/src/ontologie.ts', 'CLASSES')] },
  'R-PARAMS-ILLISIBLES': { statut: 'ambigu', evaluation: 'sourcée', motif: "Paramètres qui ne respectent pas le type de leur classe : élément non évalué.", sources: [S('packages/atelier-model/src/modele.ts', 'Params*')] },
  'R-CALQUE': { statut: 'convertible', evaluation: 'sourcée', motif: "Calque → layer (name, visible, locked).", sources: [S('apps/api/src/db/init.sql', 'atelier_calques'), S('packages/atelier-model/src/studio/noyau/types.ts', 'StudioLayer')] },
  'R-HEBERGE': { statut: 'convertible', evaluation: 'sourcée', motif: "Relation heberge-par → opening.hostId (si les deux extrémités sont converties).", sources: [S('packages/atelier-model/src/ontologie.ts', 'KindRelation'), S('packages/atelier-model/src/studio/architecture/types.ts', 'StudioOpening.hostId')] },
  'R-HEBERGE-INCOHERENT': { statut: 'ambigu', evaluation: 'sourcée', motif: "Relation heberge-par dont la cible n'est pas le mur hôte déclaré par l'ouverture (params.murHoteId) ou n'est pas un mur : incohérence du modèle source, rien n'est choisi.", sources: [S('packages/atelier-model/src/ontologie.ts', 'KindRelation'), S('packages/atelier-model/src/modele.ts', 'ParamsOuverture')] },
  'R-ASSOCIATION-REFERENCE': { statut: 'ambigu', evaluation: 'non évalué', motif: "Association annotation → caractéristique : correspondance avec les ancres de cote Studio non étudiée.", sources: [] },
  'R-RELATION-SANS-CIBLE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Studio n'a pas de table de relations : la relation reste dans atelier_relations.", sources: [S('packages/atelier-model/src/studio/composition/types.ts', 'StudioDocument')] },
  'R-REFERENCE-CARACTERISTIQUE': { statut: 'ambigu', evaluation: 'non évalué', motif: "Référence de caractéristique (état, propositions de réparation) sans équivalent étudié.", sources: [] },
  'R-COMPOSANT': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Blocs, composants, occurrences et groupes : aucun type Studio.", sources: [S('packages/atelier-model/src/studio/composition/types.ts', 'StudioDocument')] },
  'R-PLANCHE': { statut: 'ambigu', evaluation: 'non évalué', motif: "Planche (modèle planche-model) : correspondance avec les solides libres Studio non étudiée.", sources: [] },
  'R-DEFINITION-SANS-CIBLE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Définition Atelier (vue, feuille, vue 3D, référentiel…) sans équivalent dans le document Studio.", sources: [S('packages/atelier-model/src/modele.ts', 'ClasseDefinition')] },
  'R-REFERENCE-EXTERNE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Référence externe (calage d'un autre projet) : aucun équivalent Studio.", sources: [S('packages/atelier-model/src/modele.ts', 'ClasseDefinition reference-externe')] },
  'R-SITE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Parcelle et emprise (repère cadastral) : Studio n'a que local-2d ; les repères ne se mélangent pas.", sources: [S('packages/atelier-model/src/unites.ts', 'SommetParcelle'), S('packages/atelier-model/src/studio/composition/types.ts', 'StudioDocument.frame')] },
  'R-ONTOLOGIES': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Ontologies activées (P2) : Studio n'a pas d'ontologie activable.", sources: [S('apps/api/src/db/init.sql', 'atelier_site.ontologies')] },
  'R-HISTORIQUE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Journal atelier-commands/* : non rejouable sous studio-commands/1 ; conservé pour la consultation historique.", sources: [S('packages/atelier-model/src/commandes/base.ts', 'CONTRATS_ACCEPTES'), S('packages/atelier-model/src/studio/noyau/limites.ts', 'STUDIO_CONTRACT')] },
  'R-VERSION': { statut: 'ambigu', evaluation: 'sourcée', motif: "Version nommée : révision Studio ou non ? DEC-03 non décidé.", sources: [S('apps/api/src/db/init.sql', 'atelier_versions')] },
  'R-VARIANTE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Variante Atelier (projet bifurqué) : variante Studio ou étude ? DEC-03 non décidé.", sources: [S('apps/api/src/db/init.sql', 'atelier_variants')] },
  'R-AUTOMATISATION': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Scripts et propositions de l'assistant Atelier : aucun équivalent Studio.", sources: [S('apps/api/src/db/init.sql', 'atelier_scripts, atelier_propositions')] },
  'R-COMMENTAIRE-JOURNAL': { statut: 'ambigu', evaluation: 'sourcée', motif: "Commentaire ancré à une révision du journal Atelier : ancre sans équivalent dans une révision Studio.", sources: [S('apps/api/src/db/init.sql', 'project_comments.atelier_revision')] },
  'R-OUTBOX-EN-ATTENTE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Évènement en attente : à synchroniser, migrer sous contrat ou mettre en résolution avant bascule ; jamais supprimé (MIG-COEX-04).", sources: [S('apps/api/src/db/init.sql', 'atelier_outbox.processed_at')] },
  'R-OUTBOX-TRAITE': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Évènement déjà traité : trace technique conservée.", sources: [S('apps/api/src/db/init.sql', 'atelier_outbox')] },
  'R-ENSEMBLES': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Ensembles d'affichage Atelier d'un compte : le profil Studio est un profil d'outils, sans géométrie ni affichage.", sources: [S('apps/api/src/db/init.sql', 'users.atelier_ensembles, studio_tool_preferences')] },
  'R-PUBLICATION': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Publication figée Atelier : cycle Studio différent (travail → diffusé) ; conservée, liée à ses pièces d'origine (MIG-COEX-03).", sources: [S('apps/api/src/db/init.sql', 'atelier_publications, studio_publications.status')] },
  'R-EXPORT': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Export de dessin figé (fichier) : conservé tel quel.", sources: [S('apps/api/src/db/init.sql', 'drawing_exports')] },
  'R-DOCUMENT-PRODUIT': { statut: 'non-convertible', evaluation: 'sourcée', motif: "Trace d'un document produit : conservée.", sources: [S('apps/api/src/db/init.sql', 'produced_documents')] },
  'R-FILE-LOCALE': { statut: 'ambigu', evaluation: 'sourcée', motif: "Brouillon Studio hors ligne exporté : à synchroniser (format courant) ou à résoudre (format incompatible) avant bascule ; jamais supprimé.", sources: [S('apps/web/src/modules/studio/hors-ligne/contrats.ts', 'migrerBrouillon'), S('apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx', FORMAT_EXPORT_FILE_LOCALE)] },
});

/**
 * Requêtes de lecture (toutes des SELECT, exécutées par `lecture.mjs` dans une transaction READ ONLY). Pas de contenu
 * de fichier (taille et SHA-256 calculés par le serveur), pas de courriel ni d'empreinte de mot de passe.
 */
export const REQUETES = Object.freeze({
  projects: { mig: ['MIG-01'], sql: 'SELECT id, owner_id, code, name, model_revision FROM public.projects ORDER BY id' },
  project_members: { mig: ['MIG-01'], sql: 'SELECT project_id, user_id, role FROM public.project_members ORDER BY project_id, user_id' },
  atelier_niveaux: { mig: ['MIG-01'], sql: 'SELECT project_id, id, nom, elevation, hauteur, ordre FROM public.atelier_niveaux ORDER BY project_id, ordre, id' },
  atelier_objets: { mig: ['MIG-01', 'MIG-02'], sql: 'SELECT project_id, id, classe, niveau_id, definition_id, calque_id, groupe_id, phase, params, proprietes, model_revision, verrouille FROM public.atelier_objets ORDER BY project_id, id' },
  atelier_calques: { mig: ['MIG-01'], sql: 'SELECT project_id, id, nom, parent_id, visible, verrouille, gele, ordre, proprietes IS NOT NULL AS a_proprietes FROM public.atelier_calques ORDER BY project_id, ordre, id' },
  atelier_relations: { mig: ['MIG-02'], sql: 'SELECT project_id, id, kind, source_id, target_id FROM public.atelier_relations ORDER BY project_id, id' },
  atelier_definitions: { mig: ['MIG-02', 'MIG-04'], sql: 'SELECT project_id, id, classe, nom, version FROM public.atelier_definitions ORDER BY project_id, id' },
  atelier_groupes: { mig: ['MIG-02'], sql: 'SELECT project_id, id, reseau IS NOT NULL AS reseau FROM public.atelier_groupes ORDER BY project_id, id' },
  atelier_references: { mig: ['MIG-02'], sql: 'SELECT project_id, id, proprietaire_id, objet_id, caracteristique, etat FROM public.atelier_references ORDER BY project_id, id' },
  atelier_site: { mig: ['MIG-01'], sql: 'SELECT project_id, parcelle IS NOT NULL AS parcelle, emprise IS NOT NULL AS emprise, ontologies FROM public.atelier_site ORDER BY project_id' },
  atelier_commands: { mig: ['MIG-03'], sql: 'SELECT project_id, count(*)::int AS n, min(result_revision) AS rmin, max(result_revision) AS rmax, array_agg(DISTINCT contract ORDER BY contract) AS contrats FROM public.atelier_commands GROUP BY project_id ORDER BY project_id' },
  atelier_versions: { mig: ['MIG-03'], sql: 'SELECT id, project_id, revision, empreinte FROM public.atelier_versions ORDER BY project_id, revision, id' },
  atelier_variants: { mig: ['MIG-03'], sql: 'SELECT project_id, parent_id, statut, fork_revision FROM public.atelier_variants ORDER BY project_id' },
  atelier_scripts: { mig: ['MIG-03'], sql: 'SELECT project_id, count(*)::int AS n FROM public.atelier_scripts GROUP BY project_id ORDER BY project_id' },
  atelier_propositions: { mig: ['MIG-03'], sql: 'SELECT project_id, statut, count(*)::int AS n FROM public.atelier_propositions GROUP BY project_id, statut ORDER BY project_id, statut' },
  atelier_outbox: { mig: ['MIG-03'], sql: 'SELECT project_id, id, event_type, version, attempts, processed_at IS NULL AS en_attente FROM public.atelier_outbox ORDER BY project_id, id' },
  project_comments: { mig: ['MIG-03'], sql: 'SELECT project_id, id, atelier_revision FROM public.project_comments WHERE atelier_revision IS NOT NULL ORDER BY project_id, id' },
  users: { mig: ['MIG-03'], sql: 'SELECT id, atelier_ensembles IS NOT NULL AS ensembles FROM public.users ORDER BY id' },
  studio_tool_preferences: { mig: ['MIG-03'], sql: 'SELECT user_id, profile FROM public.studio_tool_preferences ORDER BY user_id' },
  atelier_publications: { mig: ['MIG-04'], sql: 'SELECT id, project_id, version_id, revision, empreinte, documents FROM public.atelier_publications ORDER BY project_id, id' },
  volumes: { mig: ['MIG-04'], sql: "SELECT id, size, octet_length(content) AS taille_reelle, encode(sha256(content), 'hex') AS sha256 FROM public.volumes ORDER BY id" },
  drawing_exports: { mig: ['MIG-04'], sql: 'SELECT id, project_id, kind, size, octet_length(content) AS taille_reelle, model_revision FROM public.drawing_exports ORDER BY project_id, id' },
  produced_documents: { mig: ['MIG-04'], sql: 'SELECT project_id, kind, model_revision FROM public.produced_documents ORDER BY project_id, kind' },
  studio_studies: { mig: ['MIG-COEX-06'], sql: 'SELECT id, project_id FROM public.studio_studies ORDER BY project_id, id' },
  studio_publications: { mig: ['MIG-04'], sql: 'SELECT id, project_id, study_id, status FROM public.studio_publications ORDER BY project_id, id' },
});

// ——— Outils ———

/** JSON canonique (clés triées) : empreintes stables quel que soit l'ordre des clés lues. */
export function canonique(v) {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const sha256 = (texte) => createHash('sha256').update(texte).digest('hex');
const court = (...parts) => sha256(parts.join('\u0000')).slice(0, 20);
/** Nom privé (calque, fichier) : jamais en clair dans le rapport, seulement une empreinte courte stable. */
export const nomMasque = (genre, nom) => `${genre}:${court(genre, String(nom))}`;
const parProjet = (rows = []) => {
  const m = new Map();
  for (const r of rows) { const k = r.project_id; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
const compter = (liste, cle) => {
  const out = {};
  for (const x of liste) { const k = String(cle(x)); out[k] = (out[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};
const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const point = (p) => estObjet(p) && fini(p.x) && fini(p.y) && p.frame === 'local' && p.unit === 'm';
const longueur = (l) => estObjet(l) && fini(l.value) && l.unit === 'm';
const angleDeg = (a) => estObjet(a) && fini(a.value) && a.unit === 'deg';
const P = (p) => ({ x: p.x, y: p.y });
const DEUX_PI = 2 * Math.PI;
const radians = (deg) => { let r = ((deg * Math.PI) / 180) % DEUX_PI; if (r < 0) r += DEUX_PI; return r; };

/** Unités et repères rencontrés dans un JSON (`{ unit }`, `{ frame }`), récursivement. */
export function unitesEtReperes(v, acc = { unites: {}, reperes: {} }) {
  if (Array.isArray(v)) { for (const x of v) unitesEtReperes(x, acc); return acc; }
  if (!estObjet(v)) return acc;
  if (typeof v.unit === 'string') acc.unites[v.unit] = (acc.unites[v.unit] ?? 0) + 1;
  if (typeof v.frame === 'string') acc.reperes[v.frame] = (acc.reperes[v.frame] ?? 0) + 1;
  for (const k of Object.keys(v)) if (k !== 'unit' && k !== 'frame') unitesEtReperes(v[k], acc);
  return acc;
}

// ——— Classement d'un objet ———

class Illisible extends Error {}
const exiger = (cond, message) => { if (!cond) throw new Illisible(message); };

/** Paramètres présents qui ne sont pas repris par la conversion (perte signalée), hors valeurs nulles ou absentes. */
function restes(params, repris) {
  return Object.keys(params).filter((k) => !repris.includes(k) && params[k] !== null && params[k] !== undefined && !(Array.isArray(params[k]) && params[k].length === 0)).sort();
}

/**
 * Classe un objet Atelier. Rend { regle, cible?, pertes[], manques[] } ; `cible` = { collection, valeur } quand la
 * règle est convertible (valeur Studio sans identité ni calque : posés par la simulation). Lève `Illisible`.
 */
function classerObjetBrut(o, ctx) {
  const p = o.params;
  exiger(estObjet(p), 'params n\'est pas un objet');
  if (!CLASSES_ATELIER.includes(o.classe)) return { regle: 'R-CLASSE-INCONNUE', pertes: [], manques: [`classe « ${o.classe} »`] };
  if (o.classe === 'esquisse') {
    exiger(FORMES_ESQUISSE.includes(p.forme), `forme d'esquisse inconnue : ${String(p.forme)}`);
    exiger(Array.isArray(p.points) && p.points.every(point), 'points absents ou hors repère local / m');
    const base = ['forme', 'points', 'ferme', 'centre', 'rayon', 'angleDebut', 'angleFin'];
    if (p.forme === 'ligne') {
      exiger(p.points.length === 2, 'une ligne a deux points');
      return { regle: 'R-LIGNE', cible: { collection: 'objects', valeur: { type: 'line', start: P(p.points[0]), end: P(p.points[1]) } }, pertes: restes(p, base) };
    }
    if (p.forme === 'polyligne' || p.forme === 'polygone') {
      const closed = p.forme === 'polygone' || p.ferme === true;
      const valeur = { type: 'polyline', points: p.points.map(P), closed };
      const transformations = [];
      if (p.renflements !== undefined && p.renflements !== null) {
        exiger(Array.isArray(p.renflements) && p.renflements.every(fini), 'renflements illisibles');
        const segments = closed ? p.points.length : Math.max(0, p.points.length - 1);
        if (p.renflements.length > segments) return { regle: 'R-POLYLIGNE-RENFLEMENTS', pertes: [], manques: [`${p.renflements.length} renflement(s) pour ${segments} segment(s)`] };
        if (p.renflements.some((b) => b !== 0)) {
          const manquants = segments - p.renflements.length;
          valeur.bulges = [...p.renflements, ...Array(manquants).fill(0)];
          if (manquants) transformations.push(`renflements complétés par ${manquants} zéro(s) (renflement absent = segment droit, pointsPolyligne)`);
        }
      }
      return { regle: 'R-POLYLIGNE', cible: { collection: 'objects', valeur }, pertes: restes(p, [...base, 'renflements']), transformations };
    }
    if (p.forme === 'cercle') {
      exiger(point(p.centre) && longueur(p.rayon), 'centre ou rayon absent');
      return { regle: 'R-CERCLE', cible: { collection: 'objects', valeur: { type: 'circle', center: P(p.centre), radius: p.rayon.value } }, pertes: restes(p, base) };
    }
    if (p.forme === 'arc') {
      exiger(point(p.centre) && longueur(p.rayon) && angleDeg(p.angleDebut) && angleDeg(p.angleFin), 'centre, rayon ou angles absents');
      // Balayage tracé par l'Atelier (pointsArc : fin ramenée strictement après le début, tours entiers conservés).
      let balayage = p.angleFin.value - p.angleDebut.value;
      while (balayage <= 0) balayage += 360;
      if (balayage >= 360) return { regle: 'R-ARC-AMBIGU', pertes: [], manques: [p.angleFin.value === p.angleDebut.value ? 'angles de début et de fin égaux (tour complet côté Atelier)' : `balayage de ${balayage}° (au moins un tour)`] };
      return { regle: 'R-ARC', cible: { collection: 'objects', valeur: { type: 'arc', center: P(p.centre), radius: p.rayon.value, startAngle: radians(p.angleDebut.value), endAngle: radians(p.angleFin.value) } }, pertes: restes(p, base) };
    }
    if (p.forme === 'rectangle') {
      const pts = p.points;
      const xs = [...new Set(pts.map((q) => q.x))], ys = [...new Set(pts.map((q) => q.y))];
      const aligne = (pts.length === 2 || pts.length === 4) && xs.length === 2 && ys.length === 2
        && (pts.length === 2 || pts.every((q) => pts.filter((r) => r.x === q.x).length === 2 && pts.filter((r) => r.y === q.y).length === 2));
      if (!aligne) return { regle: 'R-RECTANGLE-TOURNE', pertes: [], manques: ['côtés non parallèles aux axes'] };
      const [x0, x1] = xs.sort((a, b) => a - b), [y0, y1] = ys.sort((a, b) => a - b);
      return { regle: 'R-RECTANGLE', cible: { collection: 'objects', valeur: { type: 'rectangle', origin: { x: x0, y: y0 }, width: x1 - x0, height: y1 - y0 } }, pertes: restes(p, base) };
    }
    return { regle: 'R-ESQUISSE-SANS-CIBLE', pertes: [], manques: [`forme « ${p.forme} »`] };
  }
  if (o.classe === 'texte') return { regle: 'R-TEXTE', pertes: [], manques: ['hauteur du texte', 'justification'] };
  if (o.classe === 'cotation') return { regle: 'R-COTATION', pertes: [], manques: ['convention du décalage'] };
  if (o.classe === 'mur') {
    exiger(point(p.a) && point(p.b) && longueur(p.epaisseur), 'axe ou épaisseur absent');
    exiger(['gauche', 'axe', 'droite'].includes(p.alignement), 'alignement inconnu');
    if (typeof p.renflement === 'number' && p.renflement !== 0) return { regle: 'R-MUR-COURBE', pertes: [], manques: ['axe courbe'] };
    if (!longueur(p.hauteur) || p.niveauHautId) return { regle: 'R-MUR-HAUTEUR', pertes: [], manques: [p.niveauHautId ? 'hauteur liée au niveau haut' : 'hauteur non évaluée'] };
    const niveau = ctx.niveaux.get(o.niveau_id);
    const justification = { gauche: 'right', axe: 'center', droite: 'left' }[p.alignement];
    const valeur = { type: 'wall', axis: [P(p.a), P(p.b)], thickness: p.epaisseur.value, height: p.hauteur.value, base: niveau && fini(niveau.elevation) ? niveau.elevation : null, justification };
    return { regle: 'R-MUR', cible: { collection: 'architecture', valeur }, pertes: restes(p, ['a', 'b', 'epaisseur', 'hauteur', 'niveauHautId', 'alignement', 'renflement']) };
  }
  if (o.classe === 'porte' || o.classe === 'fenetre' || o.classe === 'ouverture') {
    exiger(typeof p.murHoteId === 'string' && fini(p.position) && longueur(p.largeur) && longueur(p.hauteur), 'hôte, position, largeur ou hauteur absent');
    if (!longueur(p.allege) || p.cintre) return { regle: 'R-OUVERTURE-INCOMPLETE', pertes: [], manques: [p.cintre ? 'haut cintré' : 'allège non évaluée'] };
    const valeur = { type: 'opening', hostAtelier: p.murHoteId, positionRelative: p.position, width: p.largeur.value, height: p.hauteur.value, sill: p.allege.value };
    if (o.classe !== 'ouverture') valeur.kind = o.classe;
    return { regle: 'R-OUVERTURE', cible: { collection: 'architecture', valeur }, pertes: restes(p, ['murHoteId', 'position', 'largeur', 'hauteur', 'allege', 'cintre']) };
  }
  if (o.classe === 'bloc-occurrence') return { regle: 'R-COMPOSANT', pertes: [], manques: [] };
  return { regle: 'R-SANS-CIBLE', pertes: [], manques: [] };
}

// ——— Simulation ———

/**
 * Simule la migration de lignes lues (`{ [table]: rows[] | undefined }`, table absente = non lue). Options :
 * `hypotheses` (identifiants déclarés), `horodatage` et `sourceBuild` (fournis, pour un rapport reproductible),
 * `filesLocales` (exports `fadi-studio-file-locale/1` relus, facultatif), `autorites` ({ projectId: 'atelier'|'studio' },
 * MIG-COEX-05 : aucune déclarée par défaut), `validerDocument` (validateur Studio, facultatif : sans lui la
 * conformité des documents simulés est « non évaluée »).
 */
export function simuler(lignes, options = {}) {
  const declarees = new Set(options.hypotheses ?? []);
  for (const h of declarees) if (!Object.hasOwn(HYPOTHESES, h)) throw new Error(`hypothèse inconnue : ${h}`);
  const actives = new Set([...Object.keys(HYPOTHESES).filter((h) => HYPOTHESES[h].toujours), ...declarees]);
  const tables = Object.fromEntries(Object.keys(REQUETES).map((t) => [t, lignes[t] === undefined ? 'absente' : 'lue']));
  const L = (t) => lignes[t] ?? [];
  const index = Object.fromEntries(['atelier_niveaux', 'atelier_objets', 'atelier_calques', 'atelier_relations', 'atelier_definitions', 'atelier_groupes', 'atelier_references', 'atelier_versions', 'atelier_outbox', 'atelier_publications', 'drawing_exports', 'produced_documents', 'project_members', 'atelier_scripts', 'atelier_propositions', 'project_comments', 'studio_studies', 'studio_publications'].map((t) => [t, parProjet(L(t))]));
  const commandes = new Map(L('atelier_commands').map((r) => [r.project_id, r]));
  const sites = new Map(L('atelier_site').map((r) => [r.project_id, r]));
  const variantes = new Map(L('atelier_variants').map((r) => [r.project_id, r]));
  const volumes = new Map(L('volumes').map((v) => [v.id, v]));

  const correspondances = [];
  const pertes = [];
  const ambiguites = [];
  const nonConvertibles = [];
  const erreursPartielles = [];
  const documentsSimules = [];
  const projets = [];

  /** Enregistre un élément classé ; rend l'élément du rapport. */
  const noter = (projet, element) => {
    const regle = REGLES[element.regle];
    let statut = regle.statut;
    // Convertible seulement sous les hypothèses requises : sinon ambigu, avec l'hypothèse manquante nommée.
    const manquantes = (regle.hypotheses ?? []).filter((h) => !actives.has(h));
    if (statut === 'convertible' && manquantes.length) statut = 'ambigu';
    const e = { ...element, statut, evaluation: regle.evaluation, hypothesesManquantes: manquantes };
    projet.elements.push(e);
    if (statut === 'ambigu') ambiguites.push({ projet: projet.id, element: e.ancienne, regle: e.regle, motif: regle.motif, manques: e.manques ?? [], hypothesesManquantes: manquantes, traitement: 'non converti, conservé dans sa table d\'origine, décision ou saisie requise' });
    if (statut === 'non-convertible') nonConvertibles.push({ projet: projet.id, element: e.ancienne, regle: e.regle, motif: regle.motif, traitement: 'conservé dans sa table d\'origine (jamais supprimé), signalé' });
    return e;
  };
  const erreur = (projet, ancienne, code, message) => {
    const x = { projet: projet.id, element: ancienne, code, message };
    projet.erreurs.push(x);
    erreursPartielles.push(x);
  };

  for (const pr of L('projects')) {
    const pid = pr.id;
    const projet = { id: pid, code: pr.code, elements: [], erreurs: [], inventaire: {} };
    const niveaux = index.atelier_niveaux.get(pid) ?? [];
    const objets = index.atelier_objets.get(pid) ?? [];
    const calques = index.atelier_calques.get(pid) ?? [];
    const relations = index.atelier_relations.get(pid) ?? [];
    const definitions = index.atelier_definitions.get(pid) ?? [];
    const groupes = index.atelier_groupes.get(pid) ?? [];
    const references = index.atelier_references.get(pid) ?? [];
    const site = sites.get(pid);
    const ctx = { niveaux: new Map(niveaux.map((n) => [n.id, n])) };

    // ——— Recensement (MIG-01 à MIG-04) ———
    const formes = objets.filter((o) => o.classe === 'esquisse').map((o) => (estObjet(o.params) ? o.params.forme : '(illisible)'));
    const ur = unitesEtReperes(objets.map((o) => o.params));
    const cmd = commandes.get(pid);
    const outbox = index.atelier_outbox.get(pid) ?? [];
    const publications = index.atelier_publications.get(pid) ?? [];
    projet.inventaire = {
      'MIG-01': {
        objets: objets.length, parClasse: compter(objets, (o) => o.classe), formesDessin: compter(formes, (f) => f),
        unites: ur.unites, reperes: ur.reperes,
        unitesNonReconnues: Object.keys(ur.unites).filter((u) => !UNITES_CONNUES.includes(u)),
        reperesNonLocaux: Object.keys(ur.reperes).filter((f) => f !== 'local'),
        niveaux: niveaux.map((n) => ({ id: n.id, elevation: n.elevation, hauteur: n.hauteur ?? 'non évaluée', objets: objets.filter((o) => o.niveau_id === n.id).length })),
        objetsSansNiveau: objets.filter((o) => !o.niveau_id).length, calques: calques.length,
        site: site ? { parcelle: !!site.parcelle, emprise: !!site.emprise, ontologies: Array.isArray(site.ontologies) ? site.ontologies : [] } : null,
        membres: (index.project_members.get(pid) ?? []).length,
      },
      'MIG-02': {
        associations: compter(relations, (r) => r.kind), cotes: objets.filter((o) => o.classe === 'cotation').length,
        composants: { definitions: compter(definitions.filter((d) => d.classe === 'bloc' || d.classe === 'composant'), (d) => d.classe), occurrences: objets.filter((o) => o.classe === 'bloc-occurrence').length, groupes: groupes.length },
        referencesCaracteristiques: references.length,
      },
      'MIG-03': {
        historique: cmd ? { entrees: cmd.n, revisions: [cmd.rmin, cmd.rmax], contrats: cmd.contrats } : { entrees: 0 },
        versions: (index.atelier_versions.get(pid) ?? []).length, variante: variantes.has(pid),
        automatisation: { scripts: (index.atelier_scripts.get(pid) ?? []).reduce((s, r) => s + r.n, 0), propositions: Object.fromEntries((index.atelier_propositions.get(pid) ?? []).map((r) => [r.statut, r.n])) },
        commentairesJournal: (index.project_comments.get(pid) ?? []).length,
        commandesHorsLigne: { serveur: { enAttente: outbox.filter((e) => e.en_attente).length, traitees: outbox.filter((e) => !e.en_attente).length }, navigateur: 'non évalué côté serveur (IndexedDB des appareils) : relu seulement depuis des exports fournis' },
      },
      'MIG-04': {
        referencesExternes: definitions.filter((d) => d.classe === 'reference-externe').length,
        publications: { atelier: publications.length, studio: (index.studio_publications.get(pid) ?? []).length },
        exportsDessin: (index.drawing_exports.get(pid) ?? []).length, documentsProduits: (index.produced_documents.get(pid) ?? []).length,
      },
    };

    // ——— Classement (MIG-05) et transformations simulées (MIG-07) ———
    const etude = `sim-etude-${court('etude', pid)}`;
    noter(projet, { ancienne: `projet:${pid}`, regle: 'R-PROJET', nouvelle: `projet:${pid}` });
    for (const m of index.project_members.get(pid) ?? []) noter(projet, { ancienne: `membre:${pid}/${court('membre', m.user_id)}`, regle: 'R-MEMBRES' });

    const calquesCible = new Map();
    for (const c of calques) {
      const id = `sim-calque-${court('calque', pid, c.id)}`;
      const lp = [...(c.parent_id ? ['imbrication (parent_id)'] : []), ...(c.gele ? ['gel (gele)'] : []), ...(c.a_proprietes ? ['propriétés du calque'] : [])];
      calquesCible.set(c.id, { id, name: c.nom, visible: !!c.visible, locked: !!c.verrouille });
      const e = noter(projet, { ancienne: `atelier_calques:${pid}/${c.id}`, regle: 'R-CALQUE', nouvelle: `${etude}#layers/${id}`, pertes: lp });
      if (e.statut === 'convertible') {
        correspondances.push({ ancienne: e.ancienne, nouvelle: e.nouvelle, filiation: { source: { table: 'atelier_calques', projet: pid, id: c.id }, regle: 'R-CALQUE', hypotheses: [...actives].filter((h) => HYPOTHESES[h].toujours).sort(), transformation: 'calque → layer' } });
        for (const x of lp) pertes.push({ projet: pid, element: e.ancienne, perte: x, traitement: 'reste lisible dans atelier_calques (source conservée), signalé' });
      }
    }

    for (const n of niveaux) noter(projet, { ancienne: `atelier_niveaux:${pid}/${n.id}`, regle: 'R-NIVEAU', nouvelle: `sim-variante-${court('variante', pid, n.id)}`, manques: ['niveau absent de studio-document/1'] });

    const convertis = new Map(); // id Atelier → { nouvelleId, element, valeur, niveau }
    const enAttenteHote = [];
    for (const o of objets) {
      const ancienne = `atelier_objets:${pid}/${o.id}`;
      let c;
      try { c = classerObjetBrut(o, ctx); } catch (err) {
        if (!(err instanceof Illisible)) throw err;
        noter(projet, { ancienne, classe: o.classe, regle: 'R-PARAMS-ILLISIBLES', manques: [err.message] });
        erreur(projet, ancienne, 'parametres-illisibles', err.message);
        continue;
      }
      if (c.regle === 'R-CLASSE-INCONNUE') erreur(projet, ancienne, 'classe-inconnue', `classe « ${o.classe} » absente de l'ontologie Atelier`);
      const lp = [...(c.pertes ?? []).map((k) => `paramètre « ${k} » non porté`)];
      if (estObjet(o.proprietes) && Object.keys(o.proprietes).length) lp.push('propriétés déclarées (correspondance non évaluée)');
      if (o.phase) lp.push('phase');
      if (o.verrouille) lp.push('verrou d\'objet');
      if (o.groupe_id) lp.push('appartenance à un groupe');
      if (c.cible && !o.niveau_id) { noter(projet, { ancienne, classe: o.classe, regle: 'R-NIVEAU', manques: ['objet sans niveau : aucune variante simulée'] }); continue; }
      if (c.cible?.collection === 'architecture' && c.cible.valeur.type === 'wall' && c.cible.valeur.base === null) {
        noter(projet, { ancienne, classe: o.classe, regle: 'R-MUR-HAUTEUR', manques: ['élévation du niveau absente'] });
        continue;
      }
      const element = { ancienne, classe: o.classe, regle: c.regle, manques: c.manques ?? [], pertes: c.cible ? lp : [] };
      if (c.cible && c.cible.valeur.type === 'opening') { enAttenteHote.push({ o, c, element, lp }); continue; }
      const e = noter(projet, element);
      if (e.statut === 'convertible') convertis.set(o.id, { nouvelleId: `sim-objet-${court('objet', pid, o.id)}`, element: e, valeur: c.cible, o, lp, transformations: c.transformations ?? [] });
    }
    for (const { o, c, element, lp } of enAttenteHote) {
      const hote = convertis.get(c.cible.valeur.hostAtelier);
      if (!hote || hote.valeur.valeur.type !== 'wall' || hote.o.niveau_id !== o.niveau_id) {
        noter(projet, { ...element, regle: 'R-OUVERTURE-INCOMPLETE', pertes: [], manques: ['mur hôte non converti'] });
        continue;
      }
      const [a, b] = hote.valeur.valeur.axis;
      const longueurAxe = Math.hypot(b.x - a.x, b.y - a.y);
      const { hostAtelier, positionRelative, ...reste } = c.cible.valeur;
      // Atelier : `position` = paramètre du CENTRE de la baie le long de l'axe (versions.ts `collisions`, maillage.ts :
      // [c − w/2 ; c + w/2]) ; Studio : distance du BORD DE DÉBUT (types.ts StudioOpening, placerOuverture).
      const valeur = { ...reste, hostId: hote.nouvelleId, position: positionRelative * longueurAxe - reste.width / 2 };
      const e = noter(projet, element);
      if (e.statut === 'convertible') convertis.set(o.id, { nouvelleId: `sim-objet-${court('objet', pid, o.id)}`, element: e, valeur: { collection: 'architecture', valeur }, o, lp, hote: hostAtelier });
    }

    // Documents simulés : un par niveau (hypothèse structure-cible), objets convertis seulement. Avec un validateur
    // Studio, chaque objet est d'abord validé seul (avec son mur hôte et les calques) : un refus reste rattaché à son
    // élément, qui redevient ambigu et sort du document ; une ouverture dont l'hôte est refusé le suit.
    const valeurStudio = (x) => {
      const v = { id: x.nouvelleId, ...x.valeur.valeur };
      if (x.o.calque_id && calquesCible.has(x.o.calque_id) && v.type !== 'opening') v.layerId = calquesCible.get(x.o.calque_id).id;
      return v;
    };
    const squelette = (id, calquesIds) => {
      const d = { id, schemaVersion: 'studio-document/1', units: 'm', frame: 'local-2d', objects: [] };
      if (calquesIds.length) d.layers = calquesIds.map((c) => calquesCible.get(c));
      return d;
    };
    const ranger = (doc, v, collection) => { if (collection === 'objects') doc.objects.push(v); else (doc.architecture ??= []).push(v); };
    const rejeter = (x, message) => {
      x.element.statut = 'ambigu';
      x.element.rejetStudio = message;
      erreur(projet, x.element.ancienne, 'refus-validateur-studio', message);
      ambiguites.push({ projet: pid, element: x.element.ancienne, regle: x.element.regle, motif: 'objet simulé refusé par le validateur Studio', manques: [message], hypothesesManquantes: [], traitement: 'non converti, conservé dans sa table d\'origine' });
    };
    if (options.validerDocument) {
      for (const x of convertis.values()) {
        if (x.valeur.valeur.type === 'opening') continue;
        const doc = squelette('sim-controle', x.o.calque_id && calquesCible.has(x.o.calque_id) ? [x.o.calque_id] : []);
        ranger(doc, valeurStudio(x), x.valeur.collection);
        try { options.validerDocument(doc); } catch (err) { rejeter(x, String(err?.message ?? err)); }
      }
      for (const x of convertis.values()) {
        if (x.valeur.valeur.type !== 'opening') continue;
        const hote = convertis.get(x.hote);
        if (hote.element.statut !== 'convertible') { rejeter(x, 'mur hôte refusé par le validateur Studio'); continue; }
        const doc = squelette('sim-controle', hote.o.calque_id && calquesCible.has(hote.o.calque_id) ? [hote.o.calque_id] : []);
        ranger(doc, valeurStudio(hote), 'architecture');
        ranger(doc, valeurStudio(x), 'architecture');
        try { options.validerDocument(doc); } catch (err) { rejeter(x, String(err?.message ?? err)); }
      }
    }
    for (const n of niveaux) {
      const variante = `sim-variante-${court('variante', pid, n.id)}`;
      const revision = `sim-revision-${court('revision', pid, n.id, String(pr.model_revision))}`;
      const membres = [...convertis.values()].filter((x) => x.o.niveau_id === n.id && x.element.statut === 'convertible');
      if (!membres.length) continue;
      const document = squelette(`sim-doc-${court('doc', pid, n.id)}`, [...new Set(membres.map((x) => x.o.calque_id).filter((id) => id && calquesCible.has(id)))].sort());
      for (const x of membres) {
        const v = valeurStudio(x);
        ranger(document, v, x.valeur.collection);
        const nouvelle = `${etude}/${variante}/${revision}#${x.valeur.collection}/${x.nouvelleId}`;
        x.element.nouvelle = nouvelle;
        const transformations = [`${x.o.classe}${x.o.classe === 'esquisse' ? ` (${x.o.params.forme})` : ''} → ${v.type}`];
        if (v.type === 'arc') transformations.push('angles : degrés → radians dans [0 ; 2π[');
        if (v.type === 'wall') transformations.push(`alignement ${x.o.params.alignement} → justification ${v.justification}`, `base = élévation du niveau ${n.id}`);
        if (v.type === 'opening') transformations.push('position : paramètre du centre × longueur de l\'axe du mur hôte − largeur / 2 (centre Atelier → bord de début Studio)');
        transformations.push(...(x.transformations ?? []));
        transformations.push(`niveau ${n.id} (élévation ${n.elevation} m) → variante simulée`);
        correspondances.push({
          ancienne: x.element.ancienne, nouvelle,
          filiation: {
            source: { table: 'atelier_objets', projet: pid, id: x.o.id, classe: x.o.classe, revisionModele: x.o.model_revision, empreinteParams: sha256(canonique(x.o.params)) },
            ...(x.hote ? { hote: `atelier_objets:${pid}/${x.hote}` } : {}),
            regle: x.element.regle, hypotheses: [...new Set([...(REGLES[x.element.regle].hypotheses ?? []), ...[...actives].filter((h) => HYPOTHESES[h].toujours)])].sort(),
            transformations,
          },
        });
        pertes.push({ projet: pid, element: x.element.ancienne, perte: `élévation du niveau (${n.elevation} m) et sa hauteur : absentes d'un document 2D`, traitement: 'portées par la filiation (niveau source), source conservée' });
        for (const lp of x.lp) pertes.push({ projet: pid, element: x.element.ancienne, perte: lp, traitement: 'reste lisible dans atelier_objets (source conservée), signalé' });
      }
      // Rapport : noms de calques remplacés par une empreinte courte (M7) ; l'empreinte et la validation portent sur le
      // document réel, avec ses noms.
      const rapporte = document.layers ? { ...document, layers: document.layers.map((l) => ({ ...l, name: nomMasque('calque', l.name) })) } : document;
      const d = { projet: pid, niveau: n.id, etude, variante, revision, objets: membres.length, empreinte: sha256(canonique(document)), conformite: 'non évaluée (aucun validateur fourni)', nomsCalques: 'masqués (empreinte courte)', document: rapporte };
      if (options.validerDocument) {
        try { options.validerDocument(document); d.conformite = 'conforme (validateStudioDocument)'; } catch (err) {
          d.conformite = 'refusé';
          d.refus = String(err?.message ?? err);
          erreur(projet, `document:${d.revision}`, 'document-refuse', d.refus);
        }
      }
      documentsSimules.push(d);
    }

    // Relations (MIG-02)
    for (const r of relations) {
      const ancienne = `atelier_relations:${pid}/${r.id}`;
      if (r.kind === 'heberge-par') {
        const src = convertis.get(r.source_id), cible = convertis.get(r.target_id);
        const ok = src?.element.statut === 'convertible' && cible?.element.statut === 'convertible';
        // La relation doit désigner le mur que l'ouverture déclare elle-même (params.murHoteId), et ce doit être un mur.
        const sourceObjet = objets.find((o) => o.id === r.source_id), cibleObjet = objets.find((o) => o.id === r.target_id);
        const hoteDeclare = estObjet(sourceObjet?.params) ? sourceObjet.params.murHoteId : undefined;
        const incoherences = [
          ...(sourceObjet && hoteDeclare !== undefined && r.target_id !== hoteDeclare ? [`cible ${r.target_id} ≠ mur hôte déclaré ${String(hoteDeclare)}`] : []),
          ...(sourceObjet && hoteDeclare === undefined ? ['source sans mur hôte déclaré'] : []),
          ...(cibleObjet && cibleObjet.classe !== 'mur' ? [`cible de classe « ${cibleObjet.classe} », pas un mur`] : []),
        ];
        if (incoherences.length) noter(projet, { ancienne, regle: 'R-HEBERGE-INCOHERENT', manques: incoherences });
        else if (ok) {
          const e = noter(projet, { ancienne, regle: 'R-HEBERGE', nouvelle: `${convertis.get(r.source_id).element.nouvelle}.hostId` });
          if (e.statut === 'convertible') correspondances.push({ ancienne, nouvelle: e.nouvelle, filiation: { source: { table: 'atelier_relations', projet: pid, id: r.id, kind: r.kind }, regle: 'R-HEBERGE', hypotheses: [], transformations: ['relation → champ hostId de l\'ouverture'] } });
        } else noter(projet, { ancienne, regle: 'R-RELATION-SANS-CIBLE', manques: ['ouverture ou mur hôte non converti'] });
      } else if (r.kind === 'reference') noter(projet, { ancienne, regle: 'R-ASSOCIATION-REFERENCE' });
      else noter(projet, { ancienne, regle: 'R-RELATION-SANS-CIBLE', manques: [`relation « ${r.kind} »`] });
    }
    for (const d of definitions) {
      const ancienne = `atelier_definitions:${pid}/${d.id}`;
      const regle = d.classe === 'bloc' || d.classe === 'composant' ? 'R-COMPOSANT' : d.classe === 'planche' ? 'R-PLANCHE' : d.classe === 'reference-externe' ? 'R-REFERENCE-EXTERNE' : 'R-DEFINITION-SANS-CIBLE';
      noter(projet, { ancienne, classe: d.classe, regle });
    }
    for (const g of groupes) noter(projet, { ancienne: `atelier_groupes:${pid}/${g.id}`, regle: 'R-COMPOSANT' });
    for (const r of references) noter(projet, { ancienne: `atelier_references:${pid}/${r.id}`, regle: 'R-REFERENCE-CARACTERISTIQUE' });
    if (site?.parcelle || site?.emprise) noter(projet, { ancienne: `atelier_site:${pid}`, regle: 'R-SITE' });
    if (Array.isArray(site?.ontologies) && site.ontologies.length) noter(projet, { ancienne: `atelier_site:${pid}#ontologies`, regle: 'R-ONTOLOGIES' });
    // Historiques et automatisation (MIG-03)
    if (cmd) noter(projet, { ancienne: `atelier_commands:${pid}[${cmd.rmin}..${cmd.rmax}]`, regle: 'R-HISTORIQUE' });
    for (const v of index.atelier_versions.get(pid) ?? []) noter(projet, { ancienne: `atelier_versions:${v.id}`, regle: 'R-VERSION' });
    if (variantes.has(pid)) noter(projet, { ancienne: `atelier_variants:${pid}`, regle: 'R-VARIANTE' });
    if ((index.atelier_scripts.get(pid) ?? []).length || (index.atelier_propositions.get(pid) ?? []).length) noter(projet, { ancienne: `atelier_scripts+propositions:${pid}`, regle: 'R-AUTOMATISATION' });
    for (const c of index.project_comments.get(pid) ?? []) noter(projet, { ancienne: `project_comments:${c.id}`, regle: 'R-COMMENTAIRE-JOURNAL' });
    for (const e of outbox) noter(projet, { ancienne: `atelier_outbox:${e.id}`, regle: e.en_attente ? 'R-OUTBOX-EN-ATTENTE' : 'R-OUTBOX-TRAITE' });
    // Références externes et publications (MIG-04)
    for (const pub of publications) noter(projet, { ancienne: `atelier_publications:${pub.id}`, regle: 'R-PUBLICATION' });
    for (const x of index.drawing_exports.get(pid) ?? []) noter(projet, { ancienne: `drawing_exports:${x.id}`, regle: 'R-EXPORT' });
    for (const x of index.produced_documents.get(pid) ?? []) noter(projet, { ancienne: `produced_documents:${pid}/${x.kind}`, regle: 'R-DOCUMENT-PRODUIT' });
    for (const s of index.studio_studies.get(pid) ?? []) noter(projet, { ancienne: `studio_studies:${s.id}`, regle: 'R-STUDIO', nouvelle: `studio_studies:${s.id}` });
    for (const s of index.studio_publications.get(pid) ?? []) noter(projet, { ancienne: `studio_publications:${s.id}`, regle: 'R-STUDIO', nouvelle: `studio_publications:${s.id}` });

    projets.push(projet);
  }

  // Comptes (MIG-03) : profils d'affichage et d'outils.
  const comptes = [];
  for (const u of L('users')) {
    const pseudo = `compte:${court('compte', u.id)}`;
    if (u.ensembles) comptes.push({ element: `users.atelier_ensembles:${pseudo}`, regle: 'R-ENSEMBLES', statut: REGLES['R-ENSEMBLES'].statut });
  }
  for (const p of L('studio_tool_preferences')) comptes.push({ element: `studio_tool_preferences:compte:${court('compte', p.user_id)}`, regle: 'R-STUDIO', statut: 'compatible' });
  for (const c of comptes) if (c.statut === 'non-convertible') nonConvertibles.push({ projet: null, element: c.element, regle: c.regle, motif: REGLES[c.regle].motif, traitement: 'conservé dans sa table d\'origine (jamais supprimé), signalé' });

  // Erreurs sans projet (volume commun, export de file non rattaché) : listées et comptées à part, jamais perdues.
  const erreursHorsProjet = [];
  const erreurHorsProjet = (projetDeclare, element, code, message) => {
    const x = { projet: projetDeclare ?? null, element, code, message };
    erreursHorsProjet.push(x);
    erreursPartielles.push(x);
  };

  // Volumes : compatibles, intégrité vérifiée ; un volume non intègre est une erreur partielle (I3).
  const volumesRapport = L('volumes').map((v) => {
    const empreinteOk = v.sha256 === v.id, tailleOk = v.size === v.taille_reelle;
    const r = { id: v.id, regle: 'R-VOLUME', statut: 'compatible', integre: empreinteOk && tailleOk };
    if (!r.integre) {
      r.defauts = [...(empreinteOk ? [] : ['empreinte SHA-256 du contenu différente de l\'identifiant']), ...(tailleOk ? [] : [`taille déclarée ${v.size} ≠ taille réelle ${v.taille_reelle}`])];
      erreurHorsProjet(null, `volumes:${v.id}`, 'volume-non-integre', r.defauts.join(' ; '));
    }
    return r;
  });

  // Files locales exportées (MIG-03, MIG-COEX-04).
  const filesLocales = (options.filesLocales ?? []).map((f, i) => recenserFileLocale(f, i));
  for (const f of filesLocales) {
    const projet = projets.find((p) => p.id === f.projet);
    const e = { ancienne: `file-locale:${f.reference}`, regle: 'R-FILE-LOCALE', manques: [f.traitement] };
    if (projet) noter(projet, e);
    else ambiguites.push({ projet: f.projet, element: e.ancienne, regle: 'R-FILE-LOCALE', motif: REGLES['R-FILE-LOCALE'].motif, manques: [f.traitement, f.projet ? 'projet absent de la base lue' : 'projet inconnu'], hypothesesManquantes: [], traitement: 'conservée, à résoudre' });
    if (f.erreur) {
      const message = f.chemin ? `${f.erreur} — ${f.chemin}` : f.erreur;
      if (projet) erreur(projet, e.ancienne, 'file-locale-illisible', message);
      else erreurHorsProjet(f.projet, e.ancienne, 'file-locale-illisible', message);
    }
  }

  // ——— Contrôles prévus ———
  const controles = {
    'MIG-COEX-03': controlerPublications(L('atelier_publications'), L('atelier_versions'), volumes),
    'MIG-COEX-04': controlerEnAttente(L('atelier_outbox'), filesLocales),
    'MIG-COEX-06': projets.map((p) => ({ projet: p.id, ...planEcriture(chainesProjet(p, (index.studio_studies.get(p.id) ?? []).length, options.autorites?.[p.id])) })),
    'OPS-04': { etat: 'contrôle existant, non modifié', preuves: [
      'apps/api/src/testing/studio-validation-runtime.test.ts : enveloppe d\'un autre contrat refusée avant toute transaction',
      'packages/atelier-model/src/commandes/commandes.test.ts : contrat Atelier non pris en charge refusé',
      'apps/web/src/modules/studio/chargement/service-worker.test.ts : coquille d\'un autre build jamais servie',
      'scripts/migration/simulation-studio.test.mjs : aucun contrat du journal Atelier (atelier-commands/*) n\'est studio-commands/1 — historique non rejouable, conservé',
    ] },
    'OPS-05': { etat: 'contrôle existant, complété par un test des magasins IndexedDB', preuves: [
      'apps/web/src/modules/studio/chargement/service-worker.test.ts : IndexedDB jamais touchée par le service worker',
      'apps/web/src/modules/studio/hors-ligne/contrats.test.ts : file incompatible conservée, jamais réinterprétée',
      'apps/web/src/lib/local-store-migration.test.ts : aucune version du schéma local ne retire la file Atelier ni les brouillons Studio',
    ] },
  };

  // ——— Synthèse : comptes par projet et par statut, jamais un taux global seul ———
  const synthese = projets.map((p) => ({
    projet: p.id, code: p.code,
    ...Object.fromEntries(STATUTS.map((s) => [s, p.elements.filter((e) => e.statut === s).length])),
    erreurs: p.erreurs.length,
  }));
  const totaux = Object.fromEntries([...STATUTS, 'erreurs'].map((s) => [s, synthese.reduce((n, x) => n + x[s], 0)]));
  totaux.erreurs += erreursHorsProjet.length;
  const regles = Object.fromEntries(Object.entries(REGLES).map(([id, r]) => [id, { ...r, utilisee: projets.some((p) => p.elements.some((e) => e.regle === id)) || comptes.some((c) => c.regle === id) }]));

  const corps = {
    version: VERSION_RAPPORT,
    genere: { horodatage: options.horodatage ?? null, sourceBuild: options.sourceBuild ?? 'non renseigné', base: options.base ?? null },
    mandat: { simulation: true, ecriture: 'aucune', lecture: options.lecture ?? 'non renseignée', retourArriere: 'sans objet : rien n\'est écrit', proprietaire: 'non décidé (MIG-COEX-05)', accord: 'aucun : simulation seulement' },
    schema: { tables },
    hypotheses: Object.entries(HYPOTHESES).map(([id, h]) => ({ id, texte: h.texte, appliquee: actives.has(id), origine: h.toujours ? 'structure de simulation' : declarees.has(id) ? 'déclarée par l\'opérateur' : 'non déclarée' })),
    regles,
    projets: projets.map(({ id, code, inventaire, elements, erreurs }) => ({ id, code, inventaire, elements, erreurs })),
    comptes, volumes: volumesRapport, filesLocales,
    correspondances: correspondances.sort((a, b) => a.ancienne.localeCompare(b.ancienne)),
    documentsSimules,
    pertes, ambiguites, nonConvertibles, erreursPartielles,
    controles,
    synthese: { parProjet: synthese, horsProjet: { erreurs: erreursHorsProjet.length }, tablesAbsentes: Object.keys(tables).filter((t) => tables[t] === 'absente'), totaux, avertissement: 'Aucun taux global : chaque erreur partielle, ambiguïté et non-convertible est listée avec son élément.' },
  };
  corps.empreinteCorpus = sha256(canonique({ tables: corps.schema.tables, lignes: Object.fromEntries(Object.keys(REQUETES).map((t) => [t, lignes[t] ?? null])) }));
  return corps;
}

/** Export de file locale que la ligne de commande n'a pas pu lire ou analyser (M8) : chemin et cause gardés. */
export class FichierIllisible {
  constructor(chemin, cause) { this.chemin = String(chemin); this.cause = String(cause); }
}

/** Brouillon Studio exporté (`fadi-studio-file-locale/1`) : jamais rejoué ici, seulement recensé. */
export function recenserFileLocale(fichier, i = 0) {
  const reference = `export-${i + 1}`;
  if (fichier instanceof FichierIllisible) return { reference, projet: null, chemin: fichier.chemin, erreur: `fichier d'export illisible : ${fichier.cause}`, traitement: 'à résoudre : export illisible, projet inconnu — bascule bloquée pour tous les projets tant qu\'il n\'est pas relu' };
  if (!estObjet(fichier) || fichier.format !== FORMAT_EXPORT_FILE_LOCALE || !estObjet(fichier.ligne)) return { reference, projet: null, erreur: 'format d\'export inconnu', traitement: 'à résoudre' };
  const ligne = fichier.ligne;
  let version = null, enveloppes = 0, pas = 0;
  try {
    const d = JSON.parse(ligne.donnees);
    version = d?.version ?? null;
    pas = Array.isArray(d?.pas) ? d.pas.length : 0;
    enveloppes = Array.isArray(d?.plan?.lots) ? d.plan.lots.length : 0;
  } catch { return { reference, projet: ligne.projectId ?? null, compte: ligne.userId ? `compte:${court('compte', ligne.userId)}` : null, erreur: 'données du brouillon illisibles', traitement: 'à résoudre (exporté, jamais effacé)' }; }
  const courant = version === VERSION_BROUILLON_COURANTE;
  return { reference, projet: ligne.projectId ?? null, compte: ligne.userId ? `compte:${court('compte', ligne.userId)}` : null, version, pas, enveloppes, raisonExport: fichier.raison ?? null, traitement: courant ? 'à synchroniser avant bascule (format courant)' : 'à résoudre (format incompatible) avant bascule' };
}

/** MIG-COEX-03 : chaque publication historique reste liée à sa version et à ses pièces (volumes intègres). */
export function controlerPublications(publications, versions, volumes) {
  const ids = new Set(versions.map((v) => v.id));
  return publications.map((p) => {
    const docs = Array.isArray(p.documents) ? p.documents : [];
    const pieces = docs.map((d) => {
      const v = volumes.get(d?.volumeId);
      const etat = !v ? 'pièce absente' : v.sha256 !== v.id ? 'empreinte divergente' : v.taille_reelle !== d.size ? 'taille divergente' : 'lien intact';
      return { fichier: typeof d?.fileName === 'string' ? nomMasque('fichier', d.fileName) : null, volume: d?.volumeId ?? null, etat };
    });
    const versionPresente = ids.has(p.version_id);
    const intacte = versionPresente && pieces.every((x) => x.etat === 'lien intact');
    return { publication: p.id, projet: p.project_id, version: p.version_id, versionPresente, pieces, etat: intacte ? 'lien intact' : 'lien rompu (signalé, rien n\'est réparé ni supprimé)' };
  });
}

/** MIG-COEX-04 : tout ce qui attend une écriture serveur bloque la bascule du projet ; rien n'est supprimé. */
export function controlerEnAttente(outbox, filesLocales) {
  const items = [
    ...outbox.filter((e) => e.en_attente).map((e) => ({ projet: e.project_id, element: `atelier_outbox:${e.id}`, type: e.event_type, traitement: 'synchroniser ou mettre en résolution avant bascule ; jamais supprimé' })),
    ...filesLocales.map((f) => ({ projet: f.projet, element: `file-locale:${f.reference}`, type: 'brouillon Studio', traitement: f.traitement })),
  ];
  // Un élément sans projet connu n'est jamais rangé sous `null` : il bloque la bascule de TOUS les projets.
  const bloques = [...new Set(items.filter((x) => x.projet).map((x) => x.projet))].sort();
  const nonRattaches = items.filter((x) => !x.projet);
  return { enAttente: items, basculeBloquee: bloques, nonRattaches, basculeBloqueeTousProjets: nonRattaches.length > 0, regle: 'Une bascule est refusée tant qu\'un élément en attente n\'est ni synchronisé, ni migré sous contrat, ni en résolution ; un élément dont le projet est inconnu bloque tous les projets.' };
}

/**
 * MIG-COEX-06 : chaînes d'écriture d'une étude. Une migration fait naître une étude depuis le modèle Atelier ; tant que
 * la propriété d'écriture n'est pas décidée (MIG-COEX-05), l'Atelier reste écrivain de la source et l'étude simulée
 * n'a aucun écrivain admis : deux chaînes ne peuvent jamais écrire la même étude. La consultation historique reste.
 */
export function chainesProjet(projet, etudesStudio, autorite) {
  const atelier = projet.elements.some((e) => e.ancienne.startsWith('atelier_'));
  const etude = `sim-etude-${court('etude', projet.id)}`;
  if (!atelier) return { etude, chaines: [] };
  if (autorite !== 'atelier' && autorite !== 'studio') {
    return { etude, autorite: 'non décidée', etudesStudioExistantes: etudesStudio, chaines: [{ chaine: 'atelier', ecriture: false, lecture: true }, { chaine: 'studio', ecriture: false, lecture: true }] };
  }
  return { etude, autorite, etudesStudioExistantes: etudesStudio, chaines: [{ chaine: 'atelier', ecriture: autorite === 'atelier', lecture: true }, { chaine: 'studio', ecriture: autorite === 'studio', lecture: true }] };
}

/** Refuse tout plan où deux chaînes écrivent la même étude, ou où la consultation historique disparaît. */
export function planEcriture({ etude, autorite = null, etudesStudioExistantes = 0, chaines }) {
  const ecrivains = chaines.filter((c) => c.ecriture).map((c) => c.chaine);
  const refus = [];
  if (ecrivains.length > 1) refus.push(`deux chaînes d'écriture incompatibles sur ${etude} : ${ecrivains.join(', ')}`);
  if (chaines.length && !chaines.some((c) => c.chaine === 'atelier' && c.lecture)) refus.push('consultation historique de l\'Atelier non maintenue');
  return {
    etude, autorite, etudesStudioExistantes, ecrivains, lecture: chaines.filter((c) => c.lecture).map((c) => c.chaine),
    verdict: refus.length ? 'refusé' : chaines.length === 0 ? 'sans objet (aucune donnée Atelier)' : ecrivains.length === 0 ? 'bascule bloquée : propriété d\'écriture non décidée (MIG-COEX-05)' : 'une seule chaîne d\'écriture',
    refus,
  };
}

// ——— Rendu Markdown ———

const cell = (v) => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (entetes, lignes) => [`| ${entetes.join(' | ')} |`, `| ${entetes.map(() => '---').join(' | ')} |`, ...lignes.map((l) => `| ${l.map(cell).join(' | ')} |`)].join('\n');

export function rapportMarkdown(r) {
  const out = [];
  out.push('# Rapport de simulation de migration vers Studio V1', '');
  out.push(`Format \`${r.version}\` · build \`${r.genere.sourceBuild}\` · généré ${r.genere.horodatage ?? 'non renseigné'} · empreinte du corpus \`${r.empreinteCorpus.slice(0, 16)}…\``, '');
  out.push('> Simulation seulement : aucune écriture (lecture : ' + r.mandat.lecture + '). Les non-convertibles restent dans leurs tables d\'origine. ' + r.synthese.avertissement, '');
  out.push('## Hypothèses', '', table(['Identifiant', 'Appliquée', 'Origine', 'Texte'], r.hypotheses.map((h) => [h.id, h.appliquee ? 'oui' : 'non', h.origine, h.texte])), '');
  out.push('## Synthèse par projet', '', table(['Projet', 'Code', 'Compatibles', 'Convertibles', 'Ambigus', 'Non convertibles', 'Erreurs partielles'], [...r.synthese.parProjet.map((p) => [p.projet, p.code, p.compatible, p.convertible, p.ambigu, p['non-convertible'], p.erreurs]), ['hors projet', '—', '—', '—', '—', '—', r.synthese.horsProjet.erreurs], ['total', '—', r.synthese.totaux.compatible, r.synthese.totaux.convertible, r.synthese.totaux.ambigu, r.synthese.totaux['non-convertible'], r.synthese.totaux.erreurs]]), '');
  const absentes = r.synthese.tablesAbsentes;
  out.push('## Tables absentes du schéma lu', '', absentes.length ? `> **Alerte** : ${absentes.length} table(s) attendue(s) absente(s) du schéma : rien n'y a été lu, le recensement correspondant est incomplet.\n\n${absentes.map((t) => `- \`${t}\` (${REQUETES[t]?.mig.join(', ') ?? '—'})`).join('\n')}` : 'Aucune : toutes les tables attendues ont été lues.', '');
  const nonIntegres = r.volumes.filter((v) => !v.integre);
  out.push('## Volumes', '', `${r.volumes.length} volume(s) lu(s), ${nonIntegres.length} non intègre(s).`, '', nonIntegres.length ? table(['Volume', 'Défauts'], nonIntegres.map((v) => [v.id, (v.defauts ?? []).join(' ; ')])) : 'Tous intègres (empreinte et taille).', '');
  out.push('## Recensement (MIG-01 à MIG-04)', '');
  for (const p of r.projets) {
    const i = p.inventaire;
    out.push(`### ${p.code} (${p.id})`, '');
    out.push(`- MIG-01 : ${i['MIG-01'].objets} objet(s) ${JSON.stringify(i['MIG-01'].parClasse)} ; formes ${JSON.stringify(i['MIG-01'].formesDessin)} ; unités ${JSON.stringify(i['MIG-01'].unites)} ; repères ${JSON.stringify(i['MIG-01'].reperes)} ; ${i['MIG-01'].niveaux.length} niveau(x) ; ${i['MIG-01'].calques} calque(s)`);
    out.push(`- MIG-02 : associations ${JSON.stringify(i['MIG-02'].associations)} ; ${i['MIG-02'].cotes} cote(s) ; composants ${JSON.stringify(i['MIG-02'].composants)}`);
    out.push(`- MIG-03 : journal ${JSON.stringify(i['MIG-03'].historique)} ; ${i['MIG-03'].versions} version(s) ; hors ligne serveur ${JSON.stringify(i['MIG-03'].commandesHorsLigne.serveur)} ; navigateur : ${i['MIG-03'].commandesHorsLigne.navigateur}`);
    out.push(`- MIG-04 : ${i['MIG-04'].referencesExternes} référence(s) externe(s) ; publications ${JSON.stringify(i['MIG-04'].publications)} ; ${i['MIG-04'].exportsDessin} export(s) de dessin`, '');
  }
  out.push('## Erreurs partielles (MIG-10)', '', r.erreursPartielles.length ? table(['Projet', 'Élément', 'Code', 'Message'], r.erreursPartielles.map((e) => [e.projet ?? '— (hors projet)', e.element, e.code, e.message])) : 'Aucune.', '');
  out.push('## Non convertibles conservés (MIG-09)', '', r.nonConvertibles.length ? table(['Projet', 'Élément', 'Règle', 'Traitement'], r.nonConvertibles.map((e) => [e.projet, e.element, e.regle, e.traitement])) : 'Aucun.', '');
  out.push('## Ambiguïtés (MIG-08)', '', r.ambiguites.length ? table(['Projet', 'Élément', 'Règle', 'Manque', 'Hypothèses manquantes'], r.ambiguites.map((e) => [e.projet, e.element, e.regle, e.manques.join(' ; '), e.hypothesesManquantes.join(', ')])) : 'Aucune.', '');
  out.push('## Pertes (MIG-08)', '', r.pertes.length ? table(['Projet', 'Élément', 'Perte', 'Traitement'], r.pertes.map((e) => [e.projet, e.element, e.perte, e.traitement])) : 'Aucune.', '');
  out.push('## Correspondances d\'identités (MIG-07)', '', r.correspondances.length ? table(['Ancienne identité', 'Nouvelle identité', 'Règle', 'Transformations'], r.correspondances.map((c) => [c.ancienne, c.nouvelle, c.filiation.regle, (c.filiation.transformations ?? [c.filiation.transformation]).join(' ; ')])) : 'Aucune.', '');
  out.push('## Documents Studio simulés', '', r.documentsSimules.length ? table(['Projet', 'Niveau', 'Révision simulée', 'Objets', 'Conformité'], r.documentsSimules.map((d) => [d.projet, d.niveau, d.revision, d.objets, d.conformite])) : 'Aucun.', '');
  out.push('## Contrôles prévus', '');
  out.push('### MIG-COEX-03 — publications liées à leurs pièces', '', r.controles['MIG-COEX-03'].length ? table(['Publication', 'Projet', 'Version présente', 'État'], r.controles['MIG-COEX-03'].map((c) => [c.publication, c.projet, c.versionPresente ? 'oui' : 'non', c.etat])) : 'Aucune publication Atelier.', '');
  out.push('### MIG-COEX-04 — éléments en attente', '', `${r.controles['MIG-COEX-04'].regle} Projets bloqués : ${r.controles['MIG-COEX-04'].basculeBloqueeTousProjets ? `TOUS (${r.controles['MIG-COEX-04'].nonRattaches.length} élément(s) sans projet connu)` : r.controles['MIG-COEX-04'].basculeBloquee.join(', ') || 'aucun'}.`, '');
  out.push('### MIG-COEX-06 — une seule chaîne d\'écriture par étude', '', table(['Projet', 'Étude simulée', 'Autorité', 'Écrivains', 'Lecture', 'Verdict'], r.controles['MIG-COEX-06'].map((c) => [c.projet, c.etude, c.autorite ?? '—', c.ecrivains.join(', ') || 'aucun', c.lecture.join(', ') || '—', c.verdict])), '');
  for (const id of ['OPS-04', 'OPS-05']) out.push(`### ${id} — ${r.controles[id].etat}`, '', ...r.controles[id].preuves.map((p) => `- ${p}`), '');
  out.push('## Règles de classement (MIG-05)', '', table(['Règle', 'Statut', 'Évaluation', 'Hypothèses', 'Sources', 'Utilisée'], Object.entries(r.regles).map(([id, g]) => [id, g.statut, g.evaluation, (g.hypotheses ?? []).join(', '), g.sources.map((s) => `${s.fichier} (${s.symbole})`).join(' ; ') || 'non évalué', g.utilisee ? 'oui' : 'non'])), '');
  return out.join('\n');
}
