/**
 * Boîte « Importer DXF » (Maj+U) : choix du fichier, aperçu du rapport de `lireDxfStudio` (unité et facteur vers le
 * mètre, objets ajoutés, calques, étendue, entités non prises par type), choix de l'unité quand le fichier n'en déclare
 * pas (aucune n'est présélectionnée), puis « Ajouter au brouillon » : un seul lot local, annulable par Ctrl+Z, envoyé
 * au serveur seulement à l'enregistrement. Rien n'est lu ni écrit côté serveur ici.
 */
import { useMemo, useState, type ChangeEvent } from "react";
import type { StudioCommand, StudioDocument, StudioDxfResultat, StudioDxfUnite } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { CIBLES_CALQUE, lireDxf, MESSAGE_TROP_GROS, metres, TAILLE_MAX_OCTETS, typeNonPris, UNITES_PROPOSEES } from "./import-dxf-ui";
import "./import-dxf.css";

export interface DialogueImportDxfProps {
  /** Brouillon courant : identifiants pris, calques existants, limites. */
  doc: StudioDocument;
  modifiable: boolean;
  /** Applique le lot au brouillon ; `false` si le modèle le refuse (le brouillon reste inchangé). */
  surAjouter: (commandes: StudioCommand[], resultat: StudioDxfResultat) => boolean;
  surFermer: () => void;
}

export function DialogueImportDxf({ doc, modifiable, surAjouter, surFermer }: DialogueImportDxfProps) {
  const [fichier, setFichier] = useState<{ nom: string; texte: string } | null>(null);
  const [unite, setUnite] = useState<StudioDxfUnite | null>(null);
  const [erreurFichier, setErreurFichier] = useState("");
  const [refus, setRefus] = useState(false);
  // Relu seulement quand le fichier, l'unité choisie ou le brouillon changent (un fichier peut peser 5 Mo).
  const lecture = useMemo(() => (fichier ? lireDxf(fichier.texte, doc, unite) : null), [fichier, doc, unite]);

  async function choisir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFichier(null); setUnite(null); setErreurFichier(""); setRefus(false);
    if (!f) return;
    if (f.size > TAILLE_MAX_OCTETS) { setErreurFichier(MESSAGE_TROP_GROS); return; }
    try { setFichier({ nom: f.name, texte: await f.text() }); }
    catch { setErreurFichier("Lecture du fichier impossible."); }
  }

  return (
    <Dialogue titre="Importer DXF" id="studio-import-dxf-titre" classe="studio-import-dxf" surFermer={surFermer}>
      <div data-studio-import-dxf>
        <p className="studio-dialogue-aide">DXF ASCII (R12 ou suivant). Lignes et polylignes deviennent des lignes et des rectangles du brouillon ; les autres entités sont listées, jamais écartées en silence. Rien n’est enregistré avant « Enregistrer ».</p>
        <label>Fichier DXF<input type="file" accept=".dxf,application/dxf,image/vnd.dxf" disabled={!modifiable} onChange={(e) => void choisir(e)} data-studio-import-fichier /></label>
        {erreurFichier && <p role="alert" data-studio-import-erreur>{erreurFichier}</p>}
        {lecture && "erreur" in lecture && <p role="alert" data-studio-import-erreur>{lecture.erreur}</p>}
        {lecture && "resultat" in lecture && fichier && <Rapport nom={fichier.nom} resultat={lecture.resultat} unite={unite} surUnite={setUnite} />}
        {refus && <p role="alert" data-studio-import-erreur>Ajout refusé par le modèle : le brouillon est inchangé.</p>}
        {!modifiable && <p role="status">Lecture seule : l’import est indisponible.</p>}
        <div className="studio-import-actions">
          <button type="button" disabled={!modifiable || !lecture || !("resultat" in lecture) || lecture.resultat.statut !== "pret" || lecture.resultat.commandes.length === 0}
            onClick={() => { if (lecture && "resultat" in lecture) { const ok = surAjouter(lecture.resultat.commandes, lecture.resultat); setRefus(!ok); } }} data-studio-import-ajouter>
            <Icon name="studio-import-dxf" size={18} /> Ajouter au brouillon
          </button>
        </div>
      </div>
    </Dialogue>
  );
}

export function Rapport({ nom, resultat, unite, surUnite }: { nom: string; resultat: StudioDxfResultat; unite: StudioDxfUnite | null; surUnite: (u: StudioDxfUnite | null) => void }) {
  const r = resultat.rapport;
  const inconnue = r.unite.origine !== "fichier";
  const nonPris = r.nonPris.reduce((n, x) => n + x.nombre, 0);
  return (
    <section className="studio-import-rapport" aria-label="Rapport d’import" data-studio-import-rapport data-studio-import-statut={resultat.statut}
      data-studio-import-objets={r.entites.total} data-studio-import-non-pris={nonPris} data-studio-import-unite={r.unite.valeur ?? ""}>
      <p>Fichier : <span translate="no">{nom}</span></p>
      {r.unite.origine === "fichier"
        ? <p data-studio-import-unite-fichier>{`Unité du fichier ($INSUNITS = ${r.unite.code}) : ${r.unite.valeur} · 1 unité = ${metres(r.facteur ?? 0, LOCALE)} m`}</p>
        : <p role="status" data-studio-import-unite-inconnue>{r.unite.code === null || r.unite.code === 0 ? "Unité inconnue : le fichier ne déclare pas d’unité ($INSUNITS)." : `Unité inconnue : code $INSUNITS ${r.unite.code} non pris en charge.`} Choisissez l’unité du dessin ; elle n’est jamais devinée.</p>}
      {inconnue && <label>Unité du dessin<select value={unite ?? ""} onChange={(e) => surUnite((e.target.value || null) as StudioDxfUnite | null)} data-studio-import-choix-unite>
        <option value="">Choisir…</option>
        {UNITES_PROPOSEES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}
      </select></label>}
      <p data-studio-import-decompte>{`${r.entites.total} objet(s) à ajouter : ${r.entites.lignes} ligne(s), ${r.entites.rectangles} rectangle(s), ${r.entites.segments} segment(s) de polyligne.`}</p>
      {r.entites.cercles + r.entites.arcs + r.entites.polylignes > 0 && <p data-studio-import-courbes>{`Courbes : ${r.entites.cercles} cercle(s), ${r.entites.arcs} arc(s), ${r.entites.polylignes} polyligne(s).`}</p>}
      {r.bornes && <p data-studio-import-bornes>{`Étendue : X de ${metres(r.bornes.min.x, LOCALE)} à ${metres(r.bornes.max.x, LOCALE)} m, Y de ${metres(r.bornes.min.y, LOCALE)} à ${metres(r.bornes.max.y, LOCALE)} m (repère local).`}</p>}
      {r.zIgnores > 0 && <p>{`${r.zIgnores} entité(s) avec une cote Z non nulle : projetée(s) sur le plan, Z ignoré.`}</p>}
      {nonPris === 0
        ? <p data-studio-import-tout-pris>Toutes les entités lues sont prises.</p>
        : <><p>{`Non pris : ${nonPris} élément(s), listés par type.`}</p>
          <ul className="studio-import-non-pris">{r.nonPris.map((x) => {
            const t = typeNonPris(x.type);
            return <li key={x.type} data-studio-import-non-pris-type={x.type} data-studio-import-non-pris-nombre={x.nombre}><span translate="no">{t.base}</span>{t.precision && <> (<span>{t.precision}</span>)</>} : <span translate="no">{x.nombre}</span></li>;
          })}</ul></>}
      {r.calques.length > 0 && <><p>Calques</p><ul className="studio-import-calques">{r.calques.map((c) => (
        <li key={c.nom} data-studio-import-calque={c.cible}><span translate="no">{c.nom}</span> → <span>{CIBLES_CALQUE[c.cible]}</span>{` (${c.objets} objet(s))`}{c.nomRaccourci && <span> — nom raccourci</span>}</li>
      ))}</ul></>}
    </section>
  );
}
