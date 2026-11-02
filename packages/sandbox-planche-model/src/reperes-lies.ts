/**
 * Repères liés (chantier Axes, lot AX-5 ; concept Axes 1.0, § 5.2 et AX13 ; décision AX-D7). Pur.
 *
 * Un repère enregistré peut être LIÉ à une face de la racine du document : il garde l'identifiant de la face et un
 * instantané de contrôle (centre, normale) pris au moment du lien. Sa santé est explicite :
 * - « sain » : la face existe et n'a pas bougé ;
 * - « périmé » : la face existe mais a changé — le repère garde sa base jusqu'à « Mettre à jour depuis la face » ;
 * - « manquant » : la face n'existe plus — le repère garde sa base ; aucune autre face n'est jamais devinée (AX13).
 * Les faces des groupes et composants ne sont pas liables (leur identité dépend du chemin d'occurrence) : refus explicite.
 */
import type { Id, Modele } from "./geometrie-libre.js";
import { modifierAnnotations } from "./geometrie-libre.js";
import { enregistrerRepere, type ResultatRepereDocument } from "./reperes-enregistres.js";
import { type RepereEnregistre, repereDepuisFace } from "./reperes.js";
import { type Vec3, len, normalize, sub } from "./vecteur.js";

export type SanteRepere = "instantane" | "sain" | "perime" | "manquant";

export const MESSAGES_REPERES_LIES = Object.freeze({
  face: "Le lien demande une face de la Planche (hors groupe ou composant).",
  manquant: "La face source n'existe plus : le repère garde sa base ; aucune autre face n'est substituée. Détachez le lien ou supprimez le repère.",
  pasLie: "Ce repère n'est pas lié à une face.",
});

/** Centre, normale et premier côté d'une face de la racine ; `null` si absente ou dégénérée. */
export function geometrieFaceRacine(m: Modele, face: Id): { centre: Vec3; normale: Vec3; u: Vec3 } | null {
  const f = m.racine.faces[face];
  if (!f) return null;
  const pts = f.exterieur.map((s) => m.racine.sommets[s]?.position).filter((p): p is Vec3 => !!p);
  if (pts.length < 3) return null;
  const centre = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  return { centre, normale: normalize(f.normale), u: sub(pts[1]!, pts[0]!) };
}

const TOL_SANTE = 1e-9;
const meme = (a: Vec3, b: Vec3, echelle = 1) => len(sub(a, b)) <= TOL_SANTE * Math.max(1, echelle);

/** Santé d'un repère enregistré (instantané, sain, périmé, manquant). */
export function santeRepere(m: Modele, r: RepereEnregistre): SanteRepere {
  if (r.source.mode !== "lie") return "instantane";
  const g = geometrieFaceRacine(m, r.source.face);
  if (!g) return "manquant";
  const c = r.source.controle;
  return meme(g.centre, c.centre, len(c.centre)) && meme(g.normale, c.normale) ? "sain" : "perime";
}

/** Enregistre un repère aligné sur une face de la racine et LIÉ à elle (instantané de contrôle). */
export function enregistrerRepereLie(m: Modele, nom: string, face: Id): ResultatRepereDocument {
  const g = geometrieFaceRacine(m, face);
  if (!g) return { ok: false, erreur: MESSAGES_REPERES_LIES.face };
  const r = repereDepuisFace(g.centre, g.normale, g.u);
  if (!r.ok) return { ok: false, erreur: r.message };
  const e = enregistrerRepere(m, nom, r.repere);
  if (!e.ok) return e;
  const enr = e.modele.annotations!.reperes![e.id]!;
  const lie = modifierAnnotations(e.modele, (a) => {
    a.reperes[e.id] = { ...enr, source: { mode: "lie", face, controle: { centre: g.centre, normale: g.normale } } };
  });
  return { ok: true, modele: lie.modele, id: e.id };
}

/**
 * « Mettre à jour depuis la face » : recalcule la base depuis LA face liée (révision suivante, nouveau contrôle).
 * Face manquante : refus, rien n'est modifié.
 */
export function mettreAJourDepuisSource(m: Modele, id: Id): ResultatRepereDocument {
  const r = m.annotations?.reperes?.[id];
  if (!r || r.source.mode !== "lie") return { ok: false, erreur: MESSAGES_REPERES_LIES.pasLie };
  const g = geometrieFaceRacine(m, r.source.face);
  if (!g) return { ok: false, erreur: MESSAGES_REPERES_LIES.manquant };
  const n = repereDepuisFace(g.centre, g.normale, g.u);
  if (!n.ok) return { ok: false, erreur: n.message };
  const face = r.source.face;
  const res = modifierAnnotations(m, (a) => {
    a.reperes[id] = { ...r, ...n.repere, revision: r.revision + 1, source: { mode: "lie", face, controle: { centre: g.centre, normale: g.normale } } };
  });
  return { ok: true, modele: res.modele, id };
}

/** « Détacher du lien » : le repère devient un instantané (même base, révision suivante). */
export function detacherRepereLie(m: Modele, id: Id): ResultatRepereDocument {
  const r = m.annotations?.reperes?.[id];
  if (!r || r.source.mode !== "lie") return { ok: false, erreur: MESSAGES_REPERES_LIES.pasLie };
  const res = modifierAnnotations(m, (a) => {
    a.reperes[id] = { ...r, revision: r.revision + 1, source: { mode: "instantane" } };
  });
  return { ok: true, modele: res.modele, id };
}
