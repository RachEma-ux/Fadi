/**
 * Panneau « Contrôle et nettoyage » (extension, 25 novembre 2026) : le relevé de la Planche — objets vides, matières et
 * balises inutilisées, arêtes isolées, solides ouverts — et le nettoyage de ce qui est coché. Le relevé ne modifie
 * rien ; le nettoyage est une seule opération (un seul Annuler). Barre du panneau : Nettoyer.
 *
 * Cas 2 du catalogue, lot 3 (maquettes lot3-1 à lot3-4 validées le 27 novembre 2026) : relevé des défauts de dessin avec
 * leurs tolérances, parcours un à un et correction en un geste ; vues « Préparer un fond DAO » (et faces intérieures) et
 * « Pièces du permis » (fichier de règles sourcé, site avant émission). Rien n'est corrigé sans clic.
 */
import { useState } from "react";
import {
  type BilanFondDao,
  type BilanPiece,
  type Defaut,
  type EtatCritere,
  type LigneSite,
  type OptionsFondDao,
  type ReglagesControle,
  type ReglesPieces,
  type RubriqueControle,
  POINTS_NETTOYAGE,
  RUBRIQUES_CONTROLE,
  type ChoixNettoyage,
  type RapportControle,
  rienANettoyer,
} from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_CONTROLE, type Disponibilite, type IdCommandeControle } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";
import { lireNombre } from "./panneau-accrochage";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
export type VueControle = "releve" | "fond-dao" | "pieces";

/** Tolérance de chaque rubrique : clé des réglages, unité d'affichage et facteur vers l'unité stockée. */
const SEUILS: Partial<Record<RubriqueControle, { cle: keyof ReglagesControle; unite: "mm" | "°" | "m"; facteur: number }>> = {
  superposition: { cle: "superposition", unite: "mm", facteur: 0.001 },
  confondus: { cle: "confondus", unite: "mm", facteur: 0.001 },
  angleDroit: { cle: "angleDroit", unite: "°", facteur: 1 },
  planeite: { cle: "planeite", unite: "°", facteur: 1 },
  eloignee: { cle: "eloignement", unite: "m", facteur: 1 },
};
const nombre = (v: number, sep: "." | ",") => String(Number(v.toFixed(6))).replace(".", sep);

function Bouton({ c, d, executer, principal }: { c: (typeof COMMANDES_CONTROLE)[number]; d: Disponibilite; executer: (id: IdCommandeControle) => void; principal?: boolean }) {
  return (
    <button type="button" className={principal ? "planche-controle-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
      <Pictogramme picto={c.picto} /> {t(c.court)}
    </button>
  );
}
const commande = (id: IdCommandeControle) => COMMANDES_CONTROLE.find((c) => c.id === id)!;

/** Champ de tolérance : saisi dans l'unité affichée, validé à la sortie ou par Entrée. */
function ChampSeuil({ rubrique, reglages, sep, lecture, onReglages }: { rubrique: RubriqueControle; reglages: ReglagesControle; sep: "." | ","; lecture: boolean; onReglages: (r: Partial<ReglagesControle>) => void }) {
  const s = SEUILS[rubrique];
  const [brouillon, setBrouillon] = useState<string | null>(null);
  if (!s) return null;
  const valeur = nombre(reglages[s.cle] / s.facteur, sep);
  const valider = () => {
    if (brouillon === null) return;
    const n = lireNombre(brouillon);
    setBrouillon(null);
    if (n !== null && n > 0) onReglages({ [s.cle]: n * s.facteur });
  };
  return (
    <span className="planche-controle-seuil">
      <input
        value={brouillon ?? valeur}
        disabled={lecture}
        inputMode="decimal"
        aria-label={t(`planche.controle.seuil.${rubrique}` as "planche.controle.seuil.superposition")}
        onKeyDown={(e) => {
          arreter(e);
          if (e.key === "Enter") valider();
        }}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        data-planche-controle-seuil={rubrique}
      />
      {s.unite}
    </span>
  );
}

const classeEtat = (e: EtatCritere) => (e === "present" ? "planche-accrochage-actif" : e === "absent" ? "planche-info-cote-alerte" : "planche-controle-lim");

export interface ProprietesPanneauControle {
  rapport: RapportControle;
  choix: ChoixNettoyage;
  onChoix: (c: ChoixNettoyage) => void;
  executer: (id: IdCommandeControle) => void;
  disponibilite: (id: IdCommandeControle) => Disponibilite;
  /** Sélectionne les objets de la racine qui ne sont pas des solides fermés ; absent hors de la racine. */
  onSelectionnerOuverts: (() => void) | null;
  lecture: boolean;
  note: string | null;
  // Cas 2, lot 3
  vue?: VueControle;
  separateur?: "." | ",";
  defauts?: readonly Defaut[];
  compte?: Readonly<Record<RubriqueControle, number>>;
  reglages?: ReglagesControle;
  onReglages?: (r: Partial<ReglagesControle>) => void;
  indice?: number;
  /** Libellé de l'objet qui porte un défaut (nom ou « Groupe »). */
  nomObjet?: (id: string) => string;
  onIgnorer?: () => void;
  onSelectionnerDefaut?: () => void;
  optionsFondDao?: OptionsFondDao;
  onOptionsFondDao?: (o: OptionsFondDao) => void;
  apercuFondDao?: BilanFondDao | null;
  volumes?: { readonly selectionnes: number; readonly interieures: number; readonly cloisons: number } | null;
  regles?: ReglesPieces | null;
  pieces?: readonly BilanPiece[] | null;
  site?: readonly { readonly ligne: LigneSite; readonly etat: EtatCritere }[];
  onChargerRegles?: (f: File) => void;
  onRetirerRegles?: () => void;
  onOuvrirEmplacement?: () => void;
  onLocaliserManque?: () => void;
}

export function PanneauControle(p: ProprietesPanneauControle) {
  const { rapport, choix, onChoix, executer, disponibilite, onSelectionnerOuverts, lecture, note } = p;
  const vue = p.vue ?? "releve";
  const sep = p.separateur ?? ",";
  if (vue === "fond-dao") return <VueFondDao {...p} sep={sep} />;
  if (vue === "pieces") return <VuePieces {...p} />;
  const propre = rienANettoyer(rapport, { objetsVides: true, materiauxInutilises: true, balisesInutilisees: true, aretesIsolees: true });
  const defauts = p.defauts ?? [];
  const indice = p.indice ?? -1;
  const courant = indice >= 0 ? defauts[indice] : undefined;
  const inutilises = rapport.objetsVides + rapport.materiauxInutilises + rapport.balisesInutilisees;
  return (
    <div className="planche-controle" data-planche-controle>
      {p.compte && p.reglages && p.onReglages && (
        <>
          <h4>{t("planche.controle.releve")}</h4>
          <dl className="planche-controle-releve">
            {RUBRIQUES_CONTROLE.map((r) => (
              <div key={r} className="planche-accrochage-ligne" data-planche-controle-rubrique={r}>
                <dt>
                  {t(`planche.controle.rubrique.${r}` as "planche.controle.rubrique.superposition")}{" "}
                  <ChampSeuil rubrique={r} reglages={p.reglages!} sep={sep} lecture={lecture} onReglages={p.onReglages!} />
                </dt>
                <dd className={p.compte![r] === 0 ? "planche-accrochage-actif" : r === "superposition" || r === "confondus" ? "planche-info-cote-alerte" : "planche-controle-lim"} data-planche-controle-compte={r}>
                  {p.compte![r]}
                </dd>
              </div>
            ))}
            <div className="planche-accrochage-ligne">
              <dt>{t("planche.controle.rubrique.inutilises")}</dt>
              <dd className={inutilises === 0 ? "planche-accrochage-actif" : "planche-controle-lim"} data-planche-controle-compte="inutilises">{inutilises}</dd>
            </div>
          </dl>
          <p className="inspecteur-aide">{t("planche.controle.seuils.aide")}</p>
          <h4>{t("planche.controle.parcourir")}</h4>
          <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.controle.parcourir")}>
            <Bouton c={commande("defaut-precedent")} d={disponibilite("defaut-precedent")} executer={executer} />
            <span className="planche-controle-position" data-planche-controle-position>
              {defauts.length === 0 ? t("planche.controle.aucun-defaut") : t("planche.controle.position", { n: String(indice + 1), total: String(defauts.length) })}
            </span>
            <Bouton c={commande("defaut-suivant")} d={disponibilite("defaut-suivant")} executer={executer} />
          </div>
          {courant && (
            <>
              <dl>
                <div className="planche-accrochage-ligne">
                  <dt>{t("planche.controle.defaut", { n: String(indice + 1) })}</dt>
                  <dd data-planche-controle-defaut={courant.genre}>
                    {t(`planche.controle.genre.${courant.genre}` as "planche.controle.genre.confondus", { valeur: valeurDefaut(courant, sep) })}
                    {courant.objet !== undefined && p.nomObjet ? ` · ${p.nomObjet(courant.objet)}` : ""}
                  </dd>
                </div>
              </dl>
              <div className="planche-debit-barre">
                <Bouton c={commande("corriger-defaut")} d={disponibilite("corriger-defaut")} executer={executer} principal />
                {p.onSelectionnerDefaut && (
                  <button type="button" onClick={p.onSelectionnerDefaut} data-planche-controle-selectionner-defaut>
                    {t("planche.controle.selectionner")}
                  </button>
                )}
                {p.onIgnorer && (
                  <button type="button" onClick={p.onIgnorer} data-planche-controle-ignorer>
                    {t("planche.controle.ignorer")}
                  </button>
                )}
              </div>
              <p className="inspecteur-aide">{t("planche.controle.correction.aide")}</p>
            </>
          )}
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.controle.barre")}>
        {COMMANDES_CONTROLE.filter((c) => c.id === "nettoyer" || c.id === "preparer-fond-dao" || c.id === "fusionner-volumes" || c.id === "pieces-permis").map((c) => (
          <Bouton key={c.id} c={c} d={disponibilite(c.id)} executer={executer} />
        ))}
      </div>
      <p className="inspecteur-aide">{t("planche.controle.aide")}</p>
      <h4>{t("planche.controle.a-nettoyer")}</h4>
      <ul className="planche-controle-points">
        {POINTS_NETTOYAGE.map((pt) => (
          <li key={pt} className="planche-controle-point" data-planche-controle-point={pt}>
            <label>
              <input type="checkbox" checked={choix[pt]} disabled={lecture} onKeyDown={arreter} onChange={(e) => onChoix({ ...choix, [pt]: e.target.checked })} data-planche-controle-choix={pt} />
              <span>{t(`planche.controle.point.${pt}`)}</span>
              <span className="planche-controle-nombre" data-zero={rapport[pt] === 0} data-planche-controle-nombre={pt}>{rapport[pt]}</span>
            </label>
            {pt === "aretesIsolees" && <small>{t("planche.controle.point.aretesIsolees.aide")}</small>}
          </li>
        ))}
      </ul>
      {propre && <p className="inspecteur-aide" data-planche-controle-propre>{t("planche.controle.propre")}</p>}
      <h4>{t("planche.controle.solides")}</h4>
      <p className="inspecteur-aide" data-planche-controle-solides={rapport.objetsNonSolides}>
        {rapport.objets === 0
          ? t("planche.controle.solides.aucun")
          : rapport.objetsNonSolides === 0
            ? t("planche.controle.solides.tous", { objets: String(rapport.objets) })
            : t("planche.controle.solides.ouverts", { ouverts: String(rapport.objetsNonSolides), objets: String(rapport.objets) })}
      </p>
      {rapport.objetsNonSolides > 0 && onSelectionnerOuverts && (
        <div className="planche-debit-barre">
          <button type="button" onClick={onSelectionnerOuverts} data-planche-controle-selectionner>{t("planche.controle.solides.selectionner")}</button>
        </div>
      )}
      {note && <p className="inspecteur-aide" role="status" data-planche-controle-note>{note}</p>}
    </div>
  );
}

/** Mesure d'un défaut, dans l'unité de son genre. */
export function valeurDefaut(d: Defaut, sep: "." | ","): string {
  if (d.genre === "confondus" || d.genre === "face-double" || d.genre === "objet-double") return `${nombre(Math.round(d.valeur * 10000) / 10, sep)} mm`;
  if (d.genre === "angle-droit" || d.genre === "presque-horizontale" || d.genre === "presque-verticale") return `${nombre(Math.round(d.valeur * 100) / 100, sep)}°`;
  if (d.genre === "eloignee") return `${nombre(Math.round(d.valeur), sep)} m`;
  return String(d.valeur);
}

function VueFondDao(p: ProprietesPanneauControle & { sep: "." | "," }) {
  const o = p.optionsFondDao ?? { aplatir: true, souder: 0.005, faces: true };
  const [tolerance, setTolerance] = useState<string | null>(null);
  const changer = (x: Partial<OptionsFondDao>) => p.onOptionsFondDao?.({ ...o, ...x });
  const a = p.apercuFondDao;
  const v = p.volumes;
  const ligne = (cle: string, valeur: string | number, attr: string) => (
    <div className="planche-accrochage-ligne">
      <dt>{t(cle as "planche.fond-dao.aplatir.nombre")}</dt>
      <dd {...{ [attr]: "" }}>{valeur}</dd>
    </div>
  );
  return (
    <div className="planche-controle" data-planche-controle-vue="fond-dao">
      <h4>{t("planche.fond-dao.titre")}</h4>
      {a ? (
        <dl>
          {ligne("planche.fond-dao.aplatir.nombre", a.aplatis, "data-planche-fond-dao-aplatis")}
          {ligne("planche.fond-dao.souder.nombre", t("planche.fond-dao.paires", { n: String(a.soudures) }), "data-planche-fond-dao-soudures")}
        </dl>
      ) : (
        <p className="inspecteur-aide" data-planche-fond-dao-sans-import>{t("planche.controle.motif.import")}</p>
      )}
      <label className="planche-controle-champ">
        {t("planche.fond-dao.tolerance")}
        <input
          value={tolerance ?? (o.souder === null ? "" : `${nombre(o.souder * 1000, p.sep)} mm`)}
          disabled={p.lecture}
          onKeyDown={arreter}
          onChange={(e) => setTolerance(e.target.value)}
          onBlur={() => {
            if (tolerance === null) return;
            const n = lireNombre(tolerance.replace(/\s*mm$/, ""));
            setTolerance(null);
            if (n !== null && n > 0) changer({ souder: n / 1000 });
          }}
          data-planche-fond-dao-tolerance
        />
      </label>
      {a && <dl>{ligne("planche.fond-dao.faces.nombre", a.faces, "data-planche-fond-dao-faces")}</dl>}
      <div className="planche-debit-barre">
        {(["aplatir", "souder", "faces"] as const).map((k) => (
          <label key={k} className="planche-controle-case">
            <input
              type="checkbox"
              checked={k === "souder" ? o.souder !== null : o[k]}
              disabled={p.lecture}
              onKeyDown={arreter}
              onChange={(e) => changer(k === "souder" ? { souder: e.target.checked ? 0.005 : null } : { [k]: e.target.checked })}
              data-planche-fond-dao-option={k}
            />
            {t(`planche.fond-dao.option.${k}`)}
          </label>
        ))}
      </div>
      <div className="planche-debit-barre">
        <Bouton c={commande("preparer-fond-dao")} d={p.disponibilite("preparer-fond-dao")} executer={p.executer} principal />
      </div>
      <p className="inspecteur-aide">{t("planche.fond-dao.aide")}</p>
      <h4>{t("planche.volumes.titre")}</h4>
      <dl>
        <div className="planche-accrochage-ligne">
          <dt>{t("planche.volumes.selectionnes")}</dt>
          <dd data-planche-volumes-selectionnes>{v?.selectionnes ?? 0}</dd>
        </div>
        <div className="planche-accrochage-ligne">
          <dt>{t("planche.volumes.interieures")}</dt>
          <dd data-planche-volumes-interieures>{v ? v.interieures : "—"}</dd>
        </div>
        <div className="planche-accrochage-ligne">
          <dt>{t("planche.volumes.cloisons")}</dt>
          <dd>{v ? v.cloisons : "—"}</dd>
        </div>
      </dl>
      <div className="planche-debit-barre">
        <Bouton c={commande("fusionner-volumes")} d={p.disponibilite("fusionner-volumes")} executer={p.executer} principal />
      </div>
      <p className="inspecteur-aide">{t("planche.volumes.aide")}</p>
      {p.note && <p className="inspecteur-aide" role="status" data-planche-controle-note>{p.note}</p>}
    </div>
  );
}

function VuePieces(p: ProprietesPanneauControle) {
  const [fichier, setFichier] = useState(0);
  return (
    <div className="planche-controle" data-planche-controle-vue="pieces">
      <h4>{t("planche.pieces.fichier")}</h4>
      <dl>
        <div className="planche-accrochage-ligne">
          <dt>{t("planche.pieces.source")}</dt>
          <dd className={p.regles ? "planche-accrochage-actif" : "planche-controle-lim"} data-planche-pieces-source>{p.regles ? p.regles.source : t("planche.pieces.aucun")}</dd>
        </div>
      </dl>
      <div className="planche-debit-barre">
        <label className="planche-controle-fichier">
          {t("planche.pieces.charger")}
          <input
            key={fichier}
            type="file"
            accept=".json,application/json"
            disabled={p.lecture}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onChargerRegles?.(f);
              setFichier((n) => n + 1);
            }}
            data-planche-pieces-charger
          />
        </label>
        {p.regles && p.onRetirerRegles && (
          <button type="button" disabled={p.lecture} onClick={p.onRetirerRegles} data-planche-pieces-retirer>
            {t("planche.pieces.retirer")}
          </button>
        )}
      </div>
      <p className="inspecteur-aide">{t("planche.pieces.aide")}</p>
      {p.pieces ? (
        <dl data-planche-pieces>
          {p.pieces.map((x) => (
            <div key={x.code} className="planche-accrochage-ligne" title={x.attendus.map((a) => `${a.libelle} : ${t(`planche.pieces.etat.${a.etat}`)}`).join("\n")}>
              <dt>{`${x.code} · ${x.libelle}`}</dt>
              <dd className={x.presents === x.evaluables ? "planche-accrochage-actif" : "planche-info-cote-alerte"} data-planche-piece={x.code}>
                {x.evaluables === 0 ? t("planche.pieces.etat.non-evaluable") : `${x.presents} / ${x.evaluables}`}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="inspecteur-aide" data-planche-pieces-non-evaluee>{t("planche.pieces.non-evaluee")}</p>
      )}
      <h4>{t("planche.pieces.site")}</h4>
      <dl>
        {(p.site ?? []).map((l) => (
          <div key={l.ligne} className="planche-accrochage-ligne">
            <dt>{t(`planche.pieces.site.${l.ligne}`)}</dt>
            <dd className={classeEtat(l.etat)} data-planche-site={l.ligne}>{t(`planche.pieces.site-etat.${l.ligne}.${l.etat}` as "planche.pieces.site-etat.nord.present")}</dd>
          </div>
        ))}
      </dl>
      <div className="planche-debit-barre">
        {p.onLocaliserManque && (
          <button type="button" className="planche-controle-principal" onClick={p.onLocaliserManque} data-planche-pieces-localiser>
            {t("planche.pieces.localiser")}
          </button>
        )}
        {p.onOuvrirEmplacement && (
          <button type="button" onClick={p.onOuvrirEmplacement} data-planche-pieces-emplacement>
            {t("planche.pieces.emplacement")}
          </button>
        )}
      </div>
      {p.note && <p className="inspecteur-aide" role="status" data-planche-controle-note>{p.note}</p>}
    </div>
  );
}
