/**
 * Panneau des surfaces libres NURBS de la vue 3D (X.1-05) :
 *
 * - « Surface NURBS » (Ctrl+F8) : grille plane de pôles saisie (origine, largeur, profondeur, nombres de pôles, degrés),
 *   rien proposé d'office ;
 * - « Modifier la surface » (Ctrl+F9) : choix d'un pôle (liste ligne / colonne, ou clic sur son repère dans la vue 3D),
 *   position et poids saisis ; même identité de surface ;
 * - « Épaissir la surface » (Shift+F11) : épaisseur et côté saisis ; le noyau exact (Worker OCCT, `.wasm` séparé,
 *   chargé à l'activation de l'outil) calcule le solide ; seul « Engager le résultat exact » modifie le brouillon
 *   (commande `studio.surface.epaissir`, surface conservée) ; le serveur recalcule à l'enregistrement.
 *
 * Liste des surfaces (sélection, suppression par `studio.solide.supprimer`) dès qu'il y en a une.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { studioEmpreinteContenu, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import {
  demandeEpaississement, engagementEpaississement, etatApresEpaississement, etatCourantEpaississement, tacheEpaississement, type EtatEpaississement,
} from "../exact/epaississement-session";
import { noyauExactStudio, ordonnanceurExact } from "../exact/noyau-studio";
import { NOTICE_LICENCE_OCCT, VERSION_OCCT_DISTRIBUEE } from "../exact/client-exact";
import type { PoigneeTache } from "../taches/ordonnanceur";
import { commandeModifierPole, commandeSurfacePlane, descriptionSurface, SURFACE_VIDE, valeursPole, type ResultatSurface, type ValeursPole, type ValeursSurface } from "./surfaces-ui";

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const LIBELLES_NOYAU: Record<string, string> = { absent: "non chargé", chargement: "chargement en cours", pret: "prêt", echec: "en échec" };

function Champ({ nom, libelle, valeur, surValeur, pas = "any" }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void; pas?: string }) {
  return <label>{libelle}
    <input type="number" step={pas} required name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} />
  </label>;
}

export function PanneauSurfaces({ doc, outil, revision, modifiable, selection, layerId, pole, surPole, surCommandes, surSelection }: {
  doc: StudioDocument;
  outil?: string;
  revision: string;
  modifiable: boolean;
  /** Objet sélectionné de la vue 3D (une surface, s'il en est une). */
  selection: string | null;
  layerId?: string;
  /** Pôle choisi (ligne, colonne) de la surface sélectionnée ; un clic sur son repère dans la vue 3D le choisit aussi. */
  pole: { i: number; j: number } | null;
  surPole: (p: { i: number; j: number } | null) => void;
  surCommandes?: (cs: StudioCommand[]) => boolean;
  surSelection?: (id: string | null) => void;
}) {
  const surfaces = doc.surfaces ?? [];
  const choisie = surfaces.find((s) => s.id === selection) ?? null;
  const [creation, setCreation] = useState<ValeursSurface>(SURFACE_VIDE);
  const [edition, setEdition] = useState<ValeursPole | null>(null);
  const [epaisseur, setEpaisseur] = useState(Number.NaN);
  const [sens, setSens] = useState("");
  const [cible, setCible] = useState("");
  const [erreur, setErreur] = useState("");
  const [brut, setEtat] = useState<EtatEpaississement>({ etape: "inactif" });
  const noyau = useSyncExternalStore(noyauExactStudio.abonner, noyauExactStudio.metriques, noyauExactStudio.metriques);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const poignee = useRef<PoigneeTache<unknown> | null>(null);
  useEffect(() => () => { poignee.current?.abandonner(); }, []);
  // Pôle choisi (liste ou clic dans la vue) : le formulaire reprend ses valeurs actuelles (position et poids).
  useEffect(() => {
    if (!choisie || !pole || pole.i >= choisie.lignes || pole.j >= choisie.colonnes) { setEdition(null); return; }
    setEdition(valeursPole(choisie, pole.i, pole.j));
  }, [choisie, pole?.i, pole?.j]);
  const etat = etatCourantEpaississement(brut, revision);
  const surfaceEpaissie = cible || choisie?.id || "";

  function envoyer(r: ResultatSurface, apres?: () => void) {
    if ("erreur" in r) { setErreur(r.erreur); return; }
    setErreur("");
    if (surCommandes?.(r.commandes)) apres?.();
  }
  function creer(e: FormEvent) {
    e.preventDefault();
    const id = crypto.randomUUID();
    envoyer(commandeSurfacePlane(creation, id, layerId), () => { setCreation(SURFACE_VIDE); surSelection?.(id); });
  }
  function modifier(e: FormEvent) {
    e.preventDefault();
    if (!edition) { setErreur("Choisissez le pôle à modifier (ligne et colonne)."); return; }
    envoyer(commandeModifierPole(choisie, edition));
  }
  function calculer(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    const r = demandeEpaississement(doc, revision, { surface: surfaceEpaissie, epaisseur, sens }, crypto.randomUUID());
    if (!r.ok) { setErreur(r.message); return; }
    const d = r.demande;
    const p = ordonnanceurExact().soumettre(tacheEpaississement(d));
    poignee.current = p;
    setEtat({ etape: "calcul", demande: d });
    void p.issue.then((i) => { if (poignee.current === p) setEtat(etatApresEpaississement(d, i, revisionRef.current)); });
  }
  function engager() {
    const r = engagementEpaississement(etat, { doc, revision, modifiable });
    if (!r.ok) { setEtat(r.etat); setErreur(r.message); return; }
    if (surCommandes?.(r.commandes)) {
      const id = etat.etape === "pret" ? etat.demande.id : null;
      setEtat(id ? { etape: "engage", id } : { etape: "inactif" });
      setEpaisseur(Number.NaN); setSens(""); setCible("");
      surSelection?.(id);
    }
  }
  function relancer() {
    setErreur("");
    setEtat({ etape: "inactif" });
    void noyauExactStudio.relancer().catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  }
  function supprimer() {
    if (!choisie) return;
    envoyer({ commandes: [{ toolId: "studio.solide.supprimer", params: { ids: [choisie.id] } }] }, () => surSelection?.(null));
  }

  return <>
    {outil === "studio.surface.nurbs" && <form className="studio-vue3d-formulaire" onSubmit={creer} data-studio-surface-nurbs aria-labelledby="studio-surface-titre">
      <h3 id="studio-surface-titre"><Icon name="studio-surface-nurbs" size={18} /> Surface NURBS</h3>
      <p className="studio-hint">Une grille plane de pôles (points de contrôle) est posée à l’origine saisie ; modifiez ensuite les pôles et leurs poids pour la cintrer. Aucune valeur n’est proposée.</p>
      <fieldset disabled={!modifiable}>
        <legend>Origine, dimensions en mètres, pôles et degrés</legend>
        <Champ nom="surface-x" libelle="Origine x (m)" valeur={creation.x} surValeur={(x) => setCreation({ ...creation, x })} />
        <Champ nom="surface-y" libelle="Origine y (m)" valeur={creation.y} surValeur={(y) => setCreation({ ...creation, y })} />
        <Champ nom="surface-z" libelle="Cote z (m)" valeur={creation.z} surValeur={(z) => setCreation({ ...creation, z })} />
        <Champ nom="surface-largeur" libelle="Largeur selon x (m)" valeur={creation.largeur} surValeur={(largeur) => setCreation({ ...creation, largeur })} />
        <Champ nom="surface-profondeur" libelle="Profondeur selon y (m)" valeur={creation.profondeur} surValeur={(profondeur) => setCreation({ ...creation, profondeur })} />
        <Champ nom="surface-lignes" libelle="Pôles selon x (lignes)" valeur={creation.lignes} pas="1" surValeur={(lignes) => setCreation({ ...creation, lignes })} />
        <Champ nom="surface-colonnes" libelle="Pôles selon y (colonnes)" valeur={creation.colonnes} pas="1" surValeur={(colonnes) => setCreation({ ...creation, colonnes })} />
        <Champ nom="surface-degre-u" libelle="Degré selon x" valeur={creation.degreU} pas="1" surValeur={(degreU) => setCreation({ ...creation, degreU })} />
        <Champ nom="surface-degre-v" libelle="Degré selon y" valeur={creation.degreV} pas="1" surValeur={(degreV) => setCreation({ ...creation, degreV })} />
        <button type="submit" data-studio-poser-surface><Icon name="studio-surface-nurbs" size={18} /> Poser la surface</button>
      </fieldset>
    </form>}

    {outil === "studio.surface.modifier" && <form className="studio-vue3d-formulaire" onSubmit={modifier} data-studio-surface-modifier={choisie?.id ?? ""} aria-labelledby="studio-surface-modifier-titre">
      <h3 id="studio-surface-modifier-titre"><Icon name="studio-surface-edit" size={18} /> Modifier la surface</h3>
      {!choisie && <p className="studio-hint" data-studio-surface-indice>Sélectionnez d’abord, dans la vue 3D ou la liste des surfaces, la surface à modifier.</p>}
      {choisie && <fieldset disabled={!modifiable}>
        <legend>Pôle (point de contrôle) : position en mètres et poids</legend>
        <label>Pôle
          <select name="surface-pole" required value={pole ? `${pole.i},${pole.j}` : ""} onChange={(e) => { const [i, j] = e.target.value.split(",").map(Number); surPole(e.target.value ? { i: i!, j: j! } : null); }} data-studio-surface-pole>
            <option value="">Choisir le pôle…</option>
            {choisie.controle.map((_, k) => { const i = Math.floor(k / choisie.colonnes), j = k % choisie.colonnes; return <option key={k} value={`${i},${j}`}>{`Ligne ${i + 1}, colonne ${j + 1}`}</option>; })}
          </select>
        </label>
        {edition && <>
          <Champ nom="pole-x" libelle="x (m)" valeur={edition.x} surValeur={(x) => setEdition({ ...edition, x })} />
          <Champ nom="pole-y" libelle="y (m)" valeur={edition.y} surValeur={(y) => setEdition({ ...edition, y })} />
          <Champ nom="pole-z" libelle="z (m)" valeur={edition.z} surValeur={(z) => setEdition({ ...edition, z })} />
          <Champ nom="pole-poids" libelle="Poids (strictement positif)" valeur={edition.poids} surValeur={(poids) => setEdition({ ...edition, poids })} />
        </>}
        <button type="submit" data-studio-modifier-pole><Icon name="studio-surface-edit" size={18} /> Modifier le pôle</button>
      </fieldset>}
    </form>}

    {outil === "studio.surface.epaissir" && <form className="studio-vue3d-formulaire" onSubmit={calculer} data-studio-epaissir data-studio-exact-etat={etat.etape} data-studio-exact-noyau={noyau.etat}
      data-studio-exact-document={studioEmpreinteContenu(doc)} aria-labelledby="studio-epaissir-titre">
      <h3 id="studio-epaissir-titre"><Icon name="studio-surface-thicken" size={18} /> Épaissir la surface</h3>
      <p className="studio-hint">Conversion explicite en solide exact par le noyau exact (OCCT) : la surface est conservée dans le solide ; rien n’est engagé sans votre accord.</p>
      <p role="status" data-studio-exact-statut-noyau>{`Noyau exact : ${LIBELLES_NOYAU[noyau.etat]}`}</p>
      <fieldset disabled={!modifiable || etat.etape === "calcul"}>
        <legend>Surface, épaisseur et côté</legend>
        <label>Surface
          <select name="epaissir-surface" required value={surfaceEpaissie} onChange={(e) => setCible(e.target.value)} data-studio-epaissir-surface>
            <option value="">Choisir la surface…</option>
            {surfaces.map((s) => <option key={s.id} value={s.id}>{`${descriptionSurface(s, nombre)} · ${s.id.slice(0, 8)}`}</option>)}
          </select>
        </label>
        <Champ nom="epaissir-epaisseur" libelle="Épaisseur (m)" valeur={epaisseur} surValeur={setEpaisseur} />
        <label>Côté de l’épaisseur
          <select name="epaissir-sens" required value={sens} onChange={(e) => setSens(e.target.value)} data-studio-epaissir-sens>
            <option value="">Choisir le côté…</option>
            <option value="normale">Le long de la normale de la surface</option>
            <option value="inverse">À l’opposé de la normale</option>
          </select>
        </label>
        {surfaces.length === 0 && <p className="studio-hint">Aucune surface libre dans le dessin.</p>}
        <button type="submit" data-studio-epaissir-calculer><Icon name="studio-surface-thicken" size={18} /> Calculer (noyau exact)</button>
      </fieldset>
      {etat.etape === "calcul" && <p role="status" data-studio-exact-calcul>Calcul exact en cours…</p>}
      {etat.etape === "pret" && <div data-studio-exact-resultat data-studio-exact-volume={etat.resultat.volume} data-studio-exact-empreinte={etat.resultat.empreinte}>
        <p role="status">{`Résultat exact : volume ${nombre(etat.resultat.volume)} m³, aire ${nombre(etat.resultat.aire)} m², ${etat.resultat.faces} face(s), ${etat.resultat.solides} solide(s).`}</p>
        <button type="button" onClick={engager} disabled={!modifiable} data-studio-exact-engager><Icon name="studio-surface-thicken" size={18} /> Engager le résultat exact</button>
      </div>}
      {etat.etape === "perime" && <p className="studio-alert" role="alert" data-studio-exact-perime>{etat.message}</p>}
      {etat.etape === "echec" && <div role="alert" className="studio-alert" data-studio-exact-echec>
        <p>{etat.message}</p>
        {etat.relancer && <button type="button" onClick={relancer} data-studio-exact-relancer>Relancer le noyau exact</button>}
      </div>}
      {etat.etape === "engage" && <p className="studio-info" role="status" data-studio-exact-engage={etat.id}>Résultat exact engagé dans le brouillon : enregistrez pour que le serveur le recalcule et le conserve.</p>}
      <p className="studio-hint" data-studio-exact-licence>{`Noyau exact : OCCT (occt-wasm ${VERSION_OCCT_DISTRIBUEE}), composant sous licence LGPL-2.1 chargé séparément et remplaçable.`} <a href={NOTICE_LICENCE_OCCT} target="_blank" rel="noreferrer">Licence et provenance</a></p>
    </form>}

    {erreur && <p className="studio-alert" role="alert" data-studio-surface-erreur>{erreur}</p>}

    {surfaces.length > 0 && <div className="studio-vue3d-solides" data-studio-surfaces>
      <h3>Surfaces libres</h3>
      <ul>
        {surfaces.map((s) => <li key={s.id}>
          <button type="button" aria-pressed={s.id === selection} onClick={() => { surSelection?.(s.id === selection ? null : s.id); surPole(null); }} data-studio-surface={s.id}>
            <Icon name="studio-surface-nurbs" size={16} /> {descriptionSurface(s, nombre)}
          </button>
        </li>)}
      </ul>
      {choisie && <fieldset disabled={!modifiable} data-studio-surface-choisie={choisie.id}>
        <legend>Surface sélectionnée</legend>
        <button type="button" onClick={supprimer} data-studio-supprimer-surface><Icon name="studio-solid-delete" size={18} /> Supprimer la surface</button>
      </fieldset>}
    </div>}
  </>;
}
