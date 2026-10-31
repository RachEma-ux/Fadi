/**
 * Agrégats publiés par un tiers (Concept Prix v1.1 §4, Plan §5 — baromètre FeenWay), annexe `prixPublies` d'une fiche
 * GeoData : lecture du CSV (RFC 4180, guillemets et virgules dans les champs : `lireCsv` du modèle partagé), validation
 * (`lireAgregatsFeenway`), puis rattachement géographique :
 *  - niveau `ville` → l'objet de la couche dont la propriété `ville_source` porte le même nom (normalisé) : `exact` ;
 *    plusieurs objets → `ambigu` (aucun code) ; aucun → `non-rattache` ;
 *  - quartier commercial → toujours `non-rattache`, code nul (PRX06 : un quartier commercial n'est pas une unité
 *    administrative ; il reste une étiquette de la source, servie en tableau sous sa commune, sans polygone).
 * Valeurs reprises telles que publiées : les montants passent en texte décimal exact (centimes), jamais recalculés.
 * Logique pure : aucune base, aucune donnée embarquée (D-GD-29).
 */
import {
  centimesEnTexte, lireAgregatsFeenway, lireCsv, normaliserLibelleLocalite,
  type AgregatPublie, type ResultatLectureAgregats,
} from "@parcours/geodata-model";

/** Propriété des objets de la couche qui porte le nom de ville de l'éditeur (convention des fiches `prixPublies`). */
export const PROPRIETE_VILLE_SOURCE = "ville_source";

export type EtatRattachementAgregat = "exact" | "non-rattache" | "ambigu";

/** Ligne prête à écrire dans `geodata_prix_agregats_publies` (montants en texte décimal exact pour `numeric`). */
export interface LignePrixPublie {
  readonly ordre: number;
  readonly editeur: string;
  readonly ville: string;
  readonly niveauGeo: AgregatPublie["niveauGeo"];
  readonly libelleGeo: string;
  readonly codeRattache: string | null;
  readonly etatRattachement: EtatRattachementAgregat;
  readonly typeBien: AgregatPublie["typeBien"];
  readonly typeBienOriginal: string;
  readonly transaction: AgregatPublie["transaction"];
  readonly nombreAnnonces: number;
  readonly prixMedian: string | null;
  readonly prixMedianApproximatif: boolean | null;
  readonly prixMedianTexte: string;
  readonly prixM2: string | null;
  readonly prixM2Texte: string;
  readonly unite: string;
  readonly uniteM2: string;
  readonly tendance90j: number | null;
  readonly periodeDebut: string;
  readonly periodeFin: string;
  readonly periode: string;
  readonly sourceUrl: string;
  readonly licence: string;
}

/** Lit et valide le CSV d'un baromètre (en-tête `ENTETES_FEENWAY`) ; une ligne en erreur n'est jamais retenue. */
export function lirePrixPublies(texte: string, edition: string): ResultatLectureAgregats {
  return lireAgregatsFeenway(lireCsv(texte), { edition });
}

/** Objet de la couche candidat au rattachement : code et nom de ville de l'éditeur (propriété `ville_source`). */
export interface ObjetVille { readonly code: string; readonly villeSource: string | null }

/** Rattache chaque agrégat (voir l'en-tête) et le met en forme pour l'écriture ; l'ordre du fichier est conservé. */
export function rattacherAgregats(agregats: readonly AgregatPublie[], objets: readonly ObjetVille[]): LignePrixPublie[] {
  const parVille = new Map<string, string[]>();
  for (const o of objets) {
    if (!o.villeSource) continue;
    const k = normaliserLibelleLocalite(o.villeSource);
    if (!k) continue;
    parVille.set(k, [...(parVille.get(k) ?? []), o.code]);
  }
  return agregats.map((a) => {
    let codeRattache: string | null = null;
    let etatRattachement: EtatRattachementAgregat = "non-rattache";
    if (a.niveauGeo === "ville") {
      const codes = parVille.get(normaliserLibelleLocalite(a.ville)) ?? [];
      if (codes.length === 1) { codeRattache = codes[0]!; etatRattachement = "exact"; }
      else if (codes.length > 1) etatRattachement = "ambigu";
    }
    return {
      ordre: a.ligne,
      editeur: a.editeur,
      ville: a.ville,
      niveauGeo: a.niveauGeo,
      libelleGeo: a.libelleGeo,
      codeRattache,
      etatRattachement,
      typeBien: a.typeBien,
      typeBienOriginal: a.typeBienOriginal,
      transaction: a.transaction,
      nombreAnnonces: a.nombreAnnonces,
      prixMedian: a.prixMedian ? centimesEnTexte(a.prixMedian.centimes) : null,
      prixMedianApproximatif: a.prixMedian ? a.prixMedian.approximatif : null,
      prixMedianTexte: a.prixMedian?.texteOriginal ?? "",
      prixM2: a.prixMedianM2 ? centimesEnTexte(a.prixMedianM2.centimes) : null,
      prixM2Texte: a.prixMedianM2?.texteOriginal ?? "",
      unite: a.unite,
      uniteM2: a.uniteM2,
      tendance90j: a.tendance90j,
      periodeDebut: a.periode.debut,
      periodeFin: a.periode.fin,
      periode: `${a.periode.debut}/${a.periode.fin}`,
      sourceUrl: a.sourceUrl,
      licence: a.licence,
    };
  });
}
