/**
 * Commandes d'export et d'impression (DA-14-01 part lot 3a, D-019 ; DA-16-10-c), famille Partager, **sans
 * raccourci de lettre seule**, `ecrit: false` (aucune commande du modèle : permises en lecture seule et hors ligne).
 *
 * Un export n'est pas un geste : activer l'outil produit aussitôt le fichier depuis la vue exportée
 * (`preparerVue` → `dessinerNiveau`), le télécharge, puis tente de l'enregistrer au catalogue des documents
 * (projet modifiable seulement ; échec ou hors ligne : message, le fichier reste téléchargé). La consigne de la
 * session annonce le résultat ; le geste suivant (clic, touche) ferme l'outil. Les effets de bord (téléchargement,
 * rastérisation, fenêtre d'impression, catalogue) sont injectés (`EffetsExport`) : les tests restent sans DOM.
 */
import type { Activation, Apercu, ContexteAtelier, DefinitionOutil, ErreurLisible, RegistreDessinateurs, SessionOutil } from "../../socle";
import { construireDxf } from "../exports/dxf";
import { pageImpression } from "../exports/impression";
import { dimensionsPngVue } from "../exports/png";
import { construireSvg } from "../exports/svg";
import { nomExport, preparerVue, type VueExport } from "../exports/vue";
import { lisible } from "../format";
import { calculerMetre, csvMetre, nomCsvMetre } from "../metre";

export interface EnregistrementExport {
  readonly blob: Blob;
  readonly fileName: string;
  readonly kind: string;
  readonly levelId: string | null;
  readonly levelName: string | null;
  readonly view: Record<string, unknown>;
}

/** Effets de bord des exports (implémentation navigateur : `navigateur.ts`). */
export interface EffetsExport {
  telecharger(nom: string, contenu: Blob): void;
  rasteriser(svg: string, largeur: number, hauteur: number): Promise<Blob>;
  /** Ouvre la fenêtre d'impression ; `false` si le navigateur l'a bloquée. */
  imprimer(html: string): boolean;
  /** Enregistrement au catalogue des documents (`POST /projects/:id/documents/dessins`). */
  enregistrer?(projetId: string, e: EnregistrementExport): Promise<unknown>;
  maintenant(): Date;
}

export interface DependancesExports {
  readonly dessinateurs: Pick<RegistreDessinateurs, "dessinerNiveau">;
  readonly effets: EffetsExport;
}

type Format = "svg" | "png" | "dxf" | "impression" | "metre";

const TYPES_MIME: Readonly<Record<Exclude<Format, "impression">, string>> = { svg: "image/svg+xml", png: "image/png", dxf: "application/dxf", metre: "text/csv;charset=utf-8" };

function activationExport(ctx: ContexteAtelier): Activation {
  if (!ctx.etat()) return { ok: false, motif: "le modèle n'est pas chargé" };
  if (!ctx.niveauActif()) return { ok: false, motif: "choisir d'abord un niveau actif" };
  return { ok: true };
}

/** Session d'un export : le travail est lancé à la création ; la consigne suit son avancement. */
function sessionExport(ctx: ContexteAtelier, deps: DependancesExports, format: Format): SessionOutil {
  let consigne = "Export en cours…";
  let erreurs: readonly ErreurLisible[] = [];
  const fin = (texte: string) => {
    consigne = `${texte} Cliquez ou appuyez sur une touche pour revenir à la sélection.`;
  };

  const vueOuErreur = (): VueExport | null => {
    const etat = ctx.etat();
    const niveauId = ctx.niveauActif();
    if (!etat || !niveauId) {
      erreurs = [lisible("Export", "modèle ou niveau actif absent", "ouvrir le projet et choisir un niveau")];
      return null;
    }
    const r = preparerVue({ dessinateurs: deps.dessinateurs, etat, niveauId, calquesMasques: ctx.calquesMasques(), date: deps.effets.maintenant() });
    if (!r.ok) {
      erreurs = [r.erreur];
      return null;
    }
    return r.vue;
  };

  const livrer = async (nom: string, blob: Blob, kind: string, niveau: { id: string; nom: string }, vue: Record<string, unknown>) => {
    deps.effets.telecharger(nom, blob);
    if (!deps.effets.enregistrer || !ctx.ecriture.permise) {
      fin(`Fichier téléchargé : ${nom}${ctx.ecriture.permise ? "." : ` — non enregistré au catalogue (${ctx.ecriture.motif}).`}`);
      return;
    }
    fin(`Fichier téléchargé : ${nom} ; enregistrement au catalogue…`);
    try {
      await deps.effets.enregistrer(ctx.projetId, { blob, fileName: nom, kind, levelId: niveau.id, levelName: niveau.nom, view: vue });
      fin(`Fichier téléchargé et enregistré au catalogue : ${nom}.`);
    } catch {
      fin(`Fichier téléchargé : ${nom} — non enregistré au catalogue (hors ligne ou serveur injoignable).`);
    }
  };

  const lancer = async () => {
    if (format === "metre") {
      const etat = ctx.etat();
      const niveauId = ctx.niveauActif();
      if (!etat || !niveauId) {
        erreurs = [lisible("Métré", "modèle ou niveau actif absent", "ouvrir le projet et choisir un niveau")];
        return fin("Rien n'a été exporté.");
      }
      const m = calculerMetre(etat, niveauId);
      const nom = nomCsvMetre(m);
      return livrer(nom, new Blob([csvMetre(m, deps.effets.maintenant())], { type: TYPES_MIME.metre }), "csv", { id: m.niveauId, nom: m.niveauNom }, { vue: "metre", revision: m.revision, empreinte: m.empreinte, regles: m.regle });
    }
    const v = vueOuErreur();
    if (!v) return fin("Rien n'a été exporté.");
    const niveau = { id: v.meta.niveauId, nom: v.meta.niveauNom };
    const vueCatalogue = { vue: "plan", revision: v.meta.revision, empreinte: v.meta.empreinte, mention: "vue de travail, sans échelle", unites: "m" };
    const svg = construireSvg(v);
    switch (format) {
      case "svg":
        return livrer(nomExport(v.meta, "svg"), new Blob([svg], { type: TYPES_MIME.svg }), "svg", niveau, vueCatalogue);
      case "dxf":
        return livrer(nomExport(v.meta, "dxf"), new Blob([construireDxf(v)], { type: TYPES_MIME.dxf }), "dxf", niveau, vueCatalogue);
      case "png": {
        const d = dimensionsPngVue(v);
        const blob = await deps.effets.rasteriser(svg, d.largeur, d.hauteur);
        await livrer(nomExport(v.meta, "png"), blob, "png", niveau, { ...vueCatalogue, largeur: d.largeur, hauteur: d.hauteur });
        if (d.reduit) consigne = `${consigne} Résolution réduite à ${d.largeur} × ${d.hauteur} px (plafond de 4 096 px).`;
        return;
      }
      case "impression":
        return fin(deps.effets.imprimer(pageImpression(v, svg)) ? "Fenêtre d'impression ouverte (choisir « Enregistrer en PDF » pour un fichier)." : "Fenêtre d'impression bloquée par le navigateur : autorisez les fenêtres de Fadi puis recommencez.");
    }
  };

  // Le travail démarre à l'activation (choix explicite de l'utilisateur) ; une erreur inattendue est affichée.
  const travail = lancer().catch((e: unknown) => {
    erreurs = [lisible("Export", `échec : ${e instanceof Error ? e.message : String(e)}`, "réessayer ; rien n'a été modifié")];
    fin("Rien n'a été exporté.");
  });
  void travail;

  return {
    traiter: (evt) => (evt.type === "appui" || evt.type === "touche" ? { action: "terminer" } : { action: "continuer" }),
    apercu: (): Apercu => ({ formes: [], champs: [], consigne, erreurs }),
    abandonner: () => {},
  };
}

interface SpecExport {
  readonly format: Format;
  readonly nom: string;
  readonly libelle: string;
  readonly synonymes: readonly string[];
  readonly fiches: readonly string[];
  readonly action: string;
  readonly exemple: string;
}

const EXPORTS: readonly SpecExport[] = [
  { format: "svg", nom: "exporter-svg", libelle: "Exporter le plan en SVG", synonymes: ["export", "svg", "vectoriel", "enregistrer l'image", "save as image", "plan svg"], fiches: ["DA-14-01"], action: "Exporte le plan du niveau actif (calques visibles) en SVG vectoriel.", exemple: "Mezzanine → projet_Mezzanine_plan_r12.svg" },
  { format: "png", nom: "exporter-png", libelle: "Exporter le plan en PNG", synonymes: ["export", "png", "image", "capture", "enregistrer l'image", "save as image"], fiches: ["DA-14-01"], action: "Exporte le plan du niveau actif en image PNG (proportions conservées).", exemple: "Mezzanine → projet_Mezzanine_plan_r12.png" },
  { format: "dxf", nom: "exporter-dxf", libelle: "Exporter le plan en DXF", synonymes: ["export", "dxf", "dao", "cao", "autocad", "plan dxf", "dwg"], fiches: ["DA-14-01"], action: "Exporte le plan du niveau actif en DXF (mètres, un calque DXF par calque).", exemple: "Rez → projet_Rez_plan_r12.dxf" },
  { format: "impression", nom: "imprimer", libelle: "Imprimer le plan", synonymes: ["imprimer", "impression", "pdf", "print", "enregistrer en pdf"], fiches: ["DA-14-01"], action: "Imprime le plan du niveau actif sur A3 paysage, avec cartouche et échelle.", exemple: "Imprimer → « Enregistrer en PDF »" },
  { format: "metre", nom: "exporter-metre", libelle: "Exporter le métré CSV", synonymes: ["métré", "metre", "quantités", "csv", "takeoff", "qto", "quantities"], fiches: ["DA-16-10"], action: "Exporte le métré du niveau actif en CSV, avec révision et empreinte.", exemple: "Rez → projet_Rez_r12_metre.csv" },
];

export function outilsExport(deps: DependancesExports): DefinitionOutil[] {
  return EXPORTS.map(
    (s): DefinitionOutil => ({
      id: `partager.${s.nom}`,
      libelle: s.libelle,
      famille: "partager",
      niveau: "essentiel",
      synonymes: s.synonymes,
      fiches: s.fiches,
      aide: { action: s.action, conditions: "Un niveau actif avec des objets visibles ; possible en lecture seule (le catalogue exige un projet modifiable).", exemple: s.exemple },
      vues: ["plan"],
      ecrit: false,
      activation: activationExport,
      commencer: (ctx) => sessionExport(ctx, deps, s.format),
    }),
  );
}
