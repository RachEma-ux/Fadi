/**
 * Barre d'outils verticale de la carte GeoData (à gauche, organisation inspirée de Kharita) : zoom, nord, position,
 * plein écran, mesures, zone, annotation, légende. Icônes tracées ici (module isolé). Chaque bouton a un nom accessible
 * et une infobulle ; les outils de tracé sont des bascules (aria-pressed) et retournent à la navigation au second appui.
 */
import type { OutilCarte } from "../carte/moteur";

const ICONES = {
  zoomPlus: "M12 5v14M5 12h14",
  zoomMoins: "M5 12h14",
  nord: "M12 3l5 16-5-4-5 4 5-16Z",
  position: "M12 2v4m0 12v4M2 12h4m12 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  pleinEcran: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  quitterPleinEcran: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  distance: "M4 18 18 4M4 18l2 2M8 14l2 2M12 10l2 2M16 6l2 2",
  surface: "M5 19 4 7l8-3 8 6-3 9H5Z",
  zone: "M4 4h16v16H4z M4 9h16M9 4v16",
  annotation: "M5 20l4-1 10-10-3-3L6 16l-1 4ZM14 7l3 3",
  legende: "M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10",
} as const;

function Pictogramme({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

export interface ActionsBarreCarte {
  outil: OutilCarte;
  pleinEcran: boolean;
  legendeOuverte: boolean;
  carteDisponible: boolean;
  onZoom(delta: 1 | -1): void;
  onNord(): void;
  onPosition(): void;
  onPleinEcran(): void;
  onOutil(o: OutilCarte): void;
  onLegende(): void;
}

export function BarreOutilsCarte(p: ActionsBarreCarte) {
  const bouton = (cle: string, libelle: string, d: string, action: () => void, extra: { pressed?: boolean; disabled?: boolean } = {}) => (
    <button key={cle} type="button" className="gd-outil" title={libelle} aria-label={libelle} onClick={action} aria-pressed={extra.pressed} disabled={extra.disabled} data-gd-barre-outil={cle}><Pictogramme d={d} /></button>
  );
  const trace = (o: Exclude<OutilCarte, "navigation">, libelle: string, d: string) => bouton(o, libelle, d, () => p.onOutil(p.outil === o ? "navigation" : o), { pressed: p.outil === o, disabled: !p.carteDisponible });
  return (
    <nav className="gd-barre-outils" aria-label="Outils de la carte" data-gd-barre-outils>
      <div className="gd-groupe-outils">
        {bouton("zoom-plus", "Zoom avant", ICONES.zoomPlus, () => p.onZoom(1), { disabled: !p.carteDisponible })}
        {bouton("zoom-moins", "Zoom arrière", ICONES.zoomMoins, () => p.onZoom(-1), { disabled: !p.carteDisponible })}
        {bouton("nord", "Remettre le nord en haut", ICONES.nord, p.onNord, { disabled: !p.carteDisponible })}
        {bouton("position", "Ma position (ni enregistrée ni envoyée au serveur)", ICONES.position, p.onPosition, { disabled: !p.carteDisponible })}
        {bouton("plein-ecran", p.pleinEcran ? "Quitter le plein écran" : "Plein écran", p.pleinEcran ? ICONES.quitterPleinEcran : ICONES.pleinEcran, p.onPleinEcran, { pressed: p.pleinEcran })}
      </div>
      <div className="gd-groupe-outils">
        {trace("distance", "Mesurer une distance", ICONES.distance)}
        {trace("surface", "Mesurer une surface", ICONES.surface)}
        {trace("zone", "Tracer une zone d'étude", ICONES.zone)}
        {trace("annotation", "Poser une annotation", ICONES.annotation)}
      </div>
      <div className="gd-groupe-outils">
        {bouton("legende", "Légende", ICONES.legende, p.onLegende, { pressed: p.legendeOuverte })}
      </div>
    </nav>
  );
}
