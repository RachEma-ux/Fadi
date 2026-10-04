/**
 * Commandes des documents dérivés (lot 5) : vues et feuilles sont des définitions du modèle, créées, modifiées et
 * supprimées par commandes typées (journal, annuler / rétablir, synchronisation) ; leur dessin reste dérivé.
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import { lireParamsFeuille, type ParamsFeuille } from "../documents/feuilles.js";
import { lireParamsVue, type ParamsVue } from "../documents/vues.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;
const VUE = "vue" as Definition["classe"];
const FEUILLE = "feuille" as Definition["classe"];

function definitionDe(etat: ModeleAtelier, id: string, classe: Definition["classe"], libelle: string): Definition {
  const d = etat.definitions[id];
  if (!d || d.classe !== classe) throw new ErreurCommande("precondition", "id", `${libelle} inconnue : ${id}`);
  return d;
}

function poser(etat: ModeleAtelier, def: Definition, nouvelle: boolean): ResultatCommande {
  const effets = effetsVides();
  (nouvelle ? effets.crees : effets.modifies).push(def.id);
  return { etat: { ...etat, definitions: { ...etat.definitions, [def.id]: def } }, effets };
}

/** Paramètres fournis : soit `params`, soit les clés à plat (comme les autres commandes de création). */
const brutsDe = (p: Brut): Brut => (p["params"] && typeof p["params"] === "object" ? (p["params"] as Brut) : p);

const feuillesAvec = (etat: ModeleAtelier, vueId: string) => Object.values(etat.definitions).filter((d) => d.classe === FEUILLE && ((d.params as unknown as ParamsFeuille).vues ?? []).some((v) => v.vueId === vueId));

export const reducteursDocuments: Record<string, Reducteur> = {
  "vue.creer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("vue");
    if (etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const params = lireParamsVue(etat, brutsDe(p));
    return poser(etat, { id, classe: VUE, nom: params.titre, params: params as unknown as Brut, version: 1 }, true);
  },
  "vue.modifier": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = definitionDe(etat, id, VUE, "vue");
    const params = lireParamsVue(etat, { ...(d.params as Brut), ...((p["params"] as Brut | undefined) ?? {}) });
    return poser(etat, { ...d, nom: params.titre, params: params as unknown as Brut, version: d.version + 1 }, false);
  },
  "vue.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    definitionDe(etat, id, VUE, "vue");
    const feuilles = feuillesAvec(etat, id);
    const retirer = lire.booleen(p, "retirerDesFeuilles", false);
    if (feuilles.length && !retirer) throw new ErreurCommande("precondition", "id", `vue placée sur ${feuilles.length} feuille(s) (${feuilles.map((f) => (f.params as unknown as ParamsFeuille).numero).join(", ")}) : la retirer d'abord, ou demander retirerDesFeuilles`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    for (const f of feuilles) {
      const params = f.params as unknown as ParamsFeuille;
      definitions[f.id] = { ...f, params: { ...params, vues: params.vues.filter((v) => v.vueId !== id) } as unknown as Brut, version: f.version + 1 };
      effets.modifies.push(f.id);
    }
    return { etat: { ...etat, definitions }, effets };
  },
  "feuille.creer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("feuille");
    if (etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const params = lireParamsFeuille(etat, brutsDe(p));
    return poser(etat, { id, classe: FEUILLE, nom: `${params.numero} · ${params.titre}`, params: params as unknown as Brut, version: 1 }, true);
  },
  "feuille.modifier": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = definitionDe(etat, id, FEUILLE, "feuille");
    const params = lireParamsFeuille(etat, { ...(d.params as Brut), ...((p["params"] as Brut | undefined) ?? {}) });
    return poser(etat, { ...d, nom: `${params.numero} · ${params.titre}`, params: params as unknown as Brut, version: d.version + 1 }, false);
  },
  /** Place (ou déplace) une vue sur une feuille. */
  "feuille.placer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = definitionDe(etat, id, FEUILLE, "feuille");
    const actuels = d.params as unknown as ParamsFeuille;
    const vueId = lire.chaine(p, "vueId");
    const x = lire.nombre(p, "x")!;
    const y = lire.nombre(p, "y")!;
    const vues = [...actuels.vues.filter((v) => v.vueId !== vueId), { vueId, x, y }];
    const params = lireParamsFeuille(etat, { ...(actuels as unknown as Brut), vues });
    return poser(etat, { ...d, params: params as unknown as Brut, version: d.version + 1 }, false);
  },
  "feuille.retirer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = definitionDe(etat, id, FEUILLE, "feuille");
    const actuels = d.params as unknown as ParamsFeuille;
    const vueId = lire.chaine(p, "vueId");
    if (!actuels.vues.some((v) => v.vueId === vueId)) throw new ErreurCommande("precondition", "vueId", `vue absente de la feuille : ${vueId}`);
    return poser(etat, { ...d, params: { ...actuels, vues: actuels.vues.filter((v) => v.vueId !== vueId) } as unknown as Brut, version: d.version + 1 }, false);
  },
  "feuille.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    definitionDe(etat, id, FEUILLE, "feuille");
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

export type { ParamsVue, ParamsFeuille };
