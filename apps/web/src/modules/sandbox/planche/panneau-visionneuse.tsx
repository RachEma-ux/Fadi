/**
 * Panneau de l'étape 7d du lot C4 (cas 4 du catalogue des extensions : D10-F14-085) : « Visionneuse hors ligne ».
 * Contenu du fichier (maquette en coordonnées locales, balises sur option), vues enregistrées retenues, version,
 * empreinte et taille estimée, puis l'export en un seul fichier HTML consultable sans réseau.
 */
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_VISIONNEUSE, type Disponibilite, type IdCommandeVisionneuse } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export interface ResumeVisionneuse {
  readonly triangles: string;
  readonly version: string;
  readonly empreinte: string;
  readonly taille: string;
}

export function PanneauVisionneuse({
  resume,
  balises,
  onBalises,
  scenes,
  choisies,
  onScene,
  executer,
  disponibilite,
  note,
}: {
  resume: ResumeVisionneuse;
  balises: boolean;
  onBalises: (v: boolean) => void;
  scenes: readonly { readonly id: string; readonly nom: string }[];
  choisies: ReadonlySet<string>;
  onScene: (id: string, v: boolean) => void;
  executer: (id: IdCommandeVisionneuse) => void;
  disponibilite: (id: IdCommandeVisionneuse) => Disponibilite;
  note: string | null;
}) {
  const c = COMMANDES_VISIONNEUSE.find((x) => x.id === "exporter-visionneuse")!;
  const d = disponibilite("exporter-visionneuse");
  // Dans le panneau, le bouton rappelle la touche du troisième temps (maquette validée) ; l'infobulle, le raccourci entier.
  const touche = c.raccourci.split(",").pop()!.trim();
  return (
    <div className="planche-controle planche-fonds planche-ifc planche-visionneuse" data-planche-visionneuse>
      <p className="inspecteur-aide">{t("planche.visionneuse.aide")}</p>
      <p className="planche-statut-titre"><b>{t("planche.visionneuse.contenu")}</b></p>
      <div className="planche-visionneuse-choix">
        <label>
          <input type="checkbox" checked disabled /> {t("planche.visionneuse.maquette")}
          <small data-planche-visionneuse-triangles>{resume.triangles}</small>
        </label>
        <label>
          <input type="checkbox" checked={balises} onKeyDown={arreter} onChange={(e) => onBalises(e.target.checked)} data-planche-visionneuse-balises /> {t("planche.visionneuse.balises")}
          <small>{t("planche.visionneuse.balises.aide")}</small>
        </label>
      </div>
      <p className="planche-statut-titre"><b>{t("planche.visionneuse.vues")}</b></p>
      {scenes.length === 0 ? (
        <p className="inspecteur-aide" data-planche-visionneuse-sans-vue>{t("planche.visionneuse.vues.aucune")}</p>
      ) : (
        <div className="planche-visionneuse-choix">
          {scenes.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={choisies.has(s.id)} onKeyDown={arreter} onChange={(e) => onScene(s.id, e.target.checked)} data-planche-visionneuse-vue={s.id} /> {s.nom}
            </label>
          ))}
        </div>
      )}
      <dl className="planche-dxf-calques">
        <div>
          <dt>{t("planche.visionneuse.version")}</dt>
          <dd data-planche-visionneuse-version>{resume.version}</dd>
        </div>
        <div>
          <dt>{t("planche.visionneuse.empreinte")}</dt>
          <dd data-planche-visionneuse-empreinte>{resume.empreinte}</dd>
        </div>
        <div>
          <dt>{t("planche.visionneuse.taille")}</dt>
          <dd data-planche-visionneuse-taille>{resume.taille}</dd>
        </div>
      </dl>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.visionneuse.barre")}>
        <button
          type="button"
          className="est-principal"
          disabled={!d.disponible}
          title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}
          aria-label={t(c.libelle)}
          onClick={() => executer("exporter-visionneuse")}
          data-planche-commande="exporter-visionneuse"
        >
          <Pictogramme picto={c.picto} /> {t(c.court)} <kbd>{afficherRaccourci(touche)}</kbd>
        </button>
      </div>
      <p className="inspecteur-aide">{t("planche.visionneuse.partage")}</p>
      {note && <p className="inspecteur-aide" data-planche-visionneuse-note>{note}</p>}
    </div>
  );
}
