/**
 * Panneau de l'étape 7a du lot C4 (cas 4 du catalogue des extensions : D10-F14-038, D10-F14-036, D10-F23a-012 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7a-fabricants.png`) : « Formats des fabricants ». Fichier lu
 * (glTF, GLB, 3MF, COLLADA, 3DS, PLY ; FBX, 3DM et USD refusés avec leur motif), unité et axe vertical confirmés,
 * dimensions, matières et maillages répétés ; pose en objets du dessin ou en référence contrôlée (relevé au capteur).
 */
import type { AxeHaut } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_FABRICANT, type Disponibilite, type IdCommandeFabricant } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

/** Unités proposées (mètres par unité). */
export const UNITES_FABRICANT: readonly { readonly id: string; readonly metres: number }[] = [
  { id: "m", metres: 1 },
  { id: "cm", metres: 0.01 },
  { id: "mm", metres: 0.001 },
  { id: "in", metres: 0.0254 },
  { id: "ft", metres: 0.3048 },
];

export interface ResumeFabricant {
  readonly nom: string;
  readonly format: string;
  readonly objets: number;
  readonly triangles: number;
  readonly matieres: number;
  readonly repetes: number;
  /** Dimensions affichées (texte déjà formaté, mètres). */
  readonly dimensions: string;
  readonly uniteLue: boolean;
  readonly axeLu: boolean;
  readonly omis: readonly string[];
}

function Bouton({ id, executer, disponibilite, principal = false }: { id: IdCommandeFabricant; executer: (id: IdCommandeFabricant) => void; disponibilite: (id: IdCommandeFabricant) => Disponibilite; principal?: boolean }) {
  const c = COMMANDES_FABRICANT.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={principal ? "est-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
    </button>
  );
}

export function PanneauFabricant({
  lu,
  unite,
  onUnite,
  axe,
  onAxe,
  executer,
  disponibilite,
  onChoisirFichier,
  erreur,
  note,
  progression,
}: {
  lu: ResumeFabricant | null;
  unite: number;
  onUnite: (metres: number) => void;
  axe: AxeHaut;
  onAxe: (a: AxeHaut) => void;
  executer: (id: IdCommandeFabricant) => void;
  disponibilite: (id: IdCommandeFabricant) => Disponibilite;
  onChoisirFichier: () => void;
  erreur: string | null;
  note: string | null;
  progression: string | null;
}) {
  return (
    <div className="planche-controle planche-fonds planche-ifc" data-planche-fabricant={lu ? lu.objets : ""}>
      <p className="inspecteur-aide" data-planche-fabricant-lu>{lu ? t("planche.fabricant.lu", { nom: lu.nom, format: lu.format, objets: String(lu.objets), triangles: lu.triangles.toLocaleString("fr-CH") }) : t("planche.fabricant.aucun")}</p>
      <div className="planche-debit-barre">
        <button type="button" onClick={onChoisirFichier} data-planche-fabricant-choisir>
          {t("planche.fabricant.choisir")}
        </button>
      </div>
      <p className="inspecteur-aide">{t("planche.fabricant.formats")}</p>
      {lu && (
        <>
          <div className="planche-ifc-coches">
            <label>
              {t("planche.fabricant.unite")}{" "}
              <select value={String(unite)} onKeyDown={arreter} onChange={(e) => onUnite(Number(e.target.value))} data-planche-fabricant-unite>
                {UNITES_FABRICANT.map((u) => (
                  <option key={u.id} value={String(u.metres)}>
                    {t(`planche.fabricant.unite.${u.id}` as "planche.fabricant.unite.m")}
                  </option>
                ))}
              </select>
            </label>
            <small>{t(lu.uniteLue ? "planche.fabricant.unite.lue" : "planche.fabricant.unite.declaree")}</small>
            <span>{t("planche.fabricant.axe")}</span>
            <label>
              <input type="radio" name="planche-fabricant-axe" checked={axe === "z"} onKeyDown={arreter} onChange={() => onAxe("z")} data-planche-fabricant-axe="z" /> {t("planche.fabricant.axe.z")}
            </label>
            <label>
              <input type="radio" name="planche-fabricant-axe" checked={axe === "y"} onKeyDown={arreter} onChange={() => onAxe("y")} data-planche-fabricant-axe="y" /> {t("planche.fabricant.axe.y")}
            </label>
            <small>{t(lu.axeLu ? "planche.fabricant.axe.lu" : "planche.fabricant.axe.declare")}</small>
          </div>
          <dl className="planche-dxf-calques">
            <div>
              <dt>{t("planche.fabricant.dimensions")}</dt>
              <dd data-planche-fabricant-dimensions>{lu.dimensions}</dd>
            </div>
            <div>
              <dt>{t("planche.fabricant.matieres")}</dt>
              <dd data-planche-fabricant-matieres>{lu.matieres}</dd>
            </div>
            <div>
              <dt>{t("planche.fabricant.repetes")}</dt>
              <dd data-planche-fabricant-repetes>{lu.repetes}</dd>
            </div>
          </dl>
          {lu.omis.length > 0 && <p className="inspecteur-aide" data-planche-fabricant-omis>{t("planche.fabricant.omis", { liste: lu.omis.join(", ") })}</p>}
          <p className="inspecteur-aide">{t("planche.fabricant.aide")}</p>
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.fabricant.barre")}>
        <Bouton id="importer-fabricant" executer={executer} disponibilite={disponibilite} principal />
        <Bouton id="poser-releve" executer={executer} disponibilite={disponibilite} />
      </div>
      {progression && <p className="inspecteur-aide" data-planche-fabricant-progression>{progression}</p>}
      {erreur && <p className="planche-message" role="alert" data-planche-fabricant-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-fabricant-note>{note}</p>}
    </div>
  );
}
