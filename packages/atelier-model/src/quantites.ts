/**
 * Quantités reproductibles depuis une révision (DA-16-10, recette B.17) : surfaces de pièces (calculées et
 * déclarées, écart signalé), murs (effectif, longueur d'axe, surface axe × hauteur quand la hauteur est connue),
 * ouvertures par classe, dalles (aire brute et nette), poteaux, escaliers, solides. Ordre déterministe par
 * identifiant : deux appels sur le même état donnent la même sortie.
 */
import { aire, aireNette, longueurAxeMur } from "./geometrie.js";
import type { ModeleAtelier } from "./modele.js";
import { niveauxOrdonnes, objetsDeClasse } from "./modele.js";
import { TOLERANCE_AIRE_ABS, TOLERANCE_AIRE_REL } from "./unites.js";

export interface QuantitePiece {
  id: string;
  code: string | null;
  nom: string;
  categorie: string | null;
  aireCalculee: number;
  aireDeclaree: number | null;
  /** Écart au-delà de la tolérance (D-012) : à signaler, jamais corrigé en silence. */
  ecartSignale: boolean;
  /** Hauteur propre déclarée et volume (aire calculée × hauteur), D-059 ; absents si la hauteur ne l'est pas. */
  hauteur?: number;
  volume?: number;
}

export interface QuantitesNiveau {
  niveauId: string;
  nom: string;
  elevation: number;
  pieces: QuantitePiece[];
  airePieces: number;
  murs: { nombre: number; longueurAxe: number; surfaceAxeHauteur: number; sansHauteur: number };
  ouvertures: { portes: number; fenetres: number; ouvertures: number };
  dalles: { nombre: number; aireBrute: number; aireNette: number; parUsage?: Record<string, { nombre: number; aireNette: number }> };
  toitures: { nombre: number; aire: number };
  poteaux: number;
  escaliers: number;
  solides: number;
}

export interface Quantites {
  niveaux: QuantitesNiveau[];
  totaux: { airePieces: number; murs: number; longueurMurs: number; portes: number; fenetres: number; ouvertures: number; dalles: number; aireDalles: number; poteaux: number; escaliers: number; pieces: number };
}

const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;
const parId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function quantites(etat: ModeleAtelier): Quantites {
  const niveaux: QuantitesNiveau[] = niveauxOrdonnes(etat).map((n) => {
    const pieces = objetsDeClasse(etat, "piece", n.id)
      .sort(parId)
      .map((p) => {
        const aireCalculee = arrondi(aireNette(p.params.contour, p.params.trous));
        const aireDeclaree = p.params.aireDeclaree?.value ?? null;
        const ecart = aireDeclaree === null ? 0 : Math.abs(aireDeclaree - aireCalculee);
        return {
          id: p.id,
          code: p.params.code,
          nom: p.params.nom,
          categorie: p.params.categorie,
          aireCalculee,
          aireDeclaree,
          ecartSignale: aireDeclaree !== null && ecart > Math.max(TOLERANCE_AIRE_ABS, TOLERANCE_AIRE_REL * Math.max(aireDeclaree, aireCalculee)),
          ...(p.params.hauteur ? { hauteur: p.params.hauteur.value, volume: arrondi(aireCalculee * p.params.hauteur.value) } : {}),
        };
      });
    const murs = objetsDeClasse(etat, "mur", n.id).sort(parId);
    let longueurAxe = 0;
    let surfaceAxeHauteur = 0;
    let sansHauteur = 0;
    for (const m of murs) {
      const l = longueurAxeMur(m.params); // mur courbe : longueur de l'arc (D-086)
      longueurAxe += l;
      if (m.params.hauteur) surfaceAxeHauteur += l * m.params.hauteur.value;
      else sansHauteur++;
    }
    const dalles = objetsDeClasse(etat, "dalle", n.id);
    const toitures = objetsDeClasse(etat, "toiture", n.id);
    return {
      niveauId: n.id,
      nom: n.nom,
      elevation: n.elevation,
      pieces,
      airePieces: arrondi(pieces.reduce((s, p) => s + p.aireCalculee, 0)),
      murs: { nombre: murs.length, longueurAxe: arrondi(longueurAxe), surfaceAxeHauteur: arrondi(surfaceAxeHauteur), sansHauteur },
      ouvertures: {
        portes: objetsDeClasse(etat, "porte", n.id).length,
        fenetres: objetsDeClasse(etat, "fenetre", n.id).length,
        ouvertures: objetsDeClasse(etat, "ouverture", n.id).length,
      },
      dalles: {
        nombre: dalles.length,
        aireBrute: arrondi(dalles.reduce((s, d) => s + aire(d.params.contour), 0)),
        aireNette: arrondi(dalles.reduce((s, d) => s + aireNette(d.params.contour, d.params.trous), 0)),
        // Par usage déclaré (D-059), seulement si au moins une dalle en porte un ; « non-renseigne » pour les autres.
        ...(dalles.some((d) => d.params.usage)
          ? {
              parUsage: Object.fromEntries(
                Object.entries(
                  [...dalles].sort(parId).reduce<Record<string, { nombre: number; aireNette: number }>>((acc, d) => {
                    const k = d.params.usage ?? "non-renseigne";
                    const q = acc[k] ?? { nombre: 0, aireNette: 0 };
                    acc[k] = { nombre: q.nombre + 1, aireNette: arrondi(q.aireNette + aireNette(d.params.contour, d.params.trous)) };
                    return acc;
                  }, {}),
                ).sort(([a], [b]) => (a < b ? -1 : 1)),
              ),
            }
          : {}),
      },
      toitures: { nombre: toitures.length, aire: arrondi(toitures.reduce((s, t) => s + aireNette(t.params.contour, t.params.trous), 0)) },
      poteaux: objetsDeClasse(etat, "poteau", n.id).length,
      escaliers: objetsDeClasse(etat, "escalier", n.id).length,
      solides: objetsDeClasse(etat, "solide", n.id).length,
    };
  });
  const somme = (f: (q: QuantitesNiveau) => number) => arrondi(niveaux.reduce((s, q) => s + f(q), 0));
  return {
    niveaux,
    totaux: {
      airePieces: somme((q) => q.airePieces),
      murs: somme((q) => q.murs.nombre),
      longueurMurs: somme((q) => q.murs.longueurAxe),
      portes: somme((q) => q.ouvertures.portes),
      fenetres: somme((q) => q.ouvertures.fenetres),
      ouvertures: somme((q) => q.ouvertures.ouvertures),
      dalles: somme((q) => q.dalles.nombre),
      aireDalles: somme((q) => q.dalles.aireNette),
      poteaux: somme((q) => q.poteaux),
      escaliers: somme((q) => q.escaliers),
      pieces: somme((q) => q.pieces.length),
    },
  };
}
