/**
 * Boîte « Modèles externes » (Maj+F2, lot F3, TR-EX-066) : référencer un modèle reçu d'un partenaire (auteur,
 * discipline, format, version, unité et transformation **déclarées**), le faire relire et comparer par le serveur à la
 * révision courante, puis l'accepter ou le refuser explicitement (propriétaire ou approbateur ; un refus porte un
 * motif ; chaque passage est journalisé). Un modèle reçu, comparé ou refusé ne modifie rien ; accepté, il peut être
 * ajouté au brouillon par l'import (« Ajouter au brouillon »), puis enregistré comme toute modification.
 */
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { studioSourceIfcLue, type StudioCommand, type StudioDocument, type StudioIfcResultat, type StudioUniteDeclaree } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { LIBELLES_MOTIF_PERTE, lireIfc } from "../import/import-ifc-ui";
import { MESSAGE_TROP_GROS, metres, TAILLE_MAX_OCTETS } from "../import/import-dxf-ui";
import { apiModelesExternes, ErreurModeleExterne, type ListeModeles, type ModeleExterneLu, cheminProvenance } from "./api-modeles-externes";
import {
  compteDifferences, FAMILLES_COMPARAISON, LIBELLES_ACTION_MODELE, LIBELLES_ECART_MODELE, LIBELLES_STATUT_MODELE, SAISIE_TRANSFORMATION_VIDE, transformationSaisie,
  UNITES_DECLARABLES, type SaisieTransformation,
} from "./modeles-externes-ui";
import "./echanges.css";

export interface PanneauModelesExternesProps {
  projectId: string;
  studyId: string;
  variantId: string;
  revisionId: string;
  /** Brouillon courant : reçoit l'import d'un modèle accepté. */
  brouillon: StudioDocument;
  modifiable: boolean;
  /** Droit d'écriture du serveur sur la variante affichée ; faux sur une révision historique. */
  ecriture: boolean;
  brouillonNonEnregistre: boolean;
  surFermer: () => void;
  surAjouter: (commandes: StudioCommand[], resultat: StudioIfcResultat) => boolean;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(LOCALE) : "");
const message = (e: unknown) => (e instanceof ErreurModeleExterne ? e.message : "Le serveur n’a pas répondu.");

export function PanneauModelesExternes({ projectId, studyId, variantId, brouillon, modifiable, ecriture, brouillonNonEnregistre, surFermer, surAjouter }: PanneauModelesExternesProps) {
  const [liste, setListe] = useState<ListeModeles | null>(null);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState<ModeleExterneLu | null>(null);
  const charger = useCallback(async () => {
    try { setListe(await apiModelesExternes.lister(projectId, studyId, variantId)); setErreur(""); }
    catch (e) { setErreur(message(e)); }
  }, [projectId, studyId, variantId]);
  useEffect(() => { void charger(); }, [charger]);

  async function detailler(id: string) {
    try { setOuvert(await apiModelesExternes.lire(projectId, studyId, variantId, id)); }
    catch (e) { setErreur(message(e)); }
  }

  return (
    <Dialogue titre="Modèles externes" id="studio-modeles-externes-titre" classe="studio-echanges" surFermer={surFermer}>
      <div className="studio-echanges-corps" data-studio-modeles-externes>
        <p className="studio-dialogue-aide">Modèles reçus de partenaires : chacun est relu et comparé par le serveur à la révision courante, puis accepté ou refusé explicitement. Un modèle reçu ne modifie jamais la variante ; accepté, il peut être ajouté au brouillon.</p>
        {erreur && <p role="alert" data-studio-modeles-erreur>{erreur}</p>}
        {liste && liste.peutRecevoir && ecriture && <Reception {...{ projectId, studyId, variantId }} surRecu={async (m) => { await charger(); setOuvert(m); }} surErreur={setErreur} />}
        {liste && !(liste.peutRecevoir && ecriture) && <p role="status" data-studio-modeles-lecture>Lecture seule : la réception d’un modèle est réservée aux comptes qui modifient la variante.</p>}
        {liste && liste.modeles.length === 0 && <p data-studio-modeles-vide>Aucun modèle externe reçu pour cette variante.</p>}
        {liste && liste.modeles.length > 0 && <div className="studio-echanges-tableau">
          <table data-studio-modeles-table>
            <thead><tr><th scope="col">Modèle</th><th scope="col">Version</th><th scope="col">Auteur</th><th scope="col">Discipline</th><th scope="col">Statut</th><th scope="col">Reçu le</th></tr></thead>
            <tbody>{liste.modeles.map((m) => (
              <tr key={m.id} data-studio-modele={m.id} data-studio-modele-statut={m.statut}>
                <th scope="row"><button type="button" className="studio-lien" onClick={() => void detailler(m.id)} data-studio-modele-ouvrir={m.id}><span translate="no">{m.reference}</span></button></th>
                <td translate="no">{m.version}</td><td translate="no">{m.auteur}</td><td translate="no">{m.discipline}</td>
                <td><span className={`studio-echanges-statut studio-modele-statut-${m.statut}`}>{LIBELLES_STATUT_MODELE[m.statut]}</span></td>
                <td>{date(m.recuLe)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
        {ouvert && liste && <Detail lienProvenance={cheminProvenance(projectId, studyId, variantId, ouvert.id)} m={ouvert} liste={liste} ecriture={ecriture} modifiable={modifiable} brouillon={brouillon} brouillonNonEnregistre={brouillonNonEnregistre}
          passer={async (action, motif) => {
            try { const m = await apiModelesExternes.passer(projectId, studyId, variantId, ouvert.id, action, motif); setOuvert(m); await charger(); setErreur(""); return true; }
            catch (e) { setErreur(message(e)); return false; }
          }}
          ajouter={async () => {
            try {
              const c = await apiModelesExternes.contenu(projectId, studyId, variantId, ouvert.id);
              const l = lireIfc(c.contenu, brouillon, c.transformation);
              if ("erreur" in l) { setErreur(l.erreur); return; }
              if (l.resultat.statut !== "pret" || !l.resultat.commandes.length) { setErreur("Rien à ajouter : l’unité du fichier n’est pas évaluée ou le modèle est vide."); return; }
              // EX-014 : la provenance du modèle reçu (déclarations de l'émetteur, empreinte, réception) accompagne l'ajout.
              const source = studioSourceIfcLue({ empreinteSha256: l.empreinteSha256, versionFormat: l.resultat.rapport.schema || null }, {
                id: crypto.randomUUID(), nomFichier: ouvert.nomFichier, recuLe: ouvert.recuLe, objets: l.resultat.rapport.entites.total,
                unite: { nom: l.resultat.rapport.unite.nom, facteur: l.resultat.rapport.unite.facteur }, transformation: c.transformation,
                auteur: ouvert.auteur, repereSource: ouvert.repereSource, restrictions: ouvert.restrictions,
              });
              if (!surAjouter([...l.resultat.commandes, { toolId: "studio.source.declarer", params: source }], l.resultat)) setErreur("Ajout refusé par le modèle : le brouillon est inchangé.");
            } catch (e) { setErreur(message(e)); }
          }} />}
      </div>
    </Dialogue>
  );
}

function Reception({ projectId, studyId, variantId, surRecu, surErreur }: { projectId: string; studyId: string; variantId: string; surRecu: (m: ModeleExterneLu) => Promise<void>; surErreur: (m: string) => void }) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [champs, setChamps] = useState({ reference: "", auteur: "", discipline: "", version: "" });
  const [unite, setUnite] = useState<StudioUniteDeclaree | "">("");
  const [avecTransformation, setAvecTransformation] = useState(false);
  // EX-014 : repère source et restrictions d'utilisation déclarés (facultatifs ; vides : non déclarés).
  const [provenance, setProvenance] = useState({ repereSource: "", restrictions: "" });
  const [t, setT] = useState<SaisieTransformation>(SAISIE_TRANSFORMATION_VIDE);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState("");

  function choisir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setRefus("");
    if (f && f.size > TAILLE_MAX_OCTETS) { setRefus(MESSAGE_TROP_GROS); setFichier(null); return; }
    setFichier(f);
  }
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!fichier || !unite || Object.values(champs).some((v) => !v.trim())) { setRefus("Renseignez le fichier, la référence, l’auteur, la discipline, la version et l’unité déclarée."); return; }
    const transformation = avecTransformation ? transformationSaisie(t) : null;
    if (transformation && "erreur" in transformation) { setRefus(transformation.erreur); return; }
    setEnCours(true); setRefus("");
    try {
      const contenu = await fichier.text();
      const m = await apiModelesExternes.recevoir(projectId, studyId, variantId, {
        ...champs, format: "ifc", uniteDeclaree: unite, transformation, nomFichier: fichier.name, contenu, requestId: crypto.randomUUID(),
        repereSource: provenance.repereSource.trim() || null, restrictions: provenance.restrictions.trim() || null,
      });
      await surRecu(m);
    } catch (err) { surErreur(message(err)); }
    finally { setEnCours(false); }
  }
  const champ = (cle: keyof typeof champs, libelle: string) => (
    <label>{libelle}<input type="text" value={champs[cle]} onChange={(e) => setChamps({ ...champs, [cle]: e.target.value })} maxLength={cle === "discipline" || cle === "version" ? 80 : 200} data-studio-modele-champ={cle} /></label>
  );
  return (
    <form className="studio-modeles-reception" onSubmit={(e) => void envoyer(e)} aria-labelledby="studio-modeles-reception-titre" data-studio-modeles-reception>
      <h3 id="studio-modeles-reception-titre">Recevoir un modèle</h3>
      <label>Fichier IFC<input type="file" accept=".ifc,application/x-step,model/ifc" onChange={choisir} data-studio-modele-fichier /></label>
      {champ("reference", "Référence du modèle")}
      {champ("auteur", "Auteur")}
      {champ("discipline", "Discipline")}
      {champ("version", "Version")}
      <label>Unité déclarée<select value={unite} onChange={(e) => setUnite(e.target.value as StudioUniteDeclaree | "")} data-studio-modele-unite>
        <option value="">Choisir…</option>
        {UNITES_DECLARABLES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}
      </select></label>
      <label className="studio-import-option"><input type="checkbox" checked={avecTransformation} onChange={(e) => setAvecTransformation(e.target.checked)} data-studio-modele-avec-transformation /> Transformation déclarée par l’émetteur</label>
      {avecTransformation && <fieldset data-studio-modele-transformation>
        <legend>Transformation vers le repère local (déclarée, jamais devinée)</legend>
        <label>Translation X (m)<input inputMode="decimal" value={t.dx} onChange={(e) => setT({ ...t, dx: e.target.value })} data-studio-modele-dx /></label>
        <label>Translation Y (m)<input inputMode="decimal" value={t.dy} onChange={(e) => setT({ ...t, dy: e.target.value })} data-studio-modele-dy /></label>
        <label>Translation Z (m)<input inputMode="decimal" value={t.dz} onChange={(e) => setT({ ...t, dz: e.target.value })} data-studio-modele-dz /></label>
        <label>Rotation autour de Z (°)<input inputMode="decimal" value={t.rotationDegres} onChange={(e) => setT({ ...t, rotationDegres: e.target.value })} data-studio-modele-rotation /></label>
      </fieldset>}
      <label>Repère source déclaré (facultatif)<input type="text" value={provenance.repereSource} maxLength={200} onChange={(e) => setProvenance({ ...provenance, repereSource: e.target.value })} data-studio-modele-repere-source /></label>
      <label>Restrictions d’utilisation (facultatif)<input type="text" value={provenance.restrictions} maxLength={2000} onChange={(e) => setProvenance({ ...provenance, restrictions: e.target.value })} data-studio-modele-restrictions /></label>
      {refus && <p role="alert" data-studio-modele-refus>{refus}</p>}
      <button type="submit" disabled={enCours} data-studio-modele-recevoir><Icon name="studio-external-models" size={18} /> Recevoir et comparer</button>
    </form>
  );
}

function Detail({ m, liste, ecriture, modifiable, brouillonNonEnregistre, passer, ajouter, lienProvenance }: {
  m: ModeleExterneLu; liste: ListeModeles; ecriture: boolean; modifiable: boolean; brouillon: StudioDocument; brouillonNonEnregistre: boolean; lienProvenance: string;
  passer: (action: "comparer" | "accepter" | "refuser", motif?: string) => Promise<boolean>; ajouter: () => Promise<void>;
}) {
  const [motif, setMotif] = useState("");
  const c = m.comparaison, r = m.rapport;
  const perimee = c.revisionId !== liste.teteRevisionId;
  const decidable = m.statut === "compare" && ecriture && liste.peutDecider;
  return (
    <section className="studio-modele-detail" aria-labelledby="studio-modele-detail-titre" data-studio-modele-detail={m.id} data-studio-modele-statut={m.statut} data-studio-modele-version={m.version}>
      <h3 id="studio-modele-detail-titre"><span translate="no">{m.reference}</span> — <span translate="no">{m.version}</span></h3>
      <dl className="studio-modele-declarations">
        <dt>Auteur</dt><dd translate="no">{m.auteur}</dd>
        <dt>Discipline</dt><dd translate="no">{m.discipline}</dd>
        <dt>Format</dt><dd translate="no">IFC</dd>
        <dt>Fichier</dt><dd translate="no">{m.nomFichier}</dd>
        <dt>Unité déclarée</dt><dd translate="no">{m.uniteDeclaree}</dd>
        <dt>Unité lue</dt>{r.unite.origine === "fichier" ? <dd translate="no">{r.unite.nom}</dd> : <dd>non évaluée</dd>}
        <dt>Schéma</dt><dd translate="no">{r.schema}</dd>
        <dt>SHA-256</dt><dd><code translate="no">{m.contentSha256.slice(0, 16)}</code></dd>
        <dt>Repère source</dt>{m.repereSource ? <dd translate="no" data-studio-modele-repere-declare>{m.repereSource}</dd> : <dd data-studio-modele-repere-declare="">non déclaré</dd>}
        <dt>Restrictions d’utilisation</dt>{m.restrictions ? <dd translate="no" data-studio-modele-restrictions-declarees>{m.restrictions}</dd> : <dd data-studio-modele-restrictions-declarees="">non déclarées</dd>}
        <dt>Reçu le</dt><dd translate="no">{date(m.recuLe)}</dd>
      </dl>
      <p><a href={lienProvenance} download data-studio-modele-provenance>Exporter la provenance</a></p>
      <p data-studio-modele-transformation-declaree>{m.transformation
        ? `Transformation déclarée : translation (${metres(m.transformation.dx, LOCALE)} ; ${metres(m.transformation.dy, LOCALE)} ; ${metres(m.transformation.dz, LOCALE)}) m, rotation ${metres((m.transformation.rotation * 180) / Math.PI, LOCALE)}°.`
        : "Aucune transformation déclarée."}</p>
      <p><strong>{LIBELLES_STATUT_MODELE[m.statut]}</strong>{m.decision && <> — <span translate="no">{m.decision.parEmail ?? m.decision.par}</span>, {date(m.decision.le)}{m.decision.motif && <> : <q translate="no">{m.decision.motif}</q></>}</>}</p>
      <h3>Comparaison avec la révision <code translate="no">{c.revisionId.slice(-8)}</code></h3>
      {perimee && <p role="status" data-studio-modele-perimee>La variante a changé depuis cette comparaison : comparez de nouveau avant de décider.</p>}
      <p data-studio-modele-identiques={c.identiques ? "oui" : "non"}>{c.identiques ? "Aucun écart : le modèle reçu est identique à la révision comparée." : `${c.differencesTotal} élément(s) diffèrent de la révision comparée (par identifiant).`}</p>
      <ul data-studio-modele-resume>{FAMILLES_COMPARAISON.map((f) => <li key={f.cle} data-famille={f.cle} data-ajoute={c.resume[f.cle].ajoute}>{f.libelle} : {compteDifferences(c.resume[f.cle])}</li>)}</ul>
      {c.ecarts.length > 0 && <ul data-studio-modele-ecarts>{c.ecarts.map((x) => <li key={x} data-ecart={x}>{LIBELLES_ECART_MODELE[x]}</li>)}</ul>}
      {r.nonNatifsTotal > 0 && <p>{`Éléments non natifs du modèle : ${r.nonNatifsTotal}.`}</p>}
      {r.pertes.length > 0 && <ul className="studio-import-non-pris">{r.pertes.map((p) => <li key={`${p.type}|${p.motif ?? ""}`}><span translate="no">{p.type}</span> (<span>{LIBELLES_MOTIF_PERTE[p.motif ?? "aucun"]}</span>) : <span translate="no">{p.nombre}</span></li>)}</ul>}
      <div className="studio-import-actions">
        {m.statut === "compare" && ecriture && liste.peutRecevoir && <button type="button" onClick={() => void passer("comparer")} data-studio-modele-action="comparer"><Icon name="studio-exchanges" size={18} /> Comparer de nouveau</button>}
        {decidable && <>
          <label>Motif (obligatoire pour un refus)<textarea value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={2000} data-studio-modele-motif /></label>
          <button type="button" disabled={perimee} onClick={() => void passer("accepter", motif.trim() || undefined)} data-studio-modele-action="accepter"><Icon name="studio-external-models" size={18} /> Accepter</button>
          <button type="button" disabled={!motif.trim()} onClick={() => void passer("refuser", motif.trim()).then((ok) => { if (ok) setMotif(""); })} data-studio-modele-action="refuser"><Icon name="studio-cancel" size={18} /> Refuser</button>
        </>}
        {m.statut === "compare" && !liste.peutDecider && <p role="status">Accepter ou refuser est réservé au propriétaire du projet et aux approbateurs.</p>}
        {m.statut === "accepte" && <button type="button" disabled={!modifiable} onClick={() => void ajouter()} data-studio-modele-ajouter><Icon name="studio-import-ifc" size={18} /> Ajouter au brouillon</button>}
        {m.statut === "accepte" && brouillonNonEnregistre && <p className="studio-dialogue-aide">Le brouillon contient des modifications non enregistrées : l’ajout s’y joint.</p>}
      </div>
      {m.journal && <><h3>Journal</h3><ol data-studio-modele-journal>{m.journal.map((e) => (
        <li key={e.seq} data-action={e.action}>{LIBELLES_ACTION_MODELE[e.action]} — <span translate="no">{e.parEmail ?? e.par}</span>, {date(e.le)}{e.motif && <> : <q translate="no">{e.motif}</q></>}</li>
      ))}</ol></>}
      {c.differences.length > 0 && <details><summary>{`Éléments qui diffèrent (${c.differences.length}${c.differencesTotal > c.differences.length ? ` sur ${c.differencesTotal}` : ""})`}</summary>
        <ul>{c.differences.map((d) => <li key={`${d.famille}|${d.id}|${d.etat}`} data-etat={d.etat}><code translate="no">{d.id}</code> — <span translate="no">{d.type}</span> : <span>{LIBELLES_ETAT[d.etat]}</span>{d.proprietes.map((p) => <span key={p}> · <span>{LIBELLES_PROPRIETE[p]}</span></span>)}</li>)}</ul>
      </details>}
    </section>
  );
}

const LIBELLES_ETAT: Record<"ajoute" | "supprime" | "modifie" | "identique", string> = { ajoute: "ajouté", supprime: "supprimé", modifie: "modifié", identique: "identique" };
const LIBELLES_PROPRIETE: Record<"geometrie" | "calque" | "attributs", string> = { geometrie: "géométrie", calque: "calque", attributs: "attributs" };
