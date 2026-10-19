/**
 * Champ « Mesures » de la planche 2D (Studio), comme celui de la Planche : pendant un tracé, longueur et angle du
 * segment en cours depuis le dernier point ; une saisie (« 3 », « <45 », « 3<45 ») pose le point suivant ou impose
 * l'angle. Taper un chiffre (ou « < ») sur la planche ouvre la saisie sans la souris ; Entrée valide, Échap efface.
 * Le calcul est pur (`mesures.ts`) ; ce composant ne fait qu'afficher et transmettre.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StudioPoint } from "@parcours/atelier-model";
import { LOCALE } from "../../../../lib/i18n";
import { formaterMetres } from "../geometrie-2d";
import { angleAffiche } from "./mesures";
import { PAS_POLAIRES } from "./moteur";
import "./accrochage.css";

export interface ChampMesuresProps {
  /** Dernier point posé (le champ ne s'affiche que pendant un tracé). */
  base: StudioPoint;
  /** Point survolé (accroché ou suivi). */
  survol: StudioPoint | null;
  /** Direction courante (radians), ou null. */
  direction: number | null;
  /** Angle imposé (degrés), ou null. */
  verrou: number | null;
  pasPolaire: number;
  surPasPolaire: (pas: number) => void;
  /** Saisie validée : message de refus, ou null si elle a été appliquée. */
  surSaisie: (texte: string) => string | null;
  desactive?: boolean;
}

const nombre = (v: number, max = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: max });
/** Touche qui ouvre la saisie depuis la planche (le « - » reste au zoom arrière). */
const OUVRE_SAISIE = /^[0-9.,<]$/;

export function ChampMesures({ base, survol, direction, verrou, pasPolaire, surPasPolaire, surSaisie, desactive }: ChampMesuresProps) {
  const [texte, setTexte] = useState("");
  const [refus, setRefus] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const longueur = survol ? Math.hypot(survol.x - base.x, survol.y - base.y) : null;

  // Un chiffre tapé hors d'un champ pendant le tracé ouvre la saisie (capture : avant les raccourcis de l'éditeur).
  useEffect(() => {
    if (desactive) return;
    const touche = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !OUVRE_SAISIE.test(e.key)) return;
      if ((e.target as Element | null)?.closest?.("input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      e.preventDefault(); e.stopPropagation();
      setTexte(e.key); setRefus("");
      champ.current?.focus();
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, [desactive]);

  function valider(e: FormEvent) {
    e.preventDefault();
    if (!texte.trim()) { champ.current?.blur(); return; }
    const message = surSaisie(texte);
    setRefus(message ?? "");
    if (!message) setTexte("");
  }

  return (
    <form className="studio-mesures" data-studio-mesures onSubmit={valider} aria-label="Mesures">
      <label>
        <span>Mesures</span>
        <input ref={champ} value={texte} disabled={desactive} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="3 · <45 · 3<45"
          aria-describedby="studio-mesures-aide" data-studio-mesures-saisie
          onChange={(e) => { setTexte(e.target.value); setRefus(""); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setTexte(""); setRefus(""); champ.current?.blur(); } }} />
      </label>
      <span className="studio-mesures-valeur"><span>Longueur</span> <output data-studio-mesures-longueur={longueur ?? undefined}>{longueur === null ? "—" : formaterMetres(longueur, LOCALE)}</output></span>
      <span className="studio-mesures-valeur"><span>{verrou !== null ? "Angle imposé" : "Angle"}</span> <output data-studio-mesures-angle={verrou ?? (direction === null ? undefined : angleAffiche(direction))}>{verrou !== null ? `${nombre(verrou, 2)}°` : direction === null ? "—" : `${nombre(angleAffiche(direction), 2)}°`}</output></span>
      <label>
        <span>Pas polaire</span>
        <select value={pasPolaire} disabled={desactive} data-studio-pas-polaire onChange={(e) => surPasPolaire(Number(e.target.value))}>
          {PAS_POLAIRES.map((p) => <option key={p} value={p}>{`${p}°`}</option>)}
        </select>
      </label>
      <span id="studio-mesures-aide" className="studio-mesures-aide">Tapez une longueur (3), un angle (&lt;45) ou les deux (3&lt;45), puis Entrée ; Échap efface la saisie.</span>
      {refus && <span role="alert" data-studio-mesures-refus>{refus}</span>}
    </form>
  );
}
