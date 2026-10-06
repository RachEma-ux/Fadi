/**
 * Réglages de navigation (D-157) : périphérique, geste à deux doigts, inversions et sensibilités. Préférence locale
 * de l'utilisateur (navigateur), jamais une donnée du projet.
 */
import { etatUi, NAVIGATION_DEFAUT, type EtatUi, type ReglagesNavigation } from "../etat-ui";
import { SENSIBILITE_MAX, SENSIBILITE_MIN } from "../navigation";

const maj = (ui: EtatUi, p: Partial<ReglagesNavigation>) => etatUi.set({ navigation: { ...ui.navigation, ...p } });
const virgule = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function ChoixPeripherique({ ui }: { ui: EtatUi }) {
  return (
    <label className="canevas-peripherique">
      <span className="sr-only">Périphérique de navigation</span>
      <select value={ui.navigation.peripherique} onChange={(e) => maj(ui, { peripherique: e.target.value as ReglagesNavigation["peripherique"] })} data-nav-peripherique-rapide aria-label="Périphérique de navigation">
        <option value="souris">Souris</option>
        <option value="trackpad">Trackpad</option>
      </select>
    </label>
  );
}

function Sensibilite({ ui, cle, libelle }: { ui: EtatUi; cle: "sensibiliteZoom" | "sensibilitePan" | "sensibiliteOrbite"; libelle: string }) {
  const v = ui.navigation[cle];
  return (
    <label className="nav-sensibilite">
      {libelle} <output>{virgule(v)}</output>
      <input type="range" min={Math.log2(SENSIBILITE_MIN)} max={Math.log2(SENSIBILITE_MAX)} step={0.25} value={Math.log2(v)} onChange={(e) => maj(ui, { [cle]: 2 ** Number(e.target.value) })} data-nav-sensibilite={cle} aria-valuetext={virgule(v)} />
    </label>
  );
}

export function ReglagesNavigationPanneau({ ui }: { ui: EtatUi }) {
  const n = ui.navigation;
  const souris = n.peripherique === "souris";
  return (
    <div className="nav-reglages" data-nav-reglages>
      <fieldset>
        <legend>Périphérique</legend>
        <label><input type="radio" name="nav-peripherique" checked={souris} onChange={() => maj(ui, { peripherique: "souris" })} data-nav-peripherique="souris" /> Souris</label>
        <label><input type="radio" name="nav-peripherique" checked={!souris} onChange={() => maj(ui, { peripherique: "trackpad" })} data-nav-peripherique="trackpad" /> Trackpad</label>
      </fieldset>
      <ul className="inspecteur-aide nav-gestes" data-nav-gestes>
        {souris ? (
          <>
            <li>Molette : zoom vers le pointeur ; Maj + molette : panoramique (plan).</li>
            <li>Molette maintenue : panoramique en plan, orbite en 3D ; Maj + molette maintenue : panoramique en 3D.</li>
            <li>Espace + glisser : panoramique (plan) ; clic droit glissé : panoramique (3D).</li>
          </>
        ) : (
          <>
            <li>Deux doigts : panoramique en plan, orbite en 3D ; Maj + deux doigts : panoramique en 3D.</li>
            <li>Pincement : zoom.</li>
          </>
        )}
      </ul>
      <fieldset>
        <legend>Écran tactile, deux doigts en 3D</legend>
        <label><input type="radio" name="nav-deux-doigts" checked={n.deuxDoigts === "pan"} onChange={() => maj(ui, { deuxDoigts: "pan" })} data-nav-deux-doigts="pan" /> Pincer et déplacer (panoramique)</label>
        <label><input type="radio" name="nav-deux-doigts" checked={n.deuxDoigts === "orbite"} onChange={() => maj(ui, { deuxDoigts: "orbite" })} data-nav-deux-doigts="orbite" /> Pincer et tourner (orbite)</label>
      </fieldset>
      <fieldset>
        <legend>Inverser</legend>
        <label><input type="checkbox" checked={n.inverserZoom} onChange={(e) => maj(ui, { inverserZoom: e.target.checked })} data-nav-inverser="zoom" /> Zoom</label>
        <label><input type="checkbox" checked={n.inverserPan} onChange={(e) => maj(ui, { inverserPan: e.target.checked })} data-nav-inverser="pan" /> Panoramique</label>
        <label><input type="checkbox" checked={n.inverserOrbite} onChange={(e) => maj(ui, { inverserOrbite: e.target.checked })} data-nav-inverser="orbite" /> Orbite</label>
      </fieldset>
      <fieldset>
        <legend>Sensibilité</legend>
        <Sensibilite ui={ui} cle="sensibiliteZoom" libelle="Zoom" />
        <Sensibilite ui={ui} cle="sensibilitePan" libelle="Panoramique" />
        <Sensibilite ui={ui} cle="sensibiliteOrbite" libelle="Orbite" />
      </fieldset>
      <button type="button" onClick={() => etatUi.set({ navigation: { ...NAVIGATION_DEFAUT } })} data-nav-reinitialiser>Réinitialiser tout</button>
    </div>
  );
}
