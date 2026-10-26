/**
 * Panneau des surfaces de subdivision de la vue 3D (X.1-05) :
 *
 * - « Surface de subdivision » (Ctrl+F12) : maillage de contrôle saisi au clavier (sommets « x y z », faces « i j k »)
 *   et niveau de Loop (0 à 4), rien proposé d'office ;
 * - « Modifier la surface » (Ctrl+F9) sur une surface de subdivision sélectionnée : sommet de contrôle choisi (liste, ou
 *   clic sur son repère dans la vue 3D), position et niveau saisis ; même identité ;
 * - « Solidifier la subdivision » (Ctrl+Maj+Fin) : maillage fermé seulement ; le noyau exact (Worker OCCT, chargé à
 *   l'activation de l'outil) coud le maillage subdivisé en solide polyédrique ; seul « Engager le résultat exact »
 *   modifie le brouillon ; un maillage ouvert est refusé avec sa raison.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { studioEmpreinteContenu, studioSubdivisionFermee, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import {
  demandeSolidification, engagementSolidification, etatApresSolidification, etatCourantSolidification, tacheSolidification, type EtatSolidification,
} from "../exact/solidification-session";
import { noyauExactStudio, ordonnanceurExact } from "../exact/noyau-studio";
import type { PoigneeTache } from "../taches/ordonnanceur";
import { commandeModifierSommet, commandeSubdivision, descriptionSubdivision, valeursSommet, type ResultatSurface, type ValeursSommet } from "./surfaces-ui";

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const LIBELLES_NOYAU: Record<string, string> = { absent: "non chargé", chargement: "chargement en cours", pret: "prêt", echec: "en échec" };

function Champ({ nom, libelle, valeur, surValeur, pas = "any" }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void; pas?: string }) {
  return <label>{libelle}
    <input type="number" step={pas} required name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} />
  </label>;
}

export function PanneauSubdivisions({ doc, outil, revision, modifiable, selection, layerId, sommet, surSommet, surCommandes, surSelection }: {
  doc: StudioDocument;
  outil?: string;
  revision: string;
  modifiable: boolean;
  selection: string | null;
  layerId?: string;
  /** Sommet de contrôle choisi de la surface sélectionnée (liste ou clic sur son repère dans la vue 3D). */
  sommet: number | null;
  surSommet: (k: number | null) => void;
  surCommandes?: (cs: StudioCommand[]) => boolean;
  surSelection?: (id: string | null) => void;
}) {
  const subdivisions = doc.subdivisions ?? [];
  const choisie = subdivisions.find((s) => s.id === selection) ?? null;
  const [texteSommets, setTexteSommets] = useState("");
  const [texteFaces, setTexteFaces] = useState("");
  const [niveau, setNiveau] = useState(Number.NaN);
  const [edition, setEdition] = useState<ValeursSommet | null>(null);
  const [cible, setCible] = useState("");
  const [erreur, setErreur] = useState("");
  const [brut, setEtat] = useState<EtatSolidification>({ etape: "inactif" });
  const noyau = useSyncExternalStore(noyauExactStudio.abonner, noyauExactStudio.metriques, noyauExactStudio.metriques);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const poignee = useRef<PoigneeTache<unknown> | null>(null);
  useEffect(() => () => { poignee.current?.abandonner(); }, []);
  useEffect(() => {
    if (!choisie || sommet === null || sommet >= choisie.sommets.length) { setEdition(null); return; }
    setEdition(valeursSommet(choisie, sommet));
  }, [choisie, sommet]);
  const etat = etatCourantSolidification(brut, revision);
  const solidifiee = cible || choisie?.id || "";

  function envoyer(r: ResultatSurface, apres?: () => void) {
    if ("erreur" in r) { setErreur(r.erreur); return; }
    setErreur("");
    if (surCommandes?.(r.commandes)) apres?.();
  }
  function creer(e: FormEvent) {
    e.preventDefault();
    const id = crypto.randomUUID();
    envoyer(commandeSubdivision(texteSommets, texteFaces, niveau, id, layerId), () => { setTexteSommets(""); setTexteFaces(""); setNiveau(Number.NaN); surSelection?.(id); });
  }
  function modifier(e: FormEvent) {
    e.preventDefault();
    if (!edition) { setErreur("Choisissez le sommet de contrôle à modifier."); return; }
    envoyer(commandeModifierSommet(choisie, edition));
  }
  function calculer(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    const r = demandeSolidification(doc, revision, solidifiee, crypto.randomUUID());
    if (!r.ok) { setErreur(r.message); return; }
    const d = r.demande;
    const p = ordonnanceurExact().soumettre(tacheSolidification(d));
    poignee.current = p;
    setEtat({ etape: "calcul", demande: d });
    void p.issue.then((i) => { if (poignee.current === p) setEtat(etatApresSolidification(d, i, revisionRef.current)); });
  }
  function engager() {
    const r = engagementSolidification(etat, { doc, revision, modifiable });
    if (!r.ok) { setEtat(r.etat); setErreur(r.message); return; }
    if (surCommandes?.(r.commandes)) {
      const id = etat.etape === "pret" ? etat.demande.id : null;
      setEtat(id ? { etape: "engage", id } : { etape: "inactif" });
      setCible("");
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
    {outil === "studio.subdivision.creer" && <form className="studio-vue3d-formulaire" onSubmit={creer} data-studio-subdivision-creer aria-labelledby="studio-subdivision-titre">
      <h3 id="studio-subdivision-titre"><Icon name="studio-surface-subdivision" size={18} /> Surface de subdivision</h3>
      <p className="studio-hint">Maillage de contrôle triangulaire (schéma de Loop) : saisissez ses sommets et ses faces, puis le niveau de subdivision. Aucune valeur n’est proposée.</p>
      <fieldset disabled={!modifiable}>
        <legend>Maillage de contrôle et niveau</legend>
        <label>Sommets (x y z, séparés par « ; », en mètres)
          <textarea name="subdivision-sommets" required rows={3} value={texteSommets} onChange={(e) => setTexteSommets(e.target.value)} data-studio-subdivision-sommets />
        </label>
        <label>Faces (i j k, séparées par « ; », sommets numérotés à partir de 1)
          <textarea name="subdivision-faces" required rows={3} value={texteFaces} onChange={(e) => setTexteFaces(e.target.value)} data-studio-subdivision-faces />
        </label>
        <Champ nom="subdivision-niveau" libelle="Niveau de subdivision (0 à 4)" valeur={niveau} pas="1" surValeur={setNiveau} />
        <button type="submit" data-studio-poser-subdivision><Icon name="studio-surface-subdivision" size={18} /> Poser la surface de subdivision</button>
      </fieldset>
    </form>}

    {outil === "studio.surface.modifier" && choisie && <form className="studio-vue3d-formulaire" onSubmit={modifier} data-studio-subdivision-modifier={choisie.id} aria-labelledby="studio-subdivision-modifier-titre">
      <h3 id="studio-subdivision-modifier-titre"><Icon name="studio-surface-edit" size={18} /> Modifier la surface</h3>
      <fieldset disabled={!modifiable}>
        <legend>Sommet de contrôle : position en mètres ; niveau de subdivision</legend>
        <label>Sommet
          <select name="subdivision-sommet" required value={sommet === null ? "" : String(sommet)} onChange={(e) => surSommet(e.target.value === "" ? null : Number(e.target.value))} data-studio-subdivision-sommet>
            <option value="">Choisir le sommet…</option>
            {choisie.sommets.map((_, k) => <option key={k} value={String(k)}>{`Sommet ${k + 1}`}</option>)}
          </select>
        </label>
        {edition && <>
          <Champ nom="sommet-x" libelle="x (m)" valeur={edition.x} surValeur={(x) => setEdition({ ...edition, x })} />
          <Champ nom="sommet-y" libelle="y (m)" valeur={edition.y} surValeur={(y) => setEdition({ ...edition, y })} />
          <Champ nom="sommet-z" libelle="z (m)" valeur={edition.z} surValeur={(z) => setEdition({ ...edition, z })} />
          <Champ nom="sommet-niveau" libelle="Niveau de subdivision (0 à 4)" valeur={edition.niveau} pas="1" surValeur={(n) => setEdition({ ...edition, niveau: n })} />
        </>}
        <button type="submit" data-studio-modifier-sommet><Icon name="studio-surface-edit" size={18} /> Modifier le sommet</button>
      </fieldset>
    </form>}

    {outil === "studio.subdivision.solidifier" && <form className="studio-vue3d-formulaire" onSubmit={calculer} data-studio-solidifier data-studio-exact-etat={etat.etape} data-studio-exact-noyau={noyau.etat}
      data-studio-exact-document={studioEmpreinteContenu(doc)} aria-labelledby="studio-solidifier-titre">
      <h3 id="studio-solidifier-titre"><Icon name="studio-surface-solidify" size={18} /> Solidifier la subdivision</h3>
      <p className="studio-hint">Conversion explicite d’une surface de subdivision fermée en solide polyédrique par le noyau exact (OCCT) : le maillage subdivisé est cousu tel quel, sans lissage ; la surface est conservée dans le solide. Une surface ouverte est refusée.</p>
      <p role="status" data-studio-exact-statut-noyau>{`Noyau exact : ${LIBELLES_NOYAU[noyau.etat]}`}</p>
      <fieldset disabled={!modifiable || etat.etape === "calcul"}>
        <legend>Surface de subdivision</legend>
        <label>Surface
          <select name="solidifier-surface" required value={solidifiee} onChange={(e) => setCible(e.target.value)} data-studio-solidifier-surface>
            <option value="">Choisir la surface…</option>
            {subdivisions.map((s) => <option key={s.id} value={s.id}>{`${descriptionSubdivision(s, nombre)} · ${s.id.slice(0, 8)}`}</option>)}
          </select>
        </label>
        {subdivisions.length === 0 && <p className="studio-hint">Aucune surface de subdivision dans le dessin.</p>}
        <button type="submit" data-studio-solidifier-calculer><Icon name="studio-surface-solidify" size={18} /> Calculer (noyau exact)</button>
      </fieldset>
      {etat.etape === "calcul" && <p role="status" data-studio-exact-calcul>Calcul exact en cours…</p>}
      {etat.etape === "pret" && <div data-studio-exact-resultat data-studio-exact-volume={etat.resultat.volume} data-studio-exact-empreinte={etat.resultat.empreinte}>
        <p role="status">{`Résultat exact : volume ${nombre(etat.resultat.volume)} m³, aire ${nombre(etat.resultat.aire)} m², ${etat.resultat.faces} face(s), ${etat.resultat.solides} solide(s).`}</p>
        <button type="button" onClick={engager} disabled={!modifiable} data-studio-exact-engager><Icon name="studio-surface-solidify" size={18} /> Engager le résultat exact</button>
      </div>}
      {etat.etape === "perime" && <p className="studio-alert" role="alert" data-studio-exact-perime>{etat.message}</p>}
      {etat.etape === "echec" && <div role="alert" className="studio-alert" data-studio-exact-echec>
        <p>{etat.message}</p>
        {etat.relancer && <button type="button" onClick={relancer} data-studio-exact-relancer>Relancer le noyau exact</button>}
      </div>}
      {etat.etape === "engage" && <p className="studio-info" role="status" data-studio-exact-engage={etat.id}>Résultat exact engagé dans le brouillon : enregistrez pour que le serveur le recalcule et le conserve.</p>}
    </form>}

    {erreur && <p className="studio-alert" role="alert" data-studio-subdivision-erreur>{erreur}</p>}

    {subdivisions.length > 0 && <div className="studio-vue3d-solides" data-studio-subdivisions>
      <h3>Surfaces de subdivision</h3>
      <ul>
        {subdivisions.map((s) => <li key={s.id}>
          <button type="button" aria-pressed={s.id === selection} onClick={() => { surSelection?.(s.id === selection ? null : s.id); surSommet(null); }} data-studio-subdivision={s.id} data-studio-subdivision-fermee={studioSubdivisionFermee(s) ? "oui" : "non"}>
            <Icon name="studio-surface-subdivision" size={16} /> {descriptionSubdivision(s, nombre)}
          </button>
        </li>)}
      </ul>
      {choisie && <fieldset disabled={!modifiable} data-studio-subdivision-choisie={choisie.id}>
        <legend>Surface sélectionnée</legend>
        <button type="button" onClick={supprimer} data-studio-supprimer-subdivision><Icon name="studio-solid-delete" size={18} /> Supprimer la surface</button>
      </fieldset>}
    </div>}
  </>;
}
