/**
 * Assistant à boucle contrôlée (lot 8, D4, T19) — pur.
 *
 * Boucle : intention → **générateur** (adaptateur) → séquence de commandes inspectable + journal des hypothèses →
 * **exécution à blanc** (mêmes réducteurs, aucune écriture) → en cas de refus, auto-correction par le générateur,
 * **trois itérations au plus** → aperçu (objets affectés) → l'accord explicite de l'utilisateur est hors de ce module
 * (le serveur n'exécute qu'après lui). Cache des séquences validées : clé = intention normalisée + version des règles.
 *
 * Générateur par défaut : **règles déterministes de Fadi** (aucun fournisseur de modèle de langage n'est configuré,
 * décision §10.1 du maître d'ouvrage) — intentions reconnues : feuilles et quantités (un plan et une feuille par
 * niveau), pièces détectées depuis les murs fermés, trame de poteaux, collisions d'ouvertures (recentrage dans le mur),
 * réserves du bilan Harmonie annotées sur les objets concernés.
 * Toute valeur choisie par une règle (échelle, format, nom provisoire) est une **hypothèse** écrite au journal,
 * jamais une exigence.
 */
import { appliquerLot, CONTRAT_COMMANDES, ErreurCommande, type Commande, type Effets } from "../commandes/index.js";
import { detecterPieces } from "../commandes/organisation.js";
import { empreinte } from "../documents/empreinte.js";
import { positionLibre, tailleDessinMm, type FormatFeuille } from "../documents/feuilles.js";
import { genererVue, lireParamsVue } from "../documents/vues.js";
import type { ModeleAtelier } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";
import { centroide } from "../geometrie.js";
import { collisions } from "../versions.js";
import { developperScript, SCRIPTS_INTEGRES } from "./scripts.js";

export const VERSION_REGLES = "regles-fadi/1";
export const ITERATIONS_MAX = 3;

export interface HypotheseProposition {
  texte: string;
  /** Ce qui l'a motivée (règle, convention, valeur absente). */
  motif: string;
}

export interface Generation {
  regle: string;
  explication: string;
  commandes: Commande[];
  hypotheses: HypotheseProposition[];
}

export interface Generateur {
  id: string;
  /** Première proposition pour une intention ; `null` si l'intention n'est pas comprise. */
  proposer(intention: string, etat: ModeleAtelier, contexte: ContexteAssistant): Generation | null;
  /** Correction après un refus de l'exécution à blanc ; `null` si aucune correction n'est possible. */
  corriger(precedente: Generation, erreur: ErreurCommande, etat: ModeleAtelier): Generation | null;
}

export interface ReserveHarmonie {
  id: string;
  priority: string;
  title: string;
  refs: string[];
  step: number;
}

export interface ContexteAssistant {
  niveauId: string | null;
  /** Réserves du bilan Harmonie du bâtiment conçu (calculées par le serveur), quand elles sont disponibles. */
  reserves?: readonly ReserveHarmonie[];
}

export interface Iteration {
  numero: number;
  commandes: number;
  resultat: "valide" | "refuse";
  erreur: string | null;
}

export interface Proposition {
  intention: string;
  cle: string;
  generateur: string;
  regle: string | null;
  explication: string;
  commandes: Commande[];
  hypotheses: HypotheseProposition[];
  iterations: Iteration[];
  statut: "proposee" | "echouee" | "incomprise";
  effets: Effets | null;
  depuisCache: boolean;
}

export function normaliserIntention(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[×]/g, "x")
    .replace(/[^a-z0-9.,x+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const cleCache = (intention: string, contexte: ContexteAssistant) => empreinte(`${VERSION_REGLES}|${normaliserIntention(intention)}|${contexte.niveauId ?? ""}`);

/** Exécution à blanc : mêmes réducteurs, aucune écriture. */
function essai(etat: ModeleAtelier, commandes: Commande[]): { ok: true; effets: Effets } | { ok: false; erreur: ErreurCommande } {
  try {
    const r = appliquerLot(etat, { requestId: "assistant-essai", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "essai", commands: commandes });
    return { ok: true, effets: r.effets };
  } catch (err) {
    if (err instanceof ErreurCommande) return { ok: false, erreur: err };
    throw err;
  }
}

/**
 * La boucle contrôlée : propose, essaie, corrige au plus `ITERATIONS_MAX` fois. Si `cache` est fourni (séquence
 * déjà validée pour la même clé), elle est d'abord réessayée telle quelle sur l'état courant.
 */
export function boucleControlee(etat: ModeleAtelier, intention: string, generateur: Generateur, contexte: ContexteAssistant, cache?: { commandes: Commande[]; hypotheses: HypotheseProposition[]; regle: string; explication: string } | null): Proposition {
  const cle = cleCache(intention, contexte);
  const base = { intention, cle, generateur: generateur.id };
  if (cache) {
    const r = essai(etat, cache.commandes);
    if (r.ok) return { ...base, regle: cache.regle, explication: cache.explication, commandes: cache.commandes, hypotheses: cache.hypotheses, iterations: [{ numero: 1, commandes: cache.commandes.length, resultat: "valide", erreur: null }], statut: "proposee", effets: r.effets, depuisCache: true };
  }
  const premiere = generateur.proposer(intention, etat, contexte);
  if (!premiere) return { ...base, regle: null, explication: "Intention non reconnue par les règles de Fadi. Exemples : « feuilles et quantités », « détecter les pièces », « trame de poteaux 4 x 3 tous les 6 m », « corriger les ouvertures », « annoter les réserves Harmonie ».", commandes: [], hypotheses: [], iterations: [], statut: "incomprise", effets: null, depuisCache: false };
  let g: Generation = premiere;
  const iterations: Iteration[] = [];
  for (let n = 1; n <= ITERATIONS_MAX; n++) {
    if (!g.commandes.length) {
      iterations.push({ numero: n, commandes: 0, resultat: "valide", erreur: null });
      return { ...base, regle: g.regle, explication: g.explication, commandes: [], hypotheses: g.hypotheses, iterations, statut: "proposee", effets: null, depuisCache: false };
    }
    const r = essai(etat, g.commandes);
    if (r.ok) {
      iterations.push({ numero: n, commandes: g.commandes.length, resultat: "valide", erreur: null });
      return { ...base, regle: g.regle, explication: g.explication, commandes: g.commandes, hypotheses: g.hypotheses, iterations, statut: "proposee", effets: r.effets, depuisCache: false };
    }
    iterations.push({ numero: n, commandes: g.commandes.length, resultat: "refuse", erreur: r.erreur.message });
    const suivante = n < ITERATIONS_MAX ? generateur.corriger(g, r.erreur, etat) : null;
    if (!suivante) return { ...base, regle: g.regle, explication: `${g.explication} — refusée par le modèle après ${n} essai(s) : ${r.erreur.message}`, commandes: g.commandes, hypotheses: g.hypotheses, iterations, statut: "echouee", effets: null, depuisCache: false };
    g = suivante;
  }
  return { ...base, regle: g.regle, explication: g.explication, commandes: g.commandes, hypotheses: g.hypotheses, iterations, statut: "echouee", effets: null, depuisCache: false };
}

// --- Règles déterministes de Fadi -----------------------------------------------------------------------------

function feuillesEtQuantites(etat: ModeleAtelier): Generation {
  const hypotheses: HypotheseProposition[] = [{ texte: "Échelle des plans 1:100", motif: "convention de l'assistant, à confirmer (aucune échelle n'est exigée par le modèle)" }];
  const commandes: Commande[] = [];
  const avecPlan = new Set(Object.values(etat.definitions).filter((d) => d.classe === ("vue" as typeof d.classe) && (d.params as { type?: string }).type === "plan").map((d) => (d.params as { niveauId?: string }).niveauId));
  let k = 0;
  for (const n of niveauxOrdonnes(etat)) {
    if (avecPlan.has(n.id)) continue;
    k++;
    const vueId = `assistant-plan-${n.id}`.slice(0, 120);
    let echelle = 100;
    let params = lireParamsVue(etat, { type: "plan", titre: `Plan · ${n.nom}`, echelle, niveauId: n.id });
    let taille = tailleDessinMm(genererVue(etat, params, vueId));
    // Format : le plus petit format paysage qui reçoit le plan au-dessus du cartouche ; sinon l'échelle passe à 1:200.
    let choix: { format: FormatFeuille; pos: { x: number; y: number } } | null = null;
    for (const e of [100, 200]) {
      if (e !== echelle) {
        echelle = e;
        params = lireParamsVue(etat, { type: "plan", titre: `Plan · ${n.nom}`, echelle, niveauId: n.id });
        taille = tailleDessinMm(genererVue(etat, params, vueId));
      }
      for (const format of ["A3", "A2", "A1", "A0"] as FormatFeuille[]) {
        const pos = positionLibre({ format, orientation: "paysage" }, [], taille);
        if (pos) {
          choix = { format, pos };
          break;
        }
      }
      if (choix) break;
    }
    commandes.push({ type: "vue.creer", params: { id: vueId, type: "plan", titre: `Plan · ${n.nom}`, echelle, niveauId: n.id } });
    if (echelle !== 100) hypotheses.push({ texte: `Plan « ${n.nom} » à 1:${echelle}`, motif: "le plan au 1:100 ne tient sur aucun format jusqu'à l'A0" });
    if (choix) {
      commandes.push({ type: "feuille.creer", params: { id: `assistant-feuille-${n.id}`.slice(0, 120), titre: `Plan · ${n.nom}`, numero: `A-${String(100 + k)}`, format: choix.format, orientation: "paysage", jeu: "Assistant", vues: [{ vueId, x: Math.round(choix.pos.x), y: Math.round(choix.pos.y) }] } });
      hypotheses.push({ texte: `Feuille ${choix.format} paysage, numéro A-${100 + k}, jeu « Assistant » pour « ${n.nom} »`, motif: "plus petit format qui reçoit le plan ; numérotation provisoire, à reprendre" });
    } else hypotheses.push({ texte: `Plan « ${n.nom} » sans feuille`, motif: "trop grand pour un A0 au 1:200 : à placer à la main" });
  }
  return {
    regle: "feuilles-quantites",
    explication: commandes.length ? `Un plan et une feuille pour ${k} niveau(x) qui n'en ont pas ; les tableaux de quantités sont produits par le serveur à chaque révision (mode Documents).` : "Chaque niveau a déjà un plan : rien à ajouter. Les tableaux de quantités sont à jour à chaque révision (mode Documents).",
    commandes,
    hypotheses,
  };
}

function piecesDetectees(etat: ModeleAtelier, niveauId: string | null): Generation {
  const niveaux = niveauId ? niveauxOrdonnes(etat).filter((n) => n.id === niveauId) : niveauxOrdonnes(etat);
  const commandes: Commande[] = [];
  let k = 0;
  for (const n of niveaux) {
    for (const p of detecterPieces(etat, n.id)) {
      if (p.pieceExistante) continue;
      k++;
      commandes.push({ type: "piece.creer", params: { niveauId: n.id, contour: p.contour, trous: [], nom: `Pièce ${k} (à nommer)`, notes: "Proposée par l'assistant depuis les murs fermés." } });
    }
  }
  return {
    regle: "pieces-detectees",
    explication: commandes.length ? `${commandes.length} pièce(s) fermée(s) par des murs sans pièce dessinée${niveauId ? " sur le niveau actif" : ""}.` : "Aucune boucle de murs sans pièce : rien à proposer.",
    commandes,
    hypotheses: commandes.length ? [{ texte: "Noms provisoires « Pièce n (à nommer) », sans usage ni catégorie", motif: "aucun usage n'est déduit d'une géométrie" }] : [],
  };
}

function tramePoteaux(etat: ModeleAtelier, intention: string, niveauId: string | null): Generation | null {
  const script = SCRIPTS_INTEGRES.find((s) => s.id === "trame-poteaux")!;
  const niveau = niveauId && etat.niveaux[niveauId] ? niveauId : niveauxOrdonnes(etat)[0]?.id;
  if (!niveau) return null;
  const t = normaliserIntention(intention);
  const grille = /(\d+)\s*x\s*(\d+)/.exec(t);
  const pas = /(?:tous les|pas de|espaces? de|a)\s*(\d+(?:[.,]\d+)?)\s*m/.exec(t);
  const hauteur = /hauteur\s*(?:de)?\s*(\d+(?:[.,]\d+)?)/.exec(t);
  const hypotheses: HypotheseProposition[] = [];
  const nx = grille ? Number(grille[1]) : 4;
  const ny = grille ? Number(grille[2]) : 3;
  if (!grille) hypotheses.push({ texte: "Trame 4 × 3", motif: "nombre de poteaux non précisé : valeur par défaut du script" });
  const px = pas ? Number(pas[1]!.replace(",", ".")) : 5;
  if (!pas) hypotheses.push({ texte: "Pas de 5 m dans les deux sens", motif: "pas non précisé : valeur par défaut du script" });
  const niv = etat.niveaux[niveau]!;
  const h = hauteur ? Number(hauteur[1]!.replace(",", ".")) : niv.hauteur;
  if (!h) return { regle: "trame-poteaux", explication: "Hauteur des poteaux inconnue : précisez-la (« hauteur 3 m ») ou renseignez la hauteur du niveau ; aucune hauteur n'est supposée.", commandes: [], hypotheses: [] };
  if (!hauteur) hypotheses.push({ texte: `Hauteur ${h} m`, motif: `hauteur du niveau « ${niv.nom} »` });
  hypotheses.push({ texte: "Section 0,30 × 0,30 m, origine (0 ; 0) du repère local", motif: "valeurs par défaut du script, à confirmer ; aucune donnée structurelle n'est déduite" });
  const commandes = developperScript(script, etat, { niveauId: niveau, nx, ny, px, py: px, ox: 0, oy: 0, section: 0.3, hauteur: h });
  return { regle: "trame-poteaux", explication: `Trame de ${nx} × ${ny} poteaux au pas de ${px} m sur « ${niv.nom} » (script « Trame de poteaux » v${script.version}).`, commandes, hypotheses };
}

/** Réserves Harmonie : une étiquette par réserve rattachée à un objet du modèle, sur un calque dédié. */
function annoterReserves(etat: ModeleAtelier, reserves: readonly ReserveHarmonie[] | undefined): Generation {
  if (!reserves) return { regle: "reserves-harmonie", explication: "Bilan Harmonie indisponible pour ce projet : rien à annoter.", commandes: [], hypotheses: [] };
  const commandes: Commande[] = [];
  const hypotheses: HypotheseProposition[] = [];
  const calqueId = "assistant-reserves-harmonie";
  if (!etat.calques[calqueId]) commandes.push({ type: "calque.creer", params: { id: calqueId, nom: "Réserves Harmonie" } });
  const dejaAnnotees = new Set((Object.values(etat.objets) as { classe: string; params: { texte?: string } }[]).filter((o) => o.classe === "etiquette" && o.params.texte?.startsWith("Réserve Harmonie")).map((o) => o.params.texte));
  let placees = 0;
  const nonPlacees: string[] = [];
  for (const r of reserves) {
    const texte = `Réserve Harmonie (${r.priority}) · ${r.title}`.slice(0, 300);
    if (dejaAnnotees.has(texte)) continue;
    // Références du bilan : « niveau|objet » (analyse du modèle) ou identifiant d'objet seul.
    const o = r.refs.map((ref) => etat.objets[ref.includes("|") ? ref.slice(ref.lastIndexOf("|") + 1) : ref]).find((x) => !!x && !!x.niveauId);
    let position: { x: number; y: number } | null = null;
    if (o && "contour" in o.params && Array.isArray(o.params.contour) && o.params.contour.length >= 3) position = centroide(o.params.contour as { x: number; y: number }[]);
    else if (o && o.classe === "mur") position = { x: (o.params.a.x + o.params.b.x) / 2, y: (o.params.a.y + o.params.b.y) / 2 };
    if (!o || !position) {
      nonPlacees.push(r.title);
      continue;
    }
    placees++;
    commandes.push({ type: "etiquette.creer", params: { niveauId: o.niveauId, calqueId, objetId: o.id, position: { x: Math.round(position.x * 1000) / 1000, y: Math.round(position.y * 1000) / 1000, frame: "local", unit: "m" }, texte } });
  }
  if (nonPlacees.length) hypotheses.push({ texte: `${nonPlacees.length} réserve(s) sans objet du modèle à annoter : ${nonPlacees.slice(0, 5).join(" ; ")}`, motif: "réserve portant sur le projet ou sur un élément absent du modèle : elle reste dans le bilan Harmonie" });
  if (placees) hypotheses.push({ texte: "Étiquettes au centre de l'objet concerné, calque « Réserves Harmonie »", motif: "position de lecture ; les réserves restent celles du bilan, rien n'est corrigé" });
  return {
    regle: "reserves-harmonie",
    explication: placees ? `${placees} réserve(s) du bilan Harmonie annotée(s) sur les objets concernés (étiquettes reliées).` : "Aucune réserve Harmonie à annoter sur le modèle.",
    commandes: placees ? commandes : [],
    hypotheses,
  };
}

function corrigerOuvertures(etat: ModeleAtelier): Generation {
  const commandes: Commande[] = [];
  const hypotheses: HypotheseProposition[] = [];
  for (const c of collisions(etat)) {
    if (c.type !== "ouverture-hors-mur") continue;
    const o = etat.objets[c.objets[0]!];
    const mur = etat.objets[c.objets[1]!];
    if (!o || !mur || mur.classe !== "mur" || (o.classe !== "porte" && o.classe !== "fenetre" && o.classe !== "ouverture")) continue;
    const L = Math.hypot(mur.params.b.x - mur.params.a.x, mur.params.b.y - mur.params.a.y);
    const w = o.params.largeur.value;
    if (w >= L) continue;
    const position = Math.min(Math.max(o.params.position, w / 2 / L), 1 - w / 2 / L);
    commandes.push({ type: "ouverture.deplacer", params: { id: o.id, position: Math.round(position * 1e6) / 1e6 } });
    hypotheses.push({ texte: `${o.id} ramenée dans le mur ${mur.id} (position ${Math.round(position * 1000) / 1000})`, motif: "plus petit déplacement qui la remet dans son hôte" });
  }
  return { regle: "ouvertures-hors-mur", explication: commandes.length ? `${commandes.length} ouverture(s) dépassant de leur mur, ramenée(s) à l'intérieur.` : "Aucune ouverture ne dépasse de son mur.", commandes, hypotheses };
}

/** Générateur déterministe (sans modèle de langage) : reconnaissance d'intentions par mots-clés. */
export const generateurRegles: Generateur = {
  id: VERSION_REGLES,
  proposer(intention, etat, contexte) {
    const t = normaliserIntention(intention);
    if (/feuille|quantit|plans? (par|de chaque|pour chaque) niveau|dossier de plans/.test(t)) return feuillesEtQuantites(etat);
    if (/piece|local|locaux/.test(t) && /detect|ferm|cre|propos/.test(t)) return piecesDetectees(etat, /niveau actif|ce niveau/.test(t) ? contexte.niveauId : null);
    if (/poteau|trame/.test(t)) return tramePoteaux(etat, intention, contexte.niveauId);
    if (/ouverture|porte|fenetre/.test(t) && /corrig|repar|hors|depass/.test(t)) return corrigerOuvertures(etat);
    if (/harmonie|reserve/.test(t)) return annoterReserves(etat, contexte.reserves);
    return null;
  },
  corriger(precedente, erreur) {
    // Auto-correction bornée : retirer la commande refusée (indiquée par le chemin « commands[i] ») et le noter.
    const m = /^commands\[(\d+)\]/.exec(erreur.chemin);
    if (!m) return null;
    const i = Number(m[1]);
    if (i >= precedente.commandes.length) return null;
    return {
      ...precedente,
      commandes: precedente.commandes.filter((_, k) => k !== i),
      hypotheses: [...precedente.hypotheses, { texte: `Commande ${i + 1} (${precedente.commandes[i]!.type}) retirée`, motif: `refusée par le modèle : ${erreur.message}` }],
    };
  },
};

