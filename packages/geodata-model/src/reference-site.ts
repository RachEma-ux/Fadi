/**
 * Référence de site GeoData (feuille de route équipe A, PR P14 ; donnees-1 § 1.4) : forme figée et transmissible d'une
 * lecture de site. **Renvoi, pas copie** : aucune valeur (indicateur, compte, prix, altitude) n'y figure, seulement les
 * versions lues, leur empreinte et leurs métadonnées immuables ; sans expiration ; autoportante (GeoData ne la stocke
 * pas) ; aucun champ d'un autre module. Exclue avec son motif : toute lecture d'une version provisoire, privée, dont le
 * partage ou l'export n'est pas autorisé (un droit non lu vaut « inconnu »), ou de prix sans la capacité d'export.
 */
import { verifierUsage } from "./droits.js";
import { empreinteCanonique } from "./prix/hachage.js";
import type { EntreeSite, LectureSite, Provenance, Rubrique } from "./site.js";

export const FORMAT_REFERENCE_SITE = "geodata.reference-site/1" as const;

export type RubriqueSite = "unites" | "indicateurs" | "services" | "prix" | "terrain";

export interface LectureReferencee {
  readonly rubrique: RubriqueSite; readonly versionId: string; readonly empreinteVersion: string;
  readonly methode: string; readonly parametres: Readonly<Record<string, unknown>>; readonly provenance: Provenance;
}

export interface ReferenceSiteGeoData {
  readonly format: typeof FORMAT_REFERENCE_SITE;
  /** Instant ISO de la constitution (affiché en heure suisse). */
  readonly constitueeLe: string;
  readonly entree: EntreeSite & { readonly geometrie: { readonly type: "Point"; readonly coordinates: readonly [number, number] } | null };
  readonly lectures: readonly LectureReferencee[];
  readonly exclusions: readonly { readonly rubrique: RubriqueSite; readonly versionId: string | null; readonly motif: string }[];
  /** Empreinte canonique (SHA-256) de la référence sans ce champ. */
  readonly empreinte: string;
}

const METHODES: Readonly<Record<RubriqueSite, string>> = {
  unites: "unites-au-point", indicateurs: "fiche-objet", services: "proximite", prix: "agregats-publies", terrain: "terrain-point",
};

/** Motif d'exclusion d'une provenance, ou null si elle est transmissible. */
function motifExclusion(p: Provenance, rubrique: RubriqueSite, capacitesPrix: readonly string[]): string | null {
  if (p.qualification?.etat === "provisoire") return "Source provisoire, non qualifiée : exclue de la transmission.";
  if (p.privee) return "Données importées personnelles : partage refusé.";
  if (!p.empreinte) return "Empreinte de la version non lue : renvoi impossible.";
  if (!p.droits) return "Droits de la version non lus : partage non qualifié.";
  for (const usage of ["partage", "export"] as const) { const v = verifierUsage(p.droits, usage); if (!v.ok) return v.motif; }
  if (rubrique === "prix" && !capacitesPrix.includes("prix-exporter")) return "Prix : capacité d'export absente pour ce compte.";
  return null;
}

/**
 * Constitue la référence d'une lecture de site : une ligne par version lue et transmissible, une exclusion motivée pour
 * les autres (une rubrique non évaluée n'a pas de version et n'apparaît pas). Deux constitutions identiques au même
 * instant donnent la même empreinte.
 */
export function constituerReferenceSite(l: LectureSite, capacitesPrix: readonly string[], maintenant: Date): ReferenceSiteGeoData {
  const lectures: LectureReferencee[] = [];
  const exclusions: { rubrique: RubriqueSite; versionId: string | null; motif: string }[] = [];
  const parametres = l.entree.rayonM ? { rayonM: l.entree.rayonM } : {};
  const rubriques: [RubriqueSite, Rubrique<unknown>][] = [["unites", l.unites], ["indicateurs", l.indicateurs], ["services", l.services], ["prix", l.prix], ["terrain", l.terrain]];
  for (const [rubrique, r] of rubriques) {
    if (r.etat !== "evaluee") continue;
    if (!r.provenance.length) { exclusions.push({ rubrique, versionId: null, motif: "Version de la lecture non lue : renvoi impossible." }); continue; }
    for (const p of r.provenance) {
      const motif = motifExclusion(p, rubrique, capacitesPrix);
      if (motif) exclusions.push({ rubrique, versionId: p.versionId, motif });
      else lectures.push({ rubrique, versionId: p.versionId, empreinteVersion: p.empreinte!, methode: METHODES[rubrique], parametres: rubrique === "services" ? parametres : rubrique === "terrain" ? { produit: "MNT" } : {}, provenance: p });
    }
  }
  const pt = l.entree.point;
  const sans = {
    format: FORMAT_REFERENCE_SITE, constitueeLe: maintenant.toISOString(),
    entree: { ...l.entree, geometrie: pt ? { type: "Point" as const, coordinates: [pt.lon, pt.lat] as const } : null },
    lectures, exclusions,
  };
  return { ...sans, empreinte: empreinteCanonique(sans) };
}

/** Vérifie une référence reçue : format, forme, et empreinte recalculée (une valeur modifiée est refusée). */
export function verifierEmpreinteReference(r: unknown): { ok: true; reference: ReferenceSiteGeoData } | { ok: false; erreur: string } {
  if (!r || typeof r !== "object") return { ok: false, erreur: "Référence attendue (objet)." };
  const x = r as Record<string, unknown>;
  if (x["format"] !== FORMAT_REFERENCE_SITE) return { ok: false, erreur: `Format attendu : ${FORMAT_REFERENCE_SITE}.` };
  if (typeof x["empreinte"] !== "string" || !Array.isArray(x["lectures"]) || !Array.isArray(x["exclusions"]) || typeof x["constitueeLe"] !== "string") return { ok: false, erreur: "Référence incomplète." };
  const { empreinte, ...sans } = x;
  if (empreinteCanonique(sans) !== empreinte) return { ok: false, erreur: "Empreinte invalide : la référence a été modifiée." };
  return { ok: true, reference: r as ReferenceSiteGeoData };
}
