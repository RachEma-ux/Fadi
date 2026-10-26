import { fail, record } from "../noyau/validation.js";
import { STUDIO_FRAME_SCENES, validerCameraScene } from "../scenes/scenes.js";
import { STUDIO_NATURE_RENDU, STUDIO_RENDU_SCHEMA, studioProvenanceRendu, type StudioProvenanceRendu } from "../scenes/provenance.js";
import type { StudioCoutDeclare, StudioSourceTransfert } from "./politique-transfert.js";

/**
 * Provenance d'une illustration produite depuis une vue (EX-071, EX-072, AC-007, TEST-032 ; lot F, décision P-12).
 * Une illustration est une image **séparée** du modèle : elle cite le rendu du modèle dont elle dérive (étude, variante,
 * révision, scène, caméra, date), l'empreinte de cette image source et celle du document de la révision **avant et
 * après** la génération (identiques : le modèle n'a pas changé, sinon la provenance est refusée), les paramètres tels
 * qu'archivés, l'auteur, la date, le fournisseur (nature, version ou « inconnue »), les sources envoyées, les droits,
 * l'autorisation de transfert et le consentement, les coûts et quotas, le résultat, le **statut de vérification**
 * (toujours « non vérifiée » : ni métrique ni conforme) et les **limites de reproductibilité**. Rien n'est inventé :
 * une information absente est écrite « inconnue » ou « non évalué ». Pur : la date est fournie par l'appelant.
 */

export const STUDIO_ILLUSTRATION_SCHEMA = "studio-illustration/1" as const;
export const STUDIO_NATURE_ILLUSTRATION = "illustration" as const;
export const STUDIO_CLE_PROVENANCE_ILLUSTRATION = "fadi:illustration";
/** Mot-clé PNG de la provenance d'un rendu du modèle (le même que l'export de la vue 3D). */
export const STUDIO_CLE_PROVENANCE_RENDU = "fadi:rendu";

export const STUDIO_VERIFICATION_ILLUSTRATION = Object.freeze({
  statut: "non-verifiee" as const,
  portee: "Illustration : ni métrique, ni conforme, ni source de données BIM. Elle ne remplace ni le modèle, ni ses plans, ni ses quantités ; le modèle source n’a pas été modifié.",
});

export type StudioModeIllustration = "derivee-locale" | "ia-externe";

export interface StudioFournisseurIllustrationDeclare {
  id: string;
  nom: string;
  nature: "local-deterministe" | "ia-externe";
  /** null : inconnue (écrite « inconnue »). */
  version: string | null;
  /** Hôte du service externe ; null : aucun (local). */
  service: string | null;
  reseau: boolean;
}

export interface StudioReproductibilite {
  deterministe: boolean;
  /** Ce qui est garanti, et seulement cela. */
  garantie: string;
  /** Inconnues du fournisseur, signalées comme telles. */
  inconnues: string[];
}

export interface StudioProvenanceIllustration {
  schema: typeof STUDIO_ILLUSTRATION_SCHEMA;
  nature: typeof STUDIO_NATURE_ILLUSTRATION;
  mode: StudioModeIllustration;
  source: { rendu: StudioProvenanceRendu; empreinteImage: string };
  modele: { revisionId: string; empreinteAvant: string; empreinteApres: string; inchange: true };
  parametres: Record<string, unknown>;
  auteur: { id: string };
  date: string;
  fournisseur: { id: string; nom: string; nature: StudioFournisseurIllustrationDeclare["nature"]; version: string; service: string | null; reseau: boolean };
  sourcesEnvoyees: StudioSourceTransfert[];
  droits: string;
  autorisation: { transfert: "aucun" | "externe"; politique: string; consentement: { par: string; le: string; coutAccepte: StudioCoutDeclare | null } | null };
  couts: { montant: number; devise: string | null; origine: string };
  quotas: string;
  resultat: { format: "image/png"; empreinte: string; largeur: number; hauteur: number };
  verification: typeof STUDIO_VERIFICATION_ILLUSTRATION;
  reproductibilite: StudioReproductibilite;
}

const SHA = /^[0-9a-f]{64}$/;
const texte = (v: unknown, path: string): string => { if (typeof v !== "string" || !v.trim()) fail(path, "texte non vide attendu"); return v; };
const empreinte = (v: unknown, path: string): string => { if (typeof v !== "string" || !SHA.test(v)) fail(path, "empreinte SHA-256 attendue"); return v; };

/**
 * Provenance d'un rendu du modèle relue (bloc `fadi:rendu` du PNG source, produit par la vue 3D) ; refuse tout ce qui
 * n'est pas un rendu du modèle complet, plutôt que de compléter une provenance inconnue.
 */
export function studioLireProvenanceRendu(value: unknown): StudioProvenanceRendu {
  const o = record(value, ["schema", "nature", "etude", "variante", "revisionId", "scene", "date", "repere", "camera", "auteur"], "rendu", ["parametres", "documentHash"]);
  if (o["schema"] !== STUDIO_RENDU_SCHEMA) fail("rendu.schema", "schéma de rendu inconnu");
  if (o["nature"] !== STUDIO_NATURE_RENDU) fail("rendu.nature", "« rendu du modèle » attendu");
  if (o["repere"] !== STUDIO_FRAME_SCENES) fail("rendu.repere", "repère local-3d attendu");
  const ref = (v: unknown, path: string) => { const r = record(v, ["id", "nom"], path); return { id: texte(r["id"], `${path}.id`), nom: texte(r["nom"], `${path}.nom`) }; };
  const date = texte(o["date"], "rendu.date");
  if (Number.isNaN(Date.parse(date))) fail("rendu.date", "date ISO attendue");
  // TR-EX-071 : l'auteur du rendu fait partie de sa provenance ; un rendu sans auteur est une source inconnue.
  const a = record(o["auteur"], ["id"], "rendu.auteur", ["email"]);
  const auteur = { id: texte(a["id"], "rendu.auteur.id"), email: typeof a["email"] === "string" && a["email"].trim() ? a["email"] : null };
  const p = o["parametres"] === undefined ? undefined : record(o["parametres"], ["largeurPx", "hauteurPx", "qualite"], "rendu.parametres");
  return studioProvenanceRendu({
    etude: ref(o["etude"], "rendu.etude"), variante: ref(o["variante"], "rendu.variante"), revisionId: texte(o["revisionId"], "rendu.revisionId"),
    scene: o["scene"] === null ? null : ref(o["scene"], "rendu.scene"), date: new Date(date), camera: validerCameraScene(o["camera"], "rendu.camera"), auteur,
    ...(p ? { parametres: { largeurPx: p["largeurPx"] as number, hauteurPx: p["hauteurPx"] as number, qualite: p["qualite"] as string } } : {}),
    ...(o["documentHash"] !== undefined ? { documentHash: o["documentHash"] as string } : {}),
  });
}

/** Limites de reproductibilité déclarées (EX-072) : seul le fournisseur local déterministe promet les mêmes pixels. */
export function studioReproductibilite(f: StudioFournisseurIllustrationDeclare, inconnues: readonly string[] = []): StudioReproductibilite {
  if (f.nature === "local-deterministe") {
    return {
      deterministe: true,
      garantie: "Même image source, mêmes paramètres et même version du fournisseur local : mêmes pixels. Aucune fidélité géométrique n’est promise : c’est une illustration.",
      inconnues: [],
    };
  }
  return {
    deterministe: false,
    garantie: "L’image et les paramètres sont archivés ; une nouvelle génération n’est pas garantie identique, ni au pixel ni en géométrie (service externe, génération possiblement aléatoire).",
    inconnues: [...new Set(["graine et traitements internes du fournisseur", ...inconnues])],
  };
}

/** Ce qu'une nouvelle exécution peut promettre : « identique » seulement pour un fournisseur déterministe. */
export function studioPromesseReproduction(p: Pick<StudioProvenanceIllustration, "reproductibilite">): "identique" | "non-garantie" {
  return p.reproductibilite.deterministe ? "identique" : "non-garantie";
}

export interface EntreeProvenanceIllustration {
  rendu: StudioProvenanceRendu;
  empreinteImageSource: string;
  modele: { revisionId: string; empreinteAvant: string; empreinteApres: string };
  parametres: Record<string, unknown>;
  auteurId: string;
  date: Date;
  fournisseur: StudioFournisseurIllustrationDeclare;
  sourcesEnvoyees: StudioSourceTransfert[];
  droits: string | null;
  autorisation: { transfert: "aucun" | "externe"; politique: string; consentement: { par: string; le: Date; coutAccepte: StudioCoutDeclare | null } | null };
  cout: StudioCoutDeclare | null;
  quotas: string | null;
  inconnues: readonly string[];
  resultat: { empreinte: string; largeur: number; hauteur: number };
}

/** Provenance validée ; refuse une révision différente de celle du rendu et tout modèle modifié (AC-007). */
export function studioProvenanceIllustration(e: EntreeProvenanceIllustration): StudioProvenanceIllustration {
  if (!(e.date instanceof Date) || Number.isNaN(e.date.getTime())) fail("illustration.date", "date valide attendue");
  if (e.modele.revisionId !== e.rendu.revisionId) fail("illustration.modele.revisionId", "la révision du modèle doit être celle du rendu");
  const avant = empreinte(e.modele.empreinteAvant, "illustration.modele.empreinteAvant");
  const apres = empreinte(e.modele.empreinteApres, "illustration.modele.empreinteApres");
  if (avant !== apres) fail("illustration.modele", "le modèle source a changé pendant la génération : illustration refusée");
  const local = e.fournisseur.nature === "local-deterministe";
  if (local && (e.fournisseur.reseau || e.sourcesEnvoyees.length > 0 || e.autorisation.transfert !== "aucun")) fail("illustration.fournisseur", "un fournisseur local n’envoie rien");
  if (!local && (e.autorisation.transfert !== "externe" || !e.autorisation.consentement)) fail("illustration.autorisation", "transfert externe sans autorisation ni consentement");
  return {
    schema: STUDIO_ILLUSTRATION_SCHEMA, nature: STUDIO_NATURE_ILLUSTRATION, mode: local ? "derivee-locale" : "ia-externe",
    source: { rendu: structuredClone(e.rendu), empreinteImage: empreinte(e.empreinteImageSource, "illustration.source.empreinteImage") },
    modele: { revisionId: texte(e.modele.revisionId, "illustration.modele.revisionId"), empreinteAvant: avant, empreinteApres: apres, inchange: true },
    parametres: structuredClone(e.parametres), auteur: { id: texte(e.auteurId, "illustration.auteur") }, date: e.date.toISOString(),
    fournisseur: { id: e.fournisseur.id, nom: e.fournisseur.nom, nature: e.fournisseur.nature, version: e.fournisseur.version ?? "inconnue", service: e.fournisseur.service, reseau: e.fournisseur.reseau },
    sourcesEnvoyees: structuredClone(e.sourcesEnvoyees),
    droits: e.droits ?? (local ? "Image dérivée du rendu du projet : mêmes droits que le projet." : "non déclarés par le fournisseur"),
    autorisation: {
      transfert: e.autorisation.transfert, politique: e.autorisation.politique,
      consentement: e.autorisation.consentement ? { par: e.autorisation.consentement.par, le: e.autorisation.consentement.le.toISOString(), coutAccepte: e.autorisation.consentement.coutAccepte } : null,
    },
    couts: local ? { montant: 0, devise: null, origine: "aucun coût : traitement local" } : e.cout ? { montant: e.cout.montant, devise: e.cout.devise, origine: "coût déclaré par l’administrateur" } : fail("illustration.cout", "coût déclaré attendu pour un service externe"),
    quotas: local ? "sans objet : traitement local" : e.quotas ?? "non évalués",
    resultat: { format: "image/png", empreinte: empreinte(e.resultat.empreinte, "illustration.resultat.empreinte"), largeur: e.resultat.largeur, hauteur: e.resultat.hauteur },
    verification: STUDIO_VERIFICATION_ILLUSTRATION,
    reproductibilite: studioReproductibilite(e.fournisseur, e.inconnues),
  };
}
