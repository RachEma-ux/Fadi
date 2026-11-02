/**
 * Repères enregistrés (chantier Axes, lot AX-3 ; concept Axes 1.0, § 6.1 et § 8.1). Pur : ni React, ni DOM.
 *
 * Un repère enregistré est une définition nommée du document (`annotations.reperes`) : identifiant stable (préfixe
 * « r », compteur du modèle), nom (une étiquette, jamais une clé), base validée, révision, version de schéma, source
 * (instantané en AX-3). Ses créations, renommages, mises à jour et suppressions sont des mutations du document : elles
 * passent par l'historique Annuler / Rétablir, à la différence du contexte de travail (AX-D3).
 *
 * Suppression d'un repère cité par une scène : refusée tant que la résolution n'est pas explicite ; « détacher » garde
 * l'instantané de la scène et retire seulement sa référence — jamais de substitution silencieuse par le modèle.
 */
import type { CaptureRepere, Repere, Scene } from "./annotations.js";
import { type Id, type Modele, modifierAnnotations } from "./geometrie-libre.js";
import { type ContexteTravail, type RepereEnregistre, VERSION_SCHEMA_REPERE, memeRepere, validerRepere } from "./reperes.js";

export type ResultatRepereDocument = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: string };

const refus = (erreur: string): ResultatRepereDocument => ({ ok: false, erreur });
const nomValide = (nom: string): string | null => {
  const n = nom.trim();
  return n === "" ? null : n.slice(0, 120);
};
const base = (r: Repere): Repere => ({ origine: r.origine, x: r.x, y: r.y, z: r.z });

export const MESSAGES_REPERES_ENREGISTRES = Object.freeze({
  nom: "Nom de repère vide : donnez un nom.",
  absent: "Ce repère enregistré n'existe plus.",
  references: "Ce repère est cité par une ou plusieurs scènes : choisissez de les détacher (elles gardent leur instantané) ou annulez.",
});

/** Repères enregistrés du document, par nom puis identifiant. */
export function reperesEnregistres(m: Modele): RepereEnregistre[] {
  return Object.values(m.annotations?.reperes ?? {}).sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.id.localeCompare(b.id));
}

/** Enregistre un nouveau repère (révision 1, instantané) ; la base est validée à la frontière de la commande. */
export function enregistrerRepere(m: Modele, nom: string, repere: Repere): ResultatRepereDocument {
  const n = nomValide(nom);
  if (!n) return refus(MESSAGES_REPERES_ENREGISTRES.nom);
  const v = validerRepere(repere);
  if (!v.ok) return refus(v.message);
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("r");
    a.reperes[k] = { ...base(v.repere), id: k, nom: n, revision: 1, version: VERSION_SCHEMA_REPERE, source: { mode: "instantane" } };
    return k;
  });
  return { ok: true, modele: r.modele, id: r.extra };
}

/** « Enregistrer les modifications » : nouvelle base, révision suivante, même identifiant et même nom. */
export function mettreAJourRepere(m: Modele, id: Id, repere: Repere): ResultatRepereDocument {
  const e = m.annotations?.reperes?.[id];
  if (!e) return refus(MESSAGES_REPERES_ENREGISTRES.absent);
  const v = validerRepere(repere);
  if (!v.ok) return refus(v.message);
  const r = modifierAnnotations(m, (a) => {
    a.reperes[id] = { ...e, ...base(v.repere), revision: e.revision + 1, source: { mode: "instantane" } };
  });
  return { ok: true, modele: r.modele, id };
}

/**
 * Renomme. Le nom est une étiquette, pas la définition : la révision (celle de la base, que citent les scènes et le
 * contexte actif) ne change pas.
 */
export function renommerRepere(m: Modele, id: Id, nom: string): ResultatRepereDocument {
  const e = m.annotations?.reperes?.[id];
  if (!e) return refus(MESSAGES_REPERES_ENREGISTRES.absent);
  const n = nomValide(nom);
  if (!n) return refus(MESSAGES_REPERES_ENREGISTRES.nom);
  const r = modifierAnnotations(m, (a) => {
    a.reperes[id] = { ...e, nom: n };
  });
  return { ok: true, modele: r.modele, id };
}

/** Duplique : nouvel identifiant, révision 1 (un nom identique n'est pas une identité). */
export function dupliquerRepere(m: Modele, id: Id, nom: string): ResultatRepereDocument {
  const e = m.annotations?.reperes?.[id];
  if (!e) return refus(MESSAGES_REPERES_ENREGISTRES.absent);
  return enregistrerRepere(m, nom, e);
}

/** Scènes qui citent ce repère enregistré (rappel de repère par identifiant). */
export function referencesRepere(m: Modele, id: Id): Scene[] {
  return Object.values(m.annotations?.scenes ?? {}).filter((s) => s.repere?.id === id);
}

/**
 * Supprime un repère enregistré. Cité par des scènes : refusé sans résolution ; `detacher` retire la référence des
 * scènes (leur instantané reste), dans le même pas d'historique.
 */
export function supprimerRepere(m: Modele, id: Id, resolution: "refuser" | "detacher" = "refuser"): ResultatRepereDocument {
  if (!m.annotations?.reperes?.[id]) return refus(MESSAGES_REPERES_ENREGISTRES.absent);
  const cites = referencesRepere(m, id);
  if (cites.length > 0 && resolution === "refuser") return refus(MESSAGES_REPERES_ENREGISTRES.references);
  const r = modifierAnnotations(m, (a) => {
    delete a.reperes[id];
    for (const s of cites) {
      const c = s.repere as CaptureRepere;
      a.scenes[s.id] = { ...s, repere: { instantane: c.instantane, plan: c.plan, verrou: c.verrou } };
    }
  });
  return { ok: true, modele: r.modele, id };
}

/** Active un repère enregistré : sa base, sa source (identifiant et révision) ; plan et verrou du contexte gardés. */
export function contexteEnregistre(c: ContexteTravail, r: RepereEnregistre): ContexteTravail {
  return { ...c, repere: base(r), source: { genre: "enregistre", id: r.id, revision: r.revision } };
}

/**
 * État du repère actif au regard du document : modèle, temporaire, enregistré (à jour), modifié (temporaire issu d'un
 * repère enregistré qui existe encore), périmé (repère enregistré changé depuis son activation) ou absent (supprimé).
 */
export type EtatRepereActif = "modele" | "temporaire" | "enregistre" | "modifie" | "perime" | "absent";

export function etatRepereActif(c: ContexteTravail, m: Modele): EtatRepereActif {
  const s = c.source;
  if (s.genre === "modele") return "modele";
  const reperes = m.annotations?.reperes ?? {};
  if (s.genre === "temporaire") {
    if (!s.depuis) return "temporaire";
    return reperes[s.depuis.id] ? "modifie" : "temporaire";
  }
  const e = reperes[s.id];
  if (!e) return "absent";
  return e.revision === s.revision || (c.repere && memeRepere(c.repere, e)) ? "enregistre" : "perime";
}

/** Capture du contexte pour une scène (option « Rappeler le repère ») : toujours un instantané, plus la référence. */
export function captureDuContexte(c: ContexteTravail, repere: Repere): CaptureRepere {
  const ref = c.source.genre === "enregistre" ? { id: c.source.id, revision: c.source.revision } : {};
  return { instantane: base(repere), ...ref, plan: c.plan, verrou: c.verrou };
}

/**
 * Contexte rappelé par une scène : le repère enregistré s'il existe encore à la révision capturée, sinon l'instantané
 * de la scène (contexte temporaire) — jamais une définition plus récente substituée en silence. `null` si l'instantané
 * est invalide (document altéré).
 */
export function contexteDeScene(c: ContexteTravail, capture: CaptureRepere, m: Modele): { contexte: ContexteTravail; perime: boolean } | null {
  const v = validerRepere(capture.instantane);
  if (!v.ok) return null;
  const e = capture.id ? m.annotations?.reperes?.[capture.id] : undefined;
  const plan = { plan: capture.plan, verrou: capture.verrou };
  if (e && e.revision === capture.revision) return { contexte: { ...c, ...plan, repere: base(e), source: { genre: "enregistre", id: e.id, revision: e.revision } }, perime: false };
  return { contexte: { ...c, ...plan, repere: v.repere, source: { genre: "temporaire" } }, perime: capture.id !== undefined };
}
