/**
 * Fiche territoriale (lot E, D-GD-22) : la fiche d'une entité, comme celle des cartes du HCP — indicateurs par thème,
 * familles déclinées présentées en tableaux de ventilation (modalité × milieu × sexe), subdivisions de l'entité (ses
 * enfants dans le découpage en base, D-GD-42 : arrondissements d'une commune, préfectures d'arrondissements… avec
 * leurs chiffres), douars d'une commune rurale (noms publiés en arabe, D-GD-21), impression.
 * Les noms et valeurs des sources sont des données (`translate="no"`) ; une valeur absente n'est jamais zéro.
 */
import { useEffect, useState } from "react";
import { abregerValeur, indicateurPourCle, lireValeur, syntheseCouche, type CleIndicateur, formatNombre, controlerCoherence, estUniteDeCompte, grouperIndicateurs, LIBELLES_MILIEU, LIBELLES_SEXE, partDansEnsemble, tableauCroise, tableauVentilation, type FamilleIndicateurs } from "@parcours/geodata-model";
import { api, type CoucheRecue, type DouarRecu, type FicheRecue, type LigneTable, type ProximiteCouche } from "../client";
import { formaterValeur } from "./consultation";

type IndicateurFiche = FicheRecue["indicateurs"][number];

const IMPRIMER = "M6 9V3h12v6M6 18H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M6 14h12v7H6z";
/** Signes des cellules absentes des tableaux (ceux du HCP) ; le motif complet est dans l'infobulle, jamais zéro. */
const SIGNES_ABSENCE: Record<string, string> = { "sans-objet": "…", "non-publiee": "." };
const TYPES_DOUAR: Record<string, string> = { "groupé": "Douar groupé", "éclaté": "Douar éclaté", "dispersé": "Douar dispersé" };

/** Feuille de style de la fenêtre d'impression (la page de Fadi n'est jamais modifiée). */
const STYLE_IMPRESSION = `
  body{font:12px/1.4 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#000;margin:12mm}
  h3{font-size:16px;margin:4px 0} h4{font-size:13px;margin:12px 0 4px} summary{font-weight:600;font-size:13px;margin:10px 0 4px;list-style:none}
  .gd-discret{color:#444;font-size:11px} .gd-ecran-seulement,button{display:none!important} .gd-imprime-seulement{display:block}
  dl{margin:0} dl>div{display:grid;grid-template-columns:40% 1fr;gap:6px;padding:2px 0;border-bottom:1px solid #ddd} dt{font-weight:600} dd{margin:0}
  dl>div.gd-ventilation-bloc{display:block}
  table{border-collapse:collapse;width:100%;margin:2px 0 8px} caption{text-align:left;font-weight:600;padding:2px 0}
  th,td{border-bottom:1px solid #ddd;padding:2px 5px;text-align:right} th[scope="row"],thead th:first-child{text-align:left}
  tr{page-break-inside:avoid} [dir="rtl"]{text-align:right;font-family:"Noto Naskh Arabic","Geeza Pro",Arial,sans-serif}
  abbr{text-decoration:none}
  table.gd-croise{table-layout:auto} .gd-croise tr.gd-ligne-total th,.gd-croise tr.gd-ligne-total td{font-weight:700;border-top:2px solid #555}
  .gd-croise th[scope="row"]{padding-left:8px} .gd-pastille-cat{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
  .gd-part{display:block;height:3px;border-radius:2px;margin-top:2px;margin-left:auto} .gd-alerte{color:#9a3412}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;

/**
 * Imprime la fiche seule : copie de la fiche, toutes sections dépliées, dans une fenêtre d'impression (aucune iframe,
 * ARC-10 ; aucune règle de style hors de `.geodata-page`), avec son titre, sa source et sa date ; la fenêtre se ferme
 * après l'impression. Renvoie false si le navigateur a bloqué la fenêtre.
 */
export function imprimerFiche(): boolean {
  const fiche = document.querySelector<HTMLElement>(".gd-fiche");
  if (!fiche) return false;
  const copie = fiche.cloneNode(true) as HTMLElement;
  copie.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
  const actif = document.activeElement as HTMLElement | null;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) return false;
  const titre = (fiche.querySelector("h3")?.textContent ?? "Fiche").replace(/[<>&"]/g, "");
  w.document.open();
  w.document.write(`<!doctype html><html lang="${document.documentElement.lang || "fr"}"><head><meta charset="utf-8"><title>${titre}</title><style>${STYLE_IMPRESSION}${jetonsCategories(fiche)}</style></head><body></body></html>`);
  w.document.close();
  w.document.body.appendChild(w.document.importNode(copie, true));
  w.focus();
  w.print();
  w.close();
  actif?.focus();
  return true;
}

/**
 * Couleurs des catégories pour la fenêtre d'impression : relues dans la palette partagée (`--gd-cat-*` de geodata.css),
 * jamais recopiées ; la fiche imprimée garde les mêmes couleurs que l'écran et les graphiques.
 */
function jetonsCategories(el: HTMLElement): string {
  const css = getComputedStyle(el);
  const jetons = CATEGORIES.map((c) => `--gd-cat-${c}:${css.getPropertyValue(`--gd-cat-${c}`).trim()};`).join("");
  return `:root{${jetons.replace(/[<>]/g, "")}}`;
}
const CATEGORIES = ["urbain", "rural", "ensemble", "masculin", "feminin"] as const;
/** Couleur d'une catégorie Milieu / Sexe : jeton de la palette partagée (geodata.css), commun aux graphiques. */
export const couleurCategorie = (c: string) => `var(--gd-cat-${c})`;

/**
 * Tableau croisé Milieu × Sexe (D-GD-39) : lignes Urbain, Rural, Ensemble (en gras, séparée), colonnes Ensemble,
 * Masculin, Féminin ; structure lue dans les déclinaisons de l'indicateur. Couleurs des catégories = celles des légendes
 * des graphiques (liseré des lignes, pastille des colonnes), cellules neutres ; barre proportionnelle discrète sous les
 * valeurs Urbain et Rural (part dans l'Ensemble, indicateurs de compte). Écarts de cohérence signalés, jamais corrigés.
 */
function TableauCroiseFiche({ f, t, titre }: { f: FamilleIndicateurs<IndicateurFiche>; t: NonNullable<ReturnType<typeof tableauCroise<IndicateurFiche>>>; titre: string }) {
  const compte = estUniteDeCompte(f.indicateurs[0]!.unite);
  const ecarts = compte ? controlerCoherence(t) : [];
  const nombre = (x: number) => formaterValeur({ valeur: x, motifAbsence: null });
  return (
    <div className="gd-ventilation-bloc gd-croise-bloc">
      <table className="gd-ventilation gd-croise" data-gd-ventilation={f.famille} data-gd-croise={`${t.lignes.join(",")}|${t.colonnes.join(",")}`}>
        <caption translate="no">{titre}</caption>
        <thead><tr>
          <th scope="col"><span className="sr-only">Milieu</span></th>
          {t.colonnes.map((s) => <th key={s} scope="col" data-gd-categorie={s}><span className="gd-pastille-cat" style={{ background: couleurCategorie(s) }} aria-hidden="true" />{LIBELLES_SEXE[s]}</th>)}
        </tr></thead>
        <tbody>
          {t.lignes.map((m, i) => (
            <tr key={m} className={m === "ensemble" ? "gd-ligne-total" : undefined} data-gd-ligne={m}>
              <th scope="row" data-gd-categorie={m} style={{ borderLeft: `4px solid ${couleurCategorie(m)}` }}>{LIBELLES_MILIEU[m]}</th>
              {t.cellules[i]!.map((c, k) => {
                const part = compte && m !== "ensemble" ? partDansEnsemble(t, i, k) : null;
                return (
                  <td key={k} data-gd-valeur={c?.id} data-absente={c && c.valeur === null ? "" : undefined}>
                    {!c ? "—" : c.valeur === null ? <abbr title={formaterValeur(c)}>{SIGNES_ABSENCE[c.motifAbsence ?? ""] ?? "n.d."}</abbr> : formaterValeur(c)}
                    {part !== null && <span className="gd-part" style={{ width: `${(part * 100).toFixed(1)}%`, background: couleurCategorie(m) }} title={`${(part * 100).toFixed(1).replace(".", ",")} % de l'ensemble`} aria-hidden="true" data-gd-part={part.toFixed(4)} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {ecarts.map((e, n) => (
        <p key={n} className="gd-alerte" role="note" data-gd-ecart={`${e.controle}:${e.ou}`}>
          {e.controle === "milieu"
            ? `Écart : Urbain + Rural = ${nombre(e.somme)} ≠ Ensemble ${nombre(e.total)} (colonne ${LIBELLES_SEXE[e.ou as keyof typeof LIBELLES_SEXE]})`
            : `Écart : Masculin + Féminin = ${nombre(e.somme)} ≠ Ensemble ${nombre(e.total)} (ligne ${LIBELLES_MILIEU[e.ou as keyof typeof LIBELLES_MILIEU]})`}
        </p>
      ))}
    </div>
  );
}

export const AVIS_IMPRESSION_BLOQUEE = "La fenêtre d'impression a été bloquée par le navigateur : autorisez les fenêtres de GeoData pour imprimer la fiche.";

function Famille({ f }: { f: FamilleIndicateurs<IndicateurFiche> }) {
  const premier = f.indicateurs[0]!;
  const unite = f.famille.includes(`(${premier.unite})`) ? "" : ` (${premier.unite})`;
  if (f.indicateurs.length === 1) {
    const i = premier;
    return <div data-gd-valeur={i.id} data-absente={i.valeur === null ? "" : undefined}><dt translate="no">{`${i.titre}${i.periode ? ` (${i.periode})` : ""}`}</dt><dd>{formaterValeur(i, i.unite)}{i.nature === "calcule" && <span className="gd-discret"> · résultat calculé</span>}</dd></div>;
  }
  // Période de référence de la famille (ex. « CEE 2023/2024 » face au recensement) ; plusieurs périodes sont toutes citées.
  const periodesF = [...new Set(f.indicateurs.map((i) => i.periode).filter((x): x is string => !!x))].join(", ");
  // Indicateur ventilé Milieu × Sexe (sans modalité) : tableau croisé, structure lue dans ses déclinaisons (D-GD-39).
  const croise = tableauCroise(f.indicateurs);
  if (croise) return <TableauCroiseFiche f={f} t={croise} titre={`${f.famille}${unite}${periodesF ? ` — ${periodesF}` : ""}`} />;
  const brut = tableauVentilation(f);
  // Colonne entièrement « sans objet » pour cette entité (l'urbain d'une commune rurale…) : masquée.
  const garder = brut.colonnes.map((_, k) => brut.lignes.some((l) => { const i = l.cellules[k]; return !!i && !(i.valeur === null && i.motifAbsence === "sans-objet"); }));
  const t = { colonnes: brut.colonnes.filter((_, k) => garder[k]), lignes: brut.lignes.map((l) => ({ ...l, cellules: l.cellules.filter((_, k) => garder[k]) })) };
  const plusieursMilieux = new Set(t.colonnes.map((c) => c.milieu)).size > 1;
  // Période de référence de la famille (ex. « CEE 2023/2024 » face au recensement) ; plusieurs périodes sont toutes citées.
  const periodes = [...new Set(f.indicateurs.map((i) => i.periode).filter((x): x is string => !!x))].join(", ");
  return (
    <div className="gd-ventilation-bloc">
      <table className="gd-ventilation" data-gd-ventilation={f.famille}>
        <caption translate="no">{`${f.famille}${unite}${periodes ? ` — ${periodes}` : ""}`}</caption>
        <thead><tr>
          <th scope="col"><span className="sr-only">Modalité</span></th>
          {t.colonnes.map((c) => <th key={`${c.milieu}-${c.sexe}`} scope="col">{[plusieursMilieux || c.milieu !== "ensemble" ? LIBELLES_MILIEU[c.milieu] : null, c.sexe !== "ensemble" ? LIBELLES_SEXE[c.sexe] : null].filter(Boolean).join(" · ") || "Ensemble"}</th>)}
        </tr></thead>
        <tbody>
          {t.lignes.map((l) => (
            <tr key={l.modalite ?? ""}>
              <th scope="row" translate="no">{l.modalite ?? ""}</th>
              {l.cellules.map((i, k) => <td key={k} data-gd-valeur={i?.id} data-absente={i && i.valeur === null ? "" : undefined}>{!i ? "—" : i.valeur === null ? <abbr title={formaterValeur(i)}>{SIGNES_ABSENCE[i.motifAbsence ?? ""] ?? "n.d."}</abbr> : formaterValeur(i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Subdivisions d'une entité (enfants dans le découpage en base, D-GD-42) : leurs chiffres principaux, lus dans la couche de leur niveau. */
export interface Subdivisions { readonly couche: CoucheRecue; readonly niveau: string; readonly propriete: string; readonly codes: readonly string[] }
function SubdivisionsDe({ parent, s, onFiche }: { parent: string; s: Subdivisions; onFiche(coucheId: string, code: string): void }) {
  const { couche } = s;
  const [lignes, setLignes] = useState<LigneTable[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const codes = s.codes.join(",");
  useEffect(() => {
    let vivant = true;
    const enfants = new Set(codes.split(","));
    // La couche porte, pour chaque entité, le code de chacun de ses ancêtres (propriété nommée par le niveau, en base).
    api.table(couche.id, { page: 1, taille: 200, tri: "nom", ordre: "asc", propriete: s.propriete, operateur: "egal", valeur: parent })
      .then((r) => { if (vivant) setLignes(r.lignes.filter((l) => enfants.has(l.code))); })
      .catch((e: Error) => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [parent, couche.id, s.propriete, codes]);
  const pop = couche.indicateurs.find((i) => i.famille === "Population légale" && (i.milieu ?? "ensemble") === "ensemble" && (i.sexe ?? "ensemble") === "ensemble");
  const men = couche.indicateurs.find((i) => i.famille === "Ménages" && (i.milieu ?? "ensemble") === "ensemble" && !i.modalite);
  if (erreur) return <p role="alert" className="gd-alerte">{erreur}</p>;
  if (!lignes) return <p role="status" className="gd-discret">Chargement des subdivisions…</p>;
  if (!lignes.length) return null;
  return (
    <details className="gd-theme" open data-gd-subdivisions={lignes.length}>
      <summary><span translate="no">{s.niveau}</span>{` (${lignes.length})`}</summary>
      <table className="gd-ventilation">
        <thead><tr><th scope="col" translate="no">{s.niveau}</th>{pop && <th scope="col">{`Population légale (${pop.unite})`}</th>}{men && <th scope="col">{`Ménages (${men.unite})`}</th>}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.code} data-gd-subdivision={l.code}>
              <th scope="row" translate="no">{l.nom ?? l.code}</th>
              {pop && <td>{formaterValeur(l.valeurs[pop.id])}</td>}
              {men && <td>{formaterValeur(l.valeurs[men.id])}</td>}
              <td><button type="button" onClick={() => onFiche(couche.id, l.code)} aria-label={`Voir la fiche de ${l.nom ?? l.code}`}>Fiche</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const pourcent = (v: number | null, secret: boolean) => (v === null ? (secret ? "Secret statistique" : "—") : `${v.toFixed(1).replace(".", ",")} %`);

/**
 * Compléments des douars (D-GD-43), par tableau : colonne de l'annexe (nom technique de la base) et libellé du HCP. Ce
 * sont des libellés d'interface, pas des données : les valeurs viennent de la base, telles que publiées.
 */
type Unite = "pourcent" | "nombre" | "km";
const TABLEAUX_DOUARS: readonly { titre: string; unite: Unite; colonnes: readonly (readonly [string, string, Unite?])[] }[] = [
  { titre: "Nationalité, état civil et état matrimonial", unite: "pourcent", colonnes: [
    ["marocaine", "Marocaine"], ["etrangere", "Étrangère"], ["etat_civil", "Inscrits à l'état civil"], ["pop_15_plus", "Population de 15 ans et plus", "nombre"],
    ["celibataire", "Célibataire"], ["marie", "Marié"], ["divorce", "Divorcé"], ["veuf", "Veuf"],
  ] },
  { titre: "Type de logement des ménages", unite: "pourcent", colonnes: [
    ["log_villa", "Villa ou niveau de villa"], ["log_appartement", "Appartement"], ["log_traditionnelle", "Maison marocaine traditionnelle"],
    ["log_moderne", "Maison marocaine moderne"], ["log_sommaire", "Maison sommaire ou bidonville"], ["log_dur_rural", "Logement en dur rural"],
    ["log_pise_rural", "Logement en pisé rural"], ["log_autre", "Autres"],
  ] },
  { titre: "Distance moyenne des logements aux équipements", unite: "km", colonnes: [
    ["dist_route_goudronnee", "Route goudronnée"], ["dist_route_carrossable", "Route carrossable"], ["dist_ecole", "École primaire"],
    ["dist_college", "Collège"], ["dist_lycee", "Lycée"], ["dist_sante", "Centre de santé / hôpital"],
  ] },
];

const valeurDouar = (v: number | null | undefined, unite: Unite, secret: boolean) =>
  v === null || v === undefined ? (secret ? "Secret statistique" : "—")
    : unite === "pourcent" ? pourcent(v, secret)
    : unite === "km" ? `${v.toFixed(2).replace(".", ",")} km`
    : String(v);

/** Un tableau de compléments : une ligne par douar, une colonne par valeur du HCP (D-GD-43). */
function ComplementsDouars({ douars, tableau }: { douars: DouarRecu[]; tableau: (typeof TABLEAUX_DOUARS)[number] }) {
  return (
    <details className="gd-theme gd-douars-complements" data-gd-douars-complements={tableau.unite}>
      <summary>{tableau.titre}</summary>
      <div className="gd-defilement">
        <table className="gd-ventilation gd-douars">
          <thead><tr>
            <th scope="col">Douar</th>
            {tableau.colonnes.map(([cle, libelle]) => <th key={cle} scope="col">{libelle}</th>)}
          </tr></thead>
          <tbody>
            {douars.map((d) => (
              <tr key={d.code} data-gd-douar={d.code}>
                <th scope="row" lang="ar" dir="rtl" translate="no">{d.nom || d.code}</th>
                {tableau.colonnes.map(([cle, , unite]) => <td key={cle}>{valeurDouar(d.complements?.[cle], unite ?? tableau.unite, d.secret)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Douars d'une commune rurale (RGPH 2024) : noms publiés seulement en arabe, affichés tels quels (D-GD-21). */
function Douars({ douars }: { douars: DouarRecu[] }) {
  const parType = Object.entries(douars.reduce<Record<string, number>>((m, d) => { const k = d.type ?? "—"; m[k] = (m[k] ?? 0) + 1; return m; }, {}));
  return (
    <details className="gd-theme" data-gd-douars={douars.length}>
      <summary>{`Douars (${douars.length})`}</summary>
      <p className="gd-discret">{parType.map(([t, n]) => `${TYPES_DOUAR[t] ?? t} : ${n}`).join(" · ")}</p>
      <div className="gd-defilement">
        <table className="gd-ventilation gd-douars">
          <thead><tr>
            <th scope="col">Code</th><th scope="col">Fraction</th><th scope="col">Douar</th><th scope="col">Type</th><th scope="col">Ménages</th><th scope="col">Population</th>
            <th scope="col">Masculin</th><th scope="col">Féminin</th><th scope="col">Moins de 15 ans</th><th scope="col">15-59 ans</th><th scope="col">60 ans et plus</th>
          </tr></thead>
          <tbody>
            {douars.map((d) => (
              <tr key={d.code} data-gd-douar={d.code}>
                <td translate="no">{d.code}</td>
                <td lang="ar" dir="rtl" translate="no">{d.fraction || "—"}</td>
                <th scope="row" lang="ar" dir="rtl" translate="no">{d.nom || "—"}</th>
                <td>{d.type ? TYPES_DOUAR[d.type] : "—"}</td>
                <td>{d.menages ?? "—"}</td>
                <td>{d.population ?? "—"}</td>
                <td>{pourcent(d.pourcentages.masculin, d.secret)}</td>
                <td>{pourcent(d.pourcentages.feminin, d.secret)}</td>
                <td>{pourcent(d.pourcentages.moins15, d.secret)}</td>
                <td>{pourcent(d.pourcentages.de15a59, d.secret)}</td>
                <td>{pourcent(d.pourcentages.plus60, d.secret)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {douars.some((d) => d.complements) && TABLEAUX_DOUARS.map((t) => <ComplementsDouars key={t.titre} douars={douars} tableau={t} />)}
      <p className="gd-discret">Noms publiés en arabe seulement par le HCP, affichés tels quels. « Secret statistique » : donnée supprimée par le HCP (moins de 30 ménages ou faible taux de déclaration).</p>
    </details>
  );
}

/**
 * Synthèse d'une entité (D-GD-50) : pour l'indicateur actif, minimum, moyenne simple et maximum sur ses subdivisions
 * (découpage en base), sur une échelle verticale, avec la source et la période de la couche des subdivisions. Une valeur
 * absente n'est jamais comptée ; la valeur de l'entité elle-même est donnée à part (un total n'est pas comparable à ses
 * parties). Rien si la couche des subdivisions ne porte pas l'indicateur.
 */
function SyntheseEntite(p: { fiche: FicheRecue; s: Subdivisions; cle: CleIndicateur }) {
  const enfant = indicateurPourCle(p.s.couche.indicateurs, p.cle);
  const propre = indicateurPourCle(p.fiche.indicateurs, p.cle);
  const [valeurs, setValeurs] = useState<{ id: string; m?: Map<string, ReturnType<typeof lireValeur>>; erreur?: string } | null>(null);
  useEffect(() => {
    if (!enfant) return;
    let vivant = true;
    setValeurs({ id: enfant.id });
    api.valeurs(enfant.id).then((r) => vivant && setValeurs({ id: enfant.id, m: new Map(r.valeurs.map((v) => [v.code, lireValeur(v.valeur, v.motifAbsence)])) }))
      .catch((e: Error) => vivant && setValeurs({ id: enfant.id, erreur: e.message }));
    return () => { vivant = false; };
  }, [enfant?.id]);
  if (!enfant || !p.s.codes.length) return null;
  const s = valeurs?.m ? syntheseCouche({ codes: p.s.codes, total: p.s.codes.length, valeurs: valeurs.m }).indicateur : null;
  const val = (x: number | null) => (x === null ? <span>non évaluée</span> : <span translate="no">{abregerValeur(x, enfant.unite)}</span>);
  const pos = (x: number | null) => (s && x !== null && s.max !== null && s.min !== null && s.max > s.min ? ((x - s.min) / (s.max - s.min)) * 100 : 50);
  const v = p.s.couche.version;
  return (
    <section className="gd-synthese-entite" aria-label="Synthèse sur les subdivisions" data-gd-synthese-entite={p.fiche.code}>
      <h4><span>Ses</span> <span translate="no">{p.s.niveau}</span> <span>—</span> <span translate="no">{enfant.titre}</span></h4>
      {!valeurs?.m && !valeurs?.erreur && <p className="gd-discret" role="status">Calcul…</p>}
      {valeurs?.erreur && <p className="gd-alerte" role="status">{valeurs.erreur}</p>}
      {s && (
        <div className="gd-echelle">
          <div className="gd-echelle-barre" aria-hidden="true">
            {s.moyenne !== null && <span className="gd-echelle-moyenne" style={{ bottom: `${pos(s.moyenne)}%` }} />}
          </div>
          <dl>
            <dt>Max</dt><dd data-gd-entite-max>{val(s.max)}</dd>
            <dt>Moyenne</dt><dd data-gd-entite-moyenne>{val(s.moyenne)}</dd>
            <dt>Min</dt><dd data-gd-entite-min>{val(s.min)}</dd>
          </dl>
        </div>
      )}
      {s && <p className="gd-discret"><span>Subdivisions évaluées :</span> <span>{formatNombre(s.evaluees, 0)}</span> <span>· non évaluées :</span> <span data-gd-entite-non-evaluees>{formatNombre(s.nonEvaluees, 0)}</span> <span>· moyenne simple, non pondérée.</span></p>}
      {propre && <p className="gd-discret"><span>Valeur de l'entité :</span> <span translate="no">{propre.valeur === null ? "—" : abregerValeur(propre.valeur, propre.unite)}</span></p>}
      <p className="gd-discret"><span>Source :</span> <span translate="no">{`${v.source.producteur} — ${v.libelle}${enfant.periode ? ` (${enfant.periode})` : v.periode ? ` (${v.periode})` : ""}`}</span></p>
    </section>
  );
}

/** Propriétés par lesquelles une source déclare la confiance de chaque entité (D-GD-51) ; aucune n'est calculée ici. */
export const PROPRIETES_CONFIANCE = ["confiance", "indice_confiance", "fiabilite"] as const;

/**
 * Fiabilité déclarée (D-GD-51) : l'indice de confiance que la source déclare pour cette entité (une de ses propriétés
 * exposées), la précision, la période et la date de récupération déclarées pour la version. Rien n'est calculé ni
 * estimé : une information non déclarée est « Non évaluée ».
 */
function FiabiliteDeclaree({ fiche: f }: { fiche: FicheRecue }) {
  const v = f.couche.version;
  const cle = PROPRIETES_CONFIANCE.find((k) => Object.hasOwn(f.proprietes, k) && f.proprietes[k] !== null && f.proprietes[k] !== "");
  const recupere = v.recupereLe ? new Date(v.recupereLe).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" }) : null;
  return (
    <dl className="gd-fiche-version gd-fiabilite" data-gd-fiabilite={cle ? "declaree" : "non-evaluee"}>
      <dt>Indice de confiance de l'entité</dt>
      <dd>{cle ? <span translate="no">{String(f.proprietes[cle])}</span> : <span>Non évalué (non déclaré par la source)</span>}</dd>
      <dt>Précision déclarée</dt><dd>{v.precision ? <span translate="no">{v.precision}</span> : <span>Non évaluée</span>}</dd>
      <dt>Période</dt><dd>{v.periode ? <span translate="no">{v.periode}</span> : <span>Non évaluée</span>}</dd>
      <dt>Données récupérées le</dt><dd>{recupere ? <span translate="no">{recupere}</span> : <span>Non évaluée</span>}</dd>
    </dl>
  );
}

const RAYONS = [250, 500, 1000, 2000, 5000] as const;
const distance = (m: number) => (m < 1000 ? `${formatNombre(m, 0)} m` : `${formatNombre(m / 1000, 1)} km`);

/**
 * À proximité (D-GD-49) : pour l'objet de la fiche, nombre d'objets de chaque couche de points affichée à moins du rayon
 * choisi (distance géodésique, en base) et le plus proche. Rien sans couche de points sur la carte : la section le dit.
 */
function Proximite(p: { fiche: FicheRecue; couches: readonly { id: string; titre: string }[]; onFiche?(coucheId: string, code: string): void }) {
  const [rayon, setRayon] = useState<number>(500);
  const [etat, setEtat] = useState<{ cle: string; couches?: ProximiteCouche[]; erreur?: string } | null>(null);
  const ids = p.couches.map((c) => c.id);
  const cle = `${p.fiche.couche.id}|${p.fiche.code}|${rayon}|${ids.join(",")}`;
  useEffect(() => {
    if (!ids.length) return;
    let vivant = true;
    setEtat({ cle });
    api.proximite(p.fiche.couche.id, p.fiche.code, rayon, ids)
      .then((r) => vivant && setEtat({ cle, couches: r.couches }))
      .catch((e: Error) => vivant && setEtat({ cle, erreur: e.message }));
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return (
    <section className="gd-proximite gd-ecran-seulement" aria-label="À proximité" data-gd-proximite>
      <h4>À proximité</h4>
      {!ids.length
        ? <p className="gd-discret" data-gd-proximite-vide>Affichez sur la carte une couche de points (équipements, services) pour compter ce qui se trouve à proximité.</p>
        : <>
          <label className="gd-champ">Rayon<select value={rayon} onChange={(e) => setRayon(Number(e.target.value))} data-gd-proximite-rayon>{RAYONS.map((r) => <option key={r} value={r}>{distance(r)}</option>)}</select></label>
          {etat?.cle === cle && !etat.couches && !etat.erreur && <p className="gd-discret" role="status">Calcul…</p>}
          {etat?.erreur && <p className="gd-alerte" role="status">{etat.erreur}</p>}
          {etat?.cle === cle && etat.couches && (
            <ul className="gd-liste">
              {etat.couches.map((c) => (
                <li key={c.coucheId} data-gd-proximite-couche={c.coucheId} data-gd-proximite-nombre={c.accessible ? c.nombre : ""}>
                  {!c.accessible ? <span className="gd-discret">Couche inaccessible</span> : <>
                    <strong translate="no">{c.titre}</strong>
                    <span> : </span><span>{formatNombre(c.nombre, 0)}</span> <span>à moins de</span> <span>{distance(rayon)}</span>
                    {c.plusProche && <span className="gd-discret">
                      <span> · le plus proche :</span>{" "}
                      {p.onFiche ? <button type="button" className="gd-lien" onClick={() => p.onFiche?.(c.coucheId, c.plusProche!.code)} translate="no">{c.plusProche.nom}</button> : <span translate="no">{c.plusProche.nom}</span>}
                      {" "}<span>{`(${distance(c.plusProche.distanceM)})`}</span>
                    </span>}
                  </>}
                </li>
              ))}
            </ul>
          )}
          <p className="gd-discret">Distance géodésique en base, sur les versions publiées ; une surface compte ce qui se trouve dedans ou à moins du rayon de son bord.</p>
        </>}
    </section>
  );
}

export function FicheObjet(p: {
  fiche: FicheRecue | null; chargement: boolean; erreur: string | null; onFermer(): void; onCentrer(f: FicheRecue): void;
  descendre?: { libelle: string; onDescendre(): void } | null;
  /** Subdivisions de l'entité (enfants dans le découpage en base) et couche de leur niveau. */
  subdivisions?: Subdivisions | null;
  onFiche?(coucheId: string, code: string): void;
  /** Indicateur actif du catalogue (D-GD-31) : synthèse sur les subdivisions de l'entité (D-GD-50). */
  indicateurActif?: CleIndicateur | null;
  /** Couches de points affichées sur la carte, pour la section « À proximité » (D-GD-49). */
  proximite?: readonly { id: string; titre: string }[];
}) {
  if (p.chargement) return <p role="status" className="gd-etat">Chargement de la fiche…</p>;
  if (p.erreur) return <p role="alert" className="gd-etat">{p.erreur}</p>;
  if (!p.fiche) return <p className="gd-etat">Sélectionnez un objet sur la carte, dans la table ou par la recherche.</p>;
  const f = p.fiche;
  const familles = grouperIndicateurs(f.indicateurs);
  const themes = [...new Set(familles.map((x) => x.theme))];
  return (
    <article className="gd-fiche" data-gd-fiche={f.code}>
      <p className="gd-imprime-seulement">Fiche territoriale — GeoData (Fadi)</p>
      <h3 translate="no">{f.nom ?? f.code}</h3>
      <p className="gd-discret" translate="no">{`${f.couche.titre} · ${f.code}${f.niveau ? ` · ${f.niveau}` : ""}`}</p>
      <div className="gd-actions gd-ecran-seulement">
        {p.descendre && (
          <button type="button" className="gd-descendre" onClick={p.descendre.onDescendre} title={`${p.descendre.libelle} (Alt+↓)`} aria-keyshortcuts="Alt+ArrowDown" data-gd-descendre>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            <span>{p.descendre.libelle}</span>
          </button>
        )}
        <button type="button" onClick={() => { if (!imprimerFiche()) window.alert(AVIS_IMPRESSION_BLOQUEE); }} title="Imprimer la fiche (Alt+P)" aria-keyshortcuts="Alt+P" data-gd-imprimer>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={IMPRIMER} /></svg>
          <span>Imprimer la fiche</span>
        </button>
      </div>
      {f.geometrieReparee && <p className="gd-alerte">Géométrie réparée à l'import (consignée dans la fiche de la version).</p>}
      <h4>Indicateurs</h4>
      {f.indicateurs.length === 0 && <p className="gd-discret">Aucun indicateur pour cette couche.</p>}
      {familles.some((x) => x.indicateurs.length > 1) && <p className="gd-discret">Tableaux : « … » sans objet, « . » non publiée, « n.d. » autre valeur absente (motif au survol) ; une colonne sans objet pour cette entité est masquée.</p>}
      {themes.length <= 1
        ? <dl className="gd-valeurs">{familles.map((x) => <Famille key={`${x.theme}|${x.famille}`} f={x} />)}</dl>
        : themes.map((t, n) => (
          <details key={t} className="gd-theme" open={n === 0} data-gd-theme={t}>
            <summary translate="no">{t}</summary>
            <dl className="gd-valeurs">{familles.filter((x) => x.theme === t).map((x) => <Famille key={`${x.theme}|${x.famille}`} f={x} />)}</dl>
          </details>
        ))}
      {p.subdivisions && p.indicateurActif && <SyntheseEntite fiche={f} s={p.subdivisions} cle={p.indicateurActif} />}
      {p.subdivisions && p.onFiche && <SubdivisionsDe parent={f.code} s={p.subdivisions} onFiche={p.onFiche} />}
      {p.proximite && <Proximite fiche={f} couches={p.proximite} onFiche={p.onFiche} />}
      {f.douars && f.douars.length > 0 && <Douars douars={f.douars} />}
      <h4>Attributs</h4>
      <dl className="gd-valeurs">{Object.entries(f.proprietes).map(([k, v]) => <div key={k}><dt translate="no">{k}</dt><dd translate="no">{v === null || v === "" ? "—" : String(v)}</dd></div>)}</dl>
      <h4>Source</h4>
      <p translate="no">{`${f.couche.version.source.titre} — ${f.couche.version.libelle}`}</p>
      <FiabiliteDeclaree fiche={f} />
      <p className="gd-discret" translate="no">{f.couche.version.attribution}</p>
      <p className="gd-imprime-seulement">{`Imprimée le ${new Date().toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}`}</p>
      <div className="gd-actions gd-ecran-seulement"><button type="button" onClick={() => p.onCentrer(f)}>Centrer la carte</button><button type="button" onClick={p.onFermer}>Fermer la fiche</button></div>
    </article>
  );
}
