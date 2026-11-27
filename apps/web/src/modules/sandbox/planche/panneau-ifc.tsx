/**
 * Panneaux de l'étape 6 du lot C4 (cas 4 du catalogue des extensions : D10-S-001, D10-F14-012, N-D10-1, D10-R-002,
 * D10-R-006, N-D10-2, D10-F14-124 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-6-ifc.png`) :
 * - « IFC structuré » : schéma, classes écrites, géoréférencement, .ifc ou .ifczip, contrôle avant émission, export relu ;
 * - « Import IFC structuré » : fichier lu, étages en niveaux, trame en repères, géoréférencement en point de base.
 */
import type { ConstatIfc, SchemaIfc } from "@parcours/sandbox-planche-model";
import { SCHEMAS_IFC } from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_IFC, type Disponibilite, type IdCommandeIfc } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
export type FormatFichierIfc = "ifc" | "ifczip";

function Bouton({ id, executer, disponibilite, principal = false }: { id: IdCommandeIfc; executer: (id: IdCommandeIfc) => void; disponibilite: (id: IdCommandeIfc) => Disponibilite; principal?: boolean }) {
  const c = COMMANDES_IFC.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={principal ? "est-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
    </button>
  );
}

export function PanneauIfcStructure({
  schema,
  onSchema,
  format,
  onFormat,
  georef,
  onGeoref,
  georefTexte,
  classes,
  constats,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  schema: SchemaIfc;
  onSchema: (s: SchemaIfc) => void;
  format: FormatFichierIfc;
  onFormat: (f: FormatFichierIfc) => void;
  georef: boolean;
  onGeoref: (g: boolean) => void;
  /** Valeurs du géoréférencement, ou motif s'il est impossible. */
  georefTexte: { readonly possible: boolean; readonly texte: string };
  classes: { readonly classes: Readonly<Record<string, number>>; readonly importes: number; readonly etages: number; readonly locaux: number };
  constats: readonly ConstatIfc[] | null;
  executer: (id: IdCommandeIfc) => void;
  disponibilite: (id: IdCommandeIfc) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const lignes: [string, string][] = [
    ["IfcBuildingStorey", t("planche.ifc.classe.etages", { nombre: String(classes.etages) })],
    ...Object.entries(classes.classes).sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => [c, t("planche.ifc.classe.objets", { nombre: String(n) })] as [string, string]),
    ["IfcSpace", t("planche.ifc.classe.locaux", { nombre: String(classes.locaux) })],
    ...(classes.importes > 0 ? [[t("planche.ifc.classe.importes"), t("planche.ifc.classe.importes-valeur", { nombre: String(classes.importes) })] as [string, string]] : []),
  ];
  return (
    <div className="planche-controle planche-fonds planche-ifc" data-planche-ifc={schema}>
      <p className="inspecteur-aide">{t("planche.ifc.intro")}</p>
      <fieldset className="planche-dxf-contenu planche-ifc-choix">
        <legend>{t("planche.ifc.schema")}</legend>
        {SCHEMAS_IFC.map((s) => (
          <label key={s}>
            <input type="radio" name="planche-ifc-schema" checked={schema === s} onKeyDown={arreter} onChange={() => onSchema(s)} data-planche-ifc-schema={s} /> {s === "IFC4X3_ADD2" ? "IFC4X3 ADD2" : s}
          </label>
        ))}
      </fieldset>
      <dl className="planche-dxf-calques" data-planche-ifc-classes={lignes.length}>
        {lignes.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <label className="planche-ifc-georef">
        <input type="checkbox" checked={georef && georefTexte.possible} disabled={!georefTexte.possible} onKeyDown={arreter} onChange={(e) => onGeoref(e.target.checked)} data-planche-ifc-georef /> {t("planche.ifc.georef")}
      </label>
      <p className="inspecteur-aide planche-ifc-retrait" data-planche-ifc-georef-texte>{georefTexte.texte}</p>
      <fieldset className="planche-dxf-contenu planche-ifc-choix">
        <legend>{t("planche.ifc.fichier")}</legend>
        {(["ifc", "ifczip"] as const).map((f) => (
          <label key={f}>
            <input type="radio" name="planche-ifc-format" checked={format === f} onKeyDown={arreter} onChange={() => onFormat(f)} data-planche-ifc-format={f} /> {t(`planche.ifc.fichier.${f}` as CleMessage)}
          </label>
        ))}
      </fieldset>
      <p className="planche-statut-titre"><b>{t("planche.ifc.controle")}</b></p>
      {constats === null ? (
        <p className="inspecteur-aide" data-planche-ifc-constats="">{t("planche.ifc.controle.attente")}</p>
      ) : (
        <ul className="planche-ifc-constats" data-planche-ifc-constats={constats.map((c) => c.cle).join(" ")}>
          {constats.map((c) => (
            <li key={c.cle} className={`est-${c.niveau}`} data-planche-ifc-constat={c.cle}>
              <IconeSandbox nom={c.niveau === "ok" ? "constatOk" : "constatAttention"} /> {t(`planche.ifc.controle.${c.cle}` as CleMessage, { nombre: String(c.nombre ?? 0), noms: c.noms ?? "" })}
            </li>
          ))}
        </ul>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.ifc.barre")}>
        <Bouton id="controler-ifc" executer={executer} disponibilite={disponibilite} />
        <Bouton id="exporter-ifc" executer={executer} disponibilite={disponibilite} principal />
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-ifc-erreur>{erreur}</p>}
      {note && <p className="planche-ifc-relu" data-planche-ifc-note>{note}</p>}
    </div>
  );
}

export interface ResumeImportIfc {
  readonly nom: string;
  readonly schema: string;
  readonly objets: number;
  readonly etages: readonly { readonly nom: string; readonly altitude: string }[];
  readonly axes: readonly string[];
  /** Texte du géoréférencement lu ; `null` = absent. */
  readonly georef: string | null;
  readonly nonLus: string | null;
  readonly classes: Readonly<Record<string, number>>;
}

export function PanneauImportIfc({
  lu,
  choix,
  onChoix,
  pointDeBaseExistant,
  executer,
  disponibilite,
  onChoisirFichier,
  erreur,
  note,
}: {
  lu: ResumeImportIfc | null;
  choix: { readonly niveaux: boolean; readonly trame: boolean; readonly georef: boolean };
  onChoix: (c: { readonly niveaux: boolean; readonly trame: boolean; readonly georef: boolean }) => void;
  pointDeBaseExistant: boolean;
  executer: (id: IdCommandeIfc) => void;
  disponibilite: (id: IdCommandeIfc) => Disponibilite;
  onChoisirFichier: () => void;
  erreur: string | null;
  note: string | null;
}) {
  return (
    <div className="planche-controle planche-fonds planche-ifc" data-planche-import-ifc={lu ? lu.objets : ""}>
      <p className="inspecteur-aide" data-planche-import-ifc-lu>{lu ? t("planche.ifc.import.lu", { nom: lu.nom, schema: lu.schema, objets: String(lu.objets) }) : t("planche.ifc.import.aucun")}</p>
      <div className="planche-debit-barre">
        <button type="button" onClick={onChoisirFichier} data-planche-import-ifc-choisir>
          {t("planche.ifc.import.choisir")}
        </button>
      </div>
      {lu && (
        <>
          <div className="planche-ifc-coches">
            <label>
              <input type="checkbox" checked={choix.niveaux} disabled={lu.etages.length === 0} onKeyDown={arreter} onChange={(e) => onChoix({ ...choix, niveaux: e.target.checked })} data-planche-import-ifc-choix="niveaux" /> {t("planche.ifc.import.etages", { nombre: String(lu.etages.length) })}
            </label>
            <small>{lu.etages.map((e) => `${e.nom} ${e.altitude}`).join(" · ")}</small>
            <label>
              <input type="checkbox" checked={choix.trame} disabled={lu.axes.length === 0} onKeyDown={arreter} onChange={(e) => onChoix({ ...choix, trame: e.target.checked })} data-planche-import-ifc-choix="trame" /> {t("planche.ifc.import.trame")}
            </label>
            <small>{t("planche.ifc.import.trame-detail", { nombre: String(lu.axes.length), etiquettes: lu.axes.join(", ") })}</small>
            <label>
              <input type="checkbox" checked={choix.georef && !pointDeBaseExistant && lu.georef !== null} disabled={pointDeBaseExistant || lu.georef === null} onKeyDown={arreter} onChange={(e) => onChoix({ ...choix, georef: e.target.checked })} data-planche-import-ifc-choix="georef" /> {t("planche.ifc.import.georef")}
            </label>
            <small>{lu.georef ?? t("planche.ifc.import.georef-aucun")}</small>
          </div>
          <dl className="planche-dxf-calques" data-planche-import-ifc-classes={Object.keys(lu.classes).length}>
            {Object.entries(lu.classes).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {lu.nonLus && <p className="inspecteur-aide" data-planche-import-ifc-non-lus>{lu.nonLus}</p>}
          <p className="inspecteur-aide">{t("planche.ifc.import.aide")}</p>
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.ifc.barre-import")}>
        <Bouton id="importer-ifc" executer={executer} disponibilite={disponibilite} principal />
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-import-ifc-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-import-ifc-note>{note}</p>}
    </div>
  );
}
