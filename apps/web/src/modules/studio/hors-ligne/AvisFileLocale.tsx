/**
 * Résolution explicite d'une file locale incompatible (B.3-11) : la file conservée sur l'appareil n'est ni envoyée,
 * ni réinterprétée, ni effacée en silence. L'utilisateur peut la **télécharger** (fichier JSON, ligne brute **relue
 * dans IndexedDB au moment du clic**), puis seulement ensuite l'**abandonner** après confirmation : l'abandon ne retire
 * que la ligne exportée (jeton `stamp` comparé) ; si un autre onglet l'a réécrite depuis, rien n'est retiré et un
 * nouvel export est demandé. La version serveur est ensuite relue. Tant qu'il ne fait rien, la file reste sur l'appareil.
 */
import { useState, useSyncExternalStore } from "react";
import type { StudioBrouillonEntry } from "../../../lib/local-store";
import { RAISONS_INCOMPATIBLE, type RaisonIncompatible } from "./contrats";
import { abandonnerBrouillonHorsLigne, brouillonBrut } from "./stockage";

interface Bloquee { readonly raison: RaisonIncompatible; readonly entree: StudioBrouillonEntry }
const bloquees = new Map<string, Bloquee>();
const abonnes = new Set<() => void>();
let version = 0;
const publier = () => { version += 1; for (const f of abonnes) f(); };
/** Abonnement stable (hors composant) : React ne se réabonne pas à chaque rendu. */
const abonner = (f: () => void): (() => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const lireVersion = () => version;

/** Signale une file locale incompatible pour cette clé de variante. */
export function signalerFileBloquee(cle: string, raison: RaisonIncompatible, entree: StudioBrouillonEntry): void {
  bloquees.set(cle, { raison, entree });
  publier();
}
export const fileBloquee = (cle: string): Bloquee | null => bloquees.get(cle) ?? null;

export const TEXTES_FILE_LOCALE = Object.freeze({
  conserve: "Rien n’a été envoyé ni effacé : la file locale reste sur cet appareil tant que vous ne l’abandonnez pas.",
  exporter: "Télécharger la file locale (JSON)",
  exportee: "File locale téléchargée.",
  abandonner: "Abandonner la file locale…",
  confirmer: "Abandonner la file locale conservée sur cet appareil ? Ses commandes non synchronisées seront perdues pour Studio (le fichier téléchargé reste le vôtre).",
  changee: "La file locale a changé depuis son téléchargement (autre onglet) : rien n’a été abandonné. Téléchargez-la de nouveau avant de l’abandonner.",
  disparue: "La file locale n’est plus sur cet appareil : rien à télécharger.",
});

/** Export préparé : contenu du fichier et jeton de la ligne exportée (celui que l'abandon exigera). */
export interface ExportFileLocale { readonly contenu: string; readonly jeton: string }

/** Relit la ligne conservée (jamais la copie en mémoire) et prépare le fichier ; null si elle a disparu. */
export async function preparerExportFileLocale(cle: string, userId: string, raison: RaisonIncompatible, maintenant = () => new Date()): Promise<ExportFileLocale | null> {
  const ligne = await brouillonBrut(cle, userId);
  if (!ligne) return null;
  return { contenu: JSON.stringify({ format: "fadi-studio-file-locale/1", raison, exporteeA: maintenant().toISOString(), ligne }, null, 2), jeton: ligne.stamp };
}

/** Abandon de la ligne exportée : `changee` si un autre onglet l'a réécrite depuis l'export (rien n'est retiré). */
export async function abandonnerFileLocale(cle: string, jetonExporte: string): Promise<"abandonnee" | "changee"> {
  if (!(await abandonnerBrouillonHorsLigne(cle, jetonExporte))) return "changee";
  bloquees.delete(cle);
  publier();
  return "abandonnee";
}

export function AvisFileLocale({ cle }: { cle: string | null }) {
  useSyncExternalStore(abonner, lireVersion, lireVersion);
  const [jeton, setJeton] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const b = cle ? fileBloquee(cle) : null;
  if (!cle || !b) return null;
  const exporter = async () => {
    const e = await preparerExportFileLocale(cle, b.entree.userId, b.raison);
    if (!e) { setJeton(null); setMessage(TEXTES_FILE_LOCALE.disparue); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([e.contenu], { type: "application/json" }));
    a.download = "studio-file-locale.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setJeton(e.jeton);
    setMessage(TEXTES_FILE_LOCALE.exportee);
  };
  const abandonner = async () => {
    if (!jeton || !window.confirm(TEXTES_FILE_LOCALE.confirmer)) return;
    if ((await abandonnerFileLocale(cle, jeton)) === "changee") { setJeton(null); setMessage(TEXTES_FILE_LOCALE.changee); return; }
    window.location.reload();
  };
  return (
    <div className="studio-alert" role="alert" data-studio-file-locale-incompatible={b.raison}>
      <span>{RAISONS_INCOMPATIBLE[b.raison]} {TEXTES_FILE_LOCALE.conserve}</span>
      <button type="button" onClick={() => void exporter()} data-studio-exporter-file-locale>{TEXTES_FILE_LOCALE.exporter}</button>
      {message && <span role="status" data-studio-file-locale-message>{message}</span>}
      <button type="button" disabled={!jeton} onClick={() => void abandonner()} data-studio-abandonner-file-locale>{TEXTES_FILE_LOCALE.abandonner}</button>
    </div>
  );
}
