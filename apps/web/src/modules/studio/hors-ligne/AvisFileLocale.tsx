/**
 * Résolution explicite d'une file locale incompatible (B.3-11) : la file conservée sur l'appareil n'est ni envoyée,
 * ni réinterprétée, ni effacée en silence. L'utilisateur peut la **télécharger** (fichier JSON, ligne brute telle
 * qu'elle est conservée), puis seulement ensuite l'**abandonner** après confirmation ; la version serveur est alors
 * relue. Tant qu'il ne fait rien, la file reste sur l'appareil.
 */
import { useState, useSyncExternalStore } from "react";
import type { StudioBrouillonEntry } from "../../../lib/local-store";
import { RAISONS_INCOMPATIBLE, type RaisonIncompatible } from "./contrats";
import { supprimerBrouillonHorsLigne } from "./stockage";

interface Bloquee { readonly raison: RaisonIncompatible; readonly entree: StudioBrouillonEntry }
const bloquees = new Map<string, Bloquee>();
const abonnes = new Set<() => void>();
let version = 0;
const publier = () => { version += 1; for (const f of abonnes) f(); };

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
});

export function AvisFileLocale({ cle }: { cle: string | null }) {
  useSyncExternalStore((f) => { abonnes.add(f); return () => { abonnes.delete(f); }; }, () => version, () => version);
  const [exportee, setExportee] = useState(false);
  const b = cle ? fileBloquee(cle) : null;
  if (!cle || !b) return null;
  const exporter = () => {
    const blob = new Blob([JSON.stringify({ format: "fadi-studio-file-locale/1", raison: b.raison, exporteeA: new Date().toISOString(), ligne: b.entree }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "studio-file-locale.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setExportee(true);
  };
  const abandonner = async () => {
    if (!window.confirm(TEXTES_FILE_LOCALE.confirmer)) return;
    await supprimerBrouillonHorsLigne(cle);
    bloquees.delete(cle);
    window.location.reload();
  };
  return (
    <div className="studio-alert" role="alert" data-studio-file-locale-incompatible={b.raison}>
      <span>{RAISONS_INCOMPATIBLE[b.raison]} {TEXTES_FILE_LOCALE.conserve}</span>
      <button type="button" onClick={exporter} data-studio-exporter-file-locale>{TEXTES_FILE_LOCALE.exporter}</button>
      {exportee && <span role="status">{TEXTES_FILE_LOCALE.exportee}</span>}
      <button type="button" disabled={!exportee} onClick={() => void abandonner()} data-studio-abandonner-file-locale>{TEXTES_FILE_LOCALE.abandonner}</button>
    </div>
  );
}
