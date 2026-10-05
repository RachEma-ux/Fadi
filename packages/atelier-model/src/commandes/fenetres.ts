/**
 * Fenêtres jumelées et fenêtres d'angle (D-083, fiche DA-07-03) — des ouvertures ordinaires, regroupées :
 * - `ouverture.jumeler` { id, nombre (2 à 6), meneau (m) } : l'ouverture est partagée en `nombre` ouvertures égales
 *   séparées par des meneaux de la largeur saisie, dans la même emprise ; la première garde l'identifiant ;
 * - `ouverture.angle` { murA, murB, classe?, largeurA, largeurB, hauteur, allege? } : deux ouvertures sur deux murs
 *   joints en L (extrémité commune), chacune partant de la face intérieure de l'autre mur (murs alignés sur l'axe ;
 *   le poteau d'angle — croisement des deux murs — est conservé).
 * Aucune dimension par défaut (R3) ; mêmes contrôles d'emprise que la pose ; un groupe nommé réunit les pièces.
 */
import { distance, longueurAxeMur, memePoint } from "../geometrie.js";
import type { ModeleAtelier, Occurrence } from "../modele.js";
import { estOuverture } from "../ontologie.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, type ContexteCommande, type ResultatCommande } from "./base.js";
import { creerOccurrence } from "./objets.js";
import { validerParams } from "./validation.js";

type Brut = Record<string, unknown>;
const r9 = (v: number) => Math.round(v * 1e9) / 1e9;

function nouveauGroupe(etat: ModeleAtelier, ctx: ContexteCommande, nom: string): { etat: ModeleAtelier; id: string } {
  const id = ctx.ids.nouveau("groupe");
  return { etat: { ...etat, groupes: { ...etat.groupes, [id]: { id, nom } } }, id };
}

export function jumelerOuverture(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const o = etat.objets[id]!;
  if (!estOuverture(o.classe)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une ouverture`);
  const ouv = o as Occurrence<"fenetre">;
  const calque = o.calqueId ? etat.calques[o.calqueId] : null;
  if (calque?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calque.nom}`);
  const nombre = lire.nombre(p, "nombre", { entier: true, min: 2, max: 6 })!;
  const meneau = lire.longueur(p, "meneau", { strict: true })!.value;
  if (!(meneau > 0)) throw new ErreurCommande("invalide", "meneau", "largeur du meneau strictement positive");
  const mur = etat.objets[ouv.params.murHoteId] as Occurrence<"mur">;
  const L = longueurAxeMur(mur.params);
  const W = ouv.params.largeur.value;
  const w = (W - (nombre - 1) * meneau) / nombre;
  if (!(w > 0.01)) throw new ErreurCommande("precondition", "meneau", `meneaux trop larges : chaque ouverture ferait ${r9(w)} m`);
  const debut = ouv.params.position * L - W / 2;
  const centre = (k: number) => r9((debut + w / 2 + k * (w + meneau)) / L);
  const g = nouveauGroupe(etat, ctx, `${o.classe === "porte" ? "Portes" : o.classe === "fenetre" ? "Fenêtres" : "Baies"} jumelées (${nombre})`);
  let courant = g.etat;
  const premiers = validerParams(courant, o.classe as "fenetre", { ...ouv.params, largeur: { value: r9(w), unit: "m" }, position: centre(0) } as unknown as Brut);
  courant = { ...courant, objets: { ...courant.objets, [id]: { ...o, groupeId: g.id, params: premiers } as typeof o } };
  let effets = effetsVides();
  effets.modifies.push(id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  for (let k = 1; k < nombre; k++) {
    const r = creerOccurrence(courant, { classe: o.classe, calqueId: o.calqueId, definitionId: o.definitionId, groupeId: g.id, params: { ...ouv.params, repere: null, largeur: { value: r9(w), unit: "m" }, position: centre(k) } }, ctx, o.classe);
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  }
  return { etat: courant, effets };
}

export function ouvertureAngle(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const idA = lire.objet(etat, p, "murA");
  const idB = lire.objet(etat, p, "murB");
  const A = etat.objets[idA]!;
  const B = etat.objets[idB]!;
  if (A.classe !== "mur" || B.classe !== "mur") throw new ErreurCommande("precondition", "murA", "deux murs attendus");
  if (A.params.renflement || B.params.renflement) throw new ErreurCommande("precondition", "murA", "ouverture d'angle : murs droits seulement");
  if (A.params.alignement !== "axe" || B.params.alignement !== "axe") throw new ErreurCommande("precondition", "murA", "ouverture d'angle : murs alignés sur l'axe seulement");
  const classe = lire.enumeration(p, "classe", ["fenetre", "ouverture", "porte"] as const, "fenetre");
  const largeurA = lire.longueur(p, "largeurA", { strict: true })!.value;
  const largeurB = lire.longueur(p, "largeurB", { strict: true })!.value;
  const hauteur = lire.longueur(p, "hauteur", { strict: true })!;
  const allege = classe === "fenetre" ? lire.longueur(p, "allege", { strict: true }) : null;
  let coin: { ta: 0 | 1; tb: 0 | 1 } | null = null;
  for (const ta of [0, 1] as const) for (const tb of [0, 1] as const) if (memePoint(ta ? A.params.b : A.params.a, tb ? B.params.b : B.params.a, 1e-6)) coin = { ta, tb };
  if (!coin) throw new ErreurCommande("precondition", "murB", "les deux murs n'ont pas d'extrémité commune (joindre-les d'abord)");
  const place = (m: Occurrence<"mur">, t: 0 | 1, largeur: number, epAutre: number) => {
    const L = distance(m.params.a, m.params.b);
    const d = epAutre / 2 + largeur / 2;
    return r9((t ? L - d : d) / L);
  };
  const g = nouveauGroupe(etat, ctx, classe === "fenetre" ? "Fenêtre d'angle" : classe === "porte" ? "Porte d'angle" : "Baie d'angle");
  let courant = g.etat;
  let effets = effetsVides();
  for (const [m, t, largeur, epAutre] of [[A, coin.ta, largeurA, B.params.epaisseur.value], [B, coin.tb, largeurB, A.params.epaisseur.value]] as const) {
    const r = creerOccurrence(courant, { classe, groupeId: g.id, params: { murHoteId: m.id, position: place(m as Occurrence<"mur">, t, largeur, epAutre), largeur: { value: largeur, unit: "m" }, hauteur, allege, repere: null } }, ctx, classe);
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  }
  return { etat: courant, effets };
}
