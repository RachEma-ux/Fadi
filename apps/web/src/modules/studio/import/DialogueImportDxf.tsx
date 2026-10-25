/**
 * Boîte « Importer DXF » (Maj+U) : choix du fichier, aperçu du rapport de `lireDxfStudio` (unité et facteur vers le
 * mètre, objets ajoutés, calques, étendue, entités non prises par type), choix de l'unité quand le fichier n'en déclare
 * pas (aucune n'est présélectionnée), puis « Ajouter au brouillon » : un seul lot local, annulable par Ctrl+Z, envoyé
 * au serveur seulement à l'enregistrement. Rien n'est lu ni écrit côté serveur ici.
 *
 * La lecture (jusqu'à 5 Mo) est une tâche de fond de l'ordonnanceur (`taches/`, groupe de Workers) : l'interface reste réactive,
 * l'étape en cours est annoncée et « Annuler la lecture » arrête le calcul. Un nouveau choix (fichier, unité,
 * brouillon) remplace la lecture en cours ; seul le dernier résultat est retenu et « Ajouter » attend qu'il soit prêt.
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { StudioCommand, StudioDocument, StudioDxfResultat, StudioDxfUnite } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { calculSurFilPrincipal, MESSAGE_REPLI } from "../workers/client-studio";
import { empreinteDe, revisionDocument } from "../taches/empreinte";
import { messageTache } from "../taches/messages";
import type { Progression } from "../taches/ordonnanceur";
import { DELAI_LECTURE_DXF_MS, ordonnanceurStudio } from "../taches/pool-studio";
import { CIBLES_CALQUE, MESSAGE_TROP_GROS, metres, TAILLE_MAX_OCTETS, typeNonPris, UNITES_PROPOSEES, type LectureDxf } from "./import-dxf-ui";
import "./import-dxf.css";

export interface DialogueImportDxfProps {
  /** Brouillon courant : identifiants pris, calques existants, limites. */
  doc: StudioDocument;
  modifiable: boolean;
  /** Applique le lot au brouillon ; `false` si le modèle le refuse (le brouillon reste inchangé). */
  surAjouter: (commandes: StudioCommand[], resultat: StudioDxfResultat) => boolean;
  surFermer: () => void;
}

/** Libellé de l'étape annoncée par le Worker (texte d'interface). */
export const ETAPES_LECTURE: Readonly<Record<string, string>> = Object.freeze({
  attente: "Lecture en préparation…",
  lecture: "Lecture du fichier…",
  analyse: "Analyse des entités du DXF…",
});

export function DialogueImportDxf({ doc, modifiable, surAjouter, surFermer }: DialogueImportDxfProps) {
  const [fichier, setFichier] = useState<{ nom: string; source: Blob } | null>(null);
  const [unite, setUnite] = useState<StudioDxfUnite | null>(null);
  // Lot F3 (TEST-028) : chaque entité entière non prise est conservée comme élément non natif (case cochée par défaut).
  const [conserver, setConserver] = useState(true);
  const [erreurFichier, setErreurFichier] = useState("");
  const [refus, setRefus] = useState(false);
  const [annulee, setAnnulee] = useState(false);
  // Numéro de la dernière lecture demandée, et dernier résultat reçu (avec le numéro de sa demande).
  const [attendue, setAttendue] = useState(0);
  const [lecture, setLecture] = useState<{ n: number; valeur: LectureDxf } | null>(null);
  const [etape, setEtape] = useState("attente");
  const [erreurCalcul, setErreurCalcul] = useState("");
  const [cleChamp, setCleChamp] = useState(0);
  const numero = useRef(0);
  const controleur = useRef<AbortController | null>(null);

  // Relue quand le fichier, l'unité choisie ou le brouillon changent ; la lecture précédente est arrêtée.
  useEffect(() => {
    if (!fichier) return;
    const n = ++numero.current;
    const c = new AbortController();
    controleur.current = c;
    setAttendue(n); setEtape("attente"); setErreurCalcul("");
    const tache = ordonnanceurStudio().soumettre<unknown, LectureDxf>({
      cle: "studio.import-dxf", classe: "fond", nature: "dxf.lire", charge: { source: fichier.source, document: doc, unite, conserverNonNatifs: conserver },
      empreinte: empreinteDe(doc, { fichier: revisionDocument(fichier.source), unite, conserver }), delaiMs: DELAI_LECTURE_DXF_MS, signal: c.signal,
      surProgression: (p: Progression) => { if (numero.current === n) setEtape(p.etape); },
      surResultat: (valeur) => { if (numero.current === n) setLecture({ n, valeur }); },
    });
    void tache.issue.then((i) => {
      const message = messageTache(i);
      if (numero.current === n && message !== null) { setErreurCalcul(message); setLecture(null); }
    });
    return () => c.abort();
  }, [fichier, doc, unite, conserver]);

  const enCours = fichier !== null && !erreurCalcul && lecture?.n !== attendue;
  const courante = fichier && !enCours && lecture?.n === attendue ? lecture.valeur : null;
  // Pendant une relecture (autre unité), le rapport précédent reste affiché, marqué « en cours » : le choix d'unité
  // garde sa place et son focus ; « Ajouter » attend le nouveau résultat.
  const affichee = fichier ? lecture?.valeur ?? null : null;

  function choisir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFichier(null); setUnite(null); setErreurFichier(""); setRefus(false); setAnnulee(false); setLecture(null); setErreurCalcul("");
    if (!f) return;
    if (f.size > TAILLE_MAX_OCTETS) { setErreurFichier(MESSAGE_TROP_GROS); return; }
    // Le fichier lui-même part au Worker : son texte n'est jamais décodé sur le fil principal.
    setFichier({ nom: f.name, source: f });
  }

  function annuler() {
    controleur.current?.abort();
    numero.current += 1;
    setFichier(null); setUnite(null); setLecture(null); setAnnulee(true);
    // Nouveau champ de fichier : le même fichier peut être choisi de nouveau.
    setCleChamp((k) => k + 1);
  }

  return (
    <Dialogue titre="Importer DXF" id="studio-import-dxf-titre" classe="studio-import-dxf" surFermer={surFermer}>
      <div data-studio-import-dxf aria-busy={enCours || undefined}>
        <p className="studio-dialogue-aide">DXF ASCII (R12 ou suivant). Lignes et polylignes deviennent des lignes et des rectangles du brouillon ; les autres entités sont listées, jamais écartées en silence. Rien n’est enregistré avant « Enregistrer ».</p>
        <label className="studio-import-option"><input type="checkbox" checked={conserver} disabled={!modifiable} onChange={(e) => setConserver(e.target.checked)} data-studio-import-conserver-non-natifs /> Conserver les entités non prises comme éléments non natifs</label>
        <label>Fichier DXF<input key={cleChamp} type="file" accept=".dxf,application/dxf,image/vnd.dxf" disabled={!modifiable} onChange={choisir} data-studio-import-fichier /></label>
        {erreurFichier && <p role="alert" data-studio-import-erreur>{erreurFichier}</p>}
        {enCours && <div className="studio-import-en-cours" role="status" data-studio-import-en-cours data-studio-import-etape={etape}>
          <progress aria-label="Lecture du DXF en cours" />
          <span>{ETAPES_LECTURE[etape] ?? ETAPES_LECTURE["attente"]}</span>
          <button type="button" onClick={annuler} data-studio-import-annuler><Icon name="studio-cancel" size={16} /> Annuler la lecture</button>
        </div>}
        {fichier && calculSurFilPrincipal() && <p className="studio-dialogue-aide" role="status" data-studio-calcul-repli>{MESSAGE_REPLI}</p>}
        {annulee && <p role="status" data-studio-import-annulee>Lecture annulée : rien n’est ajouté. Choisissez de nouveau un fichier.</p>}
        {erreurCalcul && <p role="alert" data-studio-import-erreur>{erreurCalcul}</p>}
        {affichee && "erreur" in affichee && <p role="alert" data-studio-import-erreur>{affichee.erreur}</p>}
        {affichee && "resultat" in affichee && fichier && <Rapport nom={fichier.nom} resultat={affichee.resultat} unite={unite} surUnite={setUnite} enCours={enCours} />}
        {refus && <p role="alert" data-studio-import-erreur>Ajout refusé par le modèle : le brouillon est inchangé.</p>}
        {!modifiable && <p role="status">Lecture seule : l’import est indisponible.</p>}
        <div className="studio-import-actions">
          <button type="button" disabled={!modifiable || !courante || !("resultat" in courante) || courante.resultat.statut !== "pret" || courante.resultat.commandes.length === 0}
            onClick={() => { if (courante && "resultat" in courante) { const ok = surAjouter(courante.resultat.commandes, courante.resultat); setRefus(!ok); } }} data-studio-import-ajouter>
            <Icon name="studio-import-dxf" size={18} /> Ajouter au brouillon
          </button>
        </div>
      </div>
    </Dialogue>
  );
}

export function Rapport({ nom, resultat, unite, surUnite, enCours = false }: { nom: string; resultat: StudioDxfResultat; unite: StudioDxfUnite | null; surUnite: (u: StudioDxfUnite | null) => void; enCours?: boolean }) {
  const r = resultat.rapport;
  const inconnue = r.unite.origine !== "fichier";
  const nonPris = r.nonPris.reduce((n, x) => n + x.nombre, 0);
  return (
    <section className="studio-import-rapport" aria-label="Rapport d’import" data-studio-import-rapport data-studio-import-statut={resultat.statut} aria-busy={enCours || undefined} data-studio-import-a-jour={enCours ? "non" : "oui"}
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
      {r.nonNatifs !== undefined && r.nonNatifs > 0 && <p data-studio-import-non-natifs={r.nonNatifs}>{`${r.nonNatifs} entité(s) conservée(s) comme éléments non natifs (non éditables, exclues des métrés).`}</p>}
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
