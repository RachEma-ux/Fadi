/**
 * Boîte « Contraintes » (X.1-01, `studio.contrainte.poser`, Ctrl+F1) : poser une contrainte géométrique (horizontale,
 * verticale, parallélisme, perpendicularité, tangence, coïncidence, égalité, distance fixée) sur les objets choisis —
 * pré-remplis depuis la sélection de la planche — et résoudre son système ; un système insatisfaisable ou sur-contraint
 * est refusé, avec son motif. La liste dit l'état de chaque contrainte (satisfaite, à résoudre…) ; les contraintes
 * cochées se résolvent ou se retirent. Rien n'est résolu sans une demande explicite.
 */
import { useState } from "react";
import { STUDIO_TYPES_CONTRAINTES, type StudioCommand, type StudioDocument, type StudioModeTangence, type StudioTypeContrainte } from "@parcours/atelier-model";
import { Dialogue } from "../planche2d/CatalogueOutils";
import {
  ciblesDuType, commandePoserContrainte, commandeResoudre, commandeRetirerContraintes, etatsContraintes, NOMS_CONTRAINTES, NOMS_STATUTS_CONTRAINTE, objetsContraignables,
  precisionsPossibles, saisieDepuisSelection, surDesPoints, tangencePrevue, type ResultatSaisie, type SaisieContrainte,
} from "./blocs-ui";
import "../graphismes/graphismes.css";

export interface PropsDialogueContraintes {
  doc: StudioDocument;
  modifiable: boolean;
  /** Sélection de la planche : les deux premiers objets contraignables pré-remplissent les cibles. */
  selection: readonly string[];
  surAppliquer: (cs: StudioCommand[]) => boolean;
  surFermer: () => void;
}

export function DialogueContraintes({ doc, modifiable, selection, surAppliquer, surFermer }: PropsDialogueContraintes) {
  const [s, setS] = useState<SaisieContrainte>(() => saisieDepuisSelection(doc, selection, "parallele"));
  const [coches, setCoches] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const objets = objetsContraignables(doc);
  const etats = etatsContraintes(doc);
  const n = ciblesDuType(s.type);
  const points = surDesPoints(s.type);
  const prevue = tangencePrevue(doc, s);
  const appliquer = (r: ResultatSaisie, message: string, apres?: () => void) => {
    if ("erreur" in r) { setErreur(r.erreur); setInfo(""); return; }
    if (surAppliquer(r.commandes)) { setErreur(""); setInfo(message); apres?.(); }
  };
  const choisirType = (type: StudioTypeContrainte) => { setS(saisieDepuisSelection(doc, selection, type)); setErreur(""); };
  const cible = (k: 0 | 1, p: Partial<SaisieContrainte["cibles"][0]>) => {
    setS((v) => {
      const c = [...v.cibles] as SaisieContrainte["cibles"];
      const objet = p.objet ?? c[k].objet;
      c[k] = { objet, precision: p.precision ?? (p.objet !== undefined ? precisionsPossibles(doc, objet, surDesPoints(v.type))[0]?.valeur ?? "" : c[k].precision) };
      return { ...v, cibles: c };
    });
    setErreur("");
  };
  return (
    <Dialogue titre="Contraintes" id="studio-contraintes-titre" classe="studio-contraintes" surFermer={surFermer}>
      <div className="studio-graphismes-corps" data-studio-contraintes>
        <p className="studio-dialogue-aide">Une contrainte relie des objets du dessin ; la poser résout le système des contraintes qui les partagent, en déplaçant la géométrie le moins possible. Une commande qui la rompt la laisse « à résoudre ».</p>
        <form onSubmit={(e) => { e.preventDefault(); appliquer(commandePoserContrainte(doc, s, crypto.randomUUID()), "Contrainte posée, système résolu."); }} data-studio-contrainte-formulaire>
          <label>Type
            <select value={s.type} onChange={(e) => choisirType(e.target.value as StudioTypeContrainte)} data-studio-contrainte-type>
              {STUDIO_TYPES_CONTRAINTES.map((t) => <option key={t} value={t}>{NOMS_CONTRAINTES[t]}</option>)}
            </select>
          </label>
          {([0, 1] as const).slice(0, n).map((k) => (
            <div key={k} className="studio-graphismes-ligne">
              <label>{k === 0 ? "Premier objet" : s.type === "distance" ? "Second objet (vide : longueur du segment)" : "Second objet"}
                <select value={s.cibles[k].objet} onChange={(e) => cible(k, { objet: e.target.value })} data-studio-contrainte-objet={k}>
                  <option value="">—</option>
                  {objets.map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
                </select>
              </label>
              <label>{points ? "Point" : "Segment ou courbe"}
                <select value={s.cibles[k].precision} onChange={(e) => cible(k, { precision: e.target.value })} data-studio-contrainte-precision={k}>
                  {precisionsPossibles(doc, s.cibles[k].objet, points && !(s.type === "distance" && k === 0 && !s.cibles[1].objet)).map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
                </select>
              </label>
            </div>
          ))}
          {s.type === "distance" && <label>Distance (m)<input inputMode="decimal" value={s.valeur} onChange={(e) => { setS((v) => ({ ...v, valeur: e.target.value })); setErreur(""); }} data-studio-contrainte-valeur /></label>}
          {s.type === "tangence" && prevue && <label>Tangence de deux courbes
            <select value={s.tangence} onChange={(e) => setS((v) => ({ ...v, tangence: e.target.value as "" | StudioModeTangence }))} data-studio-contrainte-tangence>
              <option value="">{prevue === "interieure" ? "D’après la géométrie : intérieure" : "D’après la géométrie : extérieure"}</option>
              <option value="exterieure">Extérieure</option>
              <option value="interieure">Intérieure</option>
            </select>
          </label>}
          <button type="submit" disabled={!modifiable} data-studio-contrainte-poser>Poser et résoudre</button>
        </form>
        {erreur && <p role="alert" className="studio-graphismes-erreur" data-studio-contrainte-erreur>{erreur}</p>}
        {info && <p role="status" className="studio-dialogue-aide" data-studio-contrainte-info>{info}</p>}
        <section aria-label="Contraintes du dessin" data-studio-contraintes-liste={etats.length} data-studio-contraintes-a-resoudre={etats.filter((e) => e.statut !== "satisfaite").length}>
          <h3>Contraintes du dessin</h3>
          {etats.length === 0 && <p data-studio-contraintes-vide>Aucune contrainte.</p>}
          {etats.length > 0 && <ul className="studio-graphismes-ul">{etats.map((c) => (
            <li key={c.id} data-studio-contrainte={c.id} data-studio-contrainte-statut={c.statut}><label className="studio-graphismes-coche">
              <input type="checkbox" checked={coches.has(c.id)} onChange={(e) => setCoches((v) => { const x = new Set(v); if (e.target.checked) x.add(c.id); else x.delete(c.id); return x; })} data-studio-contrainte-coche={c.id} />
              <span>{c.libelle}</span> · <span translate="no">{c.cibles}</span> · <strong>{NOMS_STATUTS_CONTRAINTE[c.statut]}</strong>{c.raison && <> · <span>{c.raison}</span></>}
            </label></li>
          ))}</ul>}
          <button type="button" disabled={!modifiable || coches.size === 0} onClick={() => appliquer(commandeResoudre(doc, [...coches]), "Contraintes résolues.", () => setCoches(new Set()))} data-studio-contrainte-resoudre>Résoudre les contraintes cochées</button>
          <button type="button" disabled={!modifiable || coches.size === 0} onClick={() => appliquer(commandeRetirerContraintes(doc, [...coches]), "Contraintes retirées.", () => setCoches(new Set()))} data-studio-contrainte-retirer>Retirer les contraintes cochées</button>
        </section>
      </div>
    </Dialogue>
  );
}
