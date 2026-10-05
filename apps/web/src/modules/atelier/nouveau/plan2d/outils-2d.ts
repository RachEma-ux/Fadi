/**
 * Machine à états des outils du plan 2D : à chaque clic (point accroché), l'outil décide s'il attend d'autres
 * points ou s'il émet un lot de commandes (annexe B). Fonctions pures sur l'état du modèle et l'état d'affichage :
 * le composant React ne fait que les appeler et transmettre les commandes au bus.
 */
import { axesDesMurs, tremiesRetenues, longueurAxeMur, projectionSurAxeMur, renflementTroisPoints, arcTangent, boucles, proposerPlancher, caracteristiqueAuPoint, cercleTroisPoints, commandesTrame, ellipseTroisPoints, lireEntraxes, polygoneRegulier, pointsSpline, rectangleTroisPoints, detecterPieces, distance, projectionSurSegment, pt, referenceExtremite, type AxeMur, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
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
  /** Repère de saisie à poser (D-091) ; null : retour au repère global. */
  repere?: { origine: Point2; angle: number } | null;
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
    const pr = projectionSurAxeMur(p, o.params); // mur courbe : sur l'arc (D-095)
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
    case "escalier-helicoidal": {
      // Escalier hélicoïdal (D-092) : centre, puis le bord extérieur de la première marche (rayon et angle de départ).
      if (pts.length === 0) return attendre([point], "Cliquez le bord extérieur de la première marche (rayon et départ).");
      const c = pts[0]!;
      const re = distance(c, point);
      const ri = Number(ui.parametresOutil["rayonInterieurHelice"]);
      const balayage = Number(ui.parametresOutil["balayageHelice"]);
      const hauteur = Number(ui.parametresOutil["hauteurHelice"]);
      const n = Number(ui.parametresOutil["contremarchesHelice"]);
      const ep = Number(ui.parametresOutil["epaisseurMarche"]);
      if (![balayage, hauteur, ep].every((x) => Number.isFinite(x) && x !== 0) || !Number.isFinite(ri) || ri < 0 || !Number.isInteger(n) || n < 2) return attendre(pts, "Renseignez dans l'inspecteur le rayon intérieur, le balayage (°), la hauteur, les contremarches et l'épaisseur des marches.");
      if (!(re > ri)) return attendre(pts, "Le rayon extérieur doit dépasser le rayon intérieur.");
      const angleDepart = Math.round(((Math.atan2(point.y - c.y, point.x - c.x) * 180) / Math.PI) * 1e6) / 1e6;
      return emettre([{ type: "escalier.helicoidal", params: { niveauId, centre: c, rayonInterieur: m(ri), rayonExterieur: m(Math.round(re * 1e6) / 1e6), angleDepart, balayage, hauteurAFranchir: m(hauteur), contremarches: n, epaisseurMarche: m(ep) } }], `Escalier hélicoïdal (${n} marches)`, `Escalier hélicoïdal posé : ${n} marches sur ${fmt(Math.abs(balayage))}°.`);
    }
    case "repere-saisie": {
      // Repère de saisie (D-091) : origine, puis un point de l'axe x′ ; affichage seul.
      if (pts.length === 0) return attendre([point], "Cliquez un point de l'axe x′ du repère (direction).");
      const o = pts[0]!;
      if (distance(o, point) < 1e-6) return attendre(pts, "Point confondu avec l'origine.");
      const angle = Math.round(((Math.atan2(point.y - o.y, point.x - o.x) * 180) / Math.PI) * 1e6) / 1e6;
      return { commandes: [], label: "", pointsEnCours: [], aide: `Repère de saisie posé (x′ à ${fmt(angle)}°) : saisies « dx;dy », repérage polaire et flèches du manipulateur s'y rapportent.`, repere: { origine: o, angle } };
    }
    case "mur-courbe": {
      // Mur courbe (D-086) : début, fin, puis un point de l'arc.
      if (pts.length === 0) return attendre([point], "Cliquez la fin du mur courbe.");
      if (pts.length === 1) return distance(pts[0]!, point) < 1e-6 ? attendre(pts, "Point identique au précédent.") : attendre([pts[0]!, point], "Cliquez un point de l'arc (il fixe la courbure).");
      const [a, b] = [pts[0]!, pts[1]!];
      const r = renflementTroisPoints(a, b, point);
      if (r === null) return attendre(pts, "Point aligné avec les extrémités : choisissez un point de l'arc, hors de la corde.");
      if (Math.abs(r) > 1 + 1e-9) return attendre(pts, "Arc de plus d'un demi-cercle : refusé (demi-cercle au plus).");
      const renflement = Math.round(Math.max(-1, Math.min(1, r)) * 1e9) / 1e9;
      return emettre([{ type: "mur.tracer", params: { ...base, a, b, renflement, epaisseur: m(nombre(ui, "epaisseur", 0.2)), hauteur: m(nombre(ui, "hauteur", niveau?.hauteur ?? 3)), alignement: (ui.parametresOutil["alignement"] as string | undefined) ?? "axe", calqueId: (ui.parametresOutil["calqueId"] as string | null | undefined) ?? null, definitionId: (ui.parametresOutil["typeMur"] as string | null | undefined) ?? null } }], "Mur courbe", "Mur courbe tracé ; portes et fenêtres se posent le long de l'arc.");
    }
    case "porte":
    case "fenetre":
    case "ouverture": {
      const cible = murSous(etat, niveauId, point, options.rayon * 2);
      if (!cible) return attendre([], "Cliquez sur un mur pour y poser l'ouverture.");
      const largeur = nombre(ui, "largeurOuverture", 0.9);
      const hauteur = nombre(ui, "hauteurOuverture", 2.1);
      const longueur = longueurAxeMur(cible.mur.params);
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
    case "plancher": {
      const rive = ui.parametresOutil["rivePlancher"];
      const ep = ui.parametresOutil["epaisseurPlancher"];
      if (rive !== "axe" && rive !== "exterieur") return attendre([], "Choisissez d'abord la ligne de rive dans l'inspecteur (axe des murs ou face extérieure).");
      if (typeof ep !== "number" || !(ep > 0)) return attendre([], "Saisissez d'abord l'épaisseur du plancher dans l'inspecteur.");
      const props = proposerPlancher(etat, niveauId, rive);
      const choix = props.contours.filter((c) => pointDansPolygone(point, c.contour)).sort((u, v) => u.aire - v.aire)[0];
      if (!choix) return attendre([], props.contours.length ? "Cliquez à l'intérieur d'un contour proposé (pointillés)." : "Aucun contour fermé de murs sur ce niveau : joignez les murs (interstices listés dans l'inspecteur) ou dessinez une dalle.");
      // Trémies écartées une à une dans l'inspecteur (D-098), avant validation.
      const exclues = Array.isArray(ui.parametresOutil["tremiesExclues"]) ? (ui.parametresOutil["tremiesExclues"] as string[]) : [];
      const retenues = tremiesRetenues(choix, exclues);
      const deja = props.planchers.length ? ` Ce niveau a déjà ${props.planchers.length} plancher(s) : signalé, rien n'est fusionné.` : "";
      return emettre([{ type: "dalle.creer", params: { ...base, contour: choix.contour, trous: retenues.map((t) => t.contour), epaisseur: m(ep), usage: "plancher" } }], `Plancher ${fmt(choix.aire)} m²`, `Plancher créé (${fmt(choix.aire)} m², ${retenues.length} trémie(s)${retenues.length < choix.trous.length ? `, ${choix.trous.length - retenues.length} écartée(s)` : ""}).${deja}`);
    }
    case "piece": {
      const axes: AxeMur[] = axesDesMurs(Object.values(etat.objets).filter((o): o is Occurrence<"mur"> => o.classe === "mur" && o.niveauId === niveauId));
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
    case "escalier-volees":
      return attendre([...pts, point], pts.length >= 2 ? "Angle suivant, ou Entrée pour terminer l'escalier (dernier point = arrivée)." : "Cliquez l'angle suivant de l'axe de l'escalier.");
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
    case "arc-tangent": {
      // Arc tangent (D-062) : il prolonge une ligne, une polyligne ouverte ou un arc depuis son extrémité.
      if (pts.length === 0) {
        const candidats = extremitesTangentes(etat, niveauId).filter((x) => !options.objetSous || x.objetId === options.objetSous);
        const proche = candidats.map((x) => ({ x, d: distance(x.point, point) })).sort((a, b) => a.d - b.d)[0];
        if (!proche || proche.d > options.rayon * 3) return attendre([], "Cliquez près de l'extrémité d'une ligne, d'une polyligne ouverte ou d'un arc.");
        return attendre([proche.x.point], "Cliquez la fin de l'arc tangent.");
      }
      const depart = extremitesTangentes(etat, niveauId).find((x) => distance(x.point, pts[0]!) < 1e-9);
      if (!depart) return attendre([], "Extrémité introuvable : recommencez.");
      const a = arcTangent(depart.point, depart.tangente, point);
      if (!a) return attendre(pts, "Point sur la tangente : aucun arc ; cliquez hors de la droite.");
      return emettre([{ type: "esquisse.arc", params: { ...base, centre: a.centre, rayon: m(a.rayon), angleDebut: { value: a.angleDebut, unit: "deg" }, angleFin: { value: a.angleFin, unit: "deg" }, points: [] } }], `Arc tangent (rayon ${fmt(a.rayon)} m)`);
    }
    case "deplacer":
    case "copier": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Cliquez le point d'arrivée (ou tapez dx,dy puis Entrée).");
      const dx = point.x - pts[0]!.x;
      const dy = point.y - pts[0]!.y;
      // Copier avec Alt (D-060) : les pièces copiées prennent le code suivant libre (B07 → B08).
      const suivant = outil === "copier" && options.alt === true;
      return emettre([{ type: outil === "deplacer" ? "transformer.deplacer" : "transformer.copier", params: { dx, dy, ...(suivant ? { codes: "suivant" } : {}) }, cibles: ui.selection }], `${outil === "deplacer" ? "Déplacer" : "Copier"} ${ui.selection.length} objet(s)${suivant ? " (codes suivants)" : ""}`);
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
    case "reseau-trajet": {
      // Nombre de copies ou pas : paramètres de l'outil, jamais supposés (D-058).
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      const nb = ui.parametresOutil["copiesTrajet"];
      const pas = ui.parametresOutil["pasTrajet"];
      const avecPas = typeof pas === "number" && pas > 0;
      if (!avecPas && !(typeof nb === "number" && Number.isInteger(nb) && nb >= 1)) return attendre([], "Renseignez le nombre de copies (ou un pas) dans l'inspecteur.");
      const estTrajet = (o: OccurrenceQuelconque | undefined): o is Occurrence<"esquisse"> => !!o && o.classe === "esquisse" && o.niveauId === niveauId && ["ligne", "polyligne", "polygone", "spline", "construction"].includes(o.params.forme) && !ui.selection.includes(o.id);
      if (pts.length === 0) {
        const o = options.objetSous ? etat.objets[options.objetSous] : undefined;
        if (!estTrajet(o)) return attendre([], "Cliquez la trajectoire : une ligne, une polyligne, un polygone ou une courbe hors de la sélection.");
        return attendre([point], `Trajectoire ${o.id} : cliquez le point de base de la sélection (Alt : copies orientées).`);
      }
      // La trajectoire est celle qui passe au premier clic (fonction pure : rien n'est retenu hors des points).
      let trajet: string | null = null;
      let meilleure = options.rayon * 1.5;
      for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
        if (!estTrajet(o)) continue;
        const ferme = o.params.ferme || o.params.forme === "polygone";
        const q = o.params.forme === "spline" ? pointsSpline(o.params.points, 16, ferme, o.params.tangentes) : o.params.points;
        const n = q.length;
        for (let i = 0; i + (ferme ? 0 : 1) < n; i++) {
          const d = projectionSurSegment(pts[0]!, q[i]!, q[(i + 1) % n]!).distance;
          if (d <= meilleure) {
            meilleure = d;
            trajet = o.id;
          }
        }
      }
      if (!trajet) return attendre([], "Trajectoire introuvable : cliquez-la de nouveau.");
      return emettre([{ type: "transformer.repeter", params: { trajetId: trajet, base: point, ...(avecPas ? { pas } : { nombre: nb }), orienter: options.alt === true }, cibles: ui.selection }], `Réseau sur trajectoire (${avecPas ? `pas ${fmt(pas as number)} m` : `${nb} copies`}${options.alt ? ", orientées" : ""})`);
    }
    case "aligner": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez d'abord des objets.");
      if (pts.length === 0) return attendre([point], "Cliquez la destination de ce premier point.");
      if (pts.length === 1) return attendre([...pts, point], "Cliquez un second point source.");
      if (pts.length === 2) return attendre([...pts, point], "Cliquez la direction de destination de ce second point (Alt : garder l'original).");
      return emettre([{ type: "transformer.aligner", params: { source1: pts[0]!, dest1: pts[1]!, source2: pts[2]!, dest2: point, copie: options.alt === true }, cibles: ui.selection }], `Aligner${options.alt ? " (copie)" : ""}`);
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
      // Arc et cercle (D-088) : extrémités aux angles de début et de fin ; un cercle s'étire par son rayon.
      const rond = o.classe === "esquisse" && (o.params.forme === "arc" || o.params.forme === "cercle") && o.params.centre && o.params.rayon ? o.params : null;
      const surCercle = (deg: number) => pt(rond!.centre!.x + rond!.rayon!.value * Math.cos((deg * Math.PI) / 180), rond!.centre!.y + rond!.rayon!.value * Math.sin((deg * Math.PI) / 180));
      const extremites = rond ? (rond.forme === "cercle" ? [point, point] : [surCercle(rond.angleDebut?.value ?? 0), surCercle(rond.angleFin?.value ?? 360)]) : o.classe === "esquisse" ? [o.params.points[0]!, o.params.points[o.params.points.length - 1]!] : [o.params.a, o.params.b];
      if (o.classe === "esquisse" && !rond && o.params.points.length < 2) return attendre([], "Cet objet n'a pas d'extrémités à étirer.");
      if (pts.length === 0) {
        const ext = distance(point, extremites[0]!) <= distance(point, extremites[1]!) ? "a" : "b";
        return { commandes: [], label: "", pointsEnCours: [ext === "a" ? extremites[0]! : extremites[1]!], aide: rond?.forme === "cercle" ? "Cliquez le nouveau rayon (point du cercle)." : `Extrémité ${ext} : cliquez sa nouvelle position.` };
      }
      const extremite = distance(pts[0]!, extremites[0]!) < 1e-9 ? "a" : "b";
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
    case "scinder-piece": {
      const id = ui.selection[0];
      const o = id ? etat.objets[id] : undefined;
      if (!o || o.classe !== "piece") return attendre([], "Sélectionnez d'abord la pièce à scinder.");
      if (pts.length === 0) return attendre([point], "Cliquez le second point de la ligne de scission.");
      return emettre([{ type: "piece.scinder", params: { id: o.id, a: pts[0]!, b: point } }], "Scinder la pièce", "Pièce scindée : la seconde partie porte le même nom, sans code — renommez-la.");
    }
    case "contour": {
      // Contour fermé détecté entre des lignes d'esquisse jointives (D-050) : proposé au clic, jamais imposé.
      const segs: AxeMur[] = [];
      for (const o of Object.values(etat.objets)) {
        if (o.classe !== "esquisse" || o.niveauId !== niveauId) continue;
        if (o.params.forme === "ligne" || o.params.forme === "construction") segs.push({ id: o.id, a: o.params.points[0]!, b: o.params.points[1]! });
        else if (o.params.forme === "polyligne") o.params.points.slice(1).forEach((q, k) => segs.push({ id: `${o.id}#${k}`, a: o.params.points[k]!, b: q }));
      }
      const faces = boucles(segs).filter((f) => pointDansPolygone(point, f.contour));
      if (!faces.length) return attendre([], "Aucun contour fermé de lignes d'esquisse autour de ce point.");
      const face = faces.sort((u, v) => u.aire - v.aire)[0]!;
      const forme = ui.parametresOutil["formeContour"] === "hachure" ? "hachure" : "polygone";
      return emettre([{ type: `esquisse.${forme}`, params: { ...base, points: face.contour, ferme: true, ...(forme === "hachure" ? { motif: null } : {}) } }], forme === "hachure" ? "Hachure (contour détecté)" : "Polygone (contour détecté)", `Contour de ${face.contour.length} sommets, ${fmt(face.aire)} m².`);
    }
    case "sommet":
    case "chanfrein-sommet": {
      // Sommet d'un contour de la sélection (D-049) : le plus proche du clic.
      const id = ui.selection[0];
      const o = id ? etat.objets[id] : undefined;
      const sommets = o ? (o.classe === "esquisse" ? o.params.points : "contour" in o.params ? (o.params as { contour: Point2[] }).contour : []) : [];
      if (!o || !sommets.length) return attendre([], "Sélectionnez d'abord un polygone, une polyligne, une dalle, une zone ou une pièce.");
      if (outil === "chanfrein-sommet") {
        const k = sommets.findIndex((q) => distance(q, point) <= options.rayon * 1.5);
        if (k < 0) return attendre([], "Cliquez près d'un sommet de l'objet sélectionné.");
        const d = nombre(ui, "distanceChanfrein", 0);
        if (!(d > 0)) return attendre([], "Renseignez la distance du chanfrein dans l'inspecteur.");
        // Alt (D-064) : chanfrein de tous les sommets (extrémités d'une polyligne ouverte exclues).
        if (options.alt) {
          const ouvert = o.classe === "esquisse" && o.params.forme === "polyligne" && !o.params.ferme;
          const tous = sommets.map((_, i) => i).filter((i) => !ouvert || (i > 0 && i < sommets.length - 1));
          return emettre([{ type: "transformer.chanfreinerSommet", params: { id: o.id, sommets: tous, distance: m(d) } }], `Chanfrein de ${tous.length} sommets ${fmt(d)} m`);
        }
        return emettre([{ type: "transformer.chanfreinerSommet", params: { id: o.id, index: k, distance: m(d) } }], `Chanfrein de sommet ${fmt(d)} m`);
      }
      if (pts.length === 0) {
        const k = sommets.findIndex((q) => distance(q, point) <= options.rayon * 1.5);
        if (k < 0) return attendre([], "Cliquez près d'un sommet de l'objet sélectionné.");
        return { commandes: [], label: "", pointsEnCours: [sommets[k]!], aide: `Sommet ${k + 1} : cliquez sa nouvelle position (Alt : sans entraîner les sommets confondus).` };
      }
      const k = sommets.findIndex((q) => distance(q, pts[0]!) < 1e-9);
      if (k < 0) return attendre([], "Sommet introuvable : recommencez.");
      return emettre([{ type: "transformer.pointsDeControle", params: { id: o.id, index: k, point, ...(options.alt ? {} : { entrainer: true }) } }], options.alt ? "Déplacer un sommet" : "Déplacer un sommet (sommets confondus entraînés)");
    }
    case "decaler": {
      if (ui.selection.length === 0) return attendre([], "Sélectionnez des murs ou des lignes, tapez la distance puis Entrée, puis cliquez le côté.");
      const d = nombre(ui, "distanceDecalage", 0);
      if (!(d > 0) && !String(ui.parametresOutil["distancesDecalage"] ?? "").trim()) return attendre([], "Tapez la distance (ou une série dans l'inspecteur) puis Entrée, puis cliquez le côté.");
      const o = etat.objets[ui.selection[0]!];
      // Série de distances (D-049) : « 0,5 ; 1 » dans l'inspecteur ; contours fermés : clic dedans = intérieur.
      let serie: number[] | null = null;
      const texteSerie = String(ui.parametresOutil["distancesDecalage"] ?? "").trim();
      if (texteSerie) {
        try {
          serie = lireEntraxes(texteSerie);
        } catch (err) {
          return attendre([], `Série de distances : ${err instanceof Error ? err.message : String(err)}.`);
        }
      }
      const contourFerme: Point2[] | null = o ? (o.classe === "esquisse" && (o.params.forme === "polygone" || o.params.forme === "hachure" || (o.params.forme === "polyligne" && o.params.ferme && (options.alt === true || !!o.params.renflements))) ? o.params.points : o.classe === "esquisse" && o.params.forme === "rectangle" && o.params.points.length === 2 ? [o.params.points[0]!, pt(o.params.points[1]!.x, o.params.points[0]!.y), o.params.points[1]!, pt(o.params.points[0]!.x, o.params.points[1]!.y)] : o.classe === "dalle" || o.classe === "zone" || o.classe === "solide" ? o.params.contour : null) : null;
      // Cercle (D-076) : clic dedans = intérieur, dehors = extérieur ; décalage concentrique.
      if (o?.classe === "esquisse" && (o.params.forme === "cercle" || o.params.forme === "arc") && o.params.centre && o.params.rayon) {
        const coteC = distance(point, o.params.centre) < o.params.rayon.value ? "interieur" : "exterieur";
        return emettre([{ type: "transformer.decaler", params: { ...(serie ? { distances: serie } : { distance: m(d) }), cote: coteC }, cibles: ui.selection }], `Décaler ${serie ? serie.map(fmt).join(" ; ") : fmt(d)} m (${coteC === "interieur" ? "intérieur" : "extérieur"})`);
      }
      if (contourFerme) {
        let dedans = false;
        for (let i = 0, j = contourFerme.length - 1; i < contourFerme.length; j = i++) {
          const A = contourFerme[i]!;
          const B = contourFerme[j]!;
          if (A.y > point.y !== B.y > point.y && point.x < ((B.x - A.x) * (point.y - A.y)) / (B.y - A.y) + A.x) dedans = !dedans;
        }
        const coteF = dedans ? "interieur" : "exterieur";
        // Alt (D-064) : angles arrondis (esquisses).
        return emettre([{ type: "transformer.decaler", params: { ...(serie ? { distances: serie } : { distance: m(d) }), cote: coteF, ...(options.alt ? { angles: "arrondis" } : {}) }, cibles: ui.selection }], `Décaler ${serie ? serie.map(fmt).join(" ; ") : fmt(d)} m (${coteF === "interieur" ? "intérieur" : "extérieur"}${options.alt ? ", angles arrondis" : ""})`);
      }
      let cote: "gauche" | "droite" = "gauche";
      if (o && (o.classe === "mur" || o.classe === "esquisse")) {
        const a = o.classe === "mur" ? o.params.a : o.params.points[0]!;
        const b = o.classe === "mur" ? o.params.b : o.params.points[1] ?? o.params.points[0]!;
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        cote = cross >= 0 ? "gauche" : "droite";
      }
      return emettre([{ type: "transformer.decaler", params: { ...(serie ? { distances: serie } : { distance: m(d) }), cote, ...(options.alt ? { angles: "arrondis" } : {}) }, cibles: ui.selection }], `Décaler ${serie ? serie.map(fmt).join(" ; ") : fmt(d)} m${options.alt ? " (angles arrondis)" : ""}`);
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
  if (outil === "escalier-volees") return escalierVolees(pts, ui, niveauId);
  if (["dalle", "toiture", "zone", "espace", "solide", "polygone", "hachure"].includes(outil)) return fermerContour(outil, pts, ui, niveauId);
  return attendre([], "");
}

/**
 * Escalier à volées (D-084) : axe saisi point par point (au moins un angle) ; largeur, hauteur à franchir,
 * contremarches et épaisseur des paliers lues dans l'inspecteur, jamais supposées.
 */
export function escalierVolees(pts: Point2[], ui: EtatUi, niveauId: string): ResultatClic {
  if (pts.length < 3) return attendre(pts, "Un escalier à volées demande au moins un angle (trois points).");
  const largeur = Number(ui.parametresOutil["largeurVolees"]);
  const hauteur = Number(ui.parametresOutil["hauteurVolees"]);
  const contremarches = Number(ui.parametresOutil["contremarchesVolees"]);
  const palier = Number(ui.parametresOutil["epaisseurPalier"]);
  if (![largeur, hauteur, palier].every((x) => Number.isFinite(x) && x > 0) || !Number.isInteger(contremarches) || contremarches < 2) return attendre(pts, "Renseignez dans l'inspecteur la largeur, la hauteur à franchir, le nombre de contremarches et l'épaisseur des paliers.");
  return { commandes: [{ type: "escalier.volees", params: { niveauId, points: pts, largeur: m(largeur), hauteurAFranchir: m(hauteur), contremarches, epaisseurPalier: m(palier), ...(ui.parametresOutil["niveauArriveeVolees"] ? { niveauArriveeId: ui.parametresOutil["niveauArriveeVolees"] } : {}) } }], label: `Escalier à ${pts.length - 1} volées`, pointsEnCours: [], aide: `Escalier à ${pts.length - 1} volées et ${pts.length - 2} palier(s) posé.` };
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
  if (paire) {
    // Repère de saisie (D-091) : « dx;dy » exprimés dans ses axes.
    const a = ((ui.repere?.angle ?? 0) * Math.PI) / 180;
    const dx = Number(paire[1]);
    const dy = Number(paire[2]);
    cible = pt(Math.round((dernier.x + dx * Math.cos(a) - dy * Math.sin(a)) * 1e9) / 1e9, Math.round((dernier.y + dx * Math.sin(a) + dy * Math.cos(a)) * 1e9) / 1e9);
  }
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

/** Extrémités libres des lignes, polylignes ouvertes et arcs d'un niveau, avec la direction qui les prolonge (D-062). */
export function extremitesTangentes(etat: ModeleAtelier, niveauId: string | null): { point: Point2; tangente: Point2; objetId: string }[] {
  const out: { point: Point2; tangente: Point2; objetId: string }[] = [];
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe !== "esquisse" || o.niveauId !== niveauId) continue;
    const q = o.params;
    if ((q.forme === "ligne" || q.forme === "polyligne" || q.forme === "construction") && !q.ferme && q.points.length >= 2) {
      const [a, b] = [q.points[0]!, q.points[1]!];
      const [y, z] = [q.points[q.points.length - 2]!, q.points[q.points.length - 1]!];
      out.push({ point: a, tangente: pt(a.x - b.x, a.y - b.y), objetId: o.id }, { point: z, tangente: pt(z.x - y.x, z.y - y.y), objetId: o.id });
    } else if (q.forme === "arc" && q.centre && q.rayon) {
      const d = ((q.angleDebut?.value ?? 0) * Math.PI) / 180;
      const f = ((q.angleFin?.value ?? 360) * Math.PI) / 180;
      const r = q.rayon.value;
      const c = q.centre;
      // Parcours direct de début à fin : à la fin, la tangente directe ; au début, l'opposée.
      out.push({ point: pt(c.x + r * Math.cos(d), c.y + r * Math.sin(d)), tangente: pt(Math.sin(d), -Math.cos(d)), objetId: o.id }, { point: pt(c.x + r * Math.cos(f), c.y + r * Math.sin(f)), tangente: pt(-Math.sin(f), Math.cos(f)), objetId: o.id });
    }
  }
  return out;
}
