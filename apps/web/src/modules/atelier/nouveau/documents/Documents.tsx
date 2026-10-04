/**
 * Mode « Documents » de l'Atelier (lot 5, cahier §5.9) : vues (plans, coupes, façades, plan de masse, détails),
 * feuilles et tableaux, définis par commandes dans le modèle et dessinés par le même code pur que le serveur
 * (`@parcours/atelier-model`). L'aperçu est calculé dans le navigateur ; les fichiers (PDF, DXF, SVG, CSV) sont
 * produits par le serveur à la révision courante et inscrits au catalogue des documents. Chaque vue affiche sa
 * fraîcheur : non produite, à jour, ou périmée — en distinguant « dessin modifié » de « modèle modifié ailleurs ».
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  composerFeuille,
  csvTableau,
  ECHELLES,
  empreinteFeuille,
  empreinteVue,
  FORMATS,
  genererTableau,
  genererVue,
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
  type VueGeneree,
} from "@parcours/atelier-model";
import { api, type DocumentDescriptor } from "../../../../lib/api";

export interface PropsDocuments {
  projectId: string;
  code: string;
  nomProjet: string;
  etat: ModeleAtelier;
  revision: number;
  readOnly: boolean;
  niveauId: string | null;
  onCommandes: (commandes: Commande[], label: string) => Promise<void> | void;
}

type Choix = { type: "vue" | "feuille"; id: string } | { type: "tableau"; id: TypeTableau } | null;

const LIBELLES_TYPE: Record<TypeVue, string> = { plan: "Plan", coupe: "Coupe", facade: "Façade", masse: "Plan de masse", detail: "Détail" };
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
function useGeneration<T>(cle: string, calcul: () => T): { valeur: T | null; enCours: boolean } {
  const [etat, setEtat] = useState<{ cle: string; valeur: T } | null>(null);
  useEffect(() => {
    let annule = false;
    const t = window.setTimeout(() => {
      const valeur = calcul();
      if (!annule) setEtat({ cle, valeur });
    }, 0);
    return () => {
      annule = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return { valeur: etat?.valeur ?? null, enCours: etat?.cle !== cle };
}

export function Documents({ projectId, code, nomProjet, etat, revision, readOnly, niveauId, onCommandes }: PropsDocuments) {
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
              : { type, titre: `Détail · ${niveau?.nom ?? ""}`, echelle: 20, niveauId: niveau?.id, cadreMin: pt(cx - 2, cy - 2), cadreMax: pt(cx + 2, cy + 2) };
    void executer([{ type: "vue.creer", params: { id, ...params } }], `Nouvelle vue : ${String(params["titre"])}`, { type: "vue", id });
  };

  const creerFeuille = () => {
    const id = nouvelId("feuille");
    const n = feuilles.length + 1;
    void executer([{ type: "feuille.creer", params: { id, titre: `Feuille ${n}`, numero: `A-${100 + n}`, format: "A3", orientation: "paysage" } }], `Nouvelle feuille A-${100 + n}`, { type: "feuille", id });
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
          {!readOnly && <button type="button" className="docs-ajout" data-nouvelle="feuille" onClick={creerFeuille}>Nouvelle feuille</button>}
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
          <VueDetail key={choix.id} projectId={projectId} def={etat.definitions[choix.id]!} etat={etat} revision={revision} readOnly={readOnly} catalogue={catalogue.data?.documents} base={base} onProduit={produit} onCommandes={executer} feuilles={feuilles} />
        )}
        {choix?.type === "feuille" && etat.definitions[choix.id] && (
          <FeuilleDetail key={choix.id} def={etat.definitions[choix.id]!} etat={etat} revision={revision} readOnly={readOnly} projet={projet} catalogue={catalogue.data?.documents} base={base} onProduit={produit} onCommandes={executer} vues={vues} />
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

function VueDetail({ projectId, def, etat, revision, readOnly, catalogue, base, onProduit, onCommandes, feuilles }: { projectId: string; def: Definition; etat: ModeleAtelier; revision: number; readOnly: boolean; catalogue: DocumentDescriptor[] | undefined; base: string; onProduit: () => void; onCommandes: (c: Commande[], label: string, apres?: Choix) => Promise<void>; feuilles: Definition[] }) {
  const p = paramsDeDefinition(def);
  const empreinte = empreinteVue(etat, p);
  const { valeur: vue, enCours } = useGeneration<VueGeneree>(`${def.id}:${empreinte}`, () => genererVue(etat, p, def.id));
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
  }));
  const [local, setLocal] = useState<string | null>(null);
  const appliquer = () => {
    setLocal(null);
    const params: Record<string, unknown> = { titre: form.titre, echelle: nombre(form.echelle) ?? p.echelle, lignesCachees: form.lignesCachees, phases: form.phases };
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
          {(p.type === "coupe" || p.type === "facade") && (
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

function FeuilleDetail({ def, etat, revision, readOnly, projet, catalogue, base, onProduit, onCommandes, vues }: { def: Definition; etat: ModeleAtelier; revision: number; readOnly: boolean; projet: { nom: string; code: string }; catalogue: DocumentDescriptor[] | undefined; base: string; onProduit: () => void; onCommandes: (c: Commande[], label: string, apres?: Choix) => Promise<void>; vues: Definition[] }) {
  const p = def.params as unknown as ParamsFeuille;
  const empreinte = empreinteFeuille(etat, p, projet);
  const { valeur: feuille, enCours } = useGeneration<FeuilleComposee>(`${def.id}:${empreinte}:${revision}`, () => composerFeuille(etat, p, revision, projet, def.id));
  const svg = useMemo(() => (feuille ? svgFeuille(feuille) : ""), [feuille]);
  const f = fraicheur(catalogue, `atelier-feuille-${def.id}-`, empreinte, revision);
  const [form, setForm] = useState(() => ({ titre: p.titre, numero: p.numero, format: p.format, orientation: p.orientation, jeu: p.jeu ?? "", indice: p.indice ?? "", auteur: p.auteur ?? "", date: p.date ?? "" }));
  const [local, setLocal] = useState<string | null>(null);
  const placees = new Set(p.vues.map((v) => v.vueId));
  const disponibles = vues.filter((v) => !placees.has(v.id));
  const [aPlacer, setAPlacer] = useState("");
  const placer = () => {
    setLocal(null);
    const d = etat.definitions[aPlacer];
    if (!d) return;
    const taille = tailleDessinMm(genererVue(etat, paramsDeDefinition(d), d.id));
    const occupees = (feuille?.vues ?? []).map((v) => ({ x0: v.cadre.x0 - 4, y0: v.cadre.y0 - 12, x1: v.cadre.x1 + 4, y1: v.cadre.y1 + 4 }));
    const pos = positionLibre(p, occupees, taille);
    if (!pos) return setLocal(`« ${d.nom} » ne tient pas sur cette feuille à son échelle : changez d'échelle ou de format.`);
    void onCommandes([{ type: "feuille.placer", params: { id: def.id, vueId: d.id, x: pos.x, y: pos.y } }], `Vue placée sur la feuille ${p.numero}`);
    setAPlacer("");
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
        {!enCours && feuille && <div className="docs-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
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
              <span className="docs-meta">centre {fmt(v.x)} ; {fmt(v.y)} mm</span>
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
            <button type="button" disabled={!aPlacer} onClick={placer} data-placer="ok">Placer</button>
          </div>
        )}
        {local && <p className="docs-erreur" role="alert">{local}</p>}
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
          <div className="docs-actions">
            <button type="submit" className="docs-principal">Appliquer</button>
            <button type="button" onClick={() => window.confirm(`Supprimer la feuille ${p.numero} ? Les vues restent dans le modèle.`) && void onCommandes([{ type: "feuille.supprimer", params: { id: def.id } }], `Feuille ${p.numero} supprimée`, null)}>Supprimer la feuille</button>
          </div>
        </fieldset>
      </form>
    </div>
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
