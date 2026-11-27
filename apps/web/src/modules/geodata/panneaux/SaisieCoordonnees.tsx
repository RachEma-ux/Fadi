/**
 * Saisie de coordonnées pour les outils de la carte (feuille de route équipe A, PR P7 ; UX-3) : distance, surface, zone
 * d'étude, annotation, altitude au point, profil du terrain sans souris et sans carte. Un outil à un point a deux champs
 * (longitude, latitude) ; les autres, un point par ligne. Le tracé saisi suit le même chemin que le tracé dessiné :
 * mesures, altitude et profil n'écrivent rien ; zone et annotation passent par le formulaire d'enregistrement existant.
 */
import { useState } from "react";
import type { OutilCarte } from "../carte/moteur";
import { SOMMETS_OUTIL, traceDepuisCoordonnees, type TraceSaisi } from "../etat/outils-ops";

const ACTION: Record<Exclude<OutilCarte, "navigation">, string> = {
  distance: "Mesurer la distance", surface: "Mesurer la surface", zone: "Tracer la zone", annotation: "Placer l'annotation",
  altitude: "Lire l'altitude", profil: "Tracer le profil",
};

export function SaisieCoordonnees(p: { outil: OutilCarte; onTrace(t: TraceSaisi): void }) {
  const [lon, setLon] = useState("");
  const [lat, setLat] = useState("");
  const [points, setPoints] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  if (p.outil === "navigation") return null;
  const unPoint = SOMMETS_OUTIL[p.outil].max === 1;
  return (
    <form className="gd-formulaire gd-saisie-coordonnees" data-gd-saisie-coordonnees={p.outil} onSubmit={(e) => {
      e.preventDefault();
      const r = traceDepuisCoordonnees(p.outil, unPoint ? `${lon.trim()} ${lat.trim()}` : points);
      if ("erreur" in r) { setErreur(r.erreur); return; }
      setErreur(null);
      p.onTrace(r.trace);
    }}>
      <h3>Par coordonnées (sans souris)</h3>
      <p className="gd-discret" id="gd-saisie-aide">{unPoint ? "WGS 84, en degrés décimaux." : "WGS 84, en degrés décimaux : un point par ligne, longitude puis latitude."}</p>
      {unPoint ? (
        <>
          <label className="gd-champ">Longitude<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} required aria-describedby="gd-saisie-aide" data-gd-saisie-lon /></label>
          <label className="gd-champ">Latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required aria-describedby="gd-saisie-aide" data-gd-saisie-lat /></label>
        </>
      ) : (
        <label className="gd-champ">Points<textarea rows={3} value={points} onChange={(e) => setPoints(e.target.value)} required aria-describedby="gd-saisie-aide" placeholder="-7.62 33.59" data-gd-saisie-points /></label>
      )}
      {erreur && <p role="alert" className="gd-alerte" data-gd-saisie-erreur>{erreur}</p>}
      <button type="submit" data-gd-saisie-valider>{ACTION[p.outil]}</button>
    </form>
  );
}

/** Met le focus sur le premier champ de la saisie de coordonnées (Alt+O / Alt+U sans carte), une fois le volet rendu. */
export function focaliserSaisie() {
  let essais = 0;
  const essayer = () => {
    const champ = document.querySelector<HTMLElement>("[data-gd-saisie-lon], [data-gd-saisie-points]");
    if (champ) champ.focus(); else if (essais++ < 10) requestAnimationFrame(essayer);
  };
  requestAnimationFrame(essayer);
}
