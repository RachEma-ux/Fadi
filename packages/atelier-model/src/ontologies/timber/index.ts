/**
 * Ontologie `timber` (P2-4, cahier P2 §5 ; DA-09-01 à 08) : pièces de bois, ossatures à génération contrôlée (mur à
 * ossature depuis un mur du bâtiment avec ses baies ; charpente depuis une toiture), panneaux CLT, assemblages bois–bois
 * et bois–métal avec quincaillerie déclarée. Réducteurs purs, mêmes dans le navigateur et sur le serveur. Aucune
 * autre ontologie importée ; aucune valeur normative (sections, essences, classes viennent du projet).
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, SectionBois } from "../../modele.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, nouveauProbleme, type ContexteCommande, type Reducteur, type ResultatCommande } from "../../commandes/base.js";
import { creerOccurrence, modifierOccurrence, supprimerIds, supprimerOccurrence } from "../../commandes/objets.js";
import { ouverturesDuMur } from "../../modele.js";
import { etendueMur, geometrieToiture } from "../../projection/maillage.js";
import { planCharpente, planOssatureMur, type BaieMur, type ElementPlanifie } from "./ossature.js";

type Brut = Record<string, unknown>;
const brutsDe = (p: Brut): Brut => ((p["params"] as Brut | undefined) ?? p);
const enchainer = (a: ResultatCommande, f: (etat: ModeleAtelier) => ResultatCommande): ResultatCommande => {
  const b = f(a.etat);
  return { etat: b.etat, effets: fusionnerEffets(a.effets, b.effets) };
};

export const estElementBois = (o: OccurrenceQuelconque | undefined): o is Occurrence<"element-bois"> => !!o && o.classe === "element-bois";
export const estOssature = (o: OccurrenceQuelconque | undefined): o is Occurrence<"ossature"> => !!o && o.classe === "ossature";

export function elementsDeOssature(etat: ModeleAtelier, ossatureId: string): Occurrence<"element-bois">[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"element-bois"> => estElementBois(o) && o.params.ossatureId === ossatureId).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Baies d'un mur dans son repère (s le long de l'axe, z depuis le niveau) — rectangles englobants des cintres. */
export function baiesDuMur(etat: ModeleAtelier, mur: Occurrence<"mur">): BaieMur[] {
  const L = Math.hypot(mur.params.b.x - mur.params.a.x, mur.params.b.y - mur.params.a.y);
  return ouverturesDuMur(etat, mur.id).map((o) => {
    const c = o.params.position * L, w = o.params.largeur.value, zb = o.params.allege?.value ?? 0;
    return { s0: Math.max(0, c - w / 2), s1: Math.min(L, c + w / 2), zb, zt: zb + o.params.hauteur.value };
  }).sort((a, b) => a.s0 - b.s0);
}

/** Aperçu de la génération d'une ossature (pur sur l'état) : éléments à créer, ou refus nommé. */
export function planOssature(etat: ModeleAtelier, oss: Occurrence<"ossature">, hauteur: number | null): ElementPlanifie[] {
  const hote = etat.objets[oss.params.hoteId];
  const lisse = oss.params.sectionLisse ?? oss.params.sectionMontant;
  if (oss.params.genre === "mur") {
    if (!hote || hote.classe !== "mur") throw new ErreurCommande("precondition", "hoteId", `${oss.params.hoteId} n'est pas un mur`);
    const ext = etendueMur(etat, hote);
    const z0 = hote.niveauId ? (etat.niveaux[hote.niveauId]?.elevation ?? 0) : 0;
    const h = hauteur ?? (ext ? ext[1] - ext[0] : null);
    if (h === null) throw new ErreurCommande("precondition", "hauteur", `mur ${hote.id} sans hauteur : indiquer la hauteur de l'ossature`);
    void z0;
    return planOssatureMur(hote.params, h, baiesDuMur(etat, hote), oss.params.entraxe.value, oss.params.sectionMontant, lisse);
  }
  if (!hote || hote.classe !== "toiture") throw new ErreurCommande("precondition", "hoteId", `${oss.params.hoteId} n'est pas une toiture`);
  if (hote.params.type === "plate" || !hote.params.pente) throw new ErreurCommande("precondition", "hoteId", `toiture ${hote.id} plate ou sans pente : charpente non générable (déclaré)`);
  const geo = geometrieToiture(hote.params.contour, hote.params.type, hote.params.pente.value);
  if (!geo) throw new ErreurCommande("precondition", "hoteId", `toiture ${hote.id} : géométrie non déterminable`);
  return planCharpente({ contour: hote.params.contour, z0: hote.params.decalageBase.value }, geo, oss.params.entraxe.value, oss.params.sectionMontant, lisse);
}

function supprimerElement(etat: ModeleAtelier, id: string, ctx: ContexteCommande): ResultatCommande {
  const aSupprimer = [id, ...(Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => o.classe === "assemblage-bois" && (o.params.a === id || o.params.b === id)).map((o) => o.id)];
  return supprimerIds(etat, aSupprimer, ctx);
}

export const reducteursBois: Record<string, Reducteur> = {
  "elementBois.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "element-bois"),
  "elementBois.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "element-bois"),
  "elementBois.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (!estElementBois(etat.objets[id])) throw new ErreurCommande("precondition", "id", `${id} n'est pas un élément bois`);
    return supprimerElement(etat, id, ctx);
  },
  "ossature.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const hote = typeof b["hoteId"] === "string" ? etat.objets[b["hoteId"]] : undefined;
    // Position de l'étiquette : milieu du mur hôte, ou centre du contour de la toiture.
    let position = b["position"];
    if (!position && hote) {
      if (hote.classe === "mur") position = { x: (hote.params.a.x + hote.params.b.x) / 2, y: (hote.params.a.y + hote.params.b.y) / 2, frame: "local", unit: "m" };
      else if (hote.classe === "toiture") position = { x: hote.params.contour.reduce((s, q) => s + q.x, 0) / hote.params.contour.length, y: hote.params.contour.reduce((s, q) => s + q.y, 0) / hote.params.contour.length, frame: "local", unit: "m" };
    }
    return creerOccurrence(etat, { ...p, niveauId: (p["niveauId"] as string | undefined) ?? hote?.niveauId ?? null, params: { ...b, position, generation: null } }, ctx, "ossature");
  },
  "ossature.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "ossature"),
  "ossature.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (!estOssature(etat.objets[id])) throw new ErreurCommande("precondition", "id", `${id} n'est pas une ossature`);
    let r: ResultatCommande = { etat, effets: effetsVides() };
    if (lire.booleen(p, "avecObjets", false)) for (const e of elementsDeOssature(etat, id)) r = enchainer(r, (s) => (s.objets[e.id] ? supprimerElement(s, e.id, ctx) : { etat: s, effets: effetsVides() }));
    return enchainer(r, (s) => supprimerOccurrence(s, { id }, ctx, "ossature"));
  },
  /**
   * Génération contrôlée (DA-09-07 / 08) après aperçu : les éléments planifiés deviennent des pièces de bois rattachées à
   * l'ossature (repère de débit) ; un élément identique déjà présent (mêmes axe et altitudes) n'est pas recréé.
   */
  "ossature.generer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const oss = etat.objets[id];
    if (!estOssature(oss)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une ossature`);
    const hauteur = lire.longueur(p, "hauteur", { optionnel: true, strict: true });
    const plan = planOssature(etat, oss, hauteur?.value ?? null);
    const existants = elementsDeOssature(etat, id);
    const meme = (e: ElementPlanifie) => existants.some((x) => Math.hypot(x.params.a.x - e.a.x, x.params.a.y - e.a.y) < 1e-6 && Math.hypot(x.params.b.x - e.b.x, x.params.b.y - e.b.y) < 1e-6 && Math.abs(x.params.za - e.za) < 1e-6 && Math.abs(x.params.zb - e.zb) < 1e-6);
    let r: ResultatCommande = { etat, effets: effetsVides() };
    let n = 0;
    for (const e of plan) {
      if (meme(e)) continue;
      r = enchainer(r, (s) => creerOccurrence(s, { niveauId: oss.niveauId, calqueId: oss.calqueId, params: { nom: `${oss.params.nom} ${e.repere}`, role: e.role, a: e.a, b: e.b, za: e.za, zb: e.zb, section: e.section, rotation: { value: e.rotation, unit: "deg" }, ossatureId: id, repere: e.repere } }, ctx, "element-bois"));
      n++;
    }
    const generation = { elements: (oss.params.generation?.elements ?? 0) + n };
    return enchainer(r, (s) => ({ etat: { ...s, objets: { ...s.objets, [id]: { ...(s.objets[id] as Occurrence<"ossature">), params: { ...(s.objets[id] as Occurrence<"ossature">).params, generation } } } }, effets: { ...effetsVides(), modifies: [id] } }));
  },
  "panneauClt.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "panneau-clt"),
  "panneauClt.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "panneau-clt"),
  "panneauClt.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (etat.objets[id]!.classe !== "panneau-clt") throw new ErreurCommande("precondition", "id", `${id} n'est pas un panneau CLT`);
    return supprimerElement(etat, id, ctx);
  },
  "assemblageBois.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const a = typeof b["a"] === "string" ? etat.objets[b["a"]] : undefined;
    return creerOccurrence(etat, { ...p, niveauId: (p["niveauId"] as string | null | undefined) ?? a?.niveauId ?? null }, ctx, "assemblage-bois");
  },
  "assemblageBois.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "assemblage-bois"),
  "assemblageBois.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "assemblage-bois"),
};

/** Contrôle après commande : un assemblage bois dont une pièce a disparu (par le socle) est signalé « à réparer » une fois. */
export function controlerBois(_avant: ModeleAtelier, etat: ModeleAtelier, ctx: ContexteCommande): ResultatCommande {
  let problemes = etat.problemes;
  const effets = effetsVides();
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe !== "assemblage-bois") continue;
    if (etat.objets[o.params.a] && etat.objets[o.params.b]) continue;
    if (Object.values(problemes).some((pb) => pb.objetId === o.id && pb.type === "reference-a-reparer")) continue;
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", o.id, `assemblage bois ${o.id} : une pièce reliée a disparu — à réparer`);
    problemes = { ...problemes, [pb.id]: pb };
    effets.problemes.push(pb);
  }
  return { etat: problemes === etat.problemes ? etat : { ...etat, problemes }, effets };
}

export type { SectionBois };
