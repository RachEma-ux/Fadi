/**
 * Ontologie `mep` (P2-5, cahier P2 §4 et §5 ; DA-12-01 à 14, 16 à 21 ; DA-03-16) : réseaux et procédés — segments
 * routés le long d'une polyligne 3D (gaines, tuyaux, chemins de câbles, conduits), raccords, vannes, équipements,
 * supports ; spécifications et catalogues du projet (vides à la livraison, D-180) ; connectivité par ports vérifiée
 * sans table de valeurs ; P&ID dérivé. Réducteurs purs, mêmes dans le navigateur et sur le serveur. Aucune autre
 * ontologie importée ; aucun diamètre, débit ni pression connu du code.
 */
import type { Definition, ModeleAtelier, Occurrence, OccurrenceQuelconque, Point3Reseau, PortReseau, Relation, SectionReseau, SystemeReseau } from "../../modele.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, nouveauProbleme, type ContexteCommande, type Reducteur, type ResultatCommande } from "../../commandes/base.js";
import { creerOccurrence, modifierOccurrence, supprimerIds, supprimerOccurrence } from "../../commandes/objets.js";
import { connexionDuPort, connexions, estReseau, etatConnexions, incompatibilites, portDe, portsDe, portsLibres, TOLERANCE_PORT, type PortAbsolu } from "./connectivite.js";

type Brut = Record<string, unknown>;
const brutsDe = (p: Brut): Brut => ((p["params"] as Brut | undefined) ?? p);
const enchainer = (a: ResultatCommande, f: (etat: ModeleAtelier) => ResultatCommande): ResultatCommande => {
  const b = f(a.etat);
  return { etat: b.etat, effets: fusionnerEffets(a.effets, b.effets) };
};

export const estSegment = (o: OccurrenceQuelconque | undefined): o is Occurrence<"segment-reseau"> => !!o && o.classe === "segment-reseau";
export const estSpecification = (d: Definition | undefined): boolean => !!d && d.classe === "specification";

/** Spécifications du projet (DA-12-07, 17, 18) : définitions `specification`, triées par nom. */
export function specifications(etat: ModeleAtelier): Definition[] {
  return Object.values(etat.definitions).filter(estSpecification).sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : a.id < b.id ? -1 : 1));
}

/** Supports attachés à un segment. */
export function supportsDe(etat: ModeleAtelier, segmentId: string): Occurrence<"support-reseau">[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"support-reseau"> => o.classe === "support-reseau" && o.params.porteId === segmentId).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Suppression d'un objet de réseau : ses connexions disparaissent (socle), ses supports aussi. */
function supprimerObjetReseau(etat: ModeleAtelier, id: string, ctx: ContexteCommande): ResultatCommande {
  const aSupprimer = [id, ...supportsDe(etat, id).map((s) => s.id)];
  return supprimerIds(etat, aSupprimer, ctx);
}

function lirePortCible(etat: ModeleAtelier, p: Brut, cleObjet: string, clePort: string): { objet: OccurrenceQuelconque; port: string | null } {
  const id = lire.objet(etat, p, cleObjet);
  const o = etat.objets[id]!;
  if (!estReseau(o)) throw new ErreurCommande("precondition", cleObjet, `${id} (${o.classe}) n'est pas un objet de réseau`);
  const port = lire.chaineOuNull(p, clePort);
  if (port !== null && !portsDe(o).some((x) => x.id === port)) throw new ErreurCommande("precondition", clePort, `${id} : port « ${port} » inconnu (${portsDe(o).map((x) => x.id).join(", ")})`);
  return { objet: o, port };
}

/** Choix de la paire de ports libres la plus proche entre deux objets quand les ports ne sont pas nommés. */
function choisirPorts(etat: ModeleAtelier, a: OccurrenceQuelconque, pa: string | null, b: OccurrenceQuelconque, pb: string | null): [PortAbsolu, PortAbsolu] {
  const libresA = portsDe(a).filter((x) => (pa ? x.id === pa : !connexionDuPort(etat, a.id, x.id)));
  const libresB = portsDe(b).filter((x) => (pb ? x.id === pb : !connexionDuPort(etat, b.id, x.id)));
  if (!libresA.length) throw new ErreurCommande("precondition", "a", `${a.id} : aucun port libre`);
  if (!libresB.length) throw new ErreurCommande("precondition", "b", `${b.id} : aucun port libre`);
  let meilleur: [PortAbsolu, PortAbsolu] | null = null, dMin = Infinity;
  for (const x of libresA) for (const y of libresB) {
    const d = Math.hypot(x.position.x - y.position.x, x.position.y - y.position.y, x.position.z - y.position.z);
    if (d < dMin) { dMin = d; meilleur = [x, y]; }
  }
  return meilleur!;
}

function connecter(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const A = lirePortCible(etat, p, "a", "portA"), B = lirePortCible(etat, p, "b", "portB");
  if (A.objet.id === B.objet.id) throw new ErreurCommande("invalide", "b", "un objet ne se connecte pas à lui-même");
  const [pa, pb] = choisirPorts(etat, A.objet, A.port, B.objet, B.port);
  const existante = connexions(etat).find((r) => (r.sourceId === pa.objetId && r.params["portA"] === pa.id && r.targetId === pb.objetId && r.params["portB"] === pb.id) || (r.sourceId === pb.objetId && r.params["portA"] === pb.id && r.targetId === pa.objetId && r.params["portB"] === pa.id));
  if (existante) return { etat, effets: effetsVides() };
  for (const x of [pa, pb]) { const c = connexionDuPort(etat, x.objetId, x.id); if (c) throw new ErreurCommande("precondition", x === pa ? "portA" : "portB", `${x.objetId} : port « ${x.id} » déjà connecté (${c.id})`); }
  const motifs = incompatibilites(pa, pb);
  if (motifs.length && !lire.booleen(p, "forcer", false)) throw new ErreurCommande("precondition", "b", `connexion ${pa.objetId}:${pa.id} — ${pb.objetId}:${pb.id} incompatible : ${motifs.join(" ; ")}`);
  const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("connexion");
  if (etat.relations[id]) throw new ErreurCommande("precondition", "id", `identifiant déjà utilisé : ${id}`);
  const relation: Relation = { id, kind: "connecte", sourceId: pa.objetId, targetId: pb.objetId, params: { portA: pa.id, portB: pb.id } };
  const effets = effetsVides();
  effets.modifies.push(pa.objetId, pb.objetId);
  return { etat: { ...etat, relations: { ...etat.relations, [id]: relation } }, effets };
}

/** Ports d'un coude déduits de deux directions (vers l'amont et vers l'aval), bras de longueur L : géométrie seulement. */
export function portsCoude(dirAmont: Point3Reseau, dirAval: Point3Reseau, L: number, section: SectionReseau | null, systeme: SystemeReseau): PortReseau[] {
  const n = (d: Point3Reseau): Point3Reseau => { const k = Math.hypot(d.x, d.y, d.z) || 1; return { x: d.x / k, y: d.y / k, z: d.z / k }; };
  const u = n(dirAmont), v = n(dirAval);
  return [
    { id: "1", dx: u.x * L, dy: u.y * L, dz: u.z * L, sens: "indifferent", section, systeme, fluide: null },
    { id: "2", dx: v.x * L, dy: v.y * L, dz: v.z * L, sens: "indifferent", section, systeme, fluide: null },
  ];
}

/**
 * Routage (DA-12-06) : une polyligne 3D devient une suite de segments connectés bout à bout ; avec `coude.longueur`, un
 * raccord coude est posé à chaque sommet intermédiaire (ses bras raccourcissent les segments) et connecté. Tout est
 * créé dans la même commande, donc dans la même révision ; rien d'autre n'est modifié.
 */
function router(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const b = brutsDe(p);
  const niveauId = lire.niveau(etat, p);
  const sommets = lireSommets(b, "sommets", 2);
  const coude = b["coude"] && typeof b["coude"] === "object" ? lire.longueur(b["coude"] as Brut, "longueur", { strict: true })! : null;
  const prefixe = lire.chaineOuNull(b, "prefixe") ?? lire.chaineOuNull(b, "nom") ?? "Tronçon";
  const commun = { systeme: b["systeme"], section: b["section"], fluide: b["fluide"] ?? null, materiau: b["materiau"] ?? null, sens: b["sens"] ?? "a-vers-b", specificationId: b["specificationId"] ?? null };
  const dir = (a: Point3Reseau, c: Point3Reseau): Point3Reseau => ({ x: c.x - a.x, y: c.y - a.y, z: c.z - a.z });
  let r: ResultatCommande = { etat, effets: effetsVides() };
  const ids: string[] = [];
  const coudes: string[] = [];
  for (let i = 1; i < sommets.length; i++) {
    let a = sommets[i - 1]!, c = sommets[i]!;
    const L = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    if (L < 1e-9) throw new ErreurCommande("invalide", "sommets", `tronçon ${i} de longueur nulle`);
    if (coude) {
      const u = { x: (c.x - a.x) / L, y: (c.y - a.y) / L, z: (c.z - a.z) / L };
      const l = coude.value;
      const utile = L - (i > 1 ? l : 0) - (i < sommets.length - 1 ? l : 0);
      if (utile < TOLERANCE_PORT) throw new ErreurCommande("invalide", "coude.longueur", `tronçon ${i} (${Math.round(L * 1000)} mm) trop court pour des bras de coude de ${Math.round(l * 1000)} mm`);
      if (i > 1) a = { x: a.x + u.x * l, y: a.y + u.y * l, z: a.z + u.z * l };
      if (i < sommets.length - 1) c = { x: c.x - u.x * l, y: c.y - u.y * l, z: c.z - u.z * l };
    }
    const id = `${lire.chaineOuNull(b, "id") ?? ctx.ids.nouveau("segment-reseau")}${lire.chaineOuNull(b, "id") ? `-${i}` : ""}`;
    r = enchainer(r, (s) => creerOccurrence(s, { id, niveauId, calqueId: p["calqueId"] ?? null, params: { ...commun, nom: `${prefixe} ${i}`, repere: null, sommets: [a, c] } }, ctx, "segment-reseau"));
    ids.push(id);
  }
  if (coude) {
    for (let i = 1; i < sommets.length - 1; i++) {
      const q = sommets[i]!;
      const ports = portsCoude(dir(q, sommets[i - 1]!), dir(q, sommets[i + 1]!), coude.value, null, lire.enumeration(b, "systeme", ["gaine", "tuyau", "chemin-de-cables", "conduit"] as const));
      const id = `${lire.chaineOuNull(b, "id") ?? ctx.ids.nouveau("raccord-reseau")}${lire.chaineOuNull(b, "id") ? `-c${i}` : ""}`;
      r = enchainer(r, (s) => creerOccurrence(s, { id, niveauId, calqueId: p["calqueId"] ?? null, params: { nom: `${prefixe} coude ${i}`, type: "coude", systeme: commun.systeme, position: { x: q.x, y: q.y, frame: "local", unit: "m" }, z: q.z, angle: { value: 0, unit: "deg" }, section: commun.section, ports, fluide: commun.fluide, materiau: commun.materiau, specificationId: commun.specificationId } }, ctx, "raccord-reseau"));
      coudes.push(id);
    }
  }
  for (let i = 1; i < ids.length; i++) {
    if (coude) {
      r = enchainer(r, (s) => connecter(s, { a: ids[i - 1], portA: "b", b: coudes[i - 1], portB: "1" }, ctx));
      r = enchainer(r, (s) => connecter(s, { a: coudes[i - 1], portA: "2", b: ids[i], portB: "a" }, ctx));
    } else r = enchainer(r, (s) => connecter(s, { a: ids[i - 1], portA: "b", b: ids[i], portB: "a" }, ctx));
  }
  return r;
}

function lireSommets(p: Brut, cle: string, min: number): Point3Reseau[] {
  const v = p[cle];
  if (!Array.isArray(v) || v.length < min || !v.every((q) => q && typeof q === "object" && [(q as Point3Reseau).x, (q as Point3Reseau).y, (q as Point3Reseau).z].every((c) => typeof c === "number" && Number.isFinite(c)))) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste d'au moins ${min} points { x, y, z } (m, z depuis le niveau)`);
  return (v as Point3Reseau[]).map((q) => ({ x: q.x, y: q.y, z: q.z }));
}

export const reducteursReseaux: Record<string, Reducteur> = {
  "segmentReseau.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "segment-reseau"),
  "segmentReseau.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "segment-reseau"),
  "segmentReseau.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (!estSegment(etat.objets[id])) throw new ErreurCommande("precondition", "id", `${id} n'est pas un segment de réseau`);
    return supprimerObjetReseau(etat, id, ctx);
  },
  "raccordReseau.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "raccord-reseau"),
  "raccordReseau.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "raccord-reseau"),
  "raccordReseau.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "raccord-reseau"),
  "vanne.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "vanne"),
  "vanne.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "vanne"),
  "vanne.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "vanne"),
  "equipementReseau.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "equipement-reseau"),
  "equipementReseau.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "equipement-reseau"),
  "equipementReseau.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "equipement-reseau"),
  "supportReseau.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const porte = typeof b["porteId"] === "string" ? etat.objets[b["porteId"]] : undefined;
    return creerOccurrence(etat, { ...p, niveauId: (p["niveauId"] as string | null | undefined) ?? porte?.niveauId ?? null }, ctx, "support-reseau");
  },
  "supportReseau.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "support-reseau"),
  "supportReseau.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "support-reseau"),
  /** Connexion de deux ports (DA-12-01) : ports nommés ou paire libre la plus proche ; compatibilité vérifiée, refus nommé. */
  "reseau.connecter": (etat, p, ctx) => connecter(etat, p, ctx),
  "reseau.deconnecter": (etat, p) => {
    const id = lire.chaineOuNull(p, "id");
    let rel: Relation | undefined;
    if (id) rel = etat.relations[id];
    else {
      const a = lire.objet(etat, p, "a"), b = lire.objet(etat, p, "b");
      rel = connexions(etat).find((r) => (r.sourceId === a && r.targetId === b) || (r.sourceId === b && r.targetId === a));
    }
    if (!rel || rel.kind !== "connecte") throw new ErreurCommande("precondition", id ? "id" : "a", "connexion introuvable");
    const relations = { ...etat.relations };
    delete relations[rel.id];
    const effets = effetsVides();
    effets.modifies.push(rel.sourceId, rel.targetId);
    return { etat: { ...etat, relations }, effets };
  },
  /** Connexion automatique des ports libres coïncidents et compatibles (objets donnés, sinon tout le modèle). */
  "reseau.connecterProches": (etat, p, ctx) => {
    const ids = Array.isArray(p["ids"]) ? (p["ids"] as unknown[]).filter((x): x is string => typeof x === "string") : null;
    const libres = portsLibres(etat, ids ? (o) => ids.includes(o.id) : undefined);
    let r: ResultatCommande = { etat, effets: effetsVides() };
    const pris = new Set<string>();
    for (let i = 0; i < libres.length; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        const a = libres[i]!, b = libres[j]!;
        const ka = `${a.objetId}:${a.id}`, kb = `${b.objetId}:${b.id}`;
        if (pris.has(ka) || pris.has(kb) || a.objetId === b.objetId) continue;
        if (incompatibilites(a, b).length) continue;
        pris.add(ka); pris.add(kb);
        r = enchainer(r, (s) => connecter(s, { a: a.objetId, portA: a.id, b: b.objetId, portB: b.id }, ctx));
      }
    }
    return r;
  },
  "reseau.router": (etat, p, ctx) => router(etat, p, ctx),
  /** Spécification (DA-12-07, 17, 18, 20) : système, fluide, matériau, catalogue sourcé et désignations admises. */
  "specification.definir": (etat, p, ctx) => {
    const nom = lire.chaine(p, "nom").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom requis");
    const systeme = lire.enumeration(p, "systeme", ["gaine", "tuyau", "chemin-de-cables", "conduit"] as const);
    const catalogueId = lire.chaineOuNull(p, "catalogueId");
    if (catalogueId !== null) { const cat = etat.definitions[catalogueId]; if (!cat || cat.classe !== "catalogue") throw new ErreurCommande("precondition", "catalogueId", `catalogue inconnu : ${catalogueId}`); }
    const d = p["designations"];
    if (d !== undefined && d !== null && (!Array.isArray(d) || !d.every((x) => typeof x === "string"))) throw new ErreurCommande("invalide", "designations", "liste de désignations attendue");
    const designations = ((d as string[] | undefined) ?? []).map((x) => x.trim()).filter(Boolean);
    if (designations.length && !catalogueId) throw new ErreurCommande("invalide", "designations", "des désignations admises supposent un catalogue");
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("specification");
    const existant = etat.definitions[id];
    if (existant && existant.classe !== "specification") throw new ErreurCommande("precondition", "id", `${id} n'est pas une spécification`);
    const def: Definition = { id, classe: "specification", nom, params: { systeme, fluide: lire.chaineOuNull(p, "fluide"), materiau: lire.chaineOuNull(p, "materiau"), catalogueId, designations, note: lire.chaineOuNull(p, "note") }, version: (existant?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existant ? effets.modifies : effets.crees).push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  "specification.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = etat.definitions[id];
    if (!d || d.classe !== "specification") throw new ErreurCommande("precondition", "id", `spécification inconnue : ${id}`);
    const usages = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => estReseau(o) && o.classe !== "equipement-reseau" && (o.params as { specificationId?: string | null }).specificationId === id);
    if (usages.length) throw new ErreurCommande("precondition", "id", `spécification ${d.nom} : ${usages.length} objet(s) la suivent encore`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

/**
 * Contrôle après commande : chaque connexion est rejugée (ports déplacés, sections ou fluides modifiés, objet disparu) ;
 * les problèmes « reseau » sont recalculés en entier (jamais cumulés) ; un support dont le segment a disparu est
 * signalé « à réparer » une fois.
 */
export function controlerReseau(_avant: ModeleAtelier, etat: ModeleAtelier, ctx: ContexteCommande): ResultatCommande {
  const anciens = Object.values(etat.problemes).filter((pb) => pb.type === "reseau");
  const voulus = etatConnexions(etat).filter((c) => c.motifs.length).map((c) => ({ objetId: c.relation.sourceId, message: `connexion ${c.relation.id} (${c.relation.sourceId}:${String(c.relation.params["portA"])} — ${c.relation.targetId}:${String(c.relation.params["portB"])}) : ${c.motifs.join(" ; ")}` }));
  const memes = anciens.length === voulus.length && voulus.every((v) => anciens.some((a) => a.objetId === v.objetId && a.message === v.message));
  let problemes = etat.problemes;
  const effets = effetsVides();
  if (!memes) {
    problemes = Object.fromEntries(Object.entries(problemes).filter(([, pb]) => pb.type !== "reseau"));
    for (const v of voulus) { const pb = nouveauProbleme(ctx.ids, "reseau", v.objetId, v.message); problemes[pb.id] = pb; effets.problemes.push(pb); }
  }
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe !== "support-reseau" || etat.objets[o.params.porteId]) continue;
    if (Object.values(problemes).some((pb) => pb.objetId === o.id && pb.type === "reference-a-reparer")) continue;
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", o.id, `support ${o.id} : le segment ${o.params.porteId} a disparu — à réparer`);
    problemes = { ...problemes, [pb.id]: pb };
    effets.problemes.push(pb);
  }
  return { etat: problemes === etat.problemes ? etat : { ...etat, problemes }, effets };
}

export { portDe, portsDe, portsLibres, connexions, etatConnexions, incompatibilites, estReseau };
export type { SystemeReseau };
