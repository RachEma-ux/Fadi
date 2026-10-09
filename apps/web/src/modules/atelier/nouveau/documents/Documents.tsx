/**
 * Mode « Documents » de l'Atelier (lot 5, cahier §5.9) : vues (plans, coupes, façades, plan de masse, détails),
 * feuilles et tableaux, définis par commandes dans le modèle et dessinés par le même code pur que le serveur
 * (`@parcours/atelier-model`). L'aperçu est calculé dans le navigateur ; les fichiers (PDF, DXF, SVG, CSV) sont
 * produits par le serveur à la révision courante et inscrits au catalogue des documents. Chaque vue affiche sa
 * fraîcheur : non produite, à jour, ou périmée — en distinguant « dessin modifié » de « modèle modifié ailleurs ».
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  csvTableau,
  ECHELLES,
  empreinteFeuille,
  empreinteVue,
  FORMATS,
  genererTableau,
  genererVue,
  grilleTableau,
  niveauxOrdonnes,
  ORIENTATIONS,
  paramsDeDefinition,
  PHASES,
  positionLibre,
  pt,
  svgComparaisonVues,
  svgFeuille,
  svgVue,
  TABLEAUX,
  tailleDessinMm,
  type Commande,
  type Definition,
  type FeuilleComposee,
  type FiltrePhase,
  type FormatFeuille,
  type ModeleAtelier,
  type Orientation,
  type ParamsFeuille,
  type ParamsVue,
  type TypeTableau,
  type TypeVue,
  type TraitsExternes,
  type VueGeneree,
  zoneUtile,
} from "@parcours/atelier-model";
import { api, type DocumentDescriptor } from "../../../../lib/api";
import { composerFeuilleHorsFil, genererVueHorsFil } from "./generation-client";

export interface PropsDocuments {
  projectId: string;
  code: string;
  nomProjet: string;
  etat: ModeleAtelier;
  revision: number;
  readOnly: boolean;
  niveauId: string | null;
  onCommandes: (commandes: Commande[], label: string) => Promise<void> | void;
  /** Traits des références externes (lus avec les droits de l'utilisateur) ; absent : pas encore lus. */
  externes?: readonly TraitsExternes[];
}

type Choix = { type: "vue" | "feuille"; id: string } | { type: "tableau"; id: TypeTableau } | null;

const LIBELLES_TYPE: Record<TypeVue, string> = { plan: "Plan", coupe: "Coupe", facade: "Façade", masse: "Plan de masse", detail: "Détail", axonometrie: "Axonométrie", isometrique: "Isométrique de tuyauterie" };
const ORIENTATION_LIBELLE: Record<Orientation, string> = { nord: "nord", sud: "sud", est: "est", ouest: "ouest" };
const PHASE_LIBELLE: Record<FiltrePhase, string> = { existant: "Existant", nouveau: "Nouveau", "a-demolir": "À démolir", "sans-phase": "Sans phase" };
const fmt = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
const nouvelId = (prefixe: string) => `${prefixe}-${Math.random().toString(36).slice(2, 10)}`;
const estVue = (d: Definition) => d.classe === ("vue" as Definition["classe"]);
const estFeuille = (d: Definition) => d.classe === ("feuille" as Definition["classe"]);

/** Boîte des murs du modèle (ou du niveau) : point de départ d'une coupe ou d'un détail. */
function boiteMurs(etat: ModeleAtelier, niveauId: string | null) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "mur" || (niveauId && o.niveauId !== niveauId)) continue;
    for (const p of [o.params.a, o.params.b]) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: -5, y0: -5, x1: 5, y1: 5 };
}

/** État de production d'un document : la dernière production parmi ses formats, comparée à l'état courant. */
function fraicheur(catalogue: DocumentDescriptor[] | undefined, prefixe: string, empreinte: string, revision: number): { texte: string; etat: "non-produit" | "a-jour" | "perime" | "modele" } {
  const produits = (catalogue ?? []).filter((d) => d.kind.startsWith(prefixe) && d.produced).sort((a, b) => (a.produced!.producedAt < b.produced!.producedAt ? 1 : -1));
  const d = produits[0];
  if (!d || !d.produced) return { texte: "Non produit", etat: "non-produit" };
  const fmtDoc = d.kind.split("-").pop()!.toUpperCase();
  if (d.produced.modelRevision === revision && d.produced.inputHash === empreinte) return { texte: `À jour · ${fmtDoc} produit à la révision ${revision}`, etat: "a-jour" };
  if (d.produced.inputHash === empreinte) return { texte: `Dessin inchangé depuis la révision ${d.produced.modelRevision} (modèle modifié ailleurs) · à reproduire pour le catalogue`, etat: "modele" };
  return { texte: `Périmé · produit à la révision ${d.produced.modelRevision}, le dessin a changé depuis`, etat: "perime" };
}

function Telechargements({ href, formats, onProduit }: { href: (f: string) => string; formats: string[]; onProduit: () => void; readOnly?: boolean }) {
  return (
    <div className="doc-telechargements" role="group" aria-label="Produire le fichier">
      {formats.map((f) => (
        <a key={f} className="doc-bouton" href={href(f)} download data-format={f} onClick={onProduit}>
          {f.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

/** Aperçu SVG généré hors du rendu (la façade d'un grand modèle prend une à deux secondes). */
function useGeneration<T>(cle: string, calcul: () => Promise<T>): { valeur: T | null; enCours: boolean; erreur: string | null } {
  const [etat, setEtat] = useState<{ cle: string; valeur: T | null; erreur: string | null } | null>(null);
  useEffect(() => {
    let annule = false;
    calcul().then(
      (valeur) => !annule && setEtat({ cle, valeur, erreur: null }),
      (err: unknown) => !annule && setEtat({ cle, valeur: null, erreur: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  // Pendant un nouveau calcul, le résultat précédent reste affiché (marqué « en cours »).
  return { valeur: etat?.valeur ?? null, enCours: etat?.cle !== cle, erreur: etat?.cle === cle ? etat.erreur : null };
}

export function Documents({ projectId, code, nomProjet, etat, revision, readOnly, niveauId, onCommandes, externes }: PropsDocuments) {
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: ["documents", projectId], queryFn: () => api.getDocuments(projectId), staleTime: 5000 });
  const [choix, setChoix] = useState<Choix>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const vues = useMemo(() => Object.values(etat.definitions).filter(estVue).sort((a, b) => (a.id < b.id ? -1 : 1)), [etat.definitions]);
  const feuilles = useMemo(() => Object.values(etat.definitions).filter(estFeuille).sort((a, b) => (a.id < b.id ? -1 : 1)), [etat.definitions]);
  const projet = useMemo(() => ({ nom: nomProjet, code }), [nomProjet, code]);
  const niveaux = niveauxOrdonnes(etat);
  const niveau = (niveauId && etat.niveaux[niveauId]) || niveaux[0] || null;
  const base = `/projects/${projectId}/documents/atelier`;
  const produit = () => window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["documents", projectId] }), 1200);

  // Choix par défaut : la première vue, sinon la première feuille, sinon la synthèse des quantités.
  useEffect(() => {
    if (choix && (choix.type === "tableau" || etat.definitions[choix.id])) return;
    setChoix(vues[0] ? { type: "vue", id: vues[0].id } : feuilles[0] ? { type: "feuille", id: feuilles[0].id } : { type: "tableau", id: "synthese" });
  }, [choix, vues, feuilles, etat.definitions]);

  const executer = async (commandes: Commande[], label: string, apres?: Choix) => {
    setErreur(null);
    try {
      await onCommandes(commandes, label);
      if (apres) setChoix(apres);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  };

  const creerVue = (type: TypeVue, orientation?: Orientation) => {
    const id = nouvelId("vue");
    const b = boiteMurs(etat, type === "detail" ? (niveau?.id ?? null) : null);
    const cy = (b.y0 + b.y1) / 2;
    const cx = (b.x0 + b.x1) / 2;
    const lettre = String.fromCharCode(65 + (vues.filter((v) => paramsDeDefinition(v).type === "coupe").length % 26));
    const params: Record<string, unknown> =
      type === "plan"
        ? { type, titre: `Plan · ${niveau?.nom ?? ""}`, echelle: 100, niveauId: niveau?.id }
        : type === "coupe"
          ? { type, titre: `Coupe ${lettre}–${lettre}`, echelle: 100, ligneA: pt(b.x0 - 2, cy), ligneB: pt(b.x1 + 2, cy) }
          : type === "facade"
            ? { type, titre: `Façade ${ORIENTATION_LIBELLE[orientation ?? "sud"]}`, echelle: 100, orientation: orientation ?? "sud" }
            : type === "masse"
              ? { type, titre: "Plan de masse", echelle: 500 }
              : type === "axonometrie"
                ? // Isométrie vue du sud-ouest : paramètres de dessin affichés et modifiables, pas des données du projet.
                  { type, titre: "Axonométrie sud-ouest", echelle: 100, azimut: { value: 225, unit: "deg" }, inclinaison: { value: 35.26, unit: "deg" }, lignesCachees: false }
              : type === "isometrique"
                ? { type, titre: `Isométrique de tuyauterie${niveau ? ` · ${niveau.nom}` : ""}`, echelle: 50, niveauId: niveau?.id ?? null }
              : { type, titre: `Détail · ${niveau?.nom ?? ""}`, echelle: 20, niveauId: niveau?.id, cadreMin: pt(cx - 2, cy - 2), cadreMax: pt(cx + 2, cy + 2) };
    void executer([{ type: "vue.creer", params: { id, ...params } }], `Nouvelle vue : ${String(params["titre"])}`, { type: "vue", id });
  };

  const creerFeuille = () => {
    const id = nouvelId("feuille");
    const n = feuilles.length + 1;
    void executer([{ type: "feuille.creer", params: { id, titre: `Feuille ${n}`, numero: `A-${100 + n}`, format: "A3", orientation: "paysage" } }], `Nouvelle feuille A-${100 + n}`, { type: "feuille", id });
  };
  // Gabarits (P2-7) : vue + nomenclatures posées d'un coup ; niveau actif requis sauf pour l'isométrique.
  const creerGabarit = (gabarit: string) => {
    const id = nouvelId("feuille");
    const vueId = nouvelId("vue");
    void executer([{ type: "feuille.gabarit", params: { id, vueId, gabarit, niveauId: gabarit === "isometrique" ? (niveau?.id ?? null) : niveau?.id } }], `Feuille gabarit ${gabarit}`, { type: "feuille", id });
  };

  return (
    <div className="atelier-docs">
      <nav className="docs-liste" aria-label="Vues, feuilles et tableaux">
        <section>
          <h3>Vues</h3>
          {!readOnly && (
            <details className="docs-nouvelle">
              <summary>Nouvelle vue</summary>
              <div className="docs-nouvelle-liste" onClick={(e) => (e.target as HTMLElement).closest("button") && e.currentTarget.closest("details")?.removeAttribute("open")}>
                <button type="button" data-nouvelle="plan" disabled={!niveau} onClick={() => creerVue("plan")}>Plan du niveau actif</button>
                <button type="button" data-nouvelle="coupe" onClick={() => creerVue("coupe")}>Coupe</button>
                {ORIENTATIONS.map((o) => (
                  <button key={o} type="button" data-nouvelle={`facade-${o}`} onClick={() => creerVue("facade", o)}>Façade {ORIENTATION_LIBELLE[o]}</button>
                ))}
                <button type="button" data-nouvelle="masse" onClick={() => creerVue("masse")}>Plan de masse</button>
                <button type="button" data-nouvelle="axonometrie" onClick={() => creerVue("axonometrie")}>Axonométrie (isométrie sud-ouest)</button>
                <button type="button" data-nouvelle="isometrique" onClick={() => creerVue("isometrique")}>Isométrique de tuyauterie</button>
                <button type="button" data-nouvelle="detail" disabled={!niveau} onClick={() => creerVue("detail")}>Détail du niveau actif</button>
              </div>
            </details>
          )}
          {vues.length === 0 && <p className="docs-vide">Aucune vue : créez un plan, une coupe ou une façade.</p>}
          <ul>
            {vues.map((d) => {
              const p = paramsDeDefinition(d);
              const f = fraicheur(catalogue.data?.documents, `atelier-vue-${d.id}-`, empreinteVue(etat, p), revision);
              return (
                <li key={d.id}>
                  <button type="button" className="docs-item" aria-current={choix?.type === "vue" && choix.id === d.id ? "true" : undefined} data-vue={d.id} onClick={() => setChoix({ type: "vue", id: d.id })}>
                    <span className="docs-item-titre">{p.titre}</span>
                    <span className="docs-item-meta">{LIBELLES_TYPE[p.type]} · 1:{p.echelle}</span>
                    <span className={`docs-fraicheur fr-${f.etat}`}>{f.etat === "a-jour" ? "À jour" : f.etat === "perime" ? "Périmée" : f.etat === "modele" ? "À reproduire" : "Non produite"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3>Feuilles</h3>
          {!readOnly && (
            <>
              <button type="button" className="docs-ajout" data-nouvelle="feuille" onClick={creerFeuille}>Nouvelle feuille</button>
              <details className="docs-gabarits" data-gabarits>
                <summary>Feuille gabarit (vue + nomenclatures)</summary>
                <div className="docs-nouvelle-liste" onClick={(e) => (e.target as HTMLElement).closest("button") && e.currentTarget.closest("details")?.removeAttribute("open")}>
                  <button type="button" data-gabarit="atelier" disabled={!niveau} onClick={() => creerGabarit("atelier")}>Plan d'atelier (pièces, perçages)</button>
                  <button type="button" data-gabarit="production-acier" disabled={!niveau} onClick={() => creerGabarit("production-acier")}>Production acier (structure, assemblages, débit)</button>
                  <button type="button" data-gabarit="production-beton" disabled={!niveau} onClick={() => creerGabarit("production-beton")}>Production béton (armatures, ferraillage)</button>
                  <button type="button" data-gabarit="ferraillage" disabled={!niveau} onClick={() => creerGabarit("ferraillage")}>Feuille de ferraillage</button>
                  <button type="button" data-gabarit="pliage" disabled={!niveau} onClick={() => creerGabarit("pliage")}>Feuille de pliage (tôles, débit)</button>
                  <button type="button" data-gabarit="isometrique" onClick={() => creerGabarit("isometrique")}>Isométrique de tuyauterie</button>
                </div>
              </details>
            </>
          )}
          {feuilles.length === 0 && <p className="docs-vide">Aucune feuille.</p>}
          <ul>
            {feuilles.map((d) => {
              const p = d.params as unknown as ParamsFeuille;
              const f = fraicheur(catalogue.data?.documents, `atelier-feuille-${d.id}-`, empreinteFeuille(etat, p, projet), revision);
              return (
                <li key={d.id}>
                  <button type="button" className="docs-item" aria-current={choix?.type === "feuille" && choix.id === d.id ? "true" : undefined} data-feuille={d.id} onClick={() => setChoix({ type: "feuille", id: d.id })}>
                    <span className="docs-item-titre">{p.numero} · {p.titre}</span>
                    <span className="docs-item-meta">{p.format} {p.orientation}{p.jeu ? ` · jeu ${p.jeu}` : ""} · {p.vues.length} vue(s)</span>
                    <span className={`docs-fraicheur fr-${f.etat}`}>{f.etat === "a-jour" ? "À jour" : f.etat === "perime" ? "Périmée" : f.etat === "modele" ? "À reproduire" : "Non produite"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3>Tableaux</h3>
          <ul>
            {(Object.keys(TABLEAUX) as TypeTableau[]).map((t) => (
              <li key={t}>
                <button type="button" className="docs-item" aria-current={choix?.type === "tableau" && choix.id === t ? "true" : undefined} data-tableau={t} onClick={() => setChoix({ type: "tableau", id: t })}>
                  <span className="docs-item-titre">{TABLEAUX[t]}</span>
                </button>
              </li>
            ))}
          </ul>
          <a className="docs-lien" href={`${base}/quantites.html`} download onClick={produit} data-rapport="quantites">Rapport des quantités (HTML)</a>
        </section>
      </nav>

      <div className="docs-contenu">
        {erreur && <p className="docs-erreur" role="alert">{erreur}</p>}
        {choix?.type === "vue" && etat.definitions[choix.id] && (
          <VueDetail key={choix.id} projectId={projectId} def={etat.definitions[choix.id]!} etat={etat} revision={revision} readOnly={readOnly} catalogue={catalogue.data?.documents} base={base} onProduit={produit} onCommandes={executer} feuilles={feuilles} externes={externes} />
        )}
        {choix?.type === "feuille" && etat.definitions[choix.id] && (
          <FeuilleDetail key={choix.id} def={etat.definitions[choix.id]!} etat={etat} revision={revision} readOnly={readOnly} projet={projet} catalogue={catalogue.data?.documents} base={base} onProduit={produit} onCommandes={executer} vues={vues} externes={externes} />
        )}
        {choix?.type === "tableau" && <TableauDetail type={choix.id} etat={etat} base={base} onProduit={produit} />}
      </div>
    </div>
  );
}

// --- Vue -----------------------------------------------------------------------------------------------------------

const lirePoint = (t: string) => {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*;\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(t);
  return m ? pt(Number(m[1]!.replace(",", ".")), Number(m[2]!.replace(",", "."))) : null;
};
const ecrirePoint = (p: { x: number; y: number } | null) => (p ? `${fmt(p.x)} ; ${fmt(p.y)}` : "");
const nombre = (t: string) => {
  const v = Number(t.replace(",", "."));
  return Number.isFinite(v) && t.trim() !== "" ? v : null;
};

/** Comparaison de la vue avec son dessin dans une version nommée (lot 7) : traits retirés / ajoutés. */
function ComparaisonVue({ projectId, p, defId, vue, revision }: { projectId: string; p: ParamsVue; defId: string; vue: VueGeneree | null; revision: number }) {
  const versions = useQuery({ queryKey: ["atelier-versions", projectId, revision], queryFn: () => api.getAtelierVersions(projectId), retry: false });
  const [versionId, setVersionId] = useState("");
  const version = useQuery({ queryKey: ["atelier-version", projectId, versionId], queryFn: () => api.getAtelierVersion(projectId, versionId), enabled: !!versionId, retry: false, staleTime: Infinity });
  // Paramètres relus à chaque rendu : la clé sérialisée évite de régénérer la vue de la version pour rien.
  const cleParams = JSON.stringify(p);
  const cmp = useMemo(() => {
    if (!vue || !version.data) return null;
    const avant = genererVue(version.data.modele, JSON.parse(cleParams) as ParamsVue, defId);
    return svgComparaisonVues(avant, vue, revision, `version « ${version.data.nom} » (r${version.data.revision})`);
  }, [vue, version.data, cleParams, defId, revision]);
  if (!versions.data?.versions.length) return null;
  return (
    <div className="docs-comparaison">
      <label>
        Comparer avec une version
        <select value={versionId} onChange={(e) => setVersionId(e.target.value)} data-comparer="version">
          <option value="">—</option>
          {versions.data.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nom} (r{v.revision})
            </option>
          ))}
        </select>
      </label>
      {version.isLoading && <p role="status">Chargement de la version…</p>}
      {cmp && (
        <>
          <p className="docs-meta" data-comparaison-resultat={`${cmp.retirees}:${cmp.ajoutees}`}>
            {cmp.retirees || cmp.ajoutees ? `${cmp.retirees} trait(s) retiré(s) (rouge), ${cmp.ajoutees} ajouté(s) (vert) depuis cette version.` : "Dessin identique à celui de cette version."}
          </p>
          <div className="docs-svg docs-svg-comparaison" aria-label="Comparaison de la vue" dangerouslySetInnerHTML={{ __html: cmp.svg }} />
        </>
      )}
    </div>
  );
}

function VueDetail({ projectId, def, etat, revision, readOnly, catalogue, base, onProduit, onCommandes, feuilles, externes }: { projectId: string; def: Definition; etat: ModeleAtelier; revision: number; readOnly: boolean; catalogue: DocumentDescriptor[] | undefined; base: string; onProduit: () => void; onCommandes: (c: Commande[], label: string, apres?: Choix) => Promise<void>; feuilles: Definition[]; externes?: readonly TraitsExternes[] }) {
  const p = paramsDeDefinition(def);
  const empreinte = empreinteVue(etat, p);
  const { valeur: vue, enCours } = useGeneration<VueGeneree>(`${def.id}:${empreinte}:${externes ? "x" : "-"}`, () => genererVueHorsFil(etat, p, def.id, externes ? { externes } : {}));
  const svg = useMemo(() => (vue ? svgVue(vue, revision) : ""), [vue, revision]);
  const f = fraicheur(catalogue, `atelier-vue-${def.id}-`, empreinte, revision);
  const [form, setForm] = useState(() => ({
    titre: p.titre,
    echelle: String(p.echelle),
    niveauId: p.niveauId ?? "",
    hauteurCoupe: p.hauteurCoupe ? fmt(p.hauteurCoupe.value) : "",
    ligneA: ecrirePoint(p.ligneA),
    ligneB: ecrirePoint(p.ligneB),
    profondeur: p.profondeur ? fmt(p.profondeur.value) : "",
    orientation: p.orientation ?? "sud",
    cadreMin: ecrirePoint(p.cadreMin),
    cadreMax: ecrirePoint(p.cadreMax),
    lignesCachees: p.lignesCachees,
    phases: p.phases,
    calquesMasques: p.calquesMasques ?? [],
    azimut: p.azimut ? fmt(p.azimut.value) : "",
    inclinaison: p.inclinaison ? fmt(p.inclinaison.value) : "",
  }));
  const [local, setLocal] = useState<string | null>(null);
  const appliquer = () => {
    setLocal(null);
    const params: Record<string, unknown> = { titre: form.titre, echelle: nombre(form.echelle) ?? p.echelle, lignesCachees: form.lignesCachees, phases: form.phases, calquesMasques: form.calquesMasques };
    if (p.type === "plan" || p.type === "detail") {
      params["niveauId"] = form.niveauId;
      const h = nombre(form.hauteurCoupe);
      params["hauteurCoupe"] = h === null ? null : { value: h, unit: "m" };
    }
    if (p.type === "coupe") {
      const a = lirePoint(form.ligneA);
      const b = lirePoint(form.ligneB);
      if (!a || !b) return setLocal("Trace de coupe : saisissez « x ; y » en mètres pour chaque extrémité.");
      params["ligneA"] = a;
      params["ligneB"] = b;
      const pr = nombre(form.profondeur);
      params["profondeur"] = pr === null ? null : { value: pr, unit: "m" };
    }
    if (p.type === "facade") params["orientation"] = form.orientation;
    if (p.type === "axonometrie") {
      const az = nombre(form.azimut);
      const inc = nombre(form.inclinaison);
      if (az === null || inc === null) return setLocal("Axonométrie : azimut et inclinaison en degrés.");
      params["azimut"] = { value: az, unit: "deg" };
      params["inclinaison"] = { value: inc, unit: "deg" };
    }
    if (p.type === "detail") {
      const a = lirePoint(form.cadreMin);
      const b = lirePoint(form.cadreMax);
      if (!a || !b) return setLocal("Cadre du détail : saisissez « x ; y » en mètres pour chaque coin.");
      params["cadreMin"] = a;
      params["cadreMax"] = b;
    }
    void onCommandes([{ type: "vue.modifier", params: { id: def.id, params } }], `Vue modifiée : ${form.titre}`);
  };
  const surFeuilles = feuilles.filter((fe) => (fe.params as unknown as ParamsFeuille).vues.some((v) => v.vueId === def.id));
  const supprimer = () => {
    if (surFeuilles.length && !window.confirm(`Cette vue est placée sur ${surFeuilles.length} feuille(s) : la retirer de ces feuilles et la supprimer ?`)) return;
    void onCommandes([{ type: "vue.supprimer", params: { id: def.id, retirerDesFeuilles: surFeuilles.length > 0 } }], `Vue supprimée : ${p.titre}`, null);
  };
  return (
    <div className="docs-detail" data-detail="vue">
      <header className="docs-entete">
        <div>
          <h2>{p.titre}</h2>
          <p className={`docs-fraicheur-texte fr-${f.etat}`} data-fraicheur={f.etat}>{f.texte}</p>
          <p className="docs-meta">Empreinte du dessin <code>{empreinte}</code> · révision du modèle {revision}{vue ? ` · ${vue.objets.length} objet(s) lus` : ""}</p>
        </div>
        <Telechargements href={(fo) => `${base}/vues/${encodeURIComponent(def.id)}.${fo}`} formats={["pdf", "dxf", "svg"]} onProduit={onProduit} readOnly={readOnly} />
      </header>
      <div className="docs-apercu" aria-busy={enCours} aria-label={`Aperçu : ${p.titre}`}>
        {enCours && <p role="status" className="docs-generation">Génération de la vue…</p>}
        {!enCours && vue && <div className="docs-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
      <ComparaisonVue projectId={projectId} p={p} defId={def.id} vue={vue} revision={revision} />
      {vue && vue.avertissements.length > 0 && (
        <ul className="docs-avertissements" aria-label="Conventions et limites de la vue">
          {vue.avertissements.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      <AnnotationsVue defId={def.id} p={p} vue={vue} readOnly={readOnly} onCommandes={onCommandes} />
      <form className="docs-reglages" onSubmit={(e) => { e.preventDefault(); appliquer(); }}>
        <fieldset disabled={readOnly}>
          <legend>Réglages de la vue</legend>
          <label>Titre<input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></label>
          <label>Échelle 1:
            <select value={form.echelle} onChange={(e) => setForm({ ...form, echelle: e.target.value })}>
              {ECHELLES.map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </label>
          {(p.type === "plan" || p.type === "detail") && (
            <>
              <label>Niveau
                <select value={form.niveauId} onChange={(e) => setForm({ ...form, niveauId: e.target.value })}>
                  {niveauxOrdonnes(etat).map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
                </select>
              </label>
              <label>Hauteur de coupe (m)<input inputMode="decimal" placeholder="1,00 (par défaut)" value={form.hauteurCoupe} onChange={(e) => setForm({ ...form, hauteurCoupe: e.target.value })} /></label>
            </>
          )}
          {p.type === "coupe" && (
            <>
              <label>Trace, début (x ; y)<input value={form.ligneA} onChange={(e) => setForm({ ...form, ligneA: e.target.value })} /></label>
              <label>Trace, fin (x ; y)<input value={form.ligneB} onChange={(e) => setForm({ ...form, ligneB: e.target.value })} /></label>
              <label>Profondeur vue (m)<input inputMode="decimal" placeholder="sans limite" value={form.profondeur} onChange={(e) => setForm({ ...form, profondeur: e.target.value })} /></label>
              <p className="docs-note">On regarde vers la gauche de la trace (du début vers la fin).</p>
            </>
          )}
          {p.type === "facade" && (
            <label>Façade
              <select value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value as Orientation })}>
                {ORIENTATIONS.map((o) => <option key={o} value={o}>{ORIENTATION_LIBELLE[o]}</option>)}
              </select>
            </label>
          )}
          {p.type === "detail" && (
            <>
              <label>Cadre, coin bas gauche (x ; y)<input value={form.cadreMin} onChange={(e) => setForm({ ...form, cadreMin: e.target.value })} /></label>
              <label>Cadre, coin haut droit (x ; y)<input value={form.cadreMax} onChange={(e) => setForm({ ...form, cadreMax: e.target.value })} /></label>
            </>
          )}
          {p.type === "axonometrie" && (
            <>
              <label>Azimut (°, depuis l'axe x, sens direct)<input value={form.azimut} inputMode="decimal" onChange={(e) => setForm({ ...form, azimut: e.target.value })} data-axo="azimut" /></label>
              <label>Inclinaison (°, au-dessus de l'horizontale)<input value={form.inclinaison} inputMode="decimal" onChange={(e) => setForm({ ...form, inclinaison: e.target.value })} data-axo="inclinaison" /></label>
            </>
          )}
          {(p.type === "coupe" || p.type === "facade" || p.type === "axonometrie") && (
            <label className="docs-case"><input type="checkbox" checked={form.lignesCachees} onChange={(e) => setForm({ ...form, lignesCachees: e.target.checked })} /> Lignes cachées en tirets</label>
          )}
          <fieldset className="docs-phases">
            <legend>Phases dessinées</legend>
            <label className="docs-case"><input type="checkbox" checked={form.phases === null} onChange={(e) => setForm({ ...form, phases: e.target.checked ? null : [...PHASES, "sans-phase"] })} /> Toutes</label>
            {form.phases !== null && ([...PHASES, "sans-phase"] as FiltrePhase[]).map((ph) => (
              <label key={ph} className="docs-case">
                <input type="checkbox" checked={form.phases!.includes(ph)} onChange={(e) => setForm({ ...form, phases: e.target.checked ? [...form.phases!, ph] : form.phases!.filter((x) => x !== ph) })} /> {PHASE_LIBELLE[ph]}
              </label>
            ))}
          </fieldset>
          {Object.keys(etat.calques).length > 0 && (
            <fieldset className="docs-phases" data-calques-vue>
              <legend>Calques masqués dans cette vue</legend>
              {Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre).map((c) => (
                <label key={c.id} className="docs-case">
                  <input type="checkbox" data-calque-vue={c.id} checked={form.calquesMasques.includes(c.id)} disabled={!c.visible} onChange={(e) => setForm({ ...form, calquesMasques: e.target.checked ? [...form.calquesMasques, c.id] : form.calquesMasques.filter((x) => x !== c.id) })} /> {c.nom}{!c.visible ? " (masqué dans le projet)" : ""}
                </label>
              ))}
            </fieldset>
          )}
          {local && <p className="docs-erreur" role="alert">{local}</p>}
          <div className="docs-actions">
            <button type="submit" className="docs-principal">Appliquer</button>
            <button type="button" onClick={supprimer}>Supprimer la vue</button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

// --- Feuille -------------------------------------------------------------------------------------------------------

function FeuilleDetail({ def, etat, revision, readOnly, projet, catalogue, base, onProduit, onCommandes, vues, externes }: { def: Definition; etat: ModeleAtelier; revision: number; readOnly: boolean; projet: { nom: string; code: string }; catalogue: DocumentDescriptor[] | undefined; base: string; onProduit: () => void; onCommandes: (c: Commande[], label: string, apres?: Choix) => Promise<void>; vues: Definition[]; externes?: readonly TraitsExternes[] }) {
  const p = def.params as unknown as ParamsFeuille;
  const empreinte = empreinteFeuille(etat, p, projet);
  const { valeur: feuille, enCours } = useGeneration<FeuilleComposee>(`${def.id}:${empreinte}:${revision}:${externes ? "x" : "-"}`, () => composerFeuilleHorsFil(etat, p, revision, projet, def.id, externes ? { externes } : {}));
  const svg = useMemo(() => (feuille ? svgFeuille(feuille) : ""), [feuille]);
  const f = fraicheur(catalogue, `atelier-feuille-${def.id}-`, empreinte, revision);
  const [form, setForm] = useState(() => ({ titre: p.titre, numero: p.numero, format: p.format, orientation: p.orientation, jeu: p.jeu ?? "", indice: p.indice ?? "", auteur: p.auteur ?? "", date: p.date ?? "" }));
  const [local, setLocal] = useState<string | null>(null);
  // Les places libres se calculent sur la composition de la feuille telle qu'elle est enregistrée, jamais sur une composition en retard.
  const compositionAJour = !enCours && feuille !== null;
  const placees = new Set(p.vues.map((v) => v.vueId));
  const disponibles = vues.filter((v) => !placees.has(v.id));
  const [aPlacer, setAPlacer] = useState("");
  const placer = async () => {
    setLocal(null);
    const d = etat.definitions[aPlacer];
    if (!d) return;
    const taille = tailleDessinMm(await genererVueHorsFil(etat, paramsDeDefinition(d), d.id));
    const occupees = (feuille?.vues ?? []).map((v) => ({ x0: v.cadre.x0 - 4, y0: v.cadre.y0 - 12, x1: v.cadre.x1 + 4, y1: v.cadre.y1 + 4 }));
    const pos = positionLibre(p, occupees, taille);
    if (!pos) return setLocal(`« ${d.nom} » ne tient pas sur cette feuille à son échelle : changez d'échelle ou de format.`);
    void onCommandes([{ type: "feuille.placer", params: { id: def.id, vueId: d.id, x: pos.x, y: pos.y } }], `Vue placée sur la feuille ${p.numero}`);
    setAPlacer("");
  };
  const tableauxDisponibles = (Object.keys(TABLEAUX) as TypeTableau[]).filter((t) => !(p.tableaux ?? []).some((x) => x.type === t));
  const [tableauAPlacer, setTableauAPlacer] = useState("");
  const placerTableau = () => {
    setLocal(null);
    const type = tableauAPlacer as TypeTableau;
    if (!type) return;
    const z = zoneUtile(p);
    const g = grilleTableau(genererTableau(etat, type), z.y1 - z.y0);
    const taille = { largeur: g.largeur, hauteur: (g.lignes.length + 1) * g.hauteurLigne + 8 };
    const occupees = [...(feuille?.vues ?? []).map((v) => ({ x0: v.cadre.x0 - 4, y0: v.cadre.y0 - 12, x1: v.cadre.x1 + 4, y1: v.cadre.y1 + 4 })), ...(feuille?.tableaux ?? []).map((t) => ({ x0: t.cadre.x0 - 4, y0: t.cadre.y0 - 4, x1: t.cadre.x1 + 4, y1: t.cadre.y1 + 4 }))];
    const pos = positionLibre(p, occupees, taille);
    // Centre renvoyé par positionLibre → coin haut gauche ; à défaut, en haut à gauche (lignes en trop signalées).
    const x = pos ? Math.round(pos.x - taille.largeur / 2) : z.x0 + 6;
    const y = pos ? Math.round(pos.y + taille.hauteur / 2 - 2) : z.y1 - 6;
    void onCommandes([{ type: "feuille.placerTableau", params: { id: def.id, type, x: Math.max(z.x0, x), y: Math.min(z.y1, y) } }], `${TABLEAUX[type]} placé sur la feuille ${p.numero}`);
    setTableauAPlacer("");
  };
  return (
    <div className="docs-detail" data-detail="feuille">
      <header className="docs-entete">
        <div>
          <h2>{p.numero} · {p.titre}</h2>
          <p className={`docs-fraicheur-texte fr-${f.etat}`} data-fraicheur={f.etat}>{f.texte}</p>
          <p className="docs-meta">{FORMATS[p.format].largeur} × {FORMATS[p.format].hauteur} mm · empreinte <code>{empreinte}</code></p>
        </div>
        <Telechargements href={(fo) => `${base}/feuilles/${encodeURIComponent(def.id)}.${fo}`} formats={["pdf", "dxf", "svg"]} onProduit={onProduit} readOnly={readOnly} />
      </header>
      <div className="docs-apercu docs-apercu-feuille" aria-busy={enCours} aria-label={`Aperçu de la feuille ${p.numero}`}>
        {enCours && <p role="status" className="docs-generation">Composition de la feuille…</p>}
        {!enCours && feuille && (
          <FeuilleInteractive
            feuille={feuille}
            svg={svg}
            readOnly={readOnly}
            onDeplacer={(c, x, y) =>
              void onCommandes(
                "vueId" in c ? [{ type: "feuille.placer", params: { id: def.id, vueId: c.vueId, x, y } }] : [{ type: "feuille.placerTableau", params: { id: def.id, type: c.tableau, x, y } }],
                "vueId" in c ? `Vue déplacée sur la feuille ${p.numero}` : `Tableau déplacé sur la feuille ${p.numero}`,
              )
            }
          />
        )}
      </div>
      {feuille && feuille.avertissements.length > 0 && (
        <ul className="docs-avertissements">
          {feuille.avertissements.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      <section className="docs-placements" aria-label="Vues placées">
        <h3>Vues placées</h3>
        {p.vues.length === 0 && <p className="docs-vide">Aucune vue sur cette feuille.</p>}
        <ul>
          {p.vues.map((v) => (
            <li key={v.vueId}>
              <span>{etat.definitions[v.vueId]?.nom ?? v.vueId}</span>
              {readOnly ? (
                <span className="docs-meta">centre {fmt(v.x)} ; {fmt(v.y)} mm</span>
              ) : (
                <CentreVue x={v.x} y={v.y} vueId={v.vueId} libelle={etat.definitions[v.vueId]?.nom ?? v.vueId} onValider={(x, y) => void onCommandes([{ type: "feuille.placer", params: { id: def.id, vueId: v.vueId, x, y } }], `Vue déplacée sur la feuille ${p.numero}`)} />
              )}
              {!readOnly && <button type="button" onClick={() => void onCommandes([{ type: "feuille.retirer", params: { id: def.id, vueId: v.vueId } }], `Vue retirée de la feuille ${p.numero}`)}>Retirer</button>}
            </li>
          ))}
        </ul>
        {!readOnly && disponibles.length > 0 && (
          <div className="docs-placer">
            <label>Placer une vue
              <select value={aPlacer} onChange={(e) => setAPlacer(e.target.value)} data-placer="vue">
                <option value="">— choisir —</option>
                {disponibles.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
              </select>
            </label>
            <button type="button" disabled={!aPlacer || !compositionAJour} onClick={() => void placer()} data-placer="ok">Placer</button>
          </div>
        )}
        {local && <p className="docs-erreur" role="alert">{local}</p>}
      </section>
      <section className="docs-placements" aria-label="Nomenclatures placées">
        <h3>Nomenclatures</h3>
        {!(p.tableaux ?? []).length && <p className="docs-vide">Aucun tableau sur cette feuille.</p>}
        <ul>
          {(p.tableaux ?? []).map((t) => (
            <li key={t.type} data-tableau-place={t.type}>
              <span>{TABLEAUX[t.type]}</span>
              <span className="docs-meta">coin haut gauche {fmt(t.x)} ; {fmt(t.y)} mm{feuille?.tableaux.find((x) => x.type === t.type)?.omises ? ` · ${feuille.tableaux.find((x) => x.type === t.type)!.omises} ligne(s) hors feuille` : ""}</span>
              {!readOnly && <button type="button" onClick={() => void onCommandes([{ type: "feuille.retirerTableau", params: { id: def.id, type: t.type } }], `Tableau retiré de la feuille ${p.numero}`)}>Retirer</button>}
            </li>
          ))}
        </ul>
        {!readOnly && tableauxDisponibles.length > 0 && (
          <div className="docs-placer">
            <label>Placer un tableau
              <select value={tableauAPlacer} onChange={(e) => setTableauAPlacer(e.target.value)} data-placer="tableau">
                <option value="">— choisir —</option>
                {tableauxDisponibles.map((t) => <option key={t} value={t}>{TABLEAUX[t]}</option>)}
              </select>
            </label>
            <button type="button" disabled={!tableauAPlacer || !compositionAJour} onClick={placerTableau} data-placer="tableau-ok">Placer</button>
          </div>
        )}
      </section>
      <form className="docs-reglages" onSubmit={(e) => { e.preventDefault(); void onCommandes([{ type: "feuille.modifier", params: { id: def.id, params: { ...form, jeu: form.jeu || null, indice: form.indice || null, auteur: form.auteur || null, date: form.date || null } } }], `Feuille ${form.numero} modifiée`); }}>
        <fieldset disabled={readOnly}>
          <legend>Cartouche et format</legend>
          <label>Titre<input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></label>
          <label>Numéro<input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></label>
          <label>Format
            <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as FormatFeuille })}>
              {(Object.keys(FORMATS) as FormatFeuille[]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label>Orientation
            <select value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value as ParamsFeuille["orientation"] })}>
              <option value="paysage">Paysage</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label>Jeu<input value={form.jeu} placeholder="ex. Esquisse, Permis" onChange={(e) => setForm({ ...form, jeu: e.target.value })} /></label>
          <label>Indice<input value={form.indice} onChange={(e) => setForm({ ...form, indice: e.target.value })} /></label>
          <label>Auteur<input value={form.auteur} onChange={(e) => setForm({ ...form, auteur: e.target.value })} /></label>
          <label>Date (saisie)<input value={form.date} placeholder="non renseignée" onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <HistoriqueIndices historique={p.historique ?? []} readOnly={readOnly} onChanger={(historique) => void onCommandes([{ type: "feuille.modifier", params: { id: def.id, params: { historique } } }], `Feuille ${p.numero} : historique des indices`)} />
          <div className="docs-actions">
            <button type="submit" className="docs-principal">Appliquer</button>
            <button type="button" onClick={() => window.confirm(`Supprimer la feuille ${p.numero} ? Les vues restent dans le modèle.`) && void onCommandes([{ type: "feuille.supprimer", params: { id: def.id } }], `Feuille ${p.numero} supprimée`, null)}>Supprimer la feuille</button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

/** Historique des indices de la feuille (D-061) : lignes saisies, dessinées au-dessus du cartouche. */
function HistoriqueIndices({ historique, readOnly, onChanger }: { historique: NonNullable<ParamsFeuille["historique"]>; readOnly: boolean; onChanger: (h: NonNullable<ParamsFeuille["historique"]>) => void }) {
  const [ligne, setLigne] = useState({ indice: "", date: "", objet: "" });
  return (
    <fieldset className="docs-historique" data-historique-indices={historique.length}>
      <legend>Historique des indices</legend>
      {historique.length > 0 && (
        <ol>
          {historique.map((h, i) => (
            <li key={`${h.indice}-${i}`}>
              <strong>{h.indice}</strong> · {h.date ?? "date non renseignée"} · {h.objet}
              {!readOnly && <button type="button" className="lien" onClick={() => onChanger(historique.filter((_, k) => k !== i))}>Retirer</button>}
            </li>
          ))}
        </ol>
      )}
      {!readOnly && historique.length < 10 && (
        <span className="docs-ligne">
          <input aria-label="Indice" placeholder="Indice" value={ligne.indice} maxLength={10} onChange={(e) => setLigne({ ...ligne, indice: e.target.value })} data-histo="indice" />
          <input aria-label="Date" placeholder="Date" value={ligne.date} maxLength={30} onChange={(e) => setLigne({ ...ligne, date: e.target.value })} data-histo="date" />
          <input aria-label="Objet de la modification" placeholder="Objet de la modification" value={ligne.objet} maxLength={80} onChange={(e) => setLigne({ ...ligne, objet: e.target.value })} data-histo="objet" />
          <button type="button" disabled={!ligne.indice.trim() || !ligne.objet.trim()} data-histo="ajouter" onClick={() => { onChanger([...historique, { indice: ligne.indice.trim(), date: ligne.date.trim() || null, objet: ligne.objet.trim() }]); setLigne({ indice: "", date: "", objet: "" }); }}>
            Ajouter l'indice
          </button>
        </span>
      )}
    </fieldset>
  );
}

/**
 * Annotations propres à la vue (coupes et façades surtout) : textes et cotes dans le repère du dessin, en mètres
 * (abscisse le long de la vue, ordonnée = altitude pour une coupe ou une façade). Rien n'est ajouté au modèle 3D.
 */
function AnnotationsVue({ defId, p, vue, readOnly, onCommandes }: { defId: string; p: ParamsVue; vue: VueGeneree | null; readOnly: boolean; onCommandes: (c: Commande[], label: string, apres?: Choix) => Promise<void> }) {
  const [type, setType] = useState<"texte" | "cote">("texte");
  const [champs, setChamps] = useState({ position: "", texte: "", a: "", b: "", decalage: "0,5" });
  const [erreur, setErreur] = useState<string | null>(null);
  const annotations = p.annotations ?? [];
  const b = vue?.bornes;
  const ajouter = () => {
    setErreur(null);
    let annotation: Record<string, unknown>;
    if (type === "texte") {
      const pos = lirePoint(champs.position);
      if (!pos || !champs.texte.trim()) return setErreur("Texte : saisissez la position « x ; y » (m) et le texte.");
      annotation = { type, position: { x: pos.x, y: pos.y }, texte: champs.texte.trim() };
    } else {
      const a = lirePoint(champs.a);
      const bb = lirePoint(champs.b);
      const d = nombre(champs.decalage);
      if (!a || !bb) return setErreur("Cote : saisissez les deux points « x ; y » (m).");
      annotation = { type, a: { x: a.x, y: a.y }, b: { x: bb.x, y: bb.y }, decalage: d ?? 0.5 };
    }
    void onCommandes([{ type: "vue.annoter", params: { id: defId, annotation } }], type === "texte" ? `Texte ajouté à la vue ${p.titre}` : `Cote ajoutée à la vue ${p.titre}`);
    setChamps({ ...champs, position: "", texte: "", a: "", b: "" });
  };
  return (
    <section className="docs-placements docs-annotations" aria-label="Annotations de la vue">
      <h3>Annotations de la vue</h3>
      <p className="docs-note">
        Repère du dessin, en mètres{p.type === "coupe" || p.type === "facade" ? " : abscisse le long de la vue, ordonnée = altitude" : " : repère local du projet"}
        {b ? ` · étendue x ${fmt(b.min.x)} → ${fmt(b.max.x)}, y ${fmt(b.min.y)} → ${fmt(b.max.y)}` : ""}.
      </p>
      {annotations.length === 0 && <p className="docs-vide">Aucune annotation propre à cette vue.</p>}
      <ul>
        {annotations.map((an) => (
          <li key={an.id} data-annotation={an.type}>
            <span>{an.type === "texte" ? `Texte « ${an.texte} »` : `Cote ${fmt(Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y))} m`}</span>
            <span className="docs-meta">{an.type === "texte" ? `${fmt(an.position.x)} ; ${fmt(an.position.y)}` : `${fmt(an.a.x)} ; ${fmt(an.a.y)} → ${fmt(an.b.x)} ; ${fmt(an.b.y)}`}</span>
            {!readOnly && <button type="button" onClick={() => void onCommandes([{ type: "vue.retirerAnnotation", params: { id: defId, annotationId: an.id } }], `Annotation retirée de la vue ${p.titre}`)}>Retirer</button>}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form className="docs-annoter" onSubmit={(e) => { e.preventDefault(); ajouter(); }}>
          <label>Ajouter
            <select value={type} onChange={(e) => setType(e.target.value as "texte" | "cote")} data-annoter="type">
              <option value="texte">un texte</option>
              <option value="cote">une cote</option>
            </select>
          </label>
          {type === "texte" ? (
            <>
              <label>Position (x ; y)<input value={champs.position} onChange={(e) => setChamps({ ...champs, position: e.target.value })} data-annoter="position" /></label>
              <label>Texte<input value={champs.texte} maxLength={200} onChange={(e) => setChamps({ ...champs, texte: e.target.value })} data-annoter="texte" /></label>
            </>
          ) : (
            <>
              <label>Premier point (x ; y)<input value={champs.a} onChange={(e) => setChamps({ ...champs, a: e.target.value })} data-annoter="a" /></label>
              <label>Second point (x ; y)<input value={champs.b} onChange={(e) => setChamps({ ...champs, b: e.target.value })} data-annoter="b" /></label>
              <label>Décalage (m)<input value={champs.decalage} inputMode="decimal" onChange={(e) => setChamps({ ...champs, decalage: e.target.value })} /></label>
            </>
          )}
          <button type="submit" data-annoter="ok">Ajouter</button>
          {erreur && <p className="docs-erreur" role="alert">{erreur}</p>}
        </form>
      )}
    </section>
  );
}

/**
 * Aperçu de feuille dont les vues se déplacent à la souris ou au doigt (cadre de la vue saisi, relâché = un lot
 * `feuille.placer`). Les coordonnées viennent de la matrice écran du SVG : 1 unité = 1 mm, y de la feuille vers le haut.
 */
type Cible = { vueId: string } | { tableau: TypeTableau };

function FeuilleInteractive({ feuille, svg, readOnly, onDeplacer }: { feuille: FeuilleComposee; svg: string; readOnly: boolean; onDeplacer: (cible: Cible, x: number, y: number) => void }) {
  const hote = useRef<HTMLDivElement | null>(null);
  const glisse = useRef<{ cible: Cible; depart: { x: number; y: number }; centre: { x: number; y: number }; el: SVGRectElement; bouge: boolean } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Poignées : un rectangle transparent par vue placée, ajouté au SVG produit (le fichier exporté n'en a pas).
  const avecPoignees = useMemo(() => {
    if (readOnly) return svg;
    const sur = (t: string) => t.replace(/[<>"&]/g, "");
    const rect = (attrs: string, c: { x0: number; y0: number; x1: number; y1: number }, libelle: string) =>
      `<rect class="feuille-poignee" ${attrs} x="${c.x0}" y="${feuille.hauteur - c.y1}" width="${c.x1 - c.x0}" height="${c.y1 - c.y0}" tabindex="0" role="button" aria-label="${sur(libelle)}"/>`;
    const aire = (c: { x0: number; y0: number; x1: number; y1: number }) => (c.x1 - c.x0) * (c.y1 - c.y0);
    // Les plus petites par-dessus : une vue posée sur une plus grande reste saisissable.
    const poignees = [
      ...feuille.vues.map((v, i) => ({ c: v.cadre, html: rect(`data-poignee="v${i}" data-poignee-vue="${sur(v.vueId)}"`, v.cadre, `Déplacer la vue ${v.titre}`) })),
      ...feuille.tableaux.map((t, i) => ({ c: t.cadre, html: rect(`data-poignee="t${i}" data-tableau="${t.type}"`, t.cadre, `Déplacer le tableau ${t.titre}`) })),
    ]
      .sort((a, b) => aire(b.c) - aire(a.c))
      .map((x) => x.html)
      .join("");
    return svg.replace("</svg>", `<g class="feuille-poignees">${poignees}</g></svg>`);
  }, [svg, feuille, readOnly]);
  const versFeuille = (e: { clientX: number; clientY: number }) => {
    const el = hote.current?.querySelector("svg");
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  const zone = zoneUtile(feuille.params);
  const borner = (x: number, y: number) => ({ x: Math.round(Math.min(zone.x1, Math.max(zone.x0, x))), y: Math.round(Math.min(zone.y1, Math.max(zone.y0, y))) });
  /** Cible d'une poignée : une vue (point = centre) ou un tableau (point = coin haut gauche). */
  const cibleDe = (el: Element | null): { cible: Cible; point: { x: number; y: number } } | null => {
    const k = el?.getAttribute("data-poignee");
    if (!k) return null;
    if (k.startsWith("v")) {
      const v = feuille.vues[Number(k.slice(1))];
      const pl = v && feuille.params.vues.find((x) => x.vueId === v.vueId);
      return v && pl ? { cible: { vueId: v.vueId }, point: { x: pl.x, y: pl.y } } : null;
    }
    const t = feuille.tableaux[Number(k.slice(1))];
    const pl = t && (feuille.params.tableaux ?? []).find((x) => x.type === t.type);
    return t && pl ? { cible: { tableau: t.type }, point: { x: pl.x, y: pl.y } } : null;
  };
  const surAppui = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest?.("[data-poignee]") as SVGRectElement | null;
    if (!el || readOnly) return;
    const c = cibleDe(el);
    const p = versFeuille(e);
    if (!c || !p) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    glisse.current = { cible: c.cible, depart: p, centre: c.point, el, bouge: false };
  };
  const surMouvement = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisse.current;
    const p = g && versFeuille(e);
    if (!g || !p) return;
    const dx = p.x - g.depart.x;
    const dy = p.y - g.depart.y;
    g.bouge = g.bouge || Math.hypot(dx, dy) > 1;
    g.el.setAttribute("transform", `translate(${dx} ${dy})`);
    const c = borner(g.centre.x + dx, g.centre.y - dy);
    setInfo(`${"vueId" in g.cible ? "centre" : "coin haut gauche"} ${c.x} ; ${c.y} mm`);
  };
  const surRelache = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisse.current;
    glisse.current = null;
    setInfo(null);
    if (!g) return;
    g.el.removeAttribute("transform");
    const p = versFeuille(e);
    if (!p || !g.bouge) return;
    const c = borner(g.centre.x + (p.x - g.depart.x), g.centre.y - (p.y - g.depart.y));
    if (c.x !== Math.round(g.centre.x) || c.y !== Math.round(g.centre.y)) onDeplacer(g.cible, c.x, c.y);
  };
  const surTouche = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const pas = e.shiftKey ? 1 : 5;
    const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] }[e.key];
    if (!d) return;
    const c = cibleDe((e.target as Element).closest?.("[data-poignee]") ?? null);
    if (!c) return;
    e.preventDefault();
    const n = borner(c.point.x + d[0]!, c.point.y + d[1]!);
    onDeplacer(c.cible, n.x, n.y);
  };
  return (
    <>
      <div ref={hote} className={`docs-svg${readOnly ? "" : " feuille-editable"}`} onPointerDown={surAppui} onPointerMove={surMouvement} onPointerUp={surRelache} onPointerCancel={surRelache} onKeyDown={surTouche} dangerouslySetInnerHTML={{ __html: avecPoignees }} />
      {!readOnly && <p className="docs-meta feuille-aide" role="status">{info ?? "Glissez une vue pour la déplacer (flèches : 5 mm, Maj + flèches : 1 mm)."}</p>}
    </>
  );
}

/** Centre d'une vue saisi au clavier (mm, depuis le coin bas gauche de la feuille). */
function CentreVue({ x, y, vueId, libelle, onValider }: { x: number; y: number; vueId: string; libelle: string; onValider: (x: number, y: number) => void }) {
  const [texte, setTexte] = useState(`${fmt(x)} ; ${fmt(y)}`);
  useEffect(() => setTexte(`${fmt(x)} ; ${fmt(y)}`), [x, y]);
  return (
    <form
      className="docs-centre"
      onSubmit={(e) => {
        e.preventDefault();
        const [a, b] = texte.split(";").map((t) => Number(t.trim().replace(",", ".")));
        if (Number.isFinite(a) && Number.isFinite(b)) onValider(a!, b!);
      }}
    >
      <label>
        <span className="sr-only">Centre de « {libelle} » (x ; y, mm)</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} inputMode="decimal" size={12} data-centre-vue={vueId} />
      </label>
      <button type="submit">Placer</button>
    </form>
  );
}

// --- Tableau -------------------------------------------------------------------------------------------------------

function TableauDetail({ type, etat, base, onProduit }: { type: TypeTableau; etat: ModeleAtelier; base: string; onProduit: () => void }) {
  const t = useMemo(() => genererTableau(etat, type), [etat, type]);
  const lignes = csvTableau(t).split("\r\n").length - 2;
  return (
    <div className="docs-detail" data-detail="tableau">
      <header className="docs-entete">
        <div>
          <h2>{t.titre}</h2>
          <p className="docs-meta">{t.lignes.length} ligne(s) · empreinte <code>{t.empreinte}</code> · une valeur absente du modèle est « non évaluée »</p>
        </div>
        <div className="doc-telechargements">
          <a className="doc-bouton" href={`${base}/tableaux/${type}.csv`} download data-format="csv" onClick={onProduit}>CSV</a>
        </div>
      </header>
      <div className="docs-tableau" role="region" aria-label={t.titre} tabIndex={0}>
        <table>
          <thead>
            <tr>{t.colonnes.map((c, i) => <th key={c} scope="col">{c}{t.unites[i] ? ` (${t.unites[i]})` : ""}</th>)}</tr>
          </thead>
          <tbody>
            {t.lignes.slice(0, 500).map((l, i) => (
              <tr key={i}>{l.map((v, j) => <td key={j} className={v === null ? "ne" : undefined}>{v === null ? "non évaluée" : typeof v === "number" ? fmt(v) : v}</td>)}</tr>
            ))}
          </tbody>
          {t.total && (
            <tfoot>
              <tr>{t.total.map((v, j) => <td key={j}>{v === null ? "" : typeof v === "number" ? fmt(v) : v}</td>)}</tr>
            </tfoot>
          )}
        </table>
        {lignes > 500 && <p className="docs-note">Aperçu limité aux 500 premières lignes ; le CSV les contient toutes.</p>}
      </div>
    </div>
  );
}
