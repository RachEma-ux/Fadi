/**
 * Relecture d'un modèle typé venu de l'extérieur (archive de projet, cahier §5.6) : rien n'entre dans la base
 * sans passer par les mêmes validateurs que les commandes. Chaque occurrence est revalidée (`validerParams`,
 * unités strictes, repères), les références croisées (niveau, calque, groupe, définition, hôte) sont contrôlées ;
 * la moindre anomalie refuse l'archive en entier avec la liste des erreurs — jamais de correction silencieuse.
 */
import { lireParamsVue3D } from "./commandes/vues3d.js";
import { lireParamsPlanche } from "./commandes/planches.js";
import { lireParamsReferentiel } from "./commandes/referentiels.js";
import { lireParamsEnsemble } from "./commandes/ensembles.js";
import { lireParamsEtatCalques } from "./commandes/etats-calques.js";
import { lireParamsVue } from "./documents/vues.js";
import { lireParamsFeuille } from "./documents/feuilles.js";
import { estClasse, estOntologie } from "./ontologie.js";
import { ErreurCommande } from "./commandes/base.js";
import { validerParams } from "./commandes/validation.js";
import { modeleVide, type ModeleAtelier, type OccurrenceQuelconque } from "./modele.js";

type Brut = Record<string, unknown>;
const estRecord = (v: unknown): v is Brut => typeof v === "object" && v !== null && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// Identifiants : texte libre (les calques du prototype portent leur nom), sans caractère de contrôle.
const ID = /^[^\u0000-\u001f]{1,200}$/u;

export type ResultatVerification = { ok: true; modele: ModeleAtelier } | { ok: false; erreurs: string[] };

/** Paramètres de réseau associatif (D-115) bien formés ; sinon le groupe est relu sans eux. */
function reseauValide(r: unknown): boolean {
  if (!estRecord(r)) return false;
  const liste = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  return liste(r["sources"]) && liste(r["copies"]) && Number.isInteger(r["nombre"]) && (typeof r["dx"] === "number" || typeof r["angle"] === "number");
}

export function verifierModele(brut: unknown): ResultatVerification {
  const erreurs: string[] = [];
  if (!estRecord(brut) || brut["version"] !== 1) return { ok: false, erreurs: ["modèle : version 1 attendue"] };
  const table = (cle: string): Brut => {
    const t = brut[cle];
    if (t === undefined) return {};
    if (!estRecord(t)) {
      erreurs.push(`${cle} : objet attendu`);
      return {};
    }
    for (const [id, v] of Object.entries(t)) {
      if (!ID.test(id)) erreurs.push(`${cle}.${id} : identifiant invalide`);
      if (!estRecord(v) || v["id"] !== id) erreurs.push(`${cle}.${id} : entrée invalide (id différent de la clé)`);
    }
    return t;
  };
  const modele = modeleVide();
  const niveaux = table("niveaux");
  for (const [id, n] of Object.entries(niveaux) as [string, Brut][]) {
    if (typeof n["nom"] !== "string" || !estNombre(n["elevation"]) || !estNombre(n["ordre"]) || !(n["hauteur"] === null || estNombre(n["hauteur"]))) erreurs.push(`niveaux.${id} : nom, altitude, hauteur ou ordre invalide`);
    else modele.niveaux[id] = { id, nom: n["nom"], elevation: n["elevation"], hauteur: (n["hauteur"] as number | null) ?? null, ordre: n["ordre"] };
  }
  for (const [id, c] of Object.entries(table("calques")) as [string, Brut][]) {
    if (typeof c["nom"] !== "string" || typeof c["visible"] !== "boolean" || typeof c["verrouille"] !== "boolean" || !estNombre(c["ordre"])) erreurs.push(`calques.${id} : calque invalide`);
    else modele.calques[id] = { id, nom: c["nom"], couleur: typeof c["couleur"] === "string" ? c["couleur"] : null, remplissage: typeof c["remplissage"] === "string" ? c["remplissage"] : null, visible: c["visible"], verrouille: c["verrouille"], ordre: c["ordre"], ...(typeof c["parentId"] === "string" && c["parentId"] ? { parentId: c["parentId"] } : {}), ...(c["gele"] === true ? { gele: true } : {}), ...(estRecord(c["proprietes"]) && Object.keys(c["proprietes"]).length ? { proprietes: c["proprietes"] as never } : {}) };
  }
  for (const c of Object.values(modele.calques)) if (c.parentId && !modele.calques[c.parentId]) erreurs.push(`calques.${c.id} : calque parent inconnu (${c.parentId})`);
  for (const [id, g] of Object.entries(table("groupes")) as [string, Brut][]) {
    if (typeof g["nom"] !== "string") erreurs.push(`groupes.${id} : nom attendu`);
    else modele.groupes[id] = { id, nom: g["nom"], ...(g["verrouille"] === true ? { verrouille: true as const } : {}), ...(estRecord(g["proprietes"]) && Object.keys(g["proprietes"]).length ? { proprietes: g["proprietes"] as never } : {}), ...(reseauValide(g["reseau"]) ? { reseau: g["reseau"] as never } : {}) };
  }
  for (const [id, d] of Object.entries(table("definitions")) as [string, Brut][]) {
    const classe = d["classe"];
    if ((!estClasse(classe) && !["bloc", "composant", "vue", "feuille", "reference-externe", "vue-3d", "planche", "referentiel-classification", "ensemble-affichage", "etat-calques", "famille", "regle", "catalogue"].includes(classe as string)) || typeof d["nom"] !== "string" || !estRecord(d["params"]) || !estNombre(d["version"])) erreurs.push(`definitions.${id} : définition invalide`);
    else modele.definitions[id] = { id, classe: classe as ModeleAtelier["definitions"][string]["classe"], nom: d["nom"], params: d["params"], version: d["version"] };
  }
  // Les objets sont validés contre le modèle candidat complet (un hôte peut être déclaré après son ouverture).
  const objetsBruts = table("objets");
  const candidat = { ...modele, objets: objetsBruts as unknown as ModeleAtelier["objets"] } as ModeleAtelier;
  for (const [id, o] of Object.entries(objetsBruts) as [string, Brut][]) {
    const classe = o["classe"];
    if (!estClasse(classe)) {
      erreurs.push(`objets.${id} : classe inconnue ${String(classe)}`);
      continue;
    }
    const ref = (cle: string, dans: Brut) => {
      const v = o[cle];
      if (v === null || v === undefined) return null;
      if (typeof v !== "string" || !dans[v]) {
        erreurs.push(`objets.${id} : ${cle} inconnu (${String(v)})`);
        return null;
      }
      return v;
    };
    const niveauId = ref("niveauId", modele.niveaux as unknown as Brut);
    const calqueId = ref("calqueId", modele.calques as unknown as Brut);
    const groupeId = ref("groupeId", modele.groupes as unknown as Brut);
    const definitionId = o["definitionId"] === "non-type" ? "non-type" : ref("definitionId", modele.definitions as unknown as Brut);
    if (!estRecord(o["params"])) {
      erreurs.push(`objets.${id} : paramètres absents`);
      continue;
    }
    try {
      const params = validerParams(candidat, classe, o["params"]);
      modele.objets[id] = { id, classe, niveauId, calqueId, groupeId, definitionId, phase: typeof o["phase"] === "string" ? o["phase"] : null, params, proprietes: estRecord(o["proprietes"]) ? (o["proprietes"] as OccurrenceQuelconque["proprietes"]) : {}, ...(o["verrouille"] === true ? { verrouille: true as const } : {}) } as OccurrenceQuelconque;
    } catch (err) {
      erreurs.push(`objets.${id} : ${err instanceof ErreurCommande ? `${err.chemin} — ${err.message}` : String(err)}`);
    }
  }
  for (const [id, r] of Object.entries(table("relations")) as [string, Brut][]) {
    if (typeof r["kind"] !== "string" || typeof r["sourceId"] !== "string" || typeof r["targetId"] !== "string") erreurs.push(`relations.${id} : relation invalide`);
    else modele.relations[id] = { id, kind: r["kind"] as ModeleAtelier["relations"][string]["kind"], sourceId: r["sourceId"], targetId: r["targetId"], params: estRecord(r["params"]) ? r["params"] : {} };
  }
  for (const [id, r] of Object.entries(table("references")) as [string, Brut][]) {
    if (typeof r["proprietaireId"] !== "string" || !["ok", "a-reparer", "libre"].includes(String(r["etat"]))) erreurs.push(`references.${id} : référence invalide`);
    else modele.references[id] = { id, proprietaireId: r["proprietaireId"], objetId: typeof r["objetId"] === "string" ? r["objetId"] : null, caracteristique: typeof r["caracteristique"] === "string" ? r["caracteristique"] : null, etat: r["etat"] as "ok", propositions: Array.isArray(r["propositions"]) ? (r["propositions"] as ModeleAtelier["references"][string]["propositions"]) : [] };
  }
  for (const [id, p] of Object.entries(table("problemes")) as [string, Brut][]) {
    if (typeof p["type"] !== "string" || typeof p["message"] !== "string") erreurs.push(`problemes.${id} : problème invalide`);
    else modele.problemes[id] = { id, type: p["type"] as ModeleAtelier["problemes"][string]["type"], objetId: typeof p["objetId"] === "string" ? p["objetId"] : null, message: p["message"] };
  }
  const site = brut["site"];
  if (site !== undefined) {
    if (!estRecord(site)) erreurs.push("site : objet attendu");
    else {
      const parcelle = site["parcelle"];
      if (parcelle !== null && parcelle !== undefined) {
        const o = estRecord(parcelle) ? parcelle["origineLocale"] : null;
        const sommets = estRecord(parcelle) ? parcelle["sommets"] : null;
        const cadastralOk = (c: unknown) => estRecord(c) && c["frame"] === "cadastral" && estNombre(c["x"]) && estNombre(c["y"]) && typeof c["crs"] === "string";
        if (!estRecord(parcelle) || !cadastralOk(o) || !Array.isArray(sommets) || !sommets.every((s) => estRecord(s) && cadastralOk(s["cadastral"]))) erreurs.push("site.parcelle : sommets et origine du repère local en coordonnées cadastrales attendus");
      }
      const emprise = site["emprise"];
      if (emprise !== null && emprise !== undefined && (!estRecord(emprise) || !Array.isArray(emprise["sommets"]) || !Array.isArray(emprise["sommetsCadastraux"]))) erreurs.push("site.emprise : sommets locaux et cadastraux attendus");
      if (!erreurs.some((e) => e.startsWith("site"))) {
        modele.site = {
          parcelle: (site["parcelle"] as ModeleAtelier["site"]["parcelle"]) ?? null,
          emprise: (site["emprise"] as ModeleAtelier["site"]["emprise"]) ?? null,
          hypotheses: Array.isArray(site["hypotheses"]) ? (site["hypotheses"] as ModeleAtelier["site"]["hypotheses"]) : [],
          sources: Array.isArray(site["sources"]) ? (site["sources"] as ModeleAtelier["site"]["sources"]) : [],
          structure: estRecord(site["structure"]) ? site["structure"] : null,
        };
      }
    }
  }
  if (estRecord(brut["proprietes"])) modele.proprietes = brut["proprietes"] as ModeleAtelier["proprietes"];
  if (brut["ontologies"] !== undefined) {
    const o = brut["ontologies"];
    if (!Array.isArray(o) || !o.every(estOntologie)) erreurs.push("ontologies : liste d'ontologies connues attendue");
    else if (o.length) modele.ontologies = [...new Set(o)];
  }
  // Vues puis feuilles (une feuille place des vues) : paramètres revalidés comme par les commandes.
  for (const classe of ["vue", "feuille"] as const) {
    for (const d of Object.values(modele.definitions)) {
      if (d.classe !== classe) continue;
      try {
        d.params = (classe === "vue" ? lireParamsVue(modele, d.params) : lireParamsFeuille(modele, d.params)) as unknown as Record<string, unknown>;
      } catch (err) {
        erreurs.push(`definitions.${d.id} : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  // Vues 3D enregistrées (D-053) et référentiels de classification (D-065) : paramètres revalidés comme par la commande.
  for (const d of Object.values(modele.definitions)) {
    if (d.classe !== "vue-3d" && d.classe !== "referentiel-classification" && d.classe !== "ensemble-affichage" && d.classe !== "etat-calques" && d.classe !== "planche") continue;
    try {
      d.params = (d.classe === "vue-3d" ? lireParamsVue3D(modele, d.params) : d.classe === "planche" ? lireParamsPlanche(modele, d.params) : d.classe === "ensemble-affichage" ? lireParamsEnsemble(modele, d.params) : d.classe === "etat-calques" ? lireParamsEtatCalques(modele, d.params) : lireParamsReferentiel(d.params)) as unknown as Record<string, unknown>;
    } catch (err) {
      erreurs.push(`definitions.${d.id} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true, modele };
}
