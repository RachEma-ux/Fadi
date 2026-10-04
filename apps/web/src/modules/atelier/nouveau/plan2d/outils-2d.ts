/**
 * Machine à états des outils du plan 2D : à chaque clic (point accroché), l'outil décide s'il attend d'autres
 * points ou s'il émet un lot de commandes (annexe B). Fonctions pures sur l'état du modèle et l'état d'affichage :
 * le composant React ne fait que les appeler et transmettre les commandes au bus.
 */
import { boucles, caracteristiqueAuPoint, cercleTroisPoints, commandesTrame, ellipseTroisPoints, lireEntraxes, polygoneRegulier, rectangleTroisPoints, detecterPieces, distance, projectionSurSegment, pt, referenceExtremite, type AxeMur, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import type { EtatUi } from "../etat-ui";

export interface ResultatClic {
  /** Commandes à exécuter (lot atomique) ; vide si l'outil attend encore. */
  commandes: Commande[];
  label: string;
  /** Points à conserver pour la suite du tracé. */
  pointsEnCours: Point2[];
  /** Message d'aide / de contrôle pour la ligne d'état. */
  aide: string;
  /** Sélection à poser après exécution (par exemple l'objet créé n'étant pas encore connu, on laisse vide). */
  selectionner?: string[];
  /** Mesure affichée (outil Mesurer). */
  mesure?: string;
}

const m = (value: number) => ({ value, unit: "m" as const });
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

const attendre = (pointsEnCours: Point2[], aide: string): ResultatClic => ({ commandes: [], label: "", pointsEnCours, aide });
const emettre = (commandes: Commande[], label: string, aide = "", extra: Partial<ResultatClic> = {}): ResultatClic => ({ commandes, label, pointsEnCours: [], aide, ...extra });

function nombre(ui: EtatUi, cle: string, defaut: number): number {
  const v = ui.parametresOutil[cle];
  return typeof v === "number" && Number.isFinite(v) ? v : defaut;
}

function murSous(etat: ModeleAtelier, niveauId: string, p: Point2, rayon: number): { mur: Occurrence<"mur">; t: number } | null {
  let meilleur: { mur: Occurrence<"mur">; t: number; d: number } | null = null;
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "mur" || o.niveauId !== niveauId) continue;
    const pr = projectionSurSegment(p, o.params.a, o.params.b);
    const d = Math.max(0, pr.distance - o.params.epaisseur.value / 2);
    if (d <= rayon && (!meilleur || d < meilleur.d)) meilleur = { mur: o, t: pr.t, d };
  }
  return meilleur ? { mur: meilleur.mur, t: meilleur.t } : null;
}

/** Nom de pièce suivant (« Pièce 3 ») — jamais une catégorie ou une surface inventée. */
function nomPieceSuivant(etat: ModeleAtelier, niveauId: string): string {
  const n = Object.values(etat.objets).filter((o) => o.classe === "piece" && o.niveauId === niveauId).length + 1;
  return `Pièce ${n}`;
}

/** Caractéristique d'objet du niveau portée exactement par un point (extrémité de cote accrochée). */
function rattachementAuPoint(etat: ModeleAtelier, niveauId: string, p: Point2): { objetId: string; caracteristique: string } | null {
  for (const o of Object.values(etat.objets)) {
    if (o.niveauId !== niveauId || o.classe === "cotation" || o.classe === "texte" || o.classe === "etiquette" || o.classe === "piece" || o.classe === "espace") continue;
    const c = caracteristiqueAuPoint(etat, o.id, p, 0.005);
    if (c && c !== "contour" && c !== "axe") return { objetId: o.id, caracteristique: c };
  }
  return null;
}

export function clic(outil: string, point: Point2, etat: ModeleAtelier, ui: EtatUi, options: { rayon: number; alt?: boolean; objetSous: string | null }): ResultatClic {
  const niveauId = ui.niveauId;
  const pts = ui.pointsEnCours;
  const base = { niveauId };
  if (!niveauId) return attendre([], "Choisissez d'abord un niveau.");
  const niveau = etat.niveaux[niveauId];
  switch (outil) {
    case "mur": {
      if (pts.length === 0) return attendre([point], "Cliquez la fin du mur (ou tapez une longueur, Entrée) ; Échap termine.");
      const a = pts[pts.length - 1]!;
      if (distance(a, point) < 1e-6) return attendre(pts, "Point identique au précédent.");
      const commandes: Commande[] = [{ type: "mur.tracer", params: { ...base, a, b: point, epaisseur: m(nombre(ui, "epaisseur", 0.2)), hauteur: m(nombre(ui, "hauteur", niveau?.hauteur ?? 3)), alignement: (ui.parametresOutil["alignement"] as string | undefined) ?? "axe", calqueId: (ui.parametresOutil["calqueId"] as string | null | undefined) ?? null, definitionId: (ui.parametresOutil["typeMur"] as string | null | undefined) ?? null } }];
      return { commandes, label: `Mur ${fmt(distance(a, point))} m`, pointsEnCours: [point], aide: "Mur tracé. Cliquez le point suivant pour enchaîner, Échap pour terminer." };
    }
    case "porte":
    case "fenetre":
    case "ouverture": {
      const cible = murSous(etat, niveauId, point, options.rayon * 2);
      if (!cible) return attendre([], "Cliquez sur un mur pour y poser l'ouverture.");
      const largeur = nombre(ui, "largeurOuverture", 0.9);
      const hauteur = nombre(ui, "hauteurOuverture", 2.1);
      const longueur = distance(cible.mur.params.a, cible.mur.params.b);
      const demi = largeur / 2 / longueur;
      const position = Math.min(1 - demi, Math.max(demi, cible.t));
      const params: Record<string, unknown> = { classe: outil, murHoteId: cible.mur.id, position, largeur: m(largeur), hauteur: m(hauteur) };
      if (outil === "fenetre") params["allege"] = m(nombre(ui, "allege", 0.9));
      return emettre([{ type: "ouverture.poser", params }], `${outil === "porte" ? "Porte" : outil === "fenetre" ? "Fenêtre" : "Ouverture"} sur ${cible.mur.id}`, "Ouverture posée ; modifiez-la dans l'inspecteur.");
    }
    case "dalle":
    case "toiture":
    case "zone":
    case "espace":
    case "solide":
    case "polygone":
    case "hachure": {
      if (pts.length >= 3 && distance(point, pts[0]!) <= options.rayon) return fermerContour(outil, pts, ui, niveauId);
      return attendre([...pts, point], pts.length >= 2 ? "Cliquez le premier point ou Entrée pour fermer le contour." : "Cliquez les sommets suivants.");
    }
    case "piece": {
      const axes: AxeMur[] = Object.values(etat.objets).filter((o): o is Occurrence<"mur"> => o.classe === "mur" && o.niveauId === niveauId).map((w) => ({ id: w.id, a: w.params.a, b: w.params.b }));
      const faces = boucles(axes).filter((f) => pointDansPolygone(point, f.contour));
      if (faces.length === 0) return attendre([], "Aucune boucle fermée de murs ici : fermez le contour ou utilisez l'outil Espace.");
      const face = faces.sort((u, v) => u.aire - v.aire)[0]!;
      const deja = detecterPieces(etat, niveauId).find((p) => p.contour.length === face.contour.length && Math.abs(p.aire - face.aire) < 1e-9 && p.pieceExistante);
      if (deja?.pieceExistante) return { commandes: [], label: "", pointsEnCours: [], aide: `Cette boucle est déjà la pièce ${deja.pieceExistante}.`, selectionner: [deja.pieceExistante] };
      return emettre([{ type: "piece.creer", params: { ...base, contour: face.contour, trous: [], nom: nomPieceSuivant(etat, niveauId), code: null } }], `Pièce ${fmt(face.aire)} m²`, `Pièce proposée (${fmt(face.aire)} m², ${face.murs.length} murs) créée : nommez-la dans l'inspecteur.`);
    }
    case "escalier": {
      if (pts.length === 0) return attendre([point], "Cliquez l'arrivée de l'escalier.");
      const a = pts[0]!;
      const suivant = Object.values(etat.niveaux).sort((u, v) => u.ordre - v.ordre).find((n) => n.ordre > (niveau?.ordre ?? 0));
      const hauteur = suivant && niveau ? suivant.elevation - niveau.elevation : nombre(ui, "hauteurEscalier", niveau?.hauteur ?? 3);
      return emettre([{ type: "escalier.creer", params: { ...base, a, b: point, largeur: m(nombre(ui, "largeurEscalier", 1.2)), hauteurAFranchir: m(hauteur), niveauDepartId: niveauId, niveauArriveeId: suivant?.id ?? null, contremarches: Math.max(1, Math.round(hauteur / 0.17)), referencePlanSeulement: false } }], "Escalier", suivant ? `Escalier vers ${suivant.nom} (${fmt(hauteur)} m) : contremarches et largeur dans l'inspecteur.` : "Escalier sans niveau d'arrivée : renseignez-le dans l'inspecteur.");
    }
    case "poteau": {
      const taille = nombre(ui, "taille", 0.3);
      return emettre([{ type: "poteau.creer", params: { ...base, point, formeId: "basic-square", largeur: m(taille), profondeur: m(taille), hauteur: m(nombre(ui, "hauteur", niveau?.hauteur ?? 3)) } }], "Poteau", "Poteau posé.");
    }
    case "ligne":
    case "construction": {
      if (pts.length === 0) return attendre([point], "Cliquez le second point.");
      return emettre([{ type: `esquisse.${outil}`, params: { ...base, points: [pts[0]!, point] } }], outil === "ligne" ? "Ligne" : "Ligne de construction", "", { pointsEnCours: [point] });
    }
    case "garde-corps":
      return attendre([...pts, point], pts.length ? "Point suivant ; Entrée termine le garde-corps." : "Cliquez le point suivant du garde-corps.");
    case "bloc": {
      const definitionId = ui.parametresOutil["definitionBloc"] as string | undefined;
      const def = definitionId ? etat.definitions[definitionId] : undefined;
      if (!def || (def.classe !== "bloc" && def.classe !== "composant")) return attendre([], "Choisissez d'abord le bloc ou le composant dans l'inspecteur.");
      return emettre([{ type: "bloc.placer", params: { ...base, definitionId: def.id, position: point, angle: { value: nombre(ui, "angleBloc", 0), unit: "deg" } } }], `${def.classe === "composant" ? "Composant" : "Bloc"} « ${def.nom} »`, "Occurrence placée ; cliquez pour en placer une autre, Échap pour terminer.");
    }
    case "polyligne":
    case "spline": {
      if (pts.length >= 2 && distance(point, pts[0]!) <= options.rayon) return emettre([{ type: `esquisse.${outil === "polyligne" ? "polygone" : "spline"}`, params: { ...base, points: pts, ferme: true } }], outil === "polyligne" ? "Polygone" : "Courbe fermée");
      return attendre([...pts, point], "Point suivant ; Entrée termine, cliquer le premier point ferme.");
    }
    case "rectangle": {
      if (pts.length === 0) return attendre([point], "Cliquez le coin opposé.");
      return emettre([{ type: "esquisse.rectangle", params: { ...base, points: [pts[0]!, point] } }], "Rectangle");
    }
    case "cercle": {
      if (pts.length === 0) return attendre([point], "Cliquez un point du cercle.");
      const r = distance(pts[0]!, point);
      if (r < 1e-6) return attendre(pts, "Rayon nul.");
      return emettre([{ type: "esquisse.cercle", params: { ...base, centre: pts[0]!, rayon: m(r), points: [] } }], `Cercle r = ${fmt(r)} m`);
    }
    case "rectangle-centre": {
      if (pts.length === 0) return attendre([point], "Cliquez un coin.");
      const c = pts[0]!;
      const coin2 = pt(2 * c.x - point.x, 2 * c.y - point.y);
      if (Math.abs(point.x - c.x) < 1e-6 || Math.abs(point.y - c.y) < 1e-6) return attendre(pts, "Rectangle plat : cliquez un coin hors des axes du centre.");
      return emettre([{ type: "esquisse.rectangle", params: { ...base, points: [coin2, point] } }], "Rectangle (centre)");
    }
    case "rectangle-3-points": {
      if (pts.length < 2) return attendre([...pts, point], pts.length ? "Cliquez un point qui donne la largeur." : "Cliquez la seconde extrémité du premier côté.");
      const r = rectangleTroisPoints(pts[0]!, pts[1]!, point);
      if (!r) return attendre(pts, "Largeur nulle : cliquez hors du premier côté.");
      return emettre([{ type: "esquisse.polygone", params: { ...base, points: r, ferme: true } }], "Rectangle (3 points)");
    }
    case "cercle-2-points": {
      if (pts.length === 0) return attendre([point], "Cliquez l'autre extrémité du diamètre.");
      const r = distance(pts[0]!, point) / 2;
      if (r < 1e-6) return attendre(pts, "Diamètre nul.");
      return emettre([{ type: "esquisse.cercle", params: { ...base, centre: pt((pts[0]!.x + point.x) / 2, (pts[0]!.y + point.y) / 2), rayon: m(Math.round(r * 1e6) / 1e6), points: [] } }], `Cercle r = ${fmt(r)} m`);
    }
    case "ellipse": {
      if (pts.length < 2) return attendre([...pts, point], pts.length ? "Cliquez un point qui donne l'autre demi-axe." : "Cliquez l'extrémité d'un axe.");
      const e = ellipseTroisPoints(pts[0]!, pts[1]!, point);
      if (!e) return attendre(pts, "Ellipse plate : cliquez hors de l'axe.");
      return emettre([{ type: "esquisse.ellipse", params: { ...base, centre: pts[0]!, rayon: m(e.rayon), rayonB: m(e.rayonB), rotation: { value: e.rotation, unit: "deg" }, points: [] } }], `Ellipse ${fmt(2 * e.rayon)} × ${fmt(2 * e.rayonB)} m`);
    }
    case "trame": {
      // Entraxes et dépassement saisis (D-046) ; rien n'est supposé.
      let ex: number[];
      let ey: number[];
      try {
        ex = lireEntraxes(String(ui.parametresOutil["entraxesX"] ?? ""));
        ey = lireEntraxes(String(ui.parametresOutil["entraxesY"] ?? ""));
      } catch (err) {
        return attendre([], `Trame : ${err instanceof Error ? err.message : String(err)}.`);
      }
      const dep = ui.parametresOutil["depassement"];
      if (!ex.length && !ey.length) return attendre([], "Renseignez les entraxes en x et/ou en y dans l'inspecteur.");
      if (typeof dep !== "number" || !(dep >= 0)) return attendre([], "Renseignez le dépassement des axes (m).");
      const idBase = `trame-${Date.now().toString(36)}`;
      return emettre(commandesTrame({ niveauId, origine: point, entraxesX: ex, entraxesY: ey, depassement: dep, reperesX: ui.parametresOutil["reperesX"] === "lettres" ? "lettres" : "chiffres", calqueId: (base as { calqueId?: string | null }).calqueId ?? null }, idBase), `Trame ${ex.length + 1} × ${ey.length + 1} axes`, "Trame posée (groupe) : ses axes guident l'accrochage.");
    }
    case "polygone-regulier": {
      // Nombre de côtés : paramètre de l'outil, jamais supposé (D-042).
      const n = ui.parametresOutil["cotes"];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 3 || n > 64) return attendre([], "Renseignez le nombre de côtés (entier de 3 à 64) dans l'inspecteur.");
      if (pts.length === 0) return attendre([point], "Cliquez un sommet du polygone.");
      if (distance(pts[0]!, point) < 1e-6) return attendre(pts, "Rayon nul.");
      return emettre([{ type: "esquisse.polygone", params: { ...base, points: polygoneRegulier(pts[0]!, point, n), ferme: true } }], `Polygone régulier (${n} côtés)`);
    }
    case "cercle-3-points": {
      if (pts.length < 2) return attendre([...pts, point], pts.length ? "Cliquez le troisième point." : "Cliquez le deuxième point.");
      const c = cercleTroisPoints(pts[0]!, pts[1]!, point);
      if (!c) return attendre(pts, "Points alignés : aucun cercle ne passe par eux.");
      return emettre([{ type: "esquisse.cercle", params: { ...base, centre: c.centre, rayon: m(Math.round(c.rayon * 1e6) / 1e6), points: [] } }], `Cercle r = ${fmt(c.rayon)} m`);
    }
    case "arc": {
      if (pts.length === 0) return attendre([point], "Cliquez le début de l'arc.");
      if (pts.length === 1) return attendre([...pts, point], "Cliquez la fin de l'arc.");
      const c = pts[0]!;
      const r = distance(c, pts[1]!);
      const ang = (q: Point2) => (Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI;
      return emettre([{ type: "esquisse.arc", params: { ...base, centre: c, rayon: m(r), angleDebut: { value: ang(pts[1]!), unit: "deg" }, angleFin: { value: ang(point), unit: "deg" }, points: [] } }], "Arc");
    }
    case "deplacer":
    case "copier": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Cliquez le point d'arrivée (ou tapez dx,dy puis Entrée).");
      const dx = point.x - pts[0]!.x;
      const dy = point.y - pts[0]!.y;
      return emettre([{ type: outil === "deplacer" ? "transformer.deplacer" : "transformer.copier", params: { dx, dy }, cibles: ui.selection }], `${outil === "deplacer" ? "Déplacer" : "Copier"} ${ui.selection.length} objet(s)`);
    }
    case "tourner": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Cliquez un point de référence, ou tapez l'angle puis Entrée.");
      if (pts.length === 1) return attendre([...pts, point], "Cliquez la nouvelle direction (Alt : garder l'original).");
      const c = pts[0]!;
      const a0 = Math.atan2(pts[1]!.y - c.y, pts[1]!.x - c.x);
      const a1 = Math.atan2(point.y - c.y, point.x - c.x);
      const angle = ((a1 - a0) * 180) / Math.PI;
      return emettre([{ type: "transformer.tourner", params: { centre: c, angle: { value: angle, unit: "deg" }, copie: options.alt === true }, cibles: ui.selection }], `Tourner ${fmt(angle)}°${options.alt ? " (copie)" : ""}`);
    }
    case "miroir": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Cliquez le second point de l'axe de symétrie (Alt : garder l'original).");
      return emettre([{ type: "transformer.miroir", params: { a: pts[0]!, b: point, copie: options.alt === true }, cibles: ui.selection }], options.alt ? "Miroir (copie)" : "Miroir");
    }
    case "echelle": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Tapez le facteur puis Entrée (ex. 1,5).");
      return attendre(pts, "Tapez le facteur puis Entrée.");
    }
    case "etirer": {
      const id = ui.selection[0];
      const o = id ? etat.objets[id] : undefined;
      if (!o || (o.classe !== "mur" && o.classe !== "escalier" && o.classe !== "esquisse")) return attendre([], "Sélectionnez un mur, un escalier ou une ligne.");
      if (pts.length === 0) {
        const extremites = o.classe === "esquisse" ? [o.params.points[0]!, o.params.points[o.params.points.length - 1]!] : [o.params.a, o.params.b];
        const ext = distance(point, extremites[0]!) <= distance(point, extremites[1]!) ? "a" : "b";
        return { commandes: [], label: "", pointsEnCours: [ext === "a" ? extremites[0]! : extremites[1]!], aide: `Extrémité ${ext} : cliquez sa nouvelle position.` };
      }
      const extremite = o.classe === "esquisse" ? (distance(pts[0]!, o.params.points[0]!) < 1e-9 ? "a" : "b") : distance(pts[0]!, o.params.a) < 1e-9 ? "a" : "b";
      // Les murs joints suivent (D-047) ; Alt : étirer le mur seul.
      return emettre([{ type: "transformer.etirer", params: { id: o.id, extremite, point, ...(o.classe === "mur" && !options.alt ? { entrainer: true } : {}) } }], o.classe === "mur" && !options.alt ? "Étirer (murs joints entraînés)" : "Étirer");
    }
    case "ajuster":
    case "prolonger": {
      const id = ui.selection[0];
      if (!id) return attendre([], "Sélectionnez d'abord l'objet à ajuster ou prolonger.");
      // Prolonger d'une longueur donnée (D-043) : longueur renseignée et clic près de l'extrémité à prolonger.
      const longueur = nombre(ui, "longueurProlongement", 0);
      const o = etat.objets[id];
      if (outil === "prolonger" && longueur > 0 && o && (!options.objetSous || options.objetSous === id)) {
        const ext = o.classe === "esquisse" ? [o.params.points[0], o.params.points[o.params.points.length - 1]] : o.classe === "mur" || o.classe === "escalier" ? [o.params.a, o.params.b] : null;
        if (ext && ext[0] && ext[1]) {
          const extremite = distance(point, ext[0]) <= distance(point, ext[1]) ? "a" : "b";
          return emettre([{ type: "transformer.prolonger", params: { id, extremite, longueur: m(longueur) } }], `Prolonger de ${fmt(longueur)} m`);
        }
      }
      if (!options.objetSous || options.objetSous === id) return attendre([], outil === "prolonger" ? "Cliquez l'objet limite, ou renseignez une longueur et cliquez l'extrémité à prolonger." : "Cliquez l'objet limite.");
      return emettre([{ type: `transformer.${outil}`, params: { id, limiteId: options.objetSous } }], outil === "ajuster" ? "Ajuster" : "Prolonger");
    }
    case "scinder": {
      const cible = murSous(etat, niveauId, point, options.rayon * 2);
      if (!cible) return attendre([], "Cliquez un point sur l'axe d'un mur.");
      return emettre([{ type: "mur.scinder", params: { id: cible.mur.id, t: cible.t } }], "Scinder le mur", "Mur scindé : les ouvertures ont suivi, les cotes rattachées sont à réparer.");
    }
    case "decaler": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez des murs ou des lignes, tapez la distance puis Entrée, puis cliquez le côté.");
      const d = nombre(ui, "distanceDecalage", 0);
      if (!(d > 0)) return attendre([], "Tapez la distance puis Entrée, puis cliquez le côté.");
      const o = etat.objets[ui.selection[0]!];
      let cote: "gauche" | "droite" = "gauche";
      if (o && (o.classe === "mur" || o.classe === "esquisse")) {
        const a = o.classe === "mur" ? o.params.a : o.params.points[0]!;
        const b = o.classe === "mur" ? o.params.b : o.params.points[1] ?? o.params.points[0]!;
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        cote = cross >= 0 ? "gauche" : "droite";
      }
      return emettre([{ type: "transformer.decaler", params: { distance: m(d), cote }, cibles: ui.selection }], `Décaler ${fmt(d)} m`);
    }
    case "mesurer": {
      if (pts.length === 0) return attendre([point], "Cliquez le second point.");
      const a = pts[0]!;
      const d = distance(a, point);
      const angle = (Math.atan2(point.y - a.y, point.x - a.x) * 180) / Math.PI;
      return { commandes: [], label: "", pointsEnCours: [], aide: `Distance ${fmt(d)} m · dx ${fmt(point.x - a.x)} · dy ${fmt(point.y - a.y)} · ${fmt(angle)}°`, mesure: `${fmt(d)} m` };
    }
    case "cotation": {
      if (pts.length === 0) return attendre([point], "Cliquez le second point de la cote.");
      if (pts.length === 1) return attendre([...pts, point], "Cliquez la position de la ligne de cote.");
      const [a, b] = [pts[0]!, pts[1]!];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const decalage = ((-dy / l) * (point.x - a.x) + (dx / l) * (point.y - a.y));
      // Cote associative : chaque extrémité posée exactement sur une caractéristique d'objet (extrémité de mur, sommet…) y est rattachée.
      const id = `cote-${Math.random().toString(36).slice(2, 10)}`;
      const commandes: Commande[] = [{ type: "cotation.creer", params: { ...base, id, a, b, decalage: m(decalage) } }];
      for (const [cle, p] of [["a", a], ["b", b]] as const) {
        const r = rattachementAuPoint(etat, niveauId, p);
        if (r) commandes.push({ type: "cotation.rattacher", params: { id, referenceId: referenceExtremite(id, cle), objetId: r.objetId, caracteristique: r.caracteristique } });
      }
      const n = commandes.length - 1;
      return emettre(commandes, `Cote ${fmt(l)} m`, n ? `Cote posée, ${n} extrémité(s) rattachée(s) : elle suivra les objets.` : "Cote posée, libre (aucune extrémité sur un objet).");
    }
    case "texte":
      return emettre([{ type: "texte.creer", params: { ...base, position: point, texte: (ui.parametresOutil["texte"] as string | undefined) || "Texte" } }], "Texte", "Texte posé : modifiez-le dans l'inspecteur.");
    case "etiquette": {
      if (!options.objetSous && pts.length === 0) return attendre([], "Cliquez d'abord l'objet à étiqueter.");
      if (pts.length === 0) {
        const o = etat.objets[options.objetSous!];
        return { commandes: [], label: "", pointsEnCours: [point], aide: `Objet ${o?.id ?? ""} : cliquez l'emplacement de l'étiquette.`, selectionner: options.objetSous ? [options.objetSous] : [] };
      }
      const cible = ui.selection[0];
      const o = cible ? (etat.objets[cible] as OccurrenceQuelconque | undefined) : undefined;
      const texte = o ? (("nom" in o.params && typeof o.params.nom === "string" && o.params.nom) || ("repere" in o.params && typeof o.params.repere === "string" && o.params.repere) || o.id) : "Étiquette";
      return emettre([{ type: "etiquette.creer", params: { ...base, position: point, texte, objetId: cible ?? null } }], "Étiquette");
    }
    default:
      return attendre([], "");
  }
}

/** Entrée (ou clic sur le premier point) : fermeture d'un contour en cours. */
export function fermerContour(outil: string, pts: Point2[], ui: EtatUi, niveauId: string): ResultatClic {
  if (pts.length < 3) return attendre(pts, "Un contour demande au moins trois points.");
  const base = { niveauId };
  switch (outil) {
    case "dalle":
      return emettre([{ type: "dalle.creer", params: { ...base, contour: pts, trous: [], epaisseur: m(nombre(ui, "epaisseurDalle", 0.25)) } }], "Dalle");
    case "toiture": {
      const pente = nombre(ui, "penteToiture", 0);
      const type = pente > 0 ? ((ui.parametresOutil["typeToiture"] as string | undefined) === "monopente" ? "monopente" : "bipente") : "plate";
      return emettre([{ type: "toiture.creer", params: { ...base, contour: pts, trous: [], type, pente: pente > 0 ? { value: pente, unit: "deg" } : null, epaisseur: m(nombre(ui, "epaisseurDalle", 0.3)) } }], type === "plate" ? "Toiture" : `Toiture ${type} ${fmt(pente)}°`);
    }
    case "garde-corps":
      if (pts.length < 2) return attendre(pts, "Un garde-corps demande au moins deux points.");
      return emettre([{ type: "gardeCorps.creer", params: { ...base, points: pts, ferme: false, hauteur: m(nombre(ui, "hauteurGardeCorps", 1)), epaisseur: m(nombre(ui, "epaisseurGardeCorps", 0.05)), remplissage: (ui.parametresOutil["remplissageGardeCorps"] as string | undefined) ?? "barreaudage" } }], "Garde-corps", "Garde-corps posé : hauteur et remplissage dans l'inspecteur.");
    case "zone":
      return emettre([{ type: "zone.creer", params: { ...base, contour: pts, trous: [], nom: (ui.parametresOutil["nom"] as string | undefined) || "Zone" } }], "Zone");
    case "espace":
      return emettre([{ type: "espace.creer", params: { ...base, polygones: [{ contour: pts, trous: [] }], nom: (ui.parametresOutil["nom"] as string | undefined) || "Espace" } }], "Espace");
    case "solide":
      return emettre([{ type: "solide.extruder", params: { ...base, contour: pts, trous: [], ferme: true, hauteur: m(nombre(ui, "hauteurSolide", 1)), role: "solid" } }], "Solide");
    case "polygone":
      return emettre([{ type: "esquisse.polygone", params: { ...base, points: pts } }], "Polygone");
    case "hachure":
      return emettre([{ type: "esquisse.hachure", params: { ...base, points: pts, motif: "diagonale" } }], "Hachure");
    case "polyligne":
      return emettre([{ type: "esquisse.polyligne", params: { ...base, points: pts, ferme: false } }], "Polyligne");
    case "spline":
      return emettre([{ type: "esquisse.spline", params: { ...base, points: pts, ferme: false } }], "Courbe");
    default:
      return attendre([], "");
  }
}

/** Entrée sans fermeture : les outils « chaîne » terminent leur tracé (polyligne ouverte, courbe). */
export function terminer(outil: string, pts: Point2[], ui: EtatUi, niveauId: string | null): ResultatClic {
  if (!niveauId) return attendre([], "");
  if ((outil === "polyligne" || outil === "spline" || outil === "garde-corps") && pts.length >= 2) return fermerContour(outil, pts, ui, niveauId);
  if (["dalle", "toiture", "zone", "espace", "solide", "polygone", "hachure"].includes(outil)) return fermerContour(outil, pts, ui, niveauId);
  return attendre([], "");
}

/** Saisie de précision (DA-02-16) : longueur, « dx,dy » ou facteur, appliquée au point suivant du tracé. */
export function saisie(outil: string, texte: string, pts: Point2[], curseur: Point2 | null, etat: ModeleAtelier, ui: EtatUi, options: { rayon: number; objetSous: string | null }): ResultatClic | null {
  const t = texte.replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  const dernier = pts[pts.length - 1] ?? null;
  const paire = /^(-?\d+(?:\.\d+)?)[;x](-?\d+(?:\.\d+)?)$/.exec(t);
  if (outil === "echelle") {
    const facteur = Number(t);
    if (!(facteur > 0) || !dernier) return null;
    return emettre([{ type: "transformer.echelle", params: { centre: dernier, facteur }, cibles: ui.selection }], `Échelle × ${facteur}`);
  }
  if (outil === "tourner" && dernier) {
    const angle = Number(t);
    if (!Number.isFinite(angle)) return null;
    return emettre([{ type: "transformer.tourner", params: { centre: dernier, angle: { value: angle, unit: "deg" } }, cibles: ui.selection }], `Tourner ${angle}°`);
  }
  if (outil === "decaler") return null; // la distance est lue depuis les paramètres de l'outil
  if (!dernier) return null;
  let cible: Point2;
  if (paire) cible = pt(dernier.x + Number(paire[1]), dernier.y + Number(paire[2]));
  else {
    const l = Number(t);
    if (!(l > 0)) return null;
    const dir = curseur && distance(curseur, dernier) > 1e-6 ? { x: (curseur.x - dernier.x) / distance(curseur, dernier), y: (curseur.y - dernier.y) / distance(curseur, dernier) } : { x: 1, y: 0 };
    cible = pt(dernier.x + dir.x * l, dernier.y + dir.y * l);
  }
  return clic(outil, cible, etat, ui, { rayon: options.rayon, objetSous: options.objetSous });
}

function pointDansPolygone(p: Point2, poly: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Objets dont un point au moins tombe dans le rectangle (sélection par cadre). */
export function objetsDansCadre(etat: ModeleAtelier, niveauId: string | null, a: Point2, b: Point2): string[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return objetsEntierementDans(etat, niveauId, (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
}

/** Lasso : objets du niveau dont tous les points caractéristiques sont dans le contour tracé à main levée. */
export function objetsDansLasso(etat: ModeleAtelier, niveauId: string | null, contour: readonly { x: number; y: number }[]): string[] {
  if (contour.length < 3) return [];
  const dedans = (q: { x: number; y: number }) => {
    let r = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[i]!;
      const b = contour[j]!;
      if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) r = !r;
    }
    return r;
  };
  return objetsEntierementDans(etat, niveauId, dedans);
}

function objetsEntierementDans(etat: ModeleAtelier, niveauId: string | null, dedans: (p: { x: number; y: number }) => boolean): string[] {
  const out: string[] = [];
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.niveauId !== niveauId) continue;
    let pts: { x: number; y: number }[] = [];
    switch (o.classe) {
      case "mur":
      case "escalier":
      case "cotation":
        pts = [o.params.a, o.params.b];
        break;
      case "poteau":
        pts = [o.params.point];
        break;
      case "texte":
      case "etiquette":
        pts = [o.params.position];
        break;
      case "esquisse":
        pts = o.params.centre ? [o.params.centre] : o.params.points;
        break;
      case "garde-corps":
        pts = o.params.points;
        break;
      case "objet-importe":
        pts = o.params.empreinte;
        break;
      case "espace":
        pts = o.params.polygones.flatMap((pg) => pg.contour);
        break;
      case "porte":
      case "fenetre":
      case "ouverture":
      case "bloc-occurrence":
        continue;
      default:
        pts = o.params.contour;
    }
    if (pts.length && pts.every(dedans)) out.push(o.id);
  }
  return out;
}
