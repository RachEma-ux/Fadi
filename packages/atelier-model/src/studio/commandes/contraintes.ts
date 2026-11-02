import {
  STUDIO_LIMITES_CONTRAINTES, studioEvaluerContrainte, studioModeTangence, studioRefusContrainte, studioResoudreContraintes, validerContrainte,
  type StudioContrainte,
} from "../contraintes/contraintes.js";
import { array, fail, idList, record } from "../noyau/validation.js";
import { calqueEtat, followLinks, freeId, shapeMap, type Etat, type Gestionnaire } from "./etat.js";
import { suivreAnnotations } from "./annotations.js";

/**
 * Commande des contraintes géométriques (X.1-01, `contraintes/contraintes.ts`) : `studio.contrainte.poser` pose de
 * nouvelles contraintes (`contraintes`) et / ou résout des contraintes « à résoudre » (`resoudre`), puis résout le
 * système qu'elles forment avec les contraintes satisfaites qui partagent leurs objets ; la géométrie changée est
 * écrite dans les formes (mêmes identités), les cotes et cotes angulaires liées la suivent. Un système insatisfaisable
 * ou sur-contraint refuse le lot. Une contrainte se retire par Supprimer (`studio.dessin.supprimer`).
 * Après chaque lot, `suivreContraintes` marque « à résoudre » toute contrainte que la géométrie ne satisfait plus.
 */

export const poserContraintes: Gestionnaire = (state, params, path) => {
  const p = record(params, [], `${path}.params`, ["contraintes", "resoudre"]);
  const nouvelles = Object.hasOwn(p, "contraintes") ? array(p.contraintes, `${path}.params.contraintes`).map((c, i) => validerContrainte(c, `${path}.params.contraintes[${i}]`)) : [];
  const aResoudre = Object.hasOwn(p, "resoudre") ? idList(p.resoudre, `${path}.params.resoudre`) : [];
  if (!nouvelles.length && !aResoudre.length) fail(`${path}.params`, "au moins une contrainte à poser ou à résoudre attendue");
  const formes = shapeMap(state);
  const vues = new Set<string>();
  for (const [i, c] of nouvelles.entries()) {
    if (c.aResoudre) fail(`${path}.params.contraintes[${i}].aResoudre`, "l’état à résoudre naît d’une commande qui rompt la contrainte, il n’est jamais saisi");
    if (vues.has(c.id)) fail(`${path}.params.contraintes`, `identifiant répété : ${c.id}`);
    vues.add(c.id);
    freeId(state, c.id, path);
    const refus = studioRefusContrainte(c, formes);
    if (refus) fail(`${path}.params.contraintes[${i}]`, `contrainte ${c.id} : ${refus}`);
    // Tangence de deux courbes : mode choisi d'après la géométrie actuelle, jamais deviné ensuite.
    if (c.type === "tangence" && !c.tangence) { const m = studioModeTangence(c, formes); if (m) c.tangence = m; }
  }
  if (state.contraintes.length + nouvelles.length > STUDIO_LIMITES_CONTRAINTES.contraintes) fail(path, `${STUDIO_LIMITES_CONTRAINTES.contraintes} contraintes au plus`);
  const index = new Map(state.contraintes.map((c) => [c.id, c]));
  const demandees = new Set(aResoudre);
  for (const id of aResoudre) {
    const c = index.get(id);
    if (!c) fail(`${path}.params.resoudre`, state.ids.has(id) ? `ce n’est pas une contrainte : ${id}` : `contrainte introuvable : ${id}`);
    const refus = studioRefusContrainte(c, formes);
    if (refus) fail(`${path}.params.resoudre`, `contrainte ${id} : ${refus} — retirez-la ou rétablissez sa cible`);
  }
  // Composante connexe : contraintes existantes qui partagent un objet avec le système, de proche en proche.
  const systeme: StudioContrainte[] = [];
  const dans = new Set<string>();
  const objets = new Set<string>();
  const ajouter = (c: StudioContrainte) => { if (dans.has(c.id)) return; dans.add(c.id); systeme.push(c); for (const x of c.cibles) objets.add(x.objet); };
  for (const id of aResoudre) ajouter(index.get(id)!);
  for (const c of nouvelles) ajouter(c);
  for (let change = true; change;) {
    change = false;
    for (const c of state.contraintes) {
      if (dans.has(c.id) || !c.cibles.some((x) => objets.has(x.objet))) continue;
      if (c.aResoudre && !demandees.has(c.id)) fail(path, `la contrainte liée ${c.id} est aussi à résoudre : résolvez-les ensemble`);
      ajouter(c);
      change = true;
    }
  }
  // Existantes d'abord : en cas de sur-contrainte, la contrainte nommée est la nouvelle.
  systeme.sort((a, b) => Number(vues.has(a.id)) - Number(vues.has(b.id)));
  const fixes = new Set([...objets].filter((id) => { const o = formes.get(id); return !!o && calqueEtat(state, o.layerId, path).locked; }));
  const r = studioResoudreContraintes(formes, systeme.map(({ aResoudre: _a, ...c }) => c), fixes, path);
  for (const o of r.formes) {
    const i = state.objects.findIndex((x) => x.id === o.id);
    state.objects[i] = o;
  }
  for (const o of r.formes) { followLinks(state, o.id, path); suivreAnnotations(state, o.id, path); }
  state.contraintes = state.contraintes.map((c) => {
    if (!demandees.has(c.id)) return c;
    const { aResoudre: _a, ...reste } = c;
    return reste;
  });
  for (const c of nouvelles) { state.contraintes.push(c); state.ids.add(c.id); }
};

/**
 * Après un lot : toute contrainte que la géométrie ne satisfait plus (ou dont une cible a disparu, ou ne convient plus)
 * passe « à résoudre », géométrie gardée — jamais recalculée sans demande.
 */
export function suivreContraintes(state: Etat): void {
  if (!state.contraintes.length) return;
  const formes = shapeMap(state);
  state.contraintes = state.contraintes.map((c) => {
    if (c.aResoudre) return c;
    return studioEvaluerContrainte(c, formes).statut === "satisfaite" ? c : { ...c, aResoudre: true };
  });
}
