/**
 * Dessinateurs de plan des classes d'architecture (contrat `DessinateurPlan`) : mur, porte, fenêtre, ouverture,
 * dalle, toiture, escalier, poteau, pièce, espace, zone, solide. Ils remplacent le repli de `plan2d/repli.ts`.
 * Représentations **dérivées à l'affichage** (R15), jamais stockées. Chaque dessin fournit `segments`, `points` et
 * `contour` : la zone de plan s'en sert pour l'accrochage et la sélection.
 *
 * Choix de touche (sélection) :
 * - mur : segments = faces + axe **interrompu au droit des baies** (au milieu d'une baie, c'est la baie qui est
 *   la plus proche), points = extrémités de l'axe, contour = épaisseur ;
 * - pièce (couche `annotation`) : **aucun segment** (ses arêtes suivent les axes des murs : elle volerait le clic
 *   sur chaque mur), contour = polygone (clic à l'intérieur), point = étiquette ;
 * - porte : battant et arc seulement si le type d'ouverture est déclaré « hinged » (propriété `openingType` de
 *   l'occurrence ou de son type, DA-07-02) ; sinon symbole neutre de baie, jamais un battant deviné.
 */
import {
  CLASSES_BAIE,
  cleDefinition,
  estNonEvaluee,
  type EtatModele,
  type ObjetBaie,
  type ObjetModele,
  type ObjetMur,
  type PointLocal,
  type PolygoneAvecTrous,
} from "@parcours/atelier-model";
import type { DessinateurPlan, DessinPlan, FormeDessin } from "../socle";
import { segmentsDe, versPoint, type SegmentPlan, type Vec } from "../plan2d/geometrie";
import { aireContour, baiesDe, centreContour, contourMur, faces, intervalleBaie, repereAxe, surMur, type RepereMur } from "./geometrie";

export const HAUTEUR_TEXTE = 0.25;

const pts = (v: readonly Vec[]): PointLocal[] => v.map(versPoint);

function dessin(o: ObjetModele, couche: DessinPlan["couche"], formes: FormeDessin[], segments: readonly SegmentPlan[], points: readonly Vec[], contour: readonly Vec[] | null): DessinPlan {
  return { objetId: o.id, couche, formes, segments: segments.map((s) => ({ a: versPoint(s.a), b: versPoint(s.b) })), points: pts(points), contour: contour ? pts(contour) : null };
}

const ligne = (a: Vec, b: Vec, style: FormeDessin["style"] = "trait"): FormeDessin => ({ forme: "polyligne", points: [versPoint(a), versPoint(b)], fermee: false, style });

/** Texte français d'une aire (m², 2 décimales). */
export function texteAire(m2: number): string {
  return `${(Math.round(m2 * 100) / 100).toFixed(2).replace(".", ",")} m²`;
}

// --- Murs ----------------------------------------------------------------------------------------------------

export function dessinerMur(m: ObjetMur, etat: EtatModele): DessinPlan | null {
  const { a, b } = m.params.axe;
  const r = repereAxe(a, b);
  if (!r) return null;
  const f = faces(m);
  if (!f) return dessin(m, "objet", [ligne(a, b)], [{ a, b }], [a, b], null);
  const trous = baiesDe(etat, m.id)
    .map((x) => intervalleBaie(x, r.L))
    .map((i) => ({ debut: Math.max(0, i.debut), fin: Math.min(r.L, i.fin) }))
    .filter((i) => i.fin > i.debut)
    .sort((x, y) => x.debut - y.debut);
  // Tronçons pleins entre les baies.
  const pleins: [number, number][] = [];
  let s = 0;
  for (const t of trous) {
    if (t.debut > s) pleins.push([s, t.debut]);
    s = Math.max(s, t.fin);
  }
  if (s < r.L) pleins.push([s, r.L]);
  const formes: FormeDessin[] = pleins.map(([s0, s1]) => ({ forme: "polygone", points: pts(contourMur(r, f, s0, s1)), style: "plein" }));
  const segments: SegmentPlan[] = [
    { a: surMur(r, 0, f.gauche), b: surMur(r, r.L, f.gauche) },
    { a: surMur(r, 0, f.droite), b: surMur(r, r.L, f.droite) },
    ...pleins.map(([s0, s1]) => ({ a: surMur(r, s0), b: surMur(r, s1) })),
  ];
  return dessin(m, "objet", formes, segments, [a, b], contourMur(r, f));
}

// --- Baies ---------------------------------------------------------------------------------------------------

/** Type d'ouverture déclaré (`openingType`) sur l'occurrence ou sur son type ; `null` si non renseigné. */
export function typeOuverture(b: ObjetBaie, etat: EtatModele): string | null {
  const noms = ["openingType", "import.openingType"];
  const lire = (props: readonly { nom: string; valeur: unknown }[] | undefined) => props?.find((p) => noms.includes(p.nom) && typeof p.valeur === "string")?.valeur as string | undefined;
  const def = etat.catalogue.definitions[cleDefinition(b.classe, b.params.typeId)];
  return lire(b.proprietes) ?? lire(def?.proprietes) ?? null;
}

export function dessinerBaie(b: ObjetBaie, etat: EtatModele): DessinPlan | null {
  const hote = etat.objets[b.params.murHoteId];
  if (!hote || hote.classe !== "mur") return null;
  const r: RepereMur | null = repereAxe(hote.params.axe.a, hote.params.axe.b);
  const f = faces(hote);
  if (!r || !f) return null;
  const w = b.params.largeur.value;
  const c = b.params.position.t * r.L;
  const s0 = c - w / 2;
  const s1 = c + w / 2;
  const centre = surMur(r, c);
  const tableaux: SegmentPlan[] = [
    { a: surMur(r, s0, f.gauche), b: surMur(r, s0, f.droite) },
    { a: surMur(r, s1, f.gauche), b: surMur(r, s1, f.droite) },
  ];
  const formes: FormeDessin[] = tableaux.map((t) => ligne(t.a, t.b));
  const segments: SegmentPlan[] = [...tableaux, { a: surMur(r, s0), b: surMur(r, s1) }];
  if (b.classe === "fenetre") {
    // Fenêtre générique : cadre et vitrage simplifiés (aucun type d'ouvrant déduit, DA-07-03).
    const k = (f.gauche + f.droite) / 2;
    const e = (f.gauche - f.droite) / 6;
    formes.push(ligne(surMur(r, s0, f.gauche), surMur(r, s1, f.gauche), "fin"), ligne(surMur(r, s0, f.droite), surMur(r, s1, f.droite), "fin"));
    formes.push(ligne(surMur(r, s0, k + e), surMur(r, s1, k + e)), ligne(surMur(r, s0, k - e), surMur(r, s1, k - e)));
  } else if (b.classe === "porte" && typeOuverture(b, etat) === "hinged") {
    // Battant ouvert à 90° côté face gauche, charnière au début de la baie ; arc de débattement.
    const charniere = surMur(r, s0, f.gauche);
    const extremite = { x: charniere.x + r.n.x * w, y: charniere.y + r.n.y * w };
    const a0 = (Math.atan2(r.u.y, r.u.x) * 180) / Math.PI;
    formes.push(ligne(charniere, extremite), { forme: "arc", centre: versPoint(charniere), rayon: w, debut: a0, fin: a0 + 90, style: "fin" });
  } else {
    // Porte sans type d'ouverture déclaré, ou ouverture : baie neutre (linteau en trait fin sur l'axe).
    formes.push(ligne(surMur(r, s0), surMur(r, s1), "fin"));
    if (b.classe === "porte") formes.push({ forme: "texte", position: versPoint(surMur(r, c, f.gauche + HAUTEUR_TEXTE)), texte: "type d'ouverture non renseigné", hauteur: HAUTEUR_TEXTE / 2, style: "annotation" });
  }
  return dessin(b, "objet", formes, segments, [centre], [surMur(r, s0, f.gauche), surMur(r, s1, f.gauche), surMur(r, s1, f.droite), surMur(r, s0, f.droite)]);
}

// --- Surfaces (dalle, toiture, solide, pièce, espace, zone) ---------------------------------------------------

function polygonesAvecTrous(contour: readonly PointLocal[], trous: readonly { polygone: readonly PointLocal[] }[], style: FormeDessin["style"]): FormeDessin[] {
  return [{ forme: "polygone", points: contour, style }, ...trous.map((t): FormeDessin => ({ forme: "polyligne", points: t.polygone, fermee: true, style: "trait" }))];
}

export function dessinerSurface(o: ObjetModele): DessinPlan | null {
  switch (o.classe) {
    case "dalle":
    case "toiture": {
      const { contour, trous } = o.params;
      if (contour.length < 3) return null;
      const style = o.classe === "dalle" ? "plein" : "trait";
      return dessin(o, "fond", polygonesAvecTrous(contour, trous, style), [...segmentsDe(contour, true), ...trous.flatMap((t) => segmentsDe(t.polygone, true))], [], contour);
    }
    case "solide": {
      const { contour, trous, ferme } = o.params;
      if (contour.length < 2) return null;
      const formes: FormeDessin[] = ferme && contour.length >= 3 ? polygonesAvecTrous(contour, trous, "fin") : [{ forme: "polyligne", points: contour, fermee: false, style: "fin" }];
      return dessin(o, "fond", formes, [...segmentsDe(contour, ferme), ...trous.flatMap((t) => segmentsDe(t.polygone, true))], [], ferme && contour.length >= 3 ? contour : null);
    }
    default:
      return null;
  }
}

/** Contour principal (le plus grand) d'une liste de polygones. */
function principal(polys: readonly PolygoneAvecTrous<PointLocal>[]): PolygoneAvecTrous<PointLocal> | null {
  let r: PolygoneAvecTrous<PointLocal> | null = null;
  for (const p of polys) if (p.contour.length >= 3 && (!r || aireContour(p.contour) > aireContour(r.contour))) r = p;
  return r;
}

const aireNette = (polys: readonly PolygoneAvecTrous<PointLocal>[]): number => polys.reduce((s, p) => s + aireContour(p.contour) - p.trous.reduce((t, h) => t + aireContour(h.polygone), 0), 0);

export function dessinerPiece(o: ObjetModele, etat: EtatModele): DessinPlan | null {
  if (o.classe !== "piece" && o.classe !== "espace" && o.classe !== "zone") return null;
  let polys = o.params.polygones;
  if (o.classe === "zone" && polys.length === 0) {
    // Zone sans tracé propre : contours des pièces et espaces qu'elle contient (relations `contient`).
    const ids = etat.relations.filter((r) => r.type === "contient" && r.sourceId === o.id).map((r) => r.cibleId);
    polys = ids.flatMap((id) => {
      const x = etat.objets[id];
      return x && (x.classe === "piece" || x.classe === "espace") ? x.params.polygones : [];
    });
  }
  const p = principal(polys);
  if (!p) return null;
  const formes: FormeDessin[] = polys.flatMap((q) => [
    { forme: "polyligne", points: q.contour, fermee: true, style: o.classe === "piece" ? "annotation" : "fin" } as FormeDessin,
    ...q.trous.map((t): FormeDessin => ({ forme: "polyligne", points: t.polygone, fermee: true, style: "fin" })),
  ]);
  const position = o.classe === "piece" && o.params.etiquette ? o.params.etiquette : versPoint(centreContour(p.contour));
  const aire = o.classe === "piece" && o.params.aireCalculee ? o.params.aireCalculee.value : aireNette(polys);
  const texte = o.classe === "piece" ? `${o.params.code ? `${o.params.code} · ` : ""}${o.params.nom} — ${texteAire(aire)}` : `${o.params.nom}`;
  formes.push({ forme: "texte", position, texte, hauteur: HAUTEUR_TEXTE, style: "annotation" });
  return dessin(o, o.classe === "piece" ? "annotation" : "fond", formes, [], [position], p.contour);
}

// --- Escalier, poteau ----------------------------------------------------------------------------------------

export function dessinerEscalier(o: ObjetModele): DessinPlan | null {
  if (o.classe !== "escalier") return null;
  const { a, b } = o.params.axe;
  const r = repereAxe(a, b);
  if (!r) return null;
  const h = o.params.largeur.value / 2;
  const emprise = contourMur(r, { gauche: h, droite: -h });
  const marches = o.params.marches;
  const n = !estNonEvaluee(marches) && Number.isInteger(marches) && marches > 0 ? marches : 0;
  const reference = o.params.referencePlanSeulement === true;
  const style: FormeDessin["style"] = reference ? "fin" : "trait";
  const formes: FormeDessin[] = [{ forme: "polygone", points: pts(emprise), style }];
  // Nez de marche : n marches de giron L / n, de a vers b.
  for (let i = 1; i < n; i++) formes.push(ligne(surMur(r, (i * r.L) / n, h), surMur(r, (i * r.L) / n, -h), "fin"));
  // Ligne de foulée et flèche de montée (vers b).
  const pointe = Math.min(0.3, r.L / 4);
  formes.push(ligne(a, b, "fin"), ligne(b, surMur(r, r.L - pointe, pointe / 2), "fin"), ligne(b, surMur(r, r.L - pointe, -pointe / 2), "fin"));
  return dessin(o, "objet", formes, [...segmentsDe(emprise, true), { a, b }], [a, b], emprise);
}

export function dessinerPoteau(o: ObjetModele): DessinPlan | null {
  if (o.classe !== "poteau") return null;
  const { point, largeur, profondeur, angle } = o.params;
  const a = (angle.value * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -u.y, y: u.x };
  const l = largeur.value / 2;
  const p = profondeur.value / 2;
  const coin = (i: number, j: number): Vec => ({ x: point.x + u.x * i * l + n.x * j * p, y: point.y + u.y * i * l + n.y * j * p });
  const c = [coin(-1, -1), coin(1, -1), coin(1, 1), coin(-1, 1)];
  return dessin(o, "objet", [{ forme: "polygone", points: pts(c), style: "plein" }], segmentsDe(c, true), [point], c);
}

// --- Registre ------------------------------------------------------------------------------------------------

export const DESSINATEUR_MUR: DessinateurPlan = { classes: ["mur"], dessiner: (o, e) => (o.classe === "mur" ? dessinerMur(o, e) : null) };
export const DESSINATEUR_BAIES: DessinateurPlan = { classes: [...CLASSES_BAIE], dessiner: (o, e) => (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture" ? dessinerBaie(o, e) : null) };
export const DESSINATEUR_SURFACES: DessinateurPlan = { classes: ["dalle", "toiture", "solide"], dessiner: (o) => dessinerSurface(o) };
export const DESSINATEUR_PIECES: DessinateurPlan = { classes: ["piece", "espace", "zone"], dessiner: (o, e) => dessinerPiece(o, e) };
export const DESSINATEUR_ESCALIER: DessinateurPlan = { classes: ["escalier"], dessiner: (o) => dessinerEscalier(o) };
export const DESSINATEUR_POTEAU: DessinateurPlan = { classes: ["poteau"], dessiner: (o) => dessinerPoteau(o) };

export const DESSINATEURS_OBJETS: readonly DessinateurPlan[] = [DESSINATEUR_MUR, DESSINATEUR_BAIES, DESSINATEUR_SURFACES, DESSINATEUR_PIECES, DESSINATEUR_ESCALIER, DESSINATEUR_POTEAU];
