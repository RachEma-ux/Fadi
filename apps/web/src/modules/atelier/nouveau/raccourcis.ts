/**
 * Raccourcis clavier configurables (D-158) : chaque outil garde son raccourci par défaut (`outils.ts`) ; une
 * personnalisation (préférence locale) le remplace. Une touche ne sert qu'à un outil : l'affecter ailleurs la retire
 * de l'ancien. Touches réservées : Échap, Entrée, Suppr, Retour arrière, Espace, chiffres et signes de zoom.
 */
import { OUTILS, type Outil } from "./outils";

export const TOUCHES_RESERVEES = new Set(["escape", "enter", "delete", "backspace", " ", "+", "-", "=", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

/** Raccourci effectif d'un outil ; chaîne vide dans les personnalisations = aucun raccourci. */
export function raccourciDe(o: Outil, perso: Record<string, string>): string | null {
  if (o.id in perso) return perso[o.id] || null;
  // Une touche par défaut reprise par un autre outil personnalisé n'est plus active pour celui-ci.
  if (o.raccourci && Object.entries(perso).some(([id, t]) => id !== o.id && t === o.raccourci)) return null;
  return o.raccourci;
}

/** Outil d'une touche (minuscule), selon les personnalisations. */
export function outilDeTouche(touche: string, perso: Record<string, string>): Outil | null {
  const t = touche.toLowerCase();
  if (TOUCHES_RESERVEES.has(t)) return null;
  return OUTILS.find((o) => raccourciDe(o, perso) === t) ?? null;
}

/** Nouvelles personnalisations après l'affectation d'une touche (vide : aucun raccourci) à un outil. */
export function affecterTouche(perso: Record<string, string>, outilId: string, touche: string): Record<string, string> | { motif: string } {
  const t = touche.trim().toLowerCase();
  if (t && (t.length !== 1 || TOUCHES_RESERVEES.has(t))) return { motif: "une seule lettre ou un signe, hors Échap, Entrée, Suppr, Espace, chiffres et + − =" };
  const suivant: Record<string, string> = {};
  for (const [id, v] of Object.entries(perso)) if (id !== outilId && v !== t) suivant[id] = v;
  // L'outil qui portait cette touche par défaut la perd explicitement.
  if (t) for (const o of OUTILS) if (o.id !== outilId && raccourciDe(o, perso) === t) suivant[o.id] = "";
  const defaut = OUTILS.find((o) => o.id === outilId)?.raccourci ?? null;
  if (t !== (defaut ?? "")) suivant[outilId] = t;
  return suivant;
}
