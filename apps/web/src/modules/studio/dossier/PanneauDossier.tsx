/**
 * Boîte « Feuilles et dossier » (Ctrl+Maj+D, barre Présentation) — production documentaire Studio (E.3-01 à E.3-03).
 *
 * - Feuilles composées : objets propres, rangés à part de la planche de travail ; chacune lit une révision ENREGISTRÉE
 *   d'une variante (jamais le brouillon) et ne la modifie jamais. Le serveur recalcule la provenance de chaque feuille :
 *   révision, variante, vue source (calques), empreinte SHA-256 du document et des données de la vue. Une feuille
 *   épinglée sur une révision plus ancienne que la tête est « périmée » ; « Actualiser » la réépingle explicitement.
 * - Dossier de conception : liste ordonnée de feuilles, métré (brut, déductions et net séparés) et rapport de
 *   fidélité ; le cartouche porte « non évalué » pour toute valeur absente. PDF et JSON téléchargeables ; le dossier
 *   figure aussi au catalogue des Documents du projet.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STUDIO_SHEET_SCALES, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { api, ApiError, type StudioDossier, type StudioSectionView, type StudioSheet } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import {
  calquesProposes, corpsFeuille, deplacer, empreinteAbregee, libelleAjustements, libelleVueSource, messageRefusDossier, refusSaisie, resumeBilan, revisionCourte,
  saisieInitiale, type SaisieFeuilleUi,
} from "./dossier-ui";
import "./dossier.css";

export interface PanneauDossierProps {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée (enregistrée) : la nouvelle feuille la lit. */
  revisionId: string;
  /** Document de cette révision (calques proposés pour la vue source). */
  revision: StudioDocument;
  brouillonNonEnregistre: boolean;
  surFermer: () => void;
}

const refuse = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const erreurDe = (e: unknown) => (e instanceof ApiError ? messageRefusDossier(e.status, e.body) : "Action non confirmée : rechargez avant de réessayer.");

export function PanneauDossier({ projectId, studyId, variantId, revisionId, revision, brouillonNonEnregistre, surFermer }: PanneauDossierProps) {
  const client = useQueryClient();
  const cleFeuilles = ["studio-sheets", projectId, studyId];
  const cleDossiers = ["studio-dossiers", projectId, studyId];
  const feuilles = useQuery({ queryKey: cleFeuilles, queryFn: () => api.studioSheets(projectId, studyId), retry: (n, e) => !refuse(e) && n < 1 });
  const dossiers = useQuery({ queryKey: cleDossiers, queryFn: () => api.studioDossiers(projectId, studyId), retry: (n, e) => !refuse(e) && n < 1 });
  const cleVues = ["studio-section-views", projectId, studyId];
  const vues = useQuery({ queryKey: cleVues, queryFn: () => api.studioSectionViews(projectId, studyId), retry: (n, e) => !refuse(e) && n < 1 });
  const relire = async () => { await client.invalidateQueries({ queryKey: cleFeuilles }); await client.invalidateQueries({ queryKey: cleDossiers }); await client.invalidateQueries({ queryKey: cleVues }); await client.invalidateQueries({ queryKey: ["studio-dossier", projectId, studyId] }); };
  const ecriture = feuilles.data?.canWrite ?? false;
  const liste = feuilles.data?.sheets ?? [];
  return (
    <Dialogue titre="Feuilles et dossier" id="studio-dossier-titre" classe="studio-dossier" surFermer={surFermer}>
      <div className="studio-dossier-corps" data-studio-dossier>
        <p className="studio-dialogue-aide">Les feuilles composées sont rangées à part de la planche de travail : chacune lit une révision enregistrée et ne la modifie jamais. Toute valeur absente du cartouche est imprimée « non évalué ».</p>
        {brouillonNonEnregistre && <p className="studio-info" role="status">Les modifications non enregistrées ne figurent sur aucune feuille : enregistrez d’abord pour les composer.</p>}
        <section aria-labelledby="studio-dossier-feuilles-titre">
          <h3 id="studio-dossier-feuilles-titre">Feuilles composées</h3>
          {feuilles.isPending && <p role="status">Chargement des feuilles…</p>}
          {feuilles.isError && <p role="alert">Feuilles indisponibles. <button type="button" onClick={() => void feuilles.refetch()}>Réessayer</button></p>}
          {feuilles.data && liste.length === 0 && <p data-studio-feuilles-vide>Aucune feuille composée dans cette étude.</p>}
          {liste.length > 0 && (
            <ul className="studio-dossier-feuilles" data-studio-feuilles>
              {liste.map((f) => <CarteFeuille key={f.id} projectId={projectId} studyId={studyId} feuille={f} ecriture={ecriture} surChange={relire} />)}
            </ul>
          )}
          {ecriture && <NouvelleFeuille projectId={projectId} studyId={studyId} variantId={variantId} revisionId={revisionId} revision={revision} feuilles={liste} surCree={relire} />}
        </section>
        <VuesCoupe projectId={projectId} studyId={studyId} variantId={variantId} vues={vues.data?.vues ?? []} ecriture={ecriture} surChange={relire} />
        <section aria-labelledby="studio-dossier-conception-titre">
          <h3 id="studio-dossier-conception-titre">Dossier de conception</h3>
          {dossiers.isError && <p role="alert">Dossiers indisponibles. <button type="button" onClick={() => void dossiers.refetch()}>Réessayer</button></p>}
          <Dossiers projectId={projectId} studyId={studyId} variantId={variantId} revisionId={revisionId} feuilles={liste} vues={vues.data?.vues ?? []} dossiers={dossiers.data?.dossiers ?? []} ecriture={ecriture} surChange={relire} />
        </section>
      </div>
    </Dialogue>
  );
}

function CarteFeuille({ projectId, studyId, feuille: f, ecriture, surChange }: { projectId: string; studyId: string; feuille: StudioSheet; ecriture: boolean; surChange: () => Promise<unknown> }) {
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  async function agir(action: () => Promise<unknown>) {
    if (enCours) return;
    setEnCours(true); setErreur("");
    try { await action(); await surChange(); } catch (e) { setErreur(erreurDe(e)); } finally { setEnCours(false); }
  }
  const p = f.provenance;
  return (
    <li className="studio-dossier-feuille" data-studio-feuille={f.id} data-numero={f.definition.numero} data-actualite={f.freshness} data-revision={f.revisionId} data-empreinte-donnees={p?.vue.empreinteDonnees ?? ""}>
      <div className="studio-dossier-feuille-tete">
        <strong translate="no">{`${f.definition.numero} — ${f.definition.titre}`}</strong>
        <span className={`studio-dossier-etat ${f.freshness === "perimee" ? "studio-dossier-perimee" : ""}`} data-studio-feuille-actualite>{f.freshness === "perimee" ? "Révision plus récente disponible" : "À jour"}</span>
      </div>
      <dl className="studio-dossier-faits">
        <dt>Variante</dt><dd translate="no">{f.variantName}</dd>
        <dt>Révision</dt><dd translate="no" title={f.revisionId}>{revisionCourte(f.revisionId)}</dd>
        <dt>Vue source</dt><dd data-studio-feuille-vue>{libelleVueSource(f)}</dd>
        <dt>Empreinte des données</dt><dd translate="no" title={p?.vue.empreinteDonnees ?? ""} data-studio-feuille-empreinte>{empreinteAbregee(p?.vue.empreinteDonnees)}</dd>
        <dt>Empreinte du document</dt><dd translate="no" title={p?.documentHash ?? ""}>{empreinteAbregee(p?.documentHash)}</dd>
        <dt>Mise en page</dt><dd><span translate="no">{f.definition.format}</span>{" · "}<span>{f.definition.orientation === "paysage" ? "Paysage" : "Portrait"}</span>{" · "}<span translate="no">{p?.echelle ?? "—"}</span></dd>
      </dl>
      {p?.decoupee && <p className="studio-info" data-studio-feuille-decoupee>Dessin découpé au cadre : choisissez une échelle plus petite ou « Ajuster ».</p>}
      {f.error && <p role="alert">{`Vue à revoir : ${f.error}`}</p>}
      <div className="studio-dossier-actions">
        <a className="studio-lien-bouton" href={f.files.svg} download data-studio-feuille-svg><Icon name="studio-sheet-svg" size={18} /> SVG</a>
        <a className="studio-lien-bouton" href={f.files.pdf} download data-studio-feuille-pdf><Icon name="studio-sheet-pdf" size={18} /> PDF</a>
        {ecriture && f.freshness === "perimee" && <button type="button" disabled={enCours} onClick={() => void agir(() => api.updateStudioSheet(projectId, studyId, f.id, { revisionId: f.headRevisionId }))} data-studio-feuille-actualiser>Actualiser sur la dernière révision</button>}
        {ecriture && <button type="button" disabled={enCours} onClick={() => void agir(() => api.deleteStudioSheet(projectId, studyId, f.id))} data-studio-feuille-supprimer>Supprimer la feuille</button>}
      </div>
      {erreur && <p role="alert" data-studio-feuille-erreur>{erreur}</p>}
    </li>
  );
}

function NouvelleFeuille({ projectId, studyId, variantId, revisionId, revision, feuilles, surCree }: {
  projectId: string; studyId: string; variantId: string; revisionId: string; revision: StudioDocument; feuilles: StudioSheet[]; surCree: () => Promise<unknown>;
}) {
  const [s, setS] = useState<SaisieFeuilleUi>(() => saisieInitiale(feuilles));
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const demande = useRef<{ cle: string; id: string } | null>(null);
  const calques = calquesProposes(revision);
  const regler = (r: Partial<SaisieFeuilleUi>) => setS((v) => ({ ...v, ...r }));
  // Numéro proposé suivant après une création (la liste a changé) tant que l'utilisateur n'a rien saisi.
  useEffect(() => { setS((v) => (v.titre ? v : { ...v, numero: saisieInitiale(feuilles).numero })); }, [feuilles.length]);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const refus = refusSaisie(s);
    if (refus) { setErreur(refus); return; }
    const corps = corpsFeuille(s);
    const cle = JSON.stringify([variantId, revisionId, corps]);
    if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
    setEnCours(true); setErreur("");
    try {
      await api.createStudioSheet(projectId, studyId, variantId, { ...corps, revisionId, requestId: demande.current.id });
      demande.current = null;
      setS(saisieInitiale([...feuilles, { definition: { numero: corps.number } } as StudioSheet]));
      await surCree();
    } catch (err) { setErreur(erreurDe(err)); } finally { setEnCours(false); }
  }
  return (
    <form className="studio-dossier-nouvelle" onSubmit={(e) => void envoyer(e)} data-studio-feuille-nouvelle>
      <h4>Nouvelle feuille sur la révision affichée <span translate="no">{revisionCourte(revisionId)}</span></h4>
      <label>Numéro<input value={s.numero} maxLength={20} onChange={(e) => regler({ numero: e.target.value })} data-studio-feuille-numero /></label>
      <label>Titre<input value={s.titre} maxLength={200} onChange={(e) => regler({ titre: e.target.value })} data-studio-feuille-titre /></label>
      <label>Format<select value={s.format} onChange={(e) => regler({ format: e.target.value as SaisieFeuilleUi["format"] })} data-studio-feuille-format-composee>
        {(["A4", "A3", "A2", "A1"] as const).map((k) => <option key={k} value={k}>{k}</option>)}
      </select></label>
      <label>Orientation<select value={s.orientation} onChange={(e) => regler({ orientation: e.target.value as SaisieFeuilleUi["orientation"] })}>
        <option value="portrait">Portrait</option>
        <option value="paysage">Paysage</option>
      </select></label>
      <label>Échelle<select value={String(s.echelle)} onChange={(e) => regler({ echelle: e.target.value === "ajuster" ? "ajuster" : Number(e.target.value) })} data-studio-feuille-echelle-composee>
        {STUDIO_SHEET_SCALES.map((k) => <option key={k} value={k}>{`1:${k}`}</option>)}
        <option value="ajuster">Ajuster au cadre</option>
      </select></label>
      <fieldset data-studio-feuille-calques>
        <legend>Vue source : calques</legend>
        <label className="studio-dossier-case"><input type="radio" name="studio-feuille-calques" checked={s.calques === null} onChange={() => regler({ calques: null })} data-studio-feuille-calques-visibles /> Calques visibles de la révision</label>
        <label className="studio-dossier-case"><input type="radio" name="studio-feuille-calques" checked={s.calques !== null} onChange={() => regler({ calques: calques.filter((c) => c.visible).map((c) => c.id) })} data-studio-feuille-calques-choisis /> Calques choisis</label>
        {s.calques !== null && calques.map((c) => (
          <label key={c.id} className="studio-dossier-case">
            <input type="checkbox" checked={s.calques!.includes(c.id)} onChange={(e) => regler({ calques: e.target.checked ? [...s.calques!, c.id] : s.calques!.filter((x) => x !== c.id) })} data-studio-feuille-calque={c.id} />
            <span translate="no">{c.nom}</span>{!c.visible && <span> (masqué)</span>}
          </label>
        ))}
      </fieldset>
      <label>Auteur du cartouche (facultatif)<input value={s.auteur} maxLength={200} onChange={(e) => regler({ auteur: e.target.value })} data-studio-feuille-auteur /></label>
      <p className="studio-dialogue-aide">Sans auteur saisi, le cartouche imprime « non évalué ». Projet, étude, variante et révision viennent des données enregistrées.</p>
      {erreur && <p role="alert" data-studio-feuille-erreur>{erreur}</p>}
      <button disabled={enCours} data-studio-feuille-creer><Icon name="studio-dossier" size={18} /> Composer la feuille</button>
    </form>
  );
}

/**
 * Vues de coupe enregistrées (EX-075) : niveau (z, repère local-3d), cadrage, échelle, styles et annotations propres ;
 * chacune lit une révision enregistrée, devient « périmée » quand la variante avance et s'actualise explicitement. Une
 * annotation de la vue reste à la vue : elle ne modifie jamais un objet du modèle.
 */
function VuesCoupe({ projectId, studyId, variantId, vues, ecriture, surChange }: { projectId: string; studyId: string; variantId: string; vues: StudioSectionView[]; ecriture: boolean; surChange: () => Promise<unknown> }) {
  const [nom, setNom] = useState("Coupe AA");
  const [z, setZ] = useState("1");
  const [cadrage, setCadrage] = useState({ xMin: "-1", yMin: "-1", xMax: "20", yMax: "20" });
  const [echelle, setEchelle] = useState<number>(50);
  const [trait, setTrait] = useState<"fin" | "moyen" | "fort">("fort");
  const [hachure, setHachure] = useState<"aucune" | "diagonale" | "croisee">("diagonale");
  const [annotation, setAnnotation] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  async function agir(action: () => Promise<unknown>) {
    if (enCours) return;
    setEnCours(true); setErreur("");
    try { await action(); await surChange(); } catch (err) { setErreur(erreurDe(err)); } finally { setEnCours(false); }
  }
  const nombre = (v: string) => Number(v.replace(",", "."));
  function creer(e: FormEvent) {
    e.preventDefault();
    const c = { xMin: nombre(cadrage.xMin), yMin: nombre(cadrage.yMin), xMax: nombre(cadrage.xMax), yMax: nombre(cadrage.yMax) };
    if (![nombre(z), c.xMin, c.yMin, c.xMax, c.yMax].every(Number.isFinite)) { setErreur("Cote et cadrage : nombres attendus (mètres)."); return; }
    void agir(() => api.createStudioSectionView(projectId, studyId, variantId, { definition: { nom: nom.trim() || "Coupe", niveau: { repere: "local-3d", z: nombre(z) }, cadrage: c, echelle, styles: { trait, hachure }, annotations: [] } }));
  }
  return (
    <section aria-labelledby="studio-dossier-coupes-titre" data-studio-vues-coupe>
      <h3 id="studio-dossier-coupes-titre">Vues de coupe</h3>
      {vues.length === 0 && <p data-studio-vues-coupe-vide>Aucune vue de coupe enregistrée dans cette étude.</p>}
      {vues.length > 0 && <ul className="studio-dossier-feuilles">{vues.map((v) => (
        <li key={v.id} data-studio-vue-coupe={v.id} data-actualite={v.freshness}>
          <strong translate="no">{v.definition.nom}</strong>{" "}
          <span translate="no">{`z = ${v.definition.niveau.z} m · 1:${v.definition.echelle} · ${revisionCourte(v.revisionId)}`}</span>{" "}
          <span data-studio-vue-coupe-actualite>{v.freshness === "perimee" ? "Périmée : la variante a avancé depuis" : "À jour"}</span>
          {v.vue && <span translate="no" title={v.vue.empreinteSection}>{` · ${v.vue.coupe.sources.length} solide(s) coupé(s) · ${empreinteAbregee(v.vue.empreinteSection)}`}</span>}
          {v.error && <span role="alert">{v.error}</span>}
          {v.definition.annotations.length > 0 && <ul>{v.definition.annotations.map((a) => <li key={a.id} translate="no">{a.texte}</li>)}</ul>}
          {ecriture && <div className="studio-dossier-actions">
            {v.freshness === "perimee" && <button type="button" disabled={enCours} onClick={() => void agir(() => api.updateStudioSectionView(projectId, studyId, v.id, { revisionId: v.headRevisionId }))} data-studio-vue-coupe-actualiser>Actualiser sur la dernière révision</button>}
            <input aria-label="Annotation de la vue" maxLength={500} value={annotation[v.id] ?? ""} onChange={(e) => setAnnotation({ ...annotation, [v.id]: e.target.value })} data-studio-vue-coupe-annotation-saisie />
            <button type="button" disabled={enCours || !(annotation[v.id] ?? "").trim()} onClick={() => void agir(async () => {
              await api.updateStudioSectionView(projectId, studyId, v.id, { annotation: { op: "ajouter", annotation: { id: crypto.randomUUID(), type: "texte", position: { x: v.definition.cadrage.xMin, y: v.definition.cadrage.yMin }, texte: annotation[v.id]!.trim() } } });
              setAnnotation({ ...annotation, [v.id]: "" });
            })} data-studio-vue-coupe-annoter>Annoter la vue</button>
          </div>}
        </li>
      ))}</ul>}
      {ecriture && <form className="studio-dossier-editer" onSubmit={creer} data-studio-vue-coupe-nouvelle>
        <h4>Nouvelle vue de coupe (révision affichée)</h4>
        <label>Nom<input value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} /></label>
        <label>Cote du plan de coupe (m, repère local 3D)<input inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} data-studio-vue-coupe-z /></label>
        <fieldset><legend>Cadrage (m, repère local du plan)</legend>
          {(["xMin", "yMin", "xMax", "yMax"] as const).map((k) => <label key={k}>{k}<input inputMode="decimal" value={cadrage[k]} onChange={(e) => setCadrage({ ...cadrage, [k]: e.target.value })} /></label>)}
        </fieldset>
        <label>Échelle<select value={echelle} onChange={(e) => setEchelle(Number(e.target.value))}>{STUDIO_SHEET_SCALES.map((n) => <option key={n} value={n}>{`1:${n}`}</option>)}</select></label>
        <label>Trait de coupe<select value={trait} onChange={(e) => setTrait(e.target.value as typeof trait)}><option value="fin">Fin</option><option value="moyen">Moyen</option><option value="fort">Fort</option></select></label>
        <label>Hachure<select value={hachure} onChange={(e) => setHachure(e.target.value as typeof hachure)}><option value="aucune">Aucune</option><option value="diagonale">Diagonale</option><option value="croisee">Croisée</option></select></label>
        <button disabled={enCours} data-studio-vue-coupe-creer>Enregistrer la vue de coupe</button>
      </form>}
      {erreur && <p role="alert" data-studio-vue-coupe-erreur>{erreur}</p>}
    </section>
  );
}

function Dossiers({ projectId, studyId, variantId, revisionId, feuilles, vues, dossiers, ecriture, surChange }: {
  projectId: string; studyId: string; variantId: string; revisionId: string; feuilles: StudioSheet[]; vues: StudioSectionView[]; dossiers: StudioDossier[]; ecriture: boolean; surChange: () => Promise<unknown>;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const actif = dossiers.find((d) => d.id === choisi) ?? dossiers[0] ?? null;
  const detail = useQuery({
    queryKey: ["studio-dossier", projectId, studyId, actif?.id ?? "", actif?.updatedAt ?? ""],
    queryFn: () => api.studioDossier(projectId, studyId, actif!.id), enabled: actif !== null, retry: (n, e) => !refuse(e) && n < 1,
  });
  return (
    <div className="studio-dossier-dossiers">
      {dossiers.length > 1 && (
        <label>Dossier<select value={actif?.id ?? ""} onChange={(e) => setChoisi(e.target.value)} data-studio-dossier-choix>
          {dossiers.map((d) => <option key={d.id} value={d.id} translate="no">{d.title}</option>)}
        </select></label>
      )}
      {actif && (
        <div className="studio-dossier-assemble" data-studio-dossier-assemble={actif.id}>
          {detail.isPending && <p role="status">Assemblage du dossier…</p>}
          {detail.isError && <p role="alert">{erreurDe(detail.error)}</p>}
          {detail.data && <ResumeDossier d={detail.data} />}
          <div className="studio-dossier-actions">
            <a className="studio-lien-bouton" href={actif.files.pdf} download data-studio-dossier-pdf><Icon name="studio-sheet-pdf" size={18} /> Dossier PDF</a>
            <a className="studio-lien-bouton" href={actif.files.json} download data-studio-dossier-json>Dossier JSON</a>
          </div>
        </div>
      )}
      {dossiers.length === 0 && <p data-studio-dossiers-vide>Aucun dossier de conception dans cette étude.</p>}
      {ecriture && feuilles.length > 0 && (
        // Nouveau dossier : toutes les feuilles de l'étude proposées, dans leur ordre (le formulaire suit les créations).
        <EditerDossier key={actif?.id ?? `nouveau-${feuilles.map((f) => f.id).join(",")}`} projectId={projectId} studyId={studyId} variantId={variantId} revisionId={revisionId} feuilles={feuilles} vues={vues} dossier={actif} surEnregistre={async (id) => { setChoisi(id); await surChange(); }} />
      )}
    </div>
  );
}

function ResumeDossier({ d }: { d: Awaited<ReturnType<typeof api.studioDossier>> }) {
  const a = d.assembly;
  const b = a.metre ? resumeBilan(a.metre.bilan, LOCALE) : null;
  return (
    <div data-studio-dossier-empreinte={a.empreinte}>
      <p><strong translate="no">{a.titre}</strong></p>
      <p><span>Empreinte du dossier</span>{" "}<code translate="no" title={a.empreinte}>{empreinteAbregee(a.empreinte)}</code></p>
      <ol className="studio-dossier-ordre" data-studio-dossier-ordre>
        {a.feuilles.map((f) => <li key={f.id} translate="no" data-studio-dossier-feuille={f.id}>{`${f.definition.numero} — ${f.definition.titre} · ${f.vue.source.variantName ?? "non évalué"} · ${revisionCourte(f.vue.source.revisionId)}`}</li>)}
      </ol>
      {b ? (
        <dl className="studio-dossier-faits" data-studio-dossier-metre>
          <dt>Volume brut (toutes les lignes)</dt><dd data-studio-dossier-brut>{b.brut}</dd>
          <dt>Sous-total brut (lignes avec net)</dt><dd data-studio-dossier-brut-avec-net>{b.brutAvecNet}</dd>
          <dt>Déductions (lignes avec net)</dt><dd data-studio-dossier-deduit-avec-net>{b.deduitAvecNet}</dd>
          <dt>Volume net</dt><dd data-studio-dossier-net>{b.net}</dd>
          <dt>Déductions déclarées (toutes les lignes)</dt><dd data-studio-dossier-deduit>{`${b.deduit} · ${b.deductions} ouverture(s)`}</dd>
          <dt>Contrôle d’arithmétique</dt>
          <dd title="Contrôle sur une même source : il ne vérifie pas les quantités de façon indépendante.">
            {b.coherent ? "Net = brut − déductions (même source, pas une vérification indépendante)" : "Écart entre le net et le brut moins les déductions"}
          </dd>
          <dt>Ajustements manuels</dt>
          <dd data-studio-dossier-ajustements data-studio-dossier-borne={a.metre!.borneAjustements ?? ""}>{libelleAjustements(a.metre!)}</dd>
        </dl>
      ) : <p data-studio-dossier-sans-metre>Métré non joint.</p>}
      <p>{a.fidelite ? `Rapport de fidélité joint (${a.fidelite.length} feuille(s)).` : "Rapport de fidélité non joint."}</p>
    </div>
  );
}

function EditerDossier({ projectId, studyId, variantId, revisionId, feuilles, vues, dossier, surEnregistre }: {
  projectId: string; studyId: string; variantId: string; revisionId: string; feuilles: StudioSheet[]; vues: StudioSectionView[]; dossier: StudioDossier | null; surEnregistre: (id: string) => Promise<void>;
}) {
  // EX-076 : vues de coupe de la maquette jointes au dossier (publiées avec les feuilles, chacune avec sa source).
  const [coupes, setCoupes] = useState<string[]>(dossier?.sectionViewIds ?? []);
  const [titre, setTitre] = useState(dossier?.title ?? "Dossier de conception");
  const [ordre, setOrdre] = useState<string[]>(() => (dossier ? dossier.sheetIds.filter((id) => feuilles.some((f) => f.id === id)) : feuilles.map((f) => f.id)));
  const [metre, setMetre] = useState(dossier ? dossier.quantities !== null : true);
  const [fidelite, setFidelite] = useState(dossier?.includeFidelity ?? true);
  // Réépinglage explicite du métré déjà joint sur la révision affichée (ajustements enregistrés depuis compris).
  const [reepingler, setReepingler] = useState(false);
  const metreJoint = dossier?.quantities ?? null;
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const demande = useRef<{ cle: string; id: string } | null>(null);
  const nom = (id: string) => { const f = feuilles.find((x) => x.id === id); return f ? `${f.definition.numero} — ${f.definition.titre}` : id; };
  const absentes = feuilles.filter((f) => !ordre.includes(f.id));
  async function envoyer(e: FormEvent, nouveau: boolean) {
    e.preventDefault();
    if (enCours) return;
    if (!titre.trim()) { setErreur("Saisissez le titre du dossier."); return; }
    if (!ordre.length) { setErreur("Ajoutez au moins une feuille au dossier."); return; }
    // Métré : la variante affichée, à la révision affichée (épinglée). Déjà joint : inchangé (même borne), sauf
    // réépinglage demandé, qui le porte sur la révision affichée et reprend les ajustements enregistrés depuis.
    const repin = !!metreJoint && !nouveau && metre && reepingler;
    const quantities = metre ? (metreJoint && !nouveau && !repin ? metreJoint : { variantId, revisionId }) : null;
    const corps = { title: titre.trim(), sheetIds: ordre, quantities, includeFidelity: fidelite, ...(coupes.length || dossier?.sectionViewIds?.length ? { sectionViewIds: coupes } : {}) };
    setEnCours(true); setErreur("");
    try {
      if (dossier && !nouveau) await surEnregistre((await api.updateStudioDossier(projectId, studyId, dossier.id, repin ? { ...corps, repinQuantities: true } : corps)).id);
      else {
        const cle = JSON.stringify(corps);
        if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
        const cree = await api.createStudioDossier(projectId, studyId, { ...corps, requestId: demande.current.id });
        demande.current = null;
        await surEnregistre(cree.id);
      }
    } catch (err) { setErreur(erreurDe(err)); } finally { setEnCours(false); }
  }
  return (
    <form className="studio-dossier-editer" onSubmit={(e) => void envoyer(e, dossier === null)} data-studio-dossier-editer={dossier?.id ?? "nouveau"}>
      <h4>{dossier ? "Modifier le dossier" : "Nouveau dossier"}</h4>
      <label>Titre<input value={titre} maxLength={200} onChange={(e) => setTitre(e.target.value)} data-studio-dossier-titre-saisie /></label>
      <fieldset>
        <legend>Feuilles, dans l’ordre du dossier</legend>
        <ol className="studio-dossier-ordre">
          {ordre.map((id, i) => (
            <li key={id} data-studio-dossier-ligne={id}>
              <span translate="no">{nom(id)}</span>
              <button type="button" disabled={i === 0} onClick={() => setOrdre(deplacer(ordre, i, -1))} aria-label={`Monter ${nom(id)}`} data-studio-dossier-monter={id}>↑</button>
              <button type="button" disabled={i === ordre.length - 1} onClick={() => setOrdre(deplacer(ordre, i, 1))} aria-label={`Descendre ${nom(id)}`} data-studio-dossier-descendre={id}>↓</button>
              <button type="button" onClick={() => setOrdre(ordre.filter((x) => x !== id))} data-studio-dossier-retirer={id}>Retirer</button>
            </li>
          ))}
        </ol>
        {absentes.map((f) => <button key={f.id} type="button" onClick={() => setOrdre([...ordre, f.id])} data-studio-dossier-ajouter={f.id}>{`Ajouter ${f.definition.numero}`}</button>)}
      </fieldset>
      <label className="studio-dossier-case"><input type="checkbox" checked={metre} onChange={(e) => setMetre(e.target.checked)} data-studio-dossier-metre-case /> {metreJoint ? "Joindre le métré (brut, déductions, net) épinglé" : "Joindre le métré (brut, déductions, net) de la révision affichée"}</label>
      {metreJoint && metre && <label className="studio-dossier-case"><input type="checkbox" checked={reepingler} onChange={(e) => setReepingler(e.target.checked)} data-studio-dossier-reepingler-case /> Réépingler le métré sur la révision affichée <span translate="no">{revisionCourte(revisionId)}</span> (ajustements enregistrés depuis compris)</label>}
      <label className="studio-dossier-case"><input type="checkbox" checked={fidelite} onChange={(e) => setFidelite(e.target.checked)} data-studio-dossier-fidelite-case /> Joindre le rapport de fidélité des feuilles</label>
      {vues.length > 0 && <fieldset data-studio-dossier-coupes>
        <legend>Vues de coupe jointes (dérivées de la maquette)</legend>
        {vues.map((v) => <label key={v.id} className="studio-dossier-case"><input type="checkbox" checked={coupes.includes(v.id)} onChange={(e) => setCoupes(e.target.checked ? [...coupes, v.id] : coupes.filter((x) => x !== v.id))} data-studio-dossier-coupe={v.id} /> <span translate="no">{v.definition.nom}</span></label>)}
      </fieldset>}
      {erreur && <p role="alert" data-studio-dossier-erreur>{erreur}</p>}
      <button disabled={enCours} data-studio-dossier-enregistrer>{dossier ? "Enregistrer le dossier" : "Créer le dossier"}</button>
      {dossier && <button type="button" disabled={enCours} onClick={(e) => void envoyer(e as unknown as FormEvent, true)} data-studio-dossier-dupliquer>Créer un nouveau dossier</button>}
    </form>
  );
}
