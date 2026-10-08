/**
 * Ontologie `structure` (P2-3, cahier P2 §4 et §5 ; DA-08-01 à 19, DA-03-14, DA-10-10) : éléments linéaires,
 * trames à génération contrôlée, plaques, assemblages paramétriques (géométrie seulement), soudures, armatures,
 * coulages. Réducteurs purs, mêmes dans le navigateur et sur le serveur. Une ontologie n'importe jamais une autre
 * ontologie directement : le poteau du socle est créé par le modèle typé (`creerOccurrence`), rien d'autre.
 * Aucune valeur normative : sections et masses linéiques viennent du projet (saisie ou catalogue sourcé, D-180).
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, ParamsTrame } from "../../modele.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, nouveauProbleme, type ContexteCommande, type Reducteur, type ResultatCommande } from "../../commandes/base.js";
import { creerOccurrence, modifierOccurrence, supprimerIds, supprimerOccurrence } from "../../commandes/objets.js";
import { planGeneration } from "./trame.js";

type Brut = Record<string, unknown>;
const brutsDe = (p: Brut): Brut => ((p["params"] as Brut | undefined) ?? p);
const enchainer = (a: ResultatCommande, f: (etat: ModeleAtelier) => ResultatCommande): ResultatCommande => {
  const b = f(a.etat);
  return { etat: b.etat, effets: fusionnerEffets(a.effets, b.effets) };
};

/** Classes qu'un assemblage, une soudure ou un coulage peut relier. */
export const ELEMENTS_STRUCTURE = ["poutre", "poteau", "plaque"] as const;
export const ELEMENTS_BETON = ["poutre", "poteau", "plaque", "dalle"] as const;

export const estPoutre = (o: OccurrenceQuelconque | undefined): o is Occurrence<"poutre"> => !!o && o.classe === "poutre";
export const estTrame = (o: OccurrenceQuelconque | undefined): o is Occurrence<"trame"> => !!o && o.classe === "trame";
export const estCoulage = (o: OccurrenceQuelconque | undefined): o is Occurrence<"coulage"> => !!o && o.classe === "coulage";

/** Objets générés par une trame (poteaux et poutres portant `trameId` ou la propriété `trame`). */
export function objetsDeTrame(etat: ModeleAtelier, trameId: string): OccurrenceQuelconque[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => (o.classe === "poutre" && o.params.trameId === trameId) || (o.classe === "poteau" && o.proprietes["trame"]?.valeur === trameId)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Suppression d'un élément de structure : les soudures qui le relient disparaissent ; un assemblage structurel le
 * retire de ses éléments (supprimé s'il n'en reste aucun) ; une armature hébergée perd son hôte ; un coulage le retire.
 */
function supprimerElement(etat: ModeleAtelier, id: string, ctx: ContexteCommande): ResultatCommande {
  const objets = { ...etat.objets };
  const effets = effetsVides();
  const aSupprimer = [id];
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe === "soudure" && (o.params.a === id || o.params.b === id)) aSupprimer.push(o.id);
    else if (o.classe === "assemblage-structurel" && o.params.elements.includes(id)) {
      const elements = o.params.elements.filter((x) => x !== id);
      if (!elements.length) aSupprimer.push(o.id);
      else { objets[o.id] = { ...o, params: { ...o.params, elements } }; effets.modifies.push(o.id); }
    } else if (o.classe === "armature" && o.params.hoteId === id) { objets[o.id] = { ...o, params: { ...o.params, hoteId: null } }; effets.modifies.push(o.id); }
    else if (o.classe === "coulage" && o.params.elements.includes(id)) { objets[o.id] = { ...o, params: { ...o.params, elements: o.params.elements.filter((x) => x !== id) } }; effets.modifies.push(o.id); }
  }
  const r = supprimerIds({ ...etat, objets }, aSupprimer, ctx);
  return { etat: r.etat, effets: fusionnerEffets(effets, r.effets) };
}

const tripletStructure = (classe: "poutre" | "plaque" | "trame" | "assemblage-structurel" | "soudure" | "armature", prefixe: string, suppression: "element" | "simple"): Record<string, Reducteur> => ({
  [`${prefixe}.creer`]: (etat, p, ctx) => creerOccurrence(etat, p, ctx, classe),
  [`${prefixe}.modifier`]: (etat, p, ctx) => modifierOccurrence(etat, p, ctx, classe),
  [`${prefixe}.supprimer`]: (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (etat.objets[id]!.classe !== classe) throw new ErreurCommande("precondition", "id", `${id} n'est pas ${classe === "armature" ? "une armature" : classe === "plaque" ? "une plaque" : classe === "trame" ? "une trame" : classe === "soudure" ? "une soudure" : classe === "poutre" ? "un élément de structure" : "un assemblage structurel"}`);
    return suppression === "element" ? supprimerElement(etat, id, ctx) : supprimerOccurrence(etat, { id }, ctx, classe);
  },
});

export const reducteursStructure: Record<string, Reducteur> = {
  ...tripletStructure("poutre", "poutre", "element"),
  ...tripletStructure("plaque", "plaque", "element"),
  ...tripletStructure("assemblage-structurel", "assemblageStructurel", "simple"),
  ...tripletStructure("soudure", "soudure", "simple"),
  /** Une soudure prend le niveau de son premier élément quand `niveauId` n'est pas donné. */
  "soudure.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const a = typeof b["a"] === "string" ? etat.objets[b["a"]] : undefined;
    return creerOccurrence(etat, { ...p, niveauId: (p["niveauId"] as string | null | undefined) ?? a?.niveauId ?? null }, ctx, "soudure");
  },
  ...tripletStructure("armature", "armature", "simple"),
  "trame.creer": (etat, p, ctx) => creerOccurrence(etat, { ...p, params: { ...brutsDe(p), generation: null } }, ctx, "trame"),
  "trame.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "trame"),
  /** Supprimer la trame seule ; `avecObjets` supprime aussi ce qu'elle a généré. */
  "trame.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (!estTrame(etat.objets[id])) throw new ErreurCommande("precondition", "id", `${id} n'est pas une trame`);
    const generes = lire.booleen(p, "avecObjets", false) ? objetsDeTrame(etat, id) : [];
    let r: ResultatCommande = { etat, effets: effetsVides() };
    for (const o of generes) r = enchainer(r, (e) => (e.objets[o.id] ? supprimerElement(e, o.id, ctx) : { etat: e, effets: effetsVides() }));
    return enchainer(r, (e) => supprimerIds(e, [id], ctx));
  },
  /**
   * Génération contrôlée (DA-08-04 / 05) : après aperçu et accord, poteaux aux intersections et poutres en tête
   * (axe à hauteur − hauteur de section / 2). Hauteur et sections viennent de la commande (jamais supposées) ; une
   * intersection qui porte déjà un poteau de cette trame n'en reçoit pas un second (rejouable sans doublon).
   */
  "trame.generer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const trame = etat.objets[id];
    if (!estTrame(trame)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une trame`);
    const avecPoteaux = lire.booleen(p, "poteaux", true);
    const avecPoutres = lire.booleen(p, "poutres", true);
    const hauteur = lire.longueur(p, "hauteur", { strict: true })!;
    const materiau = lire.enumeration(p, "materiau", ["acier", "beton", "bois", "autre"] as const);
    const materiauNom = lire.chaineOuNull(p, "materiauNom");
    const plan = planGeneration(trame.params as ParamsTrame, { poteaux: avecPoteaux, poutres: avecPoutres });
    const existants = objetsDeTrame(etat, id);
    const dejaPoteau = (q: { x: number; y: number }) => existants.some((o) => o.classe === "poteau" && Math.hypot(o.params.point.x - q.x, o.params.point.y - q.y) < 1e-6);
    const dejaPoutre = (a: { x: number; y: number }, b: { x: number; y: number }) => existants.some((o) => o.classe === "poutre" && ((Math.hypot(o.params.a.x - a.x, o.params.a.y - a.y) < 1e-6 && Math.hypot(o.params.b.x - b.x, o.params.b.y - b.y) < 1e-6) || (Math.hypot(o.params.a.x - b.x, o.params.a.y - b.y) < 1e-6 && Math.hypot(o.params.b.x - a.x, o.params.b.y - a.y) < 1e-6)));
    let r: ResultatCommande = { etat, effets: effetsVides() };
    let poteaux = 0, poutres = 0;
    if (avecPoteaux) {
      const sp = p["sectionPoteau"];
      if (!sp || typeof sp !== "object") throw new ErreurCommande("invalide", "sectionPoteau", "« sectionPoteau » : { formeId, largeur, profondeur, epaisseurProfil? } requis");
      for (const q of plan.poteaux) {
        if (dejaPoteau(q.point)) continue;
        r = enchainer(r, (e) => creerOccurrence(e, { niveauId: trame.niveauId, calqueId: trame.calqueId, params: { ...(sp as Brut), point: q.point, hauteur, angle: trame.params.angle, nom: `${trame.params.nom} ${q.file}${q.rang}` }, proprietes: { trame: { valeur: id, provenance: "calcul", statut: "declaree" }, materiau: { valeur: materiauNom ?? materiau, provenance: "saisie", statut: "declaree" } } }, ctx, "poteau"));
        poteaux++;
      }
    }
    if (avecPoutres) {
      const sp = p["sectionPoutre"];
      if (!sp || typeof sp !== "object") throw new ErreurCommande("invalide", "sectionPoutre", "« sectionPoutre » : section (forme, largeur, hauteur…) ou { catalogueId, designation } requise");
      for (const q of plan.poutres) {
        if (dejaPoutre(q.a, q.b)) continue;
        r = enchainer(r, (e) => {
          const c = creerOccurrence(e, { niveauId: trame.niveauId, calqueId: trame.calqueId, params: { nom: `${trame.params.nom} ${q.nom}`, role: "poutre", a: q.a, b: q.b, za: hauteur.value, zb: hauteur.value, section: sp, materiau, materiauNom, trameId: id } }, ctx, "poutre");
          // Axe en tête de poteau : descendu d'une demi-hauteur de section pour que le dessus affleure.
          const o = c.etat.objets[c.effets.crees[0]!] as Occurrence<"poutre">;
          const z = Math.round((hauteur.value - o.params.section.hauteur.value / 2) * 1e6) / 1e6;
          return { ...c, etat: { ...c.etat, objets: { ...c.etat.objets, [o.id]: { ...o, params: { ...o.params, za: z, zb: z } } } } };
        });
        poutres++;
      }
    }
    const generation = { poteaux: (trame.params.generation?.poteaux ?? 0) + poteaux, poutres: (trame.params.generation?.poutres ?? 0) + poutres, hauteur: hauteur.value };
    r = enchainer(r, (e) => ({ etat: { ...e, objets: { ...e.objets, [id]: { ...(e.objets[id] as Occurrence<"trame">), params: { ...(e.objets[id] as Occurrence<"trame">).params, generation } } } }, effets: { ...effetsVides(), modifies: [id] } }));
    return r;
  },
  "coulage.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "coulage"),
  "coulage.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "coulage"),
  "coulage.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "coulage"),
  /** Affecter des éléments en béton à un coulage (retirés de tout autre coulage) ; `elements: []` vide le coulage. */
  "coulage.affecter": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const c = etat.objets[id];
    if (!estCoulage(c)) throw new ErreurCommande("precondition", "id", `${id} n'est pas un coulage`);
    const elements = p["elements"];
    if (!Array.isArray(elements) || !elements.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "elements", "« elements » : liste d'identifiants");
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const el of elements as string[]) {
      const o = etat.objets[el];
      if (!o) throw new ErreurCommande("precondition", "elements", `objet inconnu : ${el}`);
      if (!(ELEMENTS_BETON as readonly string[]).includes(o.classe)) throw new ErreurCommande("precondition", "elements", `${el} (${o.classe}) : un coulage groupe des poutres, poteaux, plaques ou dalles`);
      for (const autre of Object.values(etat.objets) as OccurrenceQuelconque[]) {
        if (autre.classe === "coulage" && autre.id !== id && autre.params.elements.includes(el)) {
          const prev = objets[autre.id] as Occurrence<"coulage">;
          objets[autre.id] = { ...prev, params: { ...prev.params, elements: prev.params.elements.filter((x) => x !== el) } };
          if (!effets.modifies.includes(autre.id)) effets.modifies.push(autre.id);
        }
      }
    }
    objets[id] = { ...c, params: { ...c.params, elements: [...new Set(elements as string[])] } };
    effets.modifies.push(id);
    void ctx;
    return { etat: { ...etat, objets }, effets };
  },
};

/**
 * Contrôle après commande : une soudure, un assemblage structurel, une armature ou un coulage dont un élément a disparu
 * (supprimé par une commande du socle, hors `poutre.supprimer`) est signalé « à réparer » une seule fois.
 */
export function controlerStructure(_avant: ModeleAtelier, etat: ModeleAtelier, ctx: ContexteCommande): ResultatCommande {
  let problemes = etat.problemes;
  const effets = effetsVides();
  const deja = (id: string) => Object.values(problemes).some((pb) => pb.objetId === id && pb.type === "reference-a-reparer");
  const signaler = (id: string, message: string) => {
    if (deja(id)) return;
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", id, message);
    problemes = { ...problemes, [pb.id]: pb };
    effets.problemes.push(pb);
  };
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe === "soudure" && (!etat.objets[o.params.a] || !etat.objets[o.params.b])) signaler(o.id, `soudure ${o.id} : un élément relié a disparu — à réparer`);
    else if (o.classe === "assemblage-structurel" && o.params.elements.some((e) => !etat.objets[e])) signaler(o.id, `assemblage structurel ${o.id} : un élément relié a disparu — à réparer`);
    else if (o.classe === "armature" && o.params.hoteId && !etat.objets[o.params.hoteId]) signaler(o.id, `armature ${o.id} : l'hôte ${o.params.hoteId} a disparu — à réparer`);
    else if (o.classe === "coulage" && o.params.elements.some((e) => !etat.objets[e])) signaler(o.id, `coulage ${o.params.nom} : un élément a disparu — à réparer`);
  }
  return { etat: problemes === etat.problemes ? etat : { ...etat, problemes }, effets };
}
