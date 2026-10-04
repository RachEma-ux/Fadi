/**
 * Registre des outils du nouvel Atelier (UX2, UX4 ; cahier des charges §5.8) : famille, synonymes (français et
 * termes d'autres logiciels), aide située (une phrase + un exemple), conditions d'activation, raccourci, niveau
 * d'affichage à partir duquel l'outil est proposé. La palette cherche dans tout cela ; la barre affiche les
 * favoris et les outils du niveau d'affichage courant.
 */
import type { NiveauAffichage } from "./etat-ui";

export type Famille = "creer" | "modifier" | "connecter" | "analyser" | "documenter" | "partager" | "naviguer";

export interface Outil {
  id: string;
  libelle: string;
  famille: Famille;
  /** Pictogramme texte (pas d'image inventée). */
  picto: string;
  synonymes: string[];
  aide: string;
  exemple: string;
  /** Condition d'activation (lisible) ; `null` = toujours. */
  condition: "selection" | "selection-mur" | "selection-ligne" | "niveau" | null;
  raccourci: string | null;
  affichage: NiveauAffichage;
  /** Entrée DA de la fiche de capacité. */
  fiche: string;
}

const O = (o: Outil): Outil => o;

export const OUTILS: readonly Outil[] = [
  O({ id: "selection", libelle: "Sélection", famille: "naviguer", picto: "↖", synonymes: ["select", "pick", "flèche", "choisir"], aide: "Cliquez un objet ; glissez pour un cadre ; Alt + glisser pour un lasso ; Maj pour ajouter ; en 3D, glissez une flèche pour déplacer la sélection.", exemple: "Cliquer un mur, puis modifier son épaisseur dans l'inspecteur.", condition: null, raccourci: "v", affichage: "essentiel", fiche: "DA-02-15" }),
  O({ id: "lasso", libelle: "Lasso", famille: "naviguer", picto: "➰", synonymes: ["lasso", "main levée", "sélection libre", "entourer"], aide: "Glissez autour des objets : ceux entièrement entourés sont sélectionnés ; Maj pour ajouter à la sélection.", exemple: "Entourer les cloisons d'un plateau en forme de L.", condition: null, raccourci: null, affichage: "contextuel", fiche: "DA-02-15" }),
  O({ id: "mur", libelle: "Mur", famille: "creer", picto: "▬", synonymes: ["wall", "cloison", "paroi", "tracer un mur"], aide: "Cliquez le début puis la fin de l'axe ; tapez une longueur pour la saisie de précision ; Entrée termine, Échap annule.", exemple: "Un mur de 4 m : cliquer, taper 4, Entrée.", condition: "niveau", raccourci: "m", affichage: "essentiel", fiche: "DA-07-01" }),
  O({ id: "porte", libelle: "Porte", famille: "creer", picto: "◩", synonymes: ["door", "ouverture", "passage"], aide: "Cliquez sur un mur pour y poser la porte ; largeur et hauteur dans l'inspecteur.", exemple: "Porte 0,90 × 2,10 m au tiers du mur.", condition: "niveau", raccourci: "p", affichage: "essentiel", fiche: "DA-07-02" }),
  O({ id: "fenetre", libelle: "Fenêtre", famille: "creer", picto: "▢", synonymes: ["window", "baie", "châssis"], aide: "Cliquez sur un mur pour y poser la fenêtre ; allège, largeur et hauteur dans l'inspecteur.", exemple: "Fenêtre 1,20 × 1,40 m, allège 0,90 m.", condition: "niveau", raccourci: "f", affichage: "essentiel", fiche: "DA-07-03" }),
  O({ id: "ouverture", libelle: "Ouverture", famille: "creer", picto: "▭", synonymes: ["opening", "réservation", "trémie murale", "baie libre"], aide: "Cliquez sur un mur pour y réserver une ouverture libre.", exemple: "Ouverture 1,00 × 2,10 m sans menuiserie.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-07-04" }),
  O({ id: "dalle", libelle: "Dalle", famille: "creer", picto: "▱", synonymes: ["slab", "plancher", "floor", "dalle béton"], aide: "Cliquez les sommets du contour ; cliquez le premier point ou Entrée pour fermer.", exemple: "Dalle de 0,25 m sur l'emprise du niveau.", condition: "niveau", raccourci: "d", affichage: "essentiel", fiche: "DA-07-06" }),
  O({ id: "toiture", libelle: "Toiture", famille: "creer", picto: "⌂", synonymes: ["roof", "toit", "couverture"], aide: "Cliquez les sommets du contour ; avec une pente, le premier côté est l'égout (monopente) ou parallèle au faîtage (bipente). Pente 0 : toiture plate.", exemple: "Toiture bipente à 30°, faîtage parallèle au premier côté.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-07-07" }),
  O({ id: "escalier", libelle: "Escalier", famille: "creer", picto: "▤", synonymes: ["stair", "stairs", "volée", "marches"], aide: "Cliquez le départ puis l'arrivée de l'axe ; largeur, hauteur à franchir et niveau d'arrivée dans l'inspecteur.", exemple: "Escalier droit RDC → mezzanine, 1,20 m, 18 contremarches.", condition: "niveau", raccourci: "e", affichage: "essentiel", fiche: "DA-07-10" }),
  O({ id: "piece", libelle: "Pièce", famille: "creer", picto: "◫", synonymes: ["room", "local", "espace", "zone", "surface"], aide: "Cliquez dans une boucle fermée de murs : la pièce est proposée, puis créée avec son nom.", exemple: "Cliquer dans le bureau fermé par quatre murs → « Bureau 1 ».", condition: "niveau", raccourci: "r", affichage: "essentiel", fiche: "DA-07-15" }),
  O({ id: "espace", libelle: "Espace", famille: "creer", picto: "◧", synonymes: ["space", "espace déclaré", "programme"], aide: "Cliquez les sommets d'un espace déclaré (sans murs) ; nom et catégorie dans l'inspecteur.", exemple: "Espace « Terrasse » hors enveloppe.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-07-16" }),
  O({ id: "zone", libelle: "Zone", famille: "creer", picto: "⬚", synonymes: ["zone", "secteur", "noyau"], aide: "Cliquez les sommets de la zone ; elle contient les pièces qu'elle recouvre.", exemple: "Zone « Noyau technique ».", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-07-17" }),
  O({ id: "poteau", libelle: "Poteau", famille: "creer", picto: "▣", synonymes: ["column", "colonne", "pilier", "post"], aide: "Cliquez l'emplacement ; section et hauteur dans l'inspecteur.", exemple: "Poteau 0,30 × 0,30 m.", condition: "niveau", raccourci: "o", affichage: "contextuel", fiche: "DA-03-13" }),
  O({ id: "solide", libelle: "Solide", famille: "creer", picto: "⬒", synonymes: ["extrude", "extrusion", "volume", "bloc", "push"], aide: "Cliquez les sommets du contour, puis la hauteur dans l'inspecteur : un solide générique est extrudé.", exemple: "Un comptoir de 1,10 m de haut.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-04-01" }),
  O({ id: "ligne", libelle: "Ligne", famille: "creer", picto: "╱", synonymes: ["line", "segment", "trait", "pen"], aide: "Cliquez deux points ; Maj contraint à l'orthogonal.", exemple: "Ligne de 3 m à 45°.", condition: "niveau", raccourci: "l", affichage: "contextuel", fiche: "DA-01-02" }),
  O({ id: "garde-corps", libelle: "Garde-corps", famille: "creer", picto: "⫴", synonymes: ["railing", "guardrail", "rambarde", "balustrade", "main courante"], aide: "Cliquez les points du garde-corps ; Entrée termine. La hauteur est celle saisie dans l'inspecteur (valeur de l'outil, pas une exigence réglementaire).", exemple: "Garde-corps de mezzanine sur trois côtés.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "lot 5 · objets reportés" }),
  O({ id: "bloc", libelle: "Placer un bloc", famille: "creer", picto: "❖", synonymes: ["block", "insert", "symbole", "composant", "component", "bibliothèque", "mobilier"], aide: "Choisissez le bloc ou le composant dans l'inspecteur, puis cliquez son point de base sur le plan.", exemple: "Placer trois tables « Mobilier · Table 6 places ».", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-05-06" }),
  O({ id: "polyligne", libelle: "Polyligne", famille: "creer", picto: "⌇", synonymes: ["polyline", "chaîne", "tracé"], aide: "Cliquez les points successifs ; Entrée termine, cliquer le premier point ferme en polygone.", exemple: "Contour d'un massif en cinq points.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-02" }),
  O({ id: "rectangle", libelle: "Rectangle", famille: "creer", picto: "▭", synonymes: ["rect", "carré", "square", "box"], aide: "Cliquez deux coins opposés.", exemple: "Rectangle 2 × 3 m.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-04" }),
  O({ id: "cercle", libelle: "Cercle", famille: "creer", picto: "○", synonymes: ["circle", "rond", "disque"], aide: "Cliquez le centre puis un point du cercle.", exemple: "Cercle de rayon 1,50 m.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-03" }),
  O({ id: "arc", libelle: "Arc", famille: "creer", picto: "◠", synonymes: ["arc", "courbe"], aide: "Cliquez le centre, le début puis la fin de l'arc.", exemple: "Arc de 90° de rayon 2 m.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-03" }),
  O({ id: "polygone-regulier", libelle: "Polygone régulier", famille: "creer", picto: "⬢", synonymes: ["polygon regular", "hexagone", "pentagone", "octogone"], aide: "Renseignez le nombre de côtés, puis cliquez le centre et un sommet.", exemple: "Hexagone de 2 m de rayon.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-02" }),
  O({ id: "cercle-3-points", libelle: "Cercle par 3 points", famille: "creer", picto: "◌", synonymes: ["circle 3 points", "cercle trois points", "cercle circonscrit"], aide: "Cliquez trois points du cercle.", exemple: "Cercle passant par trois poteaux.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-03" }),
  O({ id: "rectangle-centre", libelle: "Rectangle par centre", famille: "creer", picto: "⊡", synonymes: ["rectangle centre", "rectangle centré"], aide: "Cliquez le centre puis un coin.", exemple: "Table 1,6 × 0,8 m centrée sur un axe.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-04" }),
  O({ id: "rectangle-3-points", libelle: "Rectangle par 3 points", famille: "creer", picto: "▱", synonymes: ["rectangle incliné", "rectangle tourné", "rectangle 3 points"], aide: "Cliquez les deux extrémités d'un côté, puis un point qui donne la largeur.", exemple: "Terrasse alignée sur un mur oblique.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-04" }),
  O({ id: "cercle-2-points", libelle: "Cercle par 2 points", famille: "creer", picto: "⊖", synonymes: ["cercle diamètre", "circle 2 points"], aide: "Cliquez les deux extrémités d'un diamètre.", exemple: "Cercle entre deux poteaux.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-03" }),
  O({ id: "ellipse", libelle: "Ellipse", famille: "creer", picto: "⬭", synonymes: ["ellipse", "ovale", "oval"], aide: "Cliquez le centre, l'extrémité d'un axe, puis un point qui donne l'autre demi-axe.", exemple: "Table ovale 2,4 × 1,2 m.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-03" }),
  O({ id: "trame", libelle: "Trame d'axes", famille: "creer", picto: "#", synonymes: ["grille d'axes", "axes numérotés", "grid", "trame structurelle"], aide: "Renseignez les entraxes, puis cliquez l'origine de la trame.", exemple: "Trame 3 × 5,40 m en x, 2 × 6 m en y.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-10" }),
  O({ id: "polygone", libelle: "Polygone", famille: "creer", picto: "⬡", synonymes: ["polygon", "contour fermé"], aide: "Cliquez les sommets ; cliquer le premier point ferme.", exemple: "Hexagone régulier approché.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-04" }),
  O({ id: "spline", libelle: "Courbe", famille: "creer", picto: "∿", synonymes: ["spline", "curve", "courbe lisse", "bezier"], aide: "Cliquez les points de contrôle ; Entrée termine (Catmull-Rom).", exemple: "Courbe libre d'un cheminement.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-05" }),
  O({ id: "construction", libelle: "Ligne de construction", famille: "creer", picto: "┈", synonymes: ["construction", "axe", "centerline", "guide", "repère"], aide: "Cliquez deux points : la ligne sert aux accrochages, elle n'est pas dessinée dans les documents.", exemple: "Axe de symétrie du plateau.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-10" }),
  O({ id: "hachure", libelle: "Hachure", famille: "creer", picto: "▨", synonymes: ["hatch", "hachures", "remplissage", "motif"], aide: "Cliquez les sommets de la zone à hachurer ; motif dans l'inspecteur.", exemple: "Hachure béton sur une coupe.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-01-11" }),
  O({ id: "deplacer", libelle: "Déplacer", famille: "modifier", picto: "✥", synonymes: ["move", "translation", "glisser"], aide: "Sélectionnez, puis cliquez le point de départ et le point d'arrivée ; ou tapez dx, dy.", exemple: "Déplacer trois murs de 0,50 m vers le nord.", condition: "selection", raccourci: "g", affichage: "essentiel", fiche: "DA-02-01" }),
  O({ id: "copier", libelle: "Copier", famille: "modifier", picto: "⧉", synonymes: ["copy", "dupliquer", "clone"], aide: "Sélectionnez, puis cliquez le point de départ et le point d'arrivée de la copie ; un mur emmène des copies de ses ouvertures.", exemple: "Copier un bureau type.", condition: "selection", raccourci: "c", affichage: "contextuel", fiche: "DA-02-02" }),
  O({ id: "tourner", libelle: "Tourner", famille: "modifier", picto: "⟳", synonymes: ["rotate", "rotation", "pivoter"], aide: "Sélectionnez, cliquez le centre, puis tapez l'angle ou cliquez la direction.", exemple: "Tourner de 90°.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-03" }),
  O({ id: "miroir", libelle: "Miroir", famille: "modifier", picto: "⇄", synonymes: ["mirror", "symétrie", "flip"], aide: "Sélectionnez, puis cliquez deux points de l'axe de symétrie ; Alt garde l'original.", exemple: "Symétriser l'aile est.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-04" }),
  O({ id: "echelle", libelle: "Échelle", famille: "modifier", picto: "⤢", synonymes: ["scale", "agrandir", "réduire", "homothétie"], aide: "Sélectionnez, cliquez le centre puis tapez le facteur ; les épaisseurs et hauteurs typées ne changent pas.", exemple: "× 1,5 sur une esquisse.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-05" }),
  O({ id: "etirer", libelle: "Étirer", famille: "modifier", picto: "↔", synonymes: ["stretch", "allonger", "prolonger une extrémité", "poignée"], aide: "Cliquez une extrémité de mur ou de ligne puis sa nouvelle position ; les ouvertures gardent leur distance à l'extrémité fixe.", exemple: "Allonger un mur de 4 à 6 m.", condition: "selection-mur", raccourci: null, affichage: "contextuel", fiche: "DA-02-06" }),
  O({ id: "ajuster", libelle: "Ajuster", famille: "modifier", picto: "⌐", synonymes: ["trim", "couper", "raccourcir jusqu'à"], aide: "Sélectionnez l'objet à raccourcir, puis cliquez l'objet limite.", exemple: "Ajuster une cloison sur le mur de façade.", condition: "selection-mur", raccourci: null, affichage: "contextuel", fiche: "DA-02-07" }),
  O({ id: "prolonger", libelle: "Prolonger", famille: "modifier", picto: "⊢", synonymes: ["extend", "allonger jusqu'à", "joindre"], aide: "Sélectionnez l'objet à prolonger, puis cliquez l'objet limite.", exemple: "Prolonger une cloison jusqu'au mur.", condition: "selection-mur", raccourci: null, affichage: "contextuel", fiche: "DA-02-08" }),
  O({ id: "decaler", libelle: "Décaler", famille: "modifier", picto: "∥", synonymes: ["offset", "parallèle", "décalage"], aide: "Sélectionnez des murs ou des lignes, tapez la distance, choisissez le côté.", exemple: "Doublage à 0,10 m du mur.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-09" }),
  O({ id: "raccorder", libelle: "Raccorder", famille: "modifier", picto: "◜", synonymes: ["fillet", "congé", "arrondir"], aide: "Sélectionnez deux lignes d'esquisse, tapez le rayon.", exemple: "Congé de 0,50 m.", condition: "selection-ligne", raccourci: null, affichage: "complet", fiche: "DA-02-10" }),
  O({ id: "chanfreiner", libelle: "Chanfreiner", famille: "modifier", picto: "◤", synonymes: ["chamfer", "chanfrein", "biseau"], aide: "Sélectionnez deux lignes d'esquisse, tapez la distance.", exemple: "Chanfrein de 0,20 m.", condition: "selection-ligne", raccourci: null, affichage: "complet", fiche: "DA-02-11" }),
  O({ id: "repeter", libelle: "Répéter", famille: "modifier", picto: "⋯", synonymes: ["array", "pattern", "trame", "réseau", "répétition"], aide: "Sélectionnez, puis nombre et pas (dx, dy) ou centre et angle.", exemple: "Trame de poteaux tous les 6 m.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-12" }),
  O({ id: "pousser", libelle: "Pousser / tirer", famille: "modifier", picto: "⇕", synonymes: ["push pull", "push/pull", "pousser tirer", "hauteur", "rehausser", "extruder"], aide: "En vue 3D : cliquez un mur, un poteau, un solide, une dalle ou une toiture et glissez vers le haut ou le bas ; la valeur s'affiche, le relâchement l'enregistre.", exemple: "Rehausser un mur de 2,50 à 3,00 m.", condition: null, raccourci: "u", affichage: "essentiel", fiche: "DA-04-07" }),
  O({ id: "extruder", libelle: "Extruder l'esquisse", famille: "creer", picto: "⬆", synonymes: ["extrude", "extrusion", "solidifier", "volume depuis esquisse"], aide: "Sélectionnez une esquisse fermée (rectangle, cercle, polygone) : elle devient un solide de la hauteur de l'outil.", exemple: "Un rectangle 2 × 1 m devient un bloc de 1,10 m.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-04-01" }),
  O({ id: "decomposer", libelle: "Décomposer", famille: "modifier", picto: "⊟", synonymes: ["explode", "éclater", "dissocier"], aide: "Sélectionnez des polylignes, polygones ou rectangles d'esquisse : ils deviennent des lignes.", exemple: "Décomposer un rectangle en quatre lignes.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-13" }),
  O({ id: "scinder", libelle: "Scinder", famille: "modifier", picto: "⫽", synonymes: ["split", "couper un mur", "diviser"], aide: "Cliquez un point sur l'axe d'un mur : deux murs, les ouvertures suivent, les cotes rattachées passent « à réparer ».", exemple: "Scinder un mur de 8 m au milieu.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-07-01" }),
  O({ id: "supprimer", libelle: "Supprimer", famille: "modifier", picto: "⌫", synonymes: ["delete", "erase", "effacer", "retirer"], aide: "Supprime la sélection ; un mur hébergeant des ouvertures demande confirmation.", exemple: "Sélectionner une cloison, puis Suppr.", condition: "selection", raccourci: "Delete", affichage: "essentiel", fiche: "DA-02-13" }),
  O({ id: "mesurer", libelle: "Mesurer", famille: "analyser", picto: "↔", synonymes: ["measure", "tape", "mètre", "distance"], aide: "Cliquez deux points : distance, dx, dy et angle s'affichent, rien n'est écrit.", exemple: "Vérifier un dégagement de 1,40 m.", condition: null, raccourci: "t", affichage: "essentiel", fiche: "DA-15-01" }),
  O({ id: "cotation", libelle: "Cotation", famille: "documenter", picto: "⟷", synonymes: ["dimension", "cote", "dim"], aide: "Cliquez deux points puis le décalage ; une cote cliquée sur une arête de mur s'y rattache.", exemple: "Cote de façade.", condition: "niveau", raccourci: "k", affichage: "essentiel", fiche: "DA-15-02" }),
  O({ id: "texte", libelle: "Texte", famille: "documenter", picto: "T", synonymes: ["text", "note", "annotation", "label"], aide: "Cliquez l'emplacement puis tapez le texte dans l'inspecteur.", exemple: "« Issue de secours ».", condition: "niveau", raccourci: null, affichage: "essentiel", fiche: "DA-15-04" }),
  O({ id: "etiquette", libelle: "Étiquette", famille: "documenter", picto: "⌸", synonymes: ["tag", "repère", "étiquette d'objet"], aide: "Cliquez un objet puis l'emplacement : l'étiquette porte son nom et le suit.", exemple: "Étiqueter chaque porte par son repère.", condition: "niveau", raccourci: null, affichage: "contextuel", fiche: "DA-15-06" }),
  O({ id: "calques", libelle: "Calques", famille: "naviguer", picto: "☰", synonymes: ["layers", "couches", "visibilité"], aide: "Visibilité et verrouillage des calques dans le navigateur ; affecter la sélection à un calque.", exemple: "Masquer « Mobilier ».", condition: null, raccourci: null, affichage: "essentiel", fiche: "DA-05-01" }),
  O({ id: "joindre", libelle: "Joindre", famille: "modifier", picto: "⛓", synonymes: ["join", "pedit", "relier", "fusionner lignes"], aide: "Joint des lignes et polylignes bout à bout en une polyligne (un polygone si la chaîne se referme).", exemple: "Joindre quatre lignes en un contour fermé.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-02-13" }),
  O({ id: "grouper", libelle: "Grouper", famille: "modifier", picto: "⧈", synonymes: ["group", "regrouper", "ensemble"], aide: "Groupe la sélection ; « Dissoudre » dans l'inspecteur.", exemple: "Grouper un bloc sanitaire.", condition: "selection", raccourci: null, affichage: "contextuel", fiche: "DA-05-05" }),
];

export const OUTILS_PAR_ID: Readonly<Record<string, Outil>> = Object.fromEntries(OUTILS.map((o) => [o.id, o]));

const ORDRE: Record<NiveauAffichage, number> = { essentiel: 0, contextuel: 1, complet: 2 };

export function outilsVisibles(affichage: NiveauAffichage): Outil[] {
  return OUTILS.filter((o) => ORDRE[o.affichage] <= ORDRE[affichage]);
}

/** Recherche de la palette : libellé, synonymes, famille, fiche ; sans accents ni casse. */
export function rechercherOutils(texte: string): Outil[] {
  const q = normaliser(texte);
  if (!q) return [...OUTILS];
  return OUTILS.map((o) => ({ o, score: score(o, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.o.libelle.localeCompare(b.o.libelle, "fr"))
    .map((x) => x.o);
}

function score(o: Outil, q: string): number {
  const l = normaliser(o.libelle);
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (o.synonymes.some((s) => normaliser(s) === q)) return 70;
  if (l.includes(q)) return 50;
  if (o.synonymes.some((s) => normaliser(s).includes(q))) return 40;
  if (normaliser(o.aide).includes(q) || normaliser(o.fiche).includes(q) || normaliser(o.famille).includes(q)) return 10;
  return 0;
}

export const normaliser = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const FAMILLES: Record<Famille, string> = { creer: "Créer", modifier: "Modifier", connecter: "Connecter", analyser: "Analyser", documenter: "Documenter", partager: "Partager", naviguer: "Naviguer" };
