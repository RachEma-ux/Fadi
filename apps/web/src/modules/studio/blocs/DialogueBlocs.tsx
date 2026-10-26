/**
 * Boîte « Blocs » (X.1-01) : définir un bloc depuis les formes sélectionnées (`studio.bloc.definir`, Maj+F1) — ou
 * redéfinir un bloc existant, répercuté sur toutes ses insertions —, insérer un bloc par position, rotation, échelle et
 * symétrie (`studio.bloc.inserer`, Maj+F3), changer la pose d'une insertion sélectionnée, éclater les insertions
 * sélectionnées (`studio.bloc.eclater`, Ctrl+F12) et retirer une définition qui n'est plus insérée. Les valeurs sont
 * saisies, jamais proposées ; le modèle refuse ce qu'il ne peut pas faire, et le refus est dit.
 */
import { useState } from "react";
import type { StudioCommand, StudioDocument } from "@parcours/atelier-model";
import { Dialogue } from "../planche2d/CatalogueOutils";
import {
  commandeDefinirBloc, commandeEclater, commandeInsererBloc, commandeRetirerBloc, formesSelectionnees, insertionsSelectionnees, listeBlocs, saisieDepuisInsertion,
  SAISIE_DEFINITION_INITIALE, SAISIE_INSERTION_INITIALE, type ResultatSaisie, type SaisieDefinition, type SaisieInsertion,
} from "./blocs-ui";
import "../graphismes/graphismes.css";

export interface PropsDialogueBlocs {
  doc: StudioDocument;
  modifiable: boolean;
  /** Calque actif (l'insertion y est posée). */
  layerId: string | undefined;
  /** Sélection de la planche (formes du bloc, insertion à modifier ou à éclater). */
  selection: readonly string[];
  surAppliquer: (cs: StudioCommand[]) => boolean;
  surFermer: () => void;
}

export function DialogueBlocs({ doc, modifiable, layerId, selection, surAppliquer, surFermer }: PropsDialogueBlocs) {
  const insertionsChoisies = insertionsSelectionnees(doc, selection);
  const blocs = listeBlocs(doc);
  const [def, setDef] = useState<SaisieDefinition>(SAISIE_DEFINITION_INITIALE);
  const [ins, setIns] = useState<SaisieInsertion>(() => (insertionsChoisies.length === 1 ? saisieDepuisInsertion(doc, insertionsChoisies[0]!) : null) ?? { ...SAISIE_INSERTION_INITIALE, bloc: blocs[0]?.id ?? "" });
  const [redefini, setRedefini] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const formes = formesSelectionnees(doc, selection);
  const appliquer = (r: ResultatSaisie, apres?: () => void) => {
    if ("erreur" in r) { setErreur(r.erreur); setInfo(""); return; }
    if (surAppliquer(r.commandes)) { setErreur(""); apres?.(); }
  };
  const majDef = (p: Partial<SaisieDefinition>) => { setDef((v) => ({ ...v, ...p })); setErreur(""); };
  const majIns = (p: Partial<SaisieInsertion>) => { setIns((v) => ({ ...v, ...p })); setErreur(""); };
  return (
    <Dialogue titre="Blocs" id="studio-blocs-titre" classe="studio-blocs" surFermer={surFermer}>
      <div className="studio-graphismes-corps" data-studio-blocs>
        <p className="studio-dialogue-aide">Un bloc est une définition réutilisable (formes du dessin, point de base) ; chaque insertion le pose par une position, une rotation, une échelle et une symétrie. Redéfinir un bloc change toutes ses insertions.</p>
        <section aria-label="Définir un bloc" data-studio-bloc-definition>
          <h3>Définir un bloc</h3>
          <p className="studio-dialogue-aide" data-studio-bloc-formes={formes.length}>{`Formes sélectionnées : ${formes.length}`}</p>
          <form onSubmit={(e) => { e.preventDefault(); appliquer(commandeDefinirBloc(doc, selection, def, { bloc: redefini || crypto.randomUUID(), insertion: crypto.randomUUID() }, !!redefini), () => { setInfo(redefini ? "Bloc redéfini : toutes ses insertions suivent." : "Bloc défini."); setRedefini(""); }); }}>
            <label>Nom du bloc<input value={def.nom} onChange={(e) => majDef({ nom: e.target.value })} data-studio-bloc-nom /></label>
            <div className="studio-graphismes-ligne">
              <label>Point de base X (m)<input inputMode="decimal" value={def.x} onChange={(e) => majDef({ x: e.target.value })} data-studio-bloc-base-x /></label>
              <label>Point de base Y (m)<input inputMode="decimal" value={def.y} onChange={(e) => majDef({ y: e.target.value })} data-studio-bloc-base-y /></label>
            </div>
            <label>Redéfinir
              <select value={redefini} onChange={(e) => { setRedefini(e.target.value); setErreur(""); }} data-studio-bloc-redefinir>
                <option value="">Nouveau bloc</option>
                {blocs.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            {!redefini && <label className="studio-graphismes-coche"><input type="checkbox" checked={def.remplacer} onChange={(e) => majDef({ remplacer: e.target.checked })} data-studio-bloc-remplacer /><span>Remplacer les formes par une insertion du bloc</span></label>}
            <button type="submit" disabled={!modifiable} data-studio-bloc-definir>{redefini ? "Redéfinir le bloc" : "Définir le bloc"}</button>
          </form>
        </section>
        <section aria-label="Insérer un bloc" data-studio-bloc-insertion>
          <h3>Insérer un bloc</h3>
          <form onSubmit={(e) => { e.preventDefault(); appliquer(commandeInsererBloc(doc, ins, crypto.randomUUID(), layerId), () => setInfo("Bloc inséré.")); }}>
            <label>Bloc
              <select value={ins.bloc} onChange={(e) => majIns({ bloc: e.target.value })} data-studio-bloc-choix>
                <option value="">—</option>
                {blocs.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <div className="studio-graphismes-ligne">
              <label>X (m)<input inputMode="decimal" value={ins.x} onChange={(e) => majIns({ x: e.target.value })} data-studio-bloc-x /></label>
              <label>Y (m)<input inputMode="decimal" value={ins.y} onChange={(e) => majIns({ y: e.target.value })} data-studio-bloc-y /></label>
              <label>Rotation (°)<input inputMode="decimal" value={ins.rotation} onChange={(e) => majIns({ rotation: e.target.value })} data-studio-bloc-rotation /></label>
              <label>Échelle<input inputMode="decimal" value={ins.echelle} onChange={(e) => majIns({ echelle: e.target.value })} data-studio-bloc-echelle /></label>
            </div>
            <label className="studio-graphismes-coche"><input type="checkbox" checked={ins.symetrie} onChange={(e) => majIns({ symetrie: e.target.checked })} data-studio-bloc-symetrie /><span>Symétrie (axe vertical du bloc)</span></label>
            <button type="submit" disabled={!modifiable} data-studio-bloc-inserer>Insérer le bloc</button>
            <button type="button" disabled={!modifiable || insertionsChoisies.length !== 1} data-studio-bloc-modifier
              onClick={() => appliquer(commandeInsererBloc(doc, ins, insertionsChoisies[0] ?? "", layerId, true), () => setInfo("Pose de l’insertion modifiée."))}>Appliquer la pose à l’insertion sélectionnée</button>
            <button type="button" disabled={!modifiable || !insertionsChoisies.length} data-studio-bloc-eclater
              onClick={() => appliquer(commandeEclater(doc, selection), () => setInfo("Insertion éclatée en formes du dessin."))}>Éclater les insertions sélectionnées</button>
          </form>
        </section>
        {erreur && <p role="alert" className="studio-graphismes-erreur" data-studio-bloc-erreur>{erreur}</p>}
        {info && <p role="status" className="studio-dialogue-aide" data-studio-bloc-info>{info}</p>}
        <section aria-label="Blocs du dessin" data-studio-blocs-liste={blocs.length}>
          <h3>Blocs du dessin</h3>
          {blocs.length === 0 && <p data-studio-blocs-vide>Aucun bloc.</p>}
          {blocs.length > 0 && <table className="studio-graphismes-table"><thead><tr><th>Bloc</th><th>Formes</th><th>Insertions</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {blocs.map((b) => <tr key={b.id} data-studio-bloc={b.id} data-studio-bloc-insertions={b.insertions}>
              <td>{b.nom}</td><td>{b.elements}</td><td>{b.insertions}</td>
              <td><button type="button" disabled={!modifiable || b.insertions > 0} onClick={() => appliquer(commandeRetirerBloc(doc, b.id), () => setInfo("Bloc retiré."))} data-studio-bloc-retirer={b.id}>Retirer</button></td>
            </tr>)}
          </tbody></table>}
        </section>
      </div>
    </Dialogue>
  );
}
