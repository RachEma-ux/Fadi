/**
 * Fichier de bibliothèque (D-050) — pur. Export des définitions d'un projet (types, blocs, composants ; ni vues, ni
 * feuilles, ni références externes) avec les calques du contenu des blocs, au format `fadi-bibliotheque/1` ; import :
 * le fichier est relu et validé, puis repris comme une bibliothèque partagée (famille « définitions » de la reprise,
 * D-031) — mêmes règles d'homonymes, provenance « fichier », aucune valeur ajoutée.
 */
import { estClasse } from "../ontologie.js";
import { modeleVide, type Calque, type Definition, type ModeleAtelier } from "../modele.js";

export const FORMAT_BIBLIOTHEQUE = "fadi-bibliotheque/1";

export interface FichierBibliotheque {
  format: typeof FORMAT_BIBLIOTHEQUE;
  nom: string;
  definitions: Definition[];
  calques: Calque[];
}

const EXCLUES = ["vue", "feuille", "reference-externe", "vue-3d", "referentiel-classification"];

export function exporterBibliotheque(etat: ModeleAtelier, nom: string, bibliotheque?: string): FichierBibliotheque {
  const definitions = Object.values(etat.definitions)
    .filter((d) => !EXCLUES.includes(d.classe as string))
    .filter((d) => !bibliotheque || (d.params as { bibliotheque?: string | null }).bibliotheque === bibliotheque)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const ids = new Set<string>();
  for (const d of definitions) for (const e of ((d.params as { contenu?: { calqueId?: string | null }[] }).contenu ?? [])) if (e.calqueId) ids.add(e.calqueId);
  const calques = [...ids].map((id) => etat.calques[id]).filter((c): c is Calque => !!c);
  return { format: FORMAT_BIBLIOTHEQUE, nom, definitions, calques };
}

/** Relit un fichier de bibliothèque ; lève une erreur explicite s'il n'est pas lisible. Rend un modèle source. */
export function modeleDepuisBibliotheque(texte: string): { modele: ModeleAtelier; nom: string } {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error("Fichier de bibliothèque illisible (JSON attendu).");
  }
  const f = brut as Partial<FichierBibliotheque>;
  if (!f || f.format !== FORMAT_BIBLIOTHEQUE) throw new Error(`Format inconnu : « ${String(f?.format)} » (attendu ${FORMAT_BIBLIOTHEQUE}).`);
  if (!Array.isArray(f.definitions) || !f.definitions.length) throw new Error("Le fichier ne contient aucune définition.");
  const definitions: Record<string, Definition> = {};
  f.definitions.forEach((d, i) => {
    const classe = d?.classe as string;
    const ok = d && typeof d.id === "string" && d.id && typeof d.nom === "string" && d.params && typeof d.params === "object" && typeof d.version === "number" && (estClasse(classe as never) || ["bloc", "composant"].includes(classe)) && !EXCLUES.includes(classe);
    if (!ok) throw new Error(`Définition ${i + 1} invalide (identifiant, nom, classe, paramètres, version).`);
    if (definitions[d.id]) throw new Error(`Définition en double : ${d.id}.`);
    definitions[d.id] = { id: d.id, classe: d.classe, nom: d.nom, params: d.params, version: d.version };
  });
  const calques: Record<string, Calque> = {};
  for (const c of Array.isArray(f.calques) ? f.calques : []) {
    if (!c || typeof c.id !== "string" || typeof c.nom !== "string") throw new Error("Calque invalide dans le fichier.");
    calques[c.id] = { id: c.id, nom: c.nom, couleur: c.couleur ?? null, remplissage: c.remplissage ?? null, visible: c.visible !== false, verrouille: false, ordre: Number(c.ordre) || 0 };
  }
  const vide = modeleVide();
  return { modele: { ...vide, definitions, calques }, nom: typeof f.nom === "string" && f.nom.trim() ? f.nom.trim() : "Bibliothèque" };
}
