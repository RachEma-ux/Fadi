/**
 * Boîte « Graphismes » (EX-055) : créer une spline, une hachure ou un symbole — avec sa transparence — sur le calque
 * actif (`studio.graphisme.creer`, Maj+F6), et retirer des graphismes cochés (`studio.graphisme.retirer`, Maj+F7). Les
 * valeurs sont saisies, jamais proposées ; le modèle refuse ce qu'il ne peut pas tracer, et le refus est dit.
 */
import { useState } from "react";
import { STUDIO_SYMBOLES, type StudioCommand, type StudioDocument, type StudioNomSymbole } from "@parcours/atelier-model";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { NOMS_GRAPHISMES } from "../planche2d/rendus/graphismes";
import { commandeGraphisme, commandeRetrait, NOMS_SYMBOLES, NOMS_TYPES_GRAPHISME, SAISIE_GRAPHISME_INITIALE, traitsPrevus, type SaisieGraphisme, type TypeGraphisme } from "./graphismes-ui";
import "./graphismes.css";

export interface PropsDialogueGraphismes {
  doc: StudioDocument;
  modifiable: boolean;
  /** Calque actif (le graphisme y est posé). */
  layerId: string | undefined;
  /** Graphismes cochés à l'ouverture (sélection de la planche). */
  coches?: readonly string[];
  surAppliquer: (cs: StudioCommand[]) => boolean;
  surFermer: () => void;
}

export function DialogueGraphismes({ doc, modifiable, layerId, coches = [], surAppliquer, surFermer }: PropsDialogueGraphismes) {
  const [s, setS] = useState<SaisieGraphisme>(SAISIE_GRAPHISME_INITIALE);
  const [erreur, setErreur] = useState("");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set(coches));
  const maj = (p: Partial<SaisieGraphisme>) => { setS((v) => ({ ...v, ...p })); setErreur(""); };
  const traits = traitsPrevus(s);
  const creer = () => {
    const r = commandeGraphisme(s, crypto.randomUUID(), layerId, doc);
    if ("erreur" in r) { setErreur(r.erreur); return; }
    if (surAppliquer(r.commandes)) surFermer();
  };
  const retirer = () => {
    const cs = commandeRetrait(doc, [...choisis]);
    if (cs.length && surAppliquer(cs)) setChoisis(new Set());
  };
  const liste = doc.graphismes ?? [];
  return (
    <Dialogue titre="Graphismes" id="studio-graphismes-titre" classe="studio-graphismes" surFermer={surFermer}>
      <div className="studio-graphismes-corps" data-studio-graphismes>
        <p className="studio-dialogue-aide">Spline (points de passage et poignées d’une courbe de Bézier), hachure (contour et traits parallèles) ou symbole, en mètres dans le repère du dessin ; transparence en pour cent.</p>
        <form onSubmit={(e) => { e.preventDefault(); creer(); }} data-studio-graphisme-formulaire>
          <label>Type
            <select value={s.type} onChange={(e) => maj({ type: e.target.value as TypeGraphisme })} data-studio-graphisme-type>
              {(Object.keys(NOMS_TYPES_GRAPHISME) as TypeGraphisme[]).map((t) => <option key={t} value={t}>{NOMS_TYPES_GRAPHISME[t]}</option>)}
            </select>
          </label>
          {s.type !== "symbole" && <label>{s.type === "spline" ? "Points (départ ; contrôle 1 ; contrôle 2 ; arrivée ; …), « x y » en mètres" : "Contour (sommets « x y » en mètres, séparés par « ; »)"}
            <input value={s.points} onChange={(e) => maj({ points: e.target.value })} data-studio-graphisme-points />
          </label>}
          {s.type === "hachure" && <div className="studio-graphismes-ligne">
            <label>Angle des traits (°)<input inputMode="decimal" value={s.angle} onChange={(e) => maj({ angle: e.target.value })} data-studio-graphisme-angle /></label>
            <label>Espacement des traits (m)<input inputMode="decimal" value={s.espacement} onChange={(e) => maj({ espacement: e.target.value })} data-studio-graphisme-espacement /></label>
          </div>}
          {s.type === "hachure" && traits !== null && <p className="studio-dialogue-aide" data-studio-graphisme-traits={traits}>{`Traits prévus : ${traits}`}</p>}
          {s.type === "symbole" && <>
            <label>Symbole
              <select value={s.symbole} onChange={(e) => maj({ symbole: e.target.value as StudioNomSymbole })} data-studio-graphisme-symbole>
                {STUDIO_SYMBOLES.map((n) => <option key={n} value={n}>{NOMS_SYMBOLES[n]}</option>)}
              </select>
            </label>
            <div className="studio-graphismes-ligne">
              <label>X (m)<input inputMode="decimal" value={s.x} onChange={(e) => maj({ x: e.target.value })} data-studio-graphisme-x /></label>
              <label>Y (m)<input inputMode="decimal" value={s.y} onChange={(e) => maj({ y: e.target.value })} data-studio-graphisme-y /></label>
              <label>Rotation (°)<input inputMode="decimal" value={s.rotation} onChange={(e) => maj({ rotation: e.target.value })} data-studio-graphisme-rotation /></label>
              <label>Échelle<input inputMode="decimal" value={s.echelle} onChange={(e) => maj({ echelle: e.target.value })} data-studio-graphisme-echelle /></label>
            </div>
          </>}
          <label>Opacité (%)<input inputMode="decimal" value={s.opacite} onChange={(e) => maj({ opacite: e.target.value })} data-studio-graphisme-opacite /></label>
          {erreur && <p role="alert" className="studio-graphismes-erreur" data-studio-graphisme-erreur>{erreur}</p>}
          <button type="submit" disabled={!modifiable} data-studio-graphisme-creer>Créer le graphisme</button>
        </form>
        <section aria-label="Graphismes du dessin" data-studio-graphismes-liste={liste.length}>
          <h3>Graphismes du dessin</h3>
          {liste.length === 0 && <p data-studio-graphismes-vide>Aucun graphisme.</p>}
          {liste.length > 0 && <ul className="studio-graphismes-ul">{liste.map((g) => (
            <li key={g.id}><label className="studio-graphismes-coche">
              <input type="checkbox" checked={choisis.has(g.id)} onChange={(e) => setChoisis((v) => { const n = new Set(v); if (e.target.checked) n.add(g.id); else n.delete(g.id); return n; })} data-studio-graphisme-coche={g.id} />
              <span>{NOMS_GRAPHISMES[g.type]}</span> <span translate="no">{g.id}</span>{g.opacite !== undefined && <> · <span>{`opacité ${Math.round(g.opacite * 100)} %`}</span></>}
            </label></li>
          ))}</ul>}
          <button type="button" disabled={!modifiable || choisis.size === 0} onClick={retirer} data-studio-graphisme-retirer>Retirer les graphismes cochés</button>
        </section>
      </div>
    </Dialogue>
  );
}
