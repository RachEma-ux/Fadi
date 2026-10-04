/**
 * Modèle du navigateur du projet (L3a.1, fiches DA-05-01, DA-05-02, DA-05-04, DA-05-12) : niveaux, calques et objets
 * par classe du niveau actif, lus de l'`EtatModele`. Module pur. Tout est état d'affichage (R10) : rien ici ne
 * produit de commande.
 */
import { ONTOLOGIE, estClasseObjet, type EtatModele, type IdObjet, type ObjetModele } from "@parcours/atelier-model";
import { normaliser, type EtatVue } from "../socle";
import { nombreDe, texteNiveau } from "./format";

export interface LigneNiveau {
  readonly id: IdObjet;
  readonly nom: string;
  readonly detail: string;
  readonly ordre: number;
  readonly elevation: number | null;
}

export interface LigneCalque {
  readonly id: IdObjet;
  readonly nom: string;
  readonly couleur: string | null;
  readonly ordre: number;
  /** Visibilité de projet (paramètre du modèle) — distincte du masquage local de la vue. */
  readonly visibleProjet: boolean;
  readonly verrouille: boolean;
  /** Présent au niveau actif (D-021 : `niveauxPresence` absent = calque de projet sans restriction). */
  readonly presentAuNiveau: boolean;
}

export interface LigneObjet {
  readonly id: IdObjet;
  readonly libelle: string;
}

export interface GroupeClasse {
  readonly classe: string;
  readonly libelle: string;
  /** Effectif au niveau actif (après filtre). */
  readonly nombre: number;
  /** Effectif de la classe dans tout le projet. */
  readonly total: number;
  readonly objets: readonly LigneObjet[];
}

const objetsDe = (etat: EtatModele, classe: string): ObjetModele[] => Object.values(etat.objets).filter((o) => o.classe === classe);

const nomDe = (o: ObjetModele): string | null => {
  const p = o.params as unknown as Record<string, unknown>;
  for (const cle of ["nom", "repere", "texte", "code"] as const) {
    const v = p[cle];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

/** Libellé lisible d'un objet : nom, code, repère ou texte, sinon identifiant (jamais vide). */
export function libelleObjet(o: ObjetModele): string {
  const nom = nomDe(o);
  const p = o.params as unknown as Record<string, unknown>;
  const code = typeof p.code === "string" && p.code && p.code !== nom ? `${p.code} · ` : "";
  return nom ? `${code}${nom}` : o.id;
}

export function libelleClasse(classe: string): string {
  return estClasseObjet(classe) ? ONTOLOGIE[classe].libelle : classe;
}

/** Niveaux triés par `ordre`, puis altitude, puis identifiant. */
export function niveaux(etat: EtatModele): LigneNiveau[] {
  return objetsDe(etat, "niveau")
    .map((o) => {
      const p = o.params as unknown as Record<string, unknown>;
      return {
        id: o.id,
        nom: typeof p.nom === "string" && p.nom ? p.nom : o.id,
        detail: texteNiveau(p.elevation, p.hauteur),
        ordre: typeof p.ordre === "number" ? p.ordre : Number.MAX_SAFE_INTEGER,
        elevation: nombreDe(p.elevation),
      };
    })
    .sort((a, b) => a.ordre - b.ordre || (a.elevation ?? 0) - (b.elevation ?? 0) || a.id.localeCompare(b.id));
}

export function calques(etat: EtatModele, niveauActifId: IdObjet | null): LigneCalque[] {
  return objetsDe(etat, "calque")
    .map((o) => {
      const p = o.params as unknown as Record<string, unknown>;
      const presence = Array.isArray(p.niveauxPresence) ? (p.niveauxPresence as string[]) : null;
      return {
        id: o.id,
        nom: typeof p.nom === "string" && p.nom ? p.nom : o.id,
        couleur: typeof p.couleur === "string" ? p.couleur : null,
        ordre: typeof p.ordre === "number" ? p.ordre : Number.MAX_SAFE_INTEGER,
        visibleProjet: p.visible !== false,
        verrouille: p.verrouille === true,
        presentAuNiveau: presence === null || niveauActifId === null || presence.includes(niveauActifId),
      };
    })
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
}

/**
 * Objets du niveau actif groupés par classe (ordre de `ONTOLOGIE`), avec effectif du niveau et total du projet.
 * `filtre` : texte du champ de recherche du navigateur (libellé, identifiant ou classe, sans accents).
 */
export function objetsParClasse(etat: EtatModele, niveauActifId: IdObjet | null, filtre = ""): GroupeClasse[] {
  const q = normaliser(filtre);
  const totaux = new Map<string, number>();
  const parClasse = new Map<string, LigneObjet[]>();
  for (const o of Object.values(etat.objets)) {
    if (o.classe === "niveau" || o.classe === "calque") continue;
    if (o.niveauId === undefined) continue;
    totaux.set(o.classe, (totaux.get(o.classe) ?? 0) + 1);
    if (o.niveauId !== niveauActifId) continue;
    const libelle = libelleObjet(o);
    const libClasse = libelleClasse(o.classe);
    if (q && ![libelle, o.id, libClasse, o.classe].some((t) => normaliser(t).includes(q))) continue;
    const liste = parClasse.get(o.classe) ?? [];
    liste.push({ id: o.id, libelle });
    parClasse.set(o.classe, liste);
  }
  const rang = (c: string) => {
    const i = Object.keys(ONTOLOGIE).indexOf(c);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...parClasse.entries()]
    .sort((a, b) => rang(a[0]) - rang(b[0]) || a[0].localeCompare(b[0]))
    .map(([classe, objets]) => ({
      classe,
      libelle: libelleClasse(classe),
      nombre: objets.length,
      total: totaux.get(classe) ?? objets.length,
      objets: objets.sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { numeric: true }) || a.id.localeCompare(b.id)),
    }));
}

/** Objets de projet (sans niveau) hors niveaux et calques : parcelle, hypothèses, sources… — listés, jamais omis. */
export function objetsDeProjet(etat: EtatModele): GroupeClasse[] {
  const parClasse = new Map<string, LigneObjet[]>();
  for (const o of Object.values(etat.objets)) {
    if (o.niveauId !== undefined || o.classe === "niveau" || o.classe === "calque") continue;
    const liste = parClasse.get(o.classe) ?? [];
    liste.push({ id: o.id, libelle: libelleObjet(o) });
    parClasse.set(o.classe, liste);
  }
  return [...parClasse.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([classe, objets]) => ({ classe, libelle: libelleClasse(classe), nombre: objets.length, total: objets.length, objets }));
}

/**
 * Niveau et calque actifs valides pour l'état chargé : on garde ceux de la vue s'ils existent encore, sinon le
 * premier niveau par `ordre` et le premier calque visible et non verrouillé par `ordre` (un outil ne peut rien
 * créer sans calque : `EnTeteCreation.calqueId`). Rend seulement les champs à changer.
 */
export function vueValide(etat: EtatModele, vue: EtatVue): Partial<EtatVue> {
  const changement: { -readonly [K in keyof EtatVue]?: EtatVue[K] } = {};
  const n = niveaux(etat);
  if (!vue.niveauActifId || !n.some((x) => x.id === vue.niveauActifId)) {
    const premier = n[0]?.id ?? null;
    if (premier !== vue.niveauActifId) changement.niveauActifId = premier;
  }
  const niveauId = changement.niveauActifId !== undefined ? changement.niveauActifId : vue.niveauActifId;
  const c = calques(etat, niveauId);
  if (!vue.calqueActifId || !c.some((x) => x.id === vue.calqueActifId)) {
    const choisi = c.find((x) => x.visibleProjet && !x.verrouille && x.presentAuNiveau) ?? c.find((x) => !x.verrouille) ?? null;
    if ((choisi?.id ?? null) !== vue.calqueActifId) changement.calqueActifId = choisi?.id ?? null;
  }
  const masques = vue.calquesMasques.filter((id) => c.some((x) => x.id === id));
  if (masques.length !== vue.calquesMasques.length) changement.calquesMasques = masques;
  return changement;
}

/** Bascule le masquage local d'un calque (R10 : état d'affichage, jamais `calque.modifier`). */
export function basculerMasque(masques: readonly IdObjet[], calqueId: IdObjet): IdObjet[] {
  return masques.includes(calqueId) ? masques.filter((id) => id !== calqueId) : [...masques, calqueId];
}
