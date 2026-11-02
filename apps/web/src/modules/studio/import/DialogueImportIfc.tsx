/**
 * Boîte « Importer IFC » (Maj+F9, lot F3, TEST-028) : choix du fichier, aperçu du rapport de `lireIfcStudio`
 * (schéma, unité lue et facteur vers le mètre, objets natifs ajoutés, éléments **non natifs** conservés par type, pertes
 * par type, calques des niveaux, étendue), puis « Ajouter au brouillon » : un seul lot local, annulable par Ctrl+Z,
 * envoyé au serveur seulement à l'enregistrement. Une unité absente du fichier n'est jamais choisie à sa place : rien
 * n'est ajouté. La lecture (jusqu'à 5 Mo) est une tâche de fond de l'ordonnanceur, comme celle du DXF.
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { studioSourceIfcLue, type StudioCommand, type StudioDocument, type StudioIfcResultat } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { calculSurFilPrincipal, MESSAGE_REPLI } from "../workers/client-studio";
import { empreinteDe, revisionDocument } from "../taches/empreinte";
import { messageTache } from "../taches/messages";
import type { Progression } from "../taches/ordonnanceur";
import { DELAI_LECTURE_DXF_MS, ordonnanceurStudio } from "../taches/pool-studio";
import { CIBLES_CALQUE, MESSAGE_TROP_GROS, metres, TAILLE_MAX_OCTETS } from "./import-dxf-ui";
import { LIBELLES_MOTIF_PERTE, type LectureIfc } from "./import-ifc-ui";
import { ETAPES_LECTURE } from "./DialogueImportDxf";
import "./import-dxf.css";

export interface DialogueImportIfcProps {
  doc: StudioDocument;
  modifiable: boolean;
  /** Applique le lot au brouillon ; `false` si le modèle le refuse (le brouillon reste inchangé). */
  surAjouter: (commandes: StudioCommand[], resultat: StudioIfcResultat) => boolean;
  surFermer: () => void;
}

export function DialogueImportIfc({ doc, modifiable, surAjouter, surFermer }: DialogueImportIfcProps) {
  const [fichier, setFichier] = useState<{ nom: string; source: Blob } | null>(null);
  const [erreurFichier, setErreurFichier] = useState("");
  const [refus, setRefus] = useState(false);
  const [attendue, setAttendue] = useState(0);
  const [lecture, setLecture] = useState<{ n: number; valeur: LectureIfc } | null>(null);
  const [etape, setEtape] = useState("attente");
  const [erreurCalcul, setErreurCalcul] = useState("");
  // Provenance déclarée par l'utilisateur (EX-014) ; vide : non déclarée.
  const [auteur, setAuteur] = useState(""), [repereSource, setRepereSource] = useState(""), [restrictions, setRestrictions] = useState("");
  const numero = useRef(0);

  useEffect(() => {
    if (!fichier) return;
    const n = ++numero.current;
    const c = new AbortController();
    setAttendue(n); setEtape("attente"); setErreurCalcul("");
    const tache = ordonnanceurStudio().soumettre<unknown, LectureIfc>({
      cle: "studio.import-ifc", classe: "fond", nature: "ifc.lire", charge: { source: fichier.source, document: doc },
      empreinte: empreinteDe(doc, { fichier: revisionDocument(fichier.source), format: "ifc" }), delaiMs: DELAI_LECTURE_DXF_MS, signal: c.signal,
      surProgression: (p: Progression) => { if (numero.current === n) setEtape(p.etape); },
      surResultat: (valeur) => { if (numero.current === n) setLecture({ n, valeur }); },
    });
    void tache.issue.then((i) => {
      const message = messageTache(i);
      if (numero.current === n && message !== null) { setErreurCalcul(message); setLecture(null); }
    });
    return () => c.abort();
  }, [fichier, doc]);

  const enCours = fichier !== null && !erreurCalcul && lecture?.n !== attendue;
  const courante = fichier && !enCours && lecture?.n === attendue ? lecture.valeur : null;
  const affichee = fichier ? lecture?.valeur ?? null : null;

  function choisir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFichier(null); setErreurFichier(""); setRefus(false); setLecture(null); setErreurCalcul("");
    if (!f) return;
    if (f.size > TAILLE_MAX_OCTETS) { setErreurFichier(MESSAGE_TROP_GROS); return; }
    setFichier({ nom: f.name, source: f });
  }

  const pret = courante && "resultat" in courante && courante.resultat.statut === "pret" && courante.resultat.commandes.length > 0;
  return (
    <Dialogue titre="Importer IFC" id="studio-import-ifc-titre" classe="studio-import-dxf" surFermer={surFermer}>
      <div data-studio-import-ifc aria-busy={enCours || undefined}>
        <p className="studio-dialogue-aide">IFC en texte (STEP physique : IFC2X3, IFC4, IFC4X3). Murs, ouvertures, portes et fenêtres deviennent des objets natifs ; dalles, des prismes libres ; niveaux, des calques. Toute autre entité est conservée comme élément non natif (type, GlobalId, raison), jamais écartée en silence. L’unité est lue dans le fichier, jamais supposée. Rien n’est enregistré avant « Enregistrer ».</p>
        <label>Fichier IFC<input type="file" accept=".ifc,application/x-step,model/ifc" disabled={!modifiable} onChange={choisir} data-studio-import-ifc-fichier /></label>
        {erreurFichier && <p role="alert" data-studio-import-ifc-erreur>{erreurFichier}</p>}
        {enCours && <div className="studio-import-en-cours" role="status" data-studio-import-ifc-en-cours data-studio-import-etape={etape}>
          <progress aria-label="Lecture de l’IFC en cours" />
          <span>{ETAPES_LECTURE[etape] ?? ETAPES_LECTURE["attente"]}</span>
        </div>}
        {fichier && calculSurFilPrincipal() && <p className="studio-dialogue-aide" role="status" data-studio-calcul-repli>{MESSAGE_REPLI}</p>}
        {erreurCalcul && <p role="alert" data-studio-import-ifc-erreur>{erreurCalcul}</p>}
        {affichee && "erreur" in affichee && <p role="alert" data-studio-import-ifc-erreur>{affichee.erreur}</p>}
        {affichee && "resultat" in affichee && fichier && <RapportIfc nom={fichier.nom} resultat={affichee.resultat} enCours={enCours} />}
        {refus && <p role="alert" data-studio-import-ifc-erreur>Ajout refusé par le modèle : le brouillon est inchangé.</p>}
        {!modifiable && <p role="status">Lecture seule : l’import est indisponible.</p>}
        {pret && fichier && courante && "resultat" in courante && <fieldset className="studio-import-provenance" data-studio-import-ifc-provenance data-studio-import-empreinte={courante.empreinteSha256}>
          <legend>Provenance de la source</legend>
          <p className="studio-dialogue-aide"><span>{`Empreinte SHA-256 : ${courante.empreinteSha256.slice(0, 16)}…`}</span>{" · "}<span>{`Version du format : ${courante.resultat.rapport.schema}`}</span></p>
          <label>Auteur ou fournisseur (si connu)<input value={auteur} onChange={(e) => setAuteur(e.target.value)} data-studio-import-ifc-auteur /></label>
          <label>Repère source déclaré<input value={repereSource} onChange={(e) => setRepereSource(e.target.value)} data-studio-import-ifc-repere /></label>
          <label>Restrictions d’utilisation<input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} data-studio-import-ifc-restrictions /></label>
        </fieldset>}
        <div className="studio-import-actions">
          <button type="button" disabled={!modifiable || !pret}
            onClick={() => {
              if (!courante || !("resultat" in courante) || !fichier) return;
              const r = courante.resultat;
              const source = studioSourceIfcLue({ empreinteSha256: courante.empreinteSha256, versionFormat: r.rapport.schema || null }, {
                id: crypto.randomUUID(), nomFichier: fichier.nom, recuLe: new Date().toISOString(), objets: r.rapport.entites.total,
                unite: { nom: r.rapport.unite.nom, facteur: r.rapport.unite.facteur }, transformation: r.rapport.transformation, auteur, repereSource, restrictions,
              });
              const ok = surAjouter([...r.commandes, { toolId: "studio.source.declarer", params: source }], r);
              setRefus(!ok);
            }} data-studio-import-ifc-ajouter>
            <Icon name="studio-import-ifc" size={18} /> Ajouter au brouillon
          </button>
        </div>
      </div>
    </Dialogue>
  );
}

/** Rapport d'import et de pertes d'un IFC (lecture seule) ; réutilisé par la réception d'un modèle externe. */
export function RapportIfc({ nom, resultat, enCours = false }: { nom: string; resultat: StudioIfcResultat; enCours?: boolean }) {
  const r = resultat.rapport;
  const pertes = r.pertes.reduce((n, x) => n + x.nombre, 0);
  return (
    <section className="studio-import-rapport" aria-label="Rapport d’import et de pertes" data-studio-import-ifc-rapport data-studio-import-ifc-statut={resultat.statut} aria-busy={enCours || undefined}
      data-studio-import-ifc-objets={r.entites.total} data-studio-import-ifc-non-natifs={r.nonNatifsTotal} data-studio-import-ifc-pertes={pertes}>
      <p>Fichier : <span translate="no">{nom}</span></p>
      <p>Schéma : <span translate="no">{r.schema}</span></p>
      {r.unite.origine === "fichier"
        ? <p data-studio-import-ifc-unite>{`Unité du fichier : ${r.unite.nom} · 1 unité = ${metres(r.unite.facteur ?? 0, LOCALE)} m`}</p>
        : <p role="status" data-studio-import-ifc-unite-inconnue>Unité de longueur non évaluée : le fichier n’en déclare pas (IfcUnitAssignment). Rien n’est importé ; elle n’est jamais supposée.</p>}
      <p data-studio-import-ifc-decompte>{`${r.entites.total} objet(s) natif(s) à ajouter : ${r.entites.murs} mur(s), ${r.entites.ouvertures} ouverture(s) dont ${r.entites.portes} porte(s) et ${r.entites.fenetres} fenêtre(s), ${r.entites.prismes} prisme(s) libre(s).`}</p>
      <p>{`${r.niveaux} niveau(x) lu(s).`}</p>
      {r.transformation && <p data-studio-import-ifc-transformation>{`Transformation déclarée appliquée : translation (${metres(r.transformation.dx, LOCALE)} ; ${metres(r.transformation.dy, LOCALE)} ; ${metres(r.transformation.dz, LOCALE)}) m, rotation ${metres((r.transformation.rotation * 180) / Math.PI, LOCALE)}°.`}</p>}
      {r.bornes && <p>{`Étendue : X de ${metres(r.bornes.min.x, LOCALE)} à ${metres(r.bornes.max.x, LOCALE)} m, Y de ${metres(r.bornes.min.y, LOCALE)} à ${metres(r.bornes.max.y, LOCALE)} m (repère local).`}</p>}
      {r.nonNatifsTotal === 0
        ? <p data-studio-import-ifc-tout-natif>Aucun élément non natif.</p>
        : <><p>{`Éléments non natifs conservés : ${r.nonNatifsTotal}, listés par type (non éditables, exclus des métrés).`}</p>
          <ul className="studio-import-non-pris">{r.nonNatifs.map((x) => (
            <li key={x.type} data-studio-import-ifc-non-natif={x.type} data-nombre={x.nombre}><span translate="no">{x.type}</span> : <span translate="no">{x.nombre}</span></li>
          ))}</ul></>}
      {pertes === 0
        ? <p>Aucune perte relevée.</p>
        : <><p>{`Pertes : ${pertes} information(s) non reprise(s), par type.`}</p>
          <ul className="studio-import-non-pris">{r.pertes.map((x) => (
            <li key={`${x.type}|${x.motif ?? ""}`} data-studio-import-ifc-perte={x.type} data-motif={x.motif ?? "aucun"} data-nombre={x.nombre}>
              <span translate="no">{x.type}</span> (<span>{LIBELLES_MOTIF_PERTE[x.motif ?? "aucun"]}</span>) : <span translate="no">{x.nombre}</span>
            </li>
          ))}</ul></>}
      {r.calques.length > 0 && <><p>Calques</p><ul className="studio-import-calques">{r.calques.map((c) => (
        <li key={c.id ?? "implicite"} data-studio-import-calque={c.cible}>{c.nom === null ? <span>calque implicite</span> : <span translate="no">{c.nom}</span>} → <span>{CIBLES_CALQUE[c.cible]}</span>{` (${c.objets} objet(s))`}</li>
      ))}</ul></>}
    </section>
  );
}
