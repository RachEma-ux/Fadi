/**
 * Boîte « Système de projet » (EX-023, Ctrl+Maj+F2) : versions déclarées du système de projet (origine du document
 * exprimée dans le projet, rotation), ajout de la version suivante (`studio.repere.projet` : aucune version n'est
 * réécrite), et conversion explicite d'un point entre le repère du dessin (`local-2d`) et le projet, avec la trace de la
 * transformation employée (repères, version, unité). Sans système déclaré, rien n'est converti.
 */
import { useState } from "react";
import type { StudioCommand, StudioDocument } from "@parcours/atelier-model";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { commandeSystemeProjet, convertir, degres, metres, type SaisieSystemeProjet } from "./graphismes-ui";
import "./graphismes.css";

export function DialogueSystemeProjet({ doc, modifiable, surAppliquer, surFermer }: { doc: StudioDocument; modifiable: boolean; surAppliquer: (cs: StudioCommand[]) => boolean; surFermer: () => void }) {
  const [s, setS] = useState<SaisieSystemeProjet>({ x: "", y: "", rotation: "" });
  const [erreur, setErreur] = useState("");
  const [sens, setSens] = useState<"vers-projet" | "depuis-projet">("vers-projet");
  const [px, setPx] = useState(""), [py, setPy] = useState("");
  const versions = doc.systemeProjet?.versions ?? [];
  const enVigueur = versions[versions.length - 1];
  const resultat = px.trim() && py.trim() ? convertir(doc, sens, px, py) : null;
  const ajouter = () => {
    const r = commandeSystemeProjet(doc, s);
    if ("erreur" in r) { setErreur(r.erreur); return; }
    if (surAppliquer(r.commandes)) { setS({ x: "", y: "", rotation: "" }); setErreur(""); }
  };
  return (
    <Dialogue titre="Système de projet" id="studio-systeme-projet-titre" classe="studio-systeme-projet" surFermer={surFermer}>
      <div className="studio-graphismes-corps" data-studio-systeme-projet data-studio-systeme-projet-version={enVigueur?.version ?? "aucune"}>
        <p className="studio-dialogue-aide">Le dessin est enregistré dans son repère (local-2d, mètres). Le système de projet le situe : coordonnées, dans le projet, de l’origine du dessin et rotation de son axe X. Chaque définition est une version nouvelle ; les versions passées restent lisibles.</p>
        {!enVigueur && <p role="status" data-studio-systeme-projet-absent>Système de projet non déclaré : aucune conversion n’est supposée.</p>}
        {versions.length > 0 && <table className="studio-graphismes-table" data-studio-systeme-projet-versions={versions.length}>
          <thead><tr><th scope="col">Version</th><th scope="col">Origine X (m)</th><th scope="col">Origine Y (m)</th><th scope="col">Rotation (°)</th></tr></thead>
          <tbody>{versions.map((v) => <tr key={v.version} data-studio-systeme-projet-ligne={v.version}><td>{v.version}</td><td translate="no">{metres(v.origine.x)}</td><td translate="no">{metres(v.origine.y)}</td><td translate="no">{degres(v.rotation)}</td></tr>)}</tbody>
        </table>}
        <form onSubmit={(e) => { e.preventDefault(); ajouter(); }} data-studio-systeme-projet-formulaire>
          <h3>{`Version ${versions.length + 1}`}</h3>
          <div className="studio-graphismes-ligne">
            <label>Origine X (m)<input inputMode="decimal" value={s.x} onChange={(e) => { setS({ ...s, x: e.target.value }); setErreur(""); }} data-studio-systeme-projet-x /></label>
            <label>Origine Y (m)<input inputMode="decimal" value={s.y} onChange={(e) => { setS({ ...s, y: e.target.value }); setErreur(""); }} data-studio-systeme-projet-y /></label>
            <label>Rotation (°)<input inputMode="decimal" value={s.rotation} onChange={(e) => { setS({ ...s, rotation: e.target.value }); setErreur(""); }} data-studio-systeme-projet-rotation /></label>
          </div>
          {erreur && <p role="alert" className="studio-graphismes-erreur" data-studio-systeme-projet-erreur>{erreur}</p>}
          <button type="submit" disabled={!modifiable} data-studio-systeme-projet-ajouter>Ajouter cette version</button>
        </form>
        <section aria-label="Conversion de coordonnées" data-studio-conversion>
          <h3>Conversion de coordonnées</h3>
          <label>Sens
            <select value={sens} onChange={(e) => setSens(e.target.value as typeof sens)} data-studio-conversion-sens>
              <option value="vers-projet">Dessin (local-2d) → projet</option>
              <option value="depuis-projet">Projet → dessin (local-2d)</option>
            </select>
          </label>
          <div className="studio-graphismes-ligne">
            <label>X (m)<input inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} data-studio-conversion-x /></label>
            <label>Y (m)<input inputMode="decimal" value={py} onChange={(e) => setPy(e.target.value)} data-studio-conversion-y /></label>
          </div>
          {resultat && ("erreur" in resultat
            ? <p role="alert" data-studio-conversion-erreur>{resultat.erreur}</p>
            : <p role="status" data-studio-conversion-resultat={`${metres(resultat.x)} ${metres(resultat.y)}`} data-studio-conversion-version={resultat.trace.version}>
                <span translate="no">{`${metres(resultat.x)} ; ${metres(resultat.y)} m`}</span> — <span>{`repère ${resultat.repere === "projet" ? "projet" : "dessin (local-2d)"}, transformation version ${resultat.trace.version}`}</span>
              </p>)}
        </section>
      </div>
    </Dialogue>
  );
}
