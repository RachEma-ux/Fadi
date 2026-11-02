/**
 * G1-03 — revue fonction par fonction du lot du pilote (A, B, C, D, E, I, R, X, F hors DEC-15) : pour chaque fonction
 * réellement livrée — outil du registre Studio, route de l'API Studio, format d'échange livré de la matrice — établit
 * **à partir du code** :
 *
 * (a) sa source de vérité — champ du document Studio écrit par la commande (lu, pour un outil de lecture), tables SQL
 *     écrites par la route (lues pour une lecture), champs du document et tables lus par le code du format ;
 * (b) son contrat — version de contrat, schéma de paramètres et manifeste de l'outil ; schéma d'entrée zod, besoin de
 *     droit de la matrice X.2-02 et identifiants de contrats versionnés atteints par la route ; version du format,
 *     schéma et révision de la matrice d'échanges ;
 * (c) au moins un test qui l'exerce — fichier et libellé exact, retrouvés dans les tests et recettes du dépôt
 *     (`revue-g1-tests.ts`) ; pour un outil, une commande appliquée (`toolId: "…"`) de préférence ; pour une route, un
 *     appel dont l'adresse ne désigne qu'elle ; pour un format, la preuve de test citée par la matrice.
 *
 * Les manques sont rendus tels quels : la revue (`revue-g1.test.ts`) les compare à la liste des écarts connus.
 * Pur : lecture de fichiers, sans base ni réseau.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  STUDIO_APPLIED_TOOL_IDS, STUDIO_CONTRACT, STUDIO_DOCUMENT_SCHEMA, STUDIO_MANIFESTE_OUTILS, STUDIO_MATRICE_ECHANGES,
  STUDIO_TOOL_IDS, STUDIO_TOOLS, entreeManifeste,
} from "@parcours/atelier-model";
import { IndexCode, atteindre, champsEcrits, champsLus, contratsVersionnes, schemasZod, tablesTouchees } from "./revue-g1-analyse.js";
import { IndexTests, gabaritDesigneRoute, segmentsFixesCommuns, type Occurrence } from "./revue-g1-tests.js";

export type Categorie = "outil" | "route" | "format";
/**
 * `test-fonctionnel` : route exercée par la seule matrice des droits X.2-02 (statut de la réponse du propriétaire), sans
 * test qui en contrôle le résultat ; `contrat-non-versionne` : contrat vérifiable mais sans identifiant de version.
 */
export type Manque = "source" | "contrat" | "contrat-non-versionne" | "test" | "test-fonctionnel";
export interface PreuveTest { readonly fichier: string; readonly ligne: number; readonly libelle: string; readonly motif: string }
export interface Fonction {
  readonly categorie: Categorie;
  readonly id: string;
  /** Lot ou famille (outil : barre ; route : routeur ; format : famille de la matrice). */
  readonly groupe: string;
  readonly source: readonly string[];
  readonly contrat: readonly string[];
  readonly test: PreuveTest | null;
  /** Nombre de contrôles distincts (fichier + libellé) qui citent la fonction. */
  readonly controles: number;
  readonly manques: readonly Manque[];
}

export const CHAMPS_DOCUMENT: ReadonlySet<string> = new Set(Object.keys(STUDIO_DOCUMENT_SCHEMA.properties).filter((k) => !["id", "schemaVersion", "units", "frame"].includes(k)));
const SCHEMA_DOCUMENT = STUDIO_DOCUMENT_SCHEMA.properties.schemaVersion.const;
const PREFIXE_STUDIO = "/projects/:projectId/studio";

const preuve = (o: Occurrence): PreuveTest => ({ fichier: o.fichier, ligne: o.ligne, libelle: o.libelle, motif: o.motif.length > 120 ? `${o.motif.slice(0, 117)}…` : o.motif });
const distincts = (os: readonly Occurrence[]) => new Set(os.map((o) => `${o.fichier}\u0001${o.libelle}`)).size;
/**
 * Ordre de préférence (déterministe) : un test Vitest avant une recette (son libellé nomme ce qu'il contrôle) ; puis test
 * du module propriétaire, du modèle Studio, de tout fichier « studio », le reste ; enfin chemin et ligne.
 */
const ordrePour = (proprietaire = "") => (a: Occurrence, b: Occurrence) => {
  const module = proprietaire.replace(/\.ts$/, "");
  const rang = (o: Occurrence) => (module && (o.fichier.startsWith(`${module}/`) || o.fichier.startsWith(`${module}.`)) ? 0 : o.fichier.startsWith("packages/atelier-model/src/studio/") ? 1 : /studio/.test(o.fichier) ? 2 : 3);
  return (a.genre === b.genre ? 0 : a.genre === "vitest" ? -1 : 1) || rang(a) - rang(b) || a.fichier.localeCompare(b.fichier) || a.ligne - b.ligne;
};
const ordre = ordrePour();
/** Données du modèle qui tiennent lieu de source pour une route de lecture sans table (catalogue, matrice). */
const REGISTRES_MODELE = ["STUDIO_TOOLS", "STUDIO_MANIFESTE_OUTILS", "STUDIO_MATRICE_ECHANGES"] as const;

export class RevueG1 {
  readonly code: IndexCode;
  readonly tests: IndexTests;
  constructor(readonly racine: string) {
    this.code = new IndexCode(racine);
    this.tests = new IndexTests(racine);
  }

  private chemin = (r: string) => join(this.racine, r);

  // --- Outils ------------------------------------------------------------------------------------------------------

  outils(): Fonction[] {
    const commandes = this.chemin("packages/atelier-model/src/studio/composition/commandes.ts");
    const handlers = this.code.declaration(commandes, "HANDLERS");
    const init = handlers && ts.isVariableDeclaration(handlers.noeud) && handlers.noeud.initializer && ts.isObjectLiteralExpression(handlers.noeud.initializer) ? handlers.noeud.initializer : null;
    const gestionnaire = new Map<string, ts.Expression>();
    for (const p of init?.properties ?? []) if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.name)) gestionnaire.set(p.name.text, p.initializer);
    const applique = new Set<string>(STUDIO_APPLIED_TOOL_IDS);
    return STUDIO_TOOLS.map((t): Fonction => {
      const manques: Manque[] = [];
      // (a) source de vérité.
      let source: string[] = [];
      if (t.nature === "mutation") {
        const g = gestionnaire.get(t.toolId);
        const champs = g ? champsEcrits(atteindre(this.code, commandes, g), CHAMPS_DOCUMENT) : [];
        source = champs.map((c) => `StudioDocument.${c} (écrit)`);
      } else {
        // Outil de lecture : jamais une commande ; il lit le document par sa fonction de lecture du modèle.
        // Seul le corps de la fonction est lu (pas ce qu'elle atteint : la validation lit tout le document).
        const lecture = this.code.exportee(this.chemin("packages/atelier-model/src/index.ts"), "selectStudioShape");
        const champs = lecture ? champsLus({ noeuds: [{ fichier: lecture.fichier, noeud: lecture.noeud }], declarations: new Set() }, CHAMPS_DOCUMENT) : [];
        source = champs.map((c) => `StudioDocument.${c} (lu par selectStudioShape)`);
      }
      if (!source.length) manques.push("source");
      // (b) contrat.
      const e = entreeManifeste(t.toolId);
      const schema = t.inputSchema as Record<string, unknown>;
      const decrit = schema && typeof schema === "object" && ("type" in schema || "oneOf" in schema || "anyOf" in schema);
      const sortieDocument = t.outputSchema === (STUDIO_DOCUMENT_SCHEMA as unknown);
      const contratOk = t.contractVersion === STUDIO_CONTRACT && decrit && t.refusalCodes.length > 0 && e !== null
        && e.contrat.contractVersion === t.contractVersion && (t.nature === "lecture" || (applique.has(t.toolId) && sortieDocument));
      const contrat = [
        t.contractVersion,
        `schéma de paramètres (${"properties" in schema ? `${Object.keys(schema.properties as object).length} propriétés` : "oneOf" in schema ? `${(schema.oneOf as unknown[]).length} variantes` : "anyOf"})`,
        t.nature === "mutation" ? `sortie ${SCHEMA_DOCUMENT}` : "sortie : forme ou null, aucune écriture",
        `refus ${t.refusalCodes.join(", ")}`,
        e ? `${STUDIO_MANIFESTE_OUTILS.version} (droit ${e.droit})` : "absent du manifeste",
      ];
      if (!contratOk) manques.push("contrat");
      // (c) test : une commande appliquée (`toolId: "…"`) de préférence, sinon toute citation.
      const citations = this.tests.citant(t.toolId);
      const commandesAppliquees = citations.filter((o) => o.cle === "toolId");
      const choisies = (t.nature === "mutation" && commandesAppliquees.length ? commandesAppliquees : citations).slice().sort(ordrePour(e?.proprietaire.module));
      if (!choisies.length) manques.push("test");
      return { categorie: "outil", id: t.toolId, groupe: t.groupe, source, contrat, test: choisies[0] ? preuve(choisies[0]) : null, controles: distincts(citations), manques };
    });
  }

  // --- Routes ------------------------------------------------------------------------------------------------------

  /** Routes déclarées par `routes/studio*.ts` (constantes de chemin et boucles d'actions développées), avec leur nœud. */
  inventaireRoutes(): { route: string; methode: string; chemin: string; fichier: string; groupe: string; noeud: ts.CallExpression }[] {
    const dossier = this.chemin("apps/api/src/routes");
    const studio = this.code.fichier(join(dossier, "studio.ts"))!;
    // Préfixe de montage de chaque sous-routeur (`studioRouter.use("/x", sousRouteur)` ou sans préfixe).
    const prefixes = new Map<string, string>([["studioRouter", ""]]);
    const visiterUse = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "use" && n.expression.expression.getText() === "studioRouter") {
        const [a, b] = n.arguments;
        if (a && b && ts.isStringLiteral(a) && ts.isIdentifier(b) && /Router$/.test(b.text)) prefixes.set(b.text, a.text);
        else if (a && !b && ts.isIdentifier(a) && /Router$/.test(a.text)) prefixes.set(a.text, "");
      }
      ts.forEachChild(n, visiterUse);
    };
    visiterUse(studio.source);
    const out: ReturnType<RevueG1["inventaireRoutes"]> = [];
    for (const nom of readdirSync(dossier).filter((f) => /^studio.*\.ts$/.test(f) && !f.endsWith(".test.ts")).sort()) {
      const f = this.code.fichier(join(dossier, nom))!;
      const constante = (id: string): string | null => {
        const d = f.declarations.get(id);
        if (d && ts.isVariableDeclaration(d) && d.initializer) return evaluer(d.initializer, {});
        return null;
      };
      const evaluer = (e: ts.Expression, liees: Record<string, string>): string | null => {
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
        if (ts.isIdentifier(e)) return liees[e.text] ?? constante(e.text);
        if (ts.isTemplateExpression(e)) {
          let s = e.head.text;
          for (const span of e.templateSpans) { const v = evaluer(span.expression, liees); if (v === null) return null; s += v + span.literal.text; }
          return s;
        }
        return null;
      };
      const visiter = (n: ts.Node, liees: Record<string, string>[]): void => {
        if (ts.isForOfStatement(n) && ts.isArrayLiteralExpression(skipAs(n.expression))) {
          // `for (const [action, …] of [["archive", …], …])` : une liaison par élément.
          const nomVar = ts.isVariableDeclarationList(n.initializer) ? n.initializer.declarations[0]?.name : undefined;
          const elements = (skipAs(n.expression) as ts.ArrayLiteralExpression).elements;
          const valeurs = elements.map((el) => {
            if (nomVar && ts.isIdentifier(nomVar) && ts.isStringLiteral(el)) return { [nomVar.text]: el.text };
            if (nomVar && ts.isArrayBindingPattern(nomVar) && ts.isArrayLiteralExpression(el)) {
              const r: Record<string, string> = {};
              nomVar.elements.forEach((b, i) => { const v = el.elements[i]; if (ts.isBindingElement(b) && ts.isIdentifier(b.name) && v && ts.isStringLiteral(v)) r[b.name.text] = v.text; });
              return r;
            }
            return {};
          });
          for (const v of valeurs) visiter(n.statement, [v]);
          return;
        }
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
          && /^studio\w*Router$/.test(n.expression.expression.text) && ["get", "post", "put", "patch", "delete"].includes(n.expression.name.text) && n.arguments[0]) {
          const routeur = n.expression.expression.text;
          for (const l of liees.length ? liees : [{}]) {
            const chemin = evaluer(n.arguments[0], l);
            if (chemin === null) throw new Error(`routes/${nom} : chemin de route non évalué (${n.arguments[0].getText()})`);
            const methode = n.expression.name.text.toUpperCase();
            const complet = `${prefixes.get(routeur) ?? "?"}${chemin}`;
            out.push({ route: `${methode} ${complet}`, methode, chemin: `${PREFIXE_STUDIO}${complet}`, fichier: `apps/api/src/routes/${nom}`, groupe: nom.replace(/\.ts$/, ""), noeud: n });
          }
          return;
        }
        ts.forEachChild(n, (c) => visiter(c, liees));
      };
      visiter(f.source, []);
    }
    return out;
  }

  routes(): Fonction[] {
    const inventaire = this.inventaireRoutes();
    const permissions = readFileSync(this.chemin("docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md"), "utf8");
    const besoins = new Map([...permissions.matchAll(/^\| `([A-Z]+ [^`]+)` \| (\w+) \|/gm)].map((m) => [m[1]!, m[2]!]));
    // Occurrences d'adresse : littéral qui désigne une seule route (méthode comprise quand elle se lit).
    const fonctionnelles = new Map<string, Occurrence[]>();
    for (const o of this.tests.occurrences) {
      if (o.fichier === "apps/api/src/routes/studio-permissions.test.ts" || !o.texte.includes("/")) continue;
      const candidates = inventaire.filter((r) => o.methode === null || o.methode === r.methode)
        .map((r) => ({ r, n: segmentsFixesCommuns(o.texte, r.chemin) })).filter((c) => c.n > 0);
      // Plusieurs routes possibles : celle dont le plus de segments fixes sont lus tels quels l'emporte si elle est seule
      // à ce rang (`…/observations/rapprochements` plutôt que `…/observations/:observationId`) ; sinon l'adresse ne prouve rien.
      const max = Math.max(...candidates.map((c) => c.n));
      const retenues = candidates.filter((c) => c.n === max).map((c) => c.r);
      if (retenues.length !== 1) continue;
      const r = retenues[0]!.route;
      fonctionnelles.set(r, [...(fonctionnelles.get(r) ?? []), o]);
    }
    return inventaire.map((r): Fonction => {
      const manques: Manque[] = [];
      const a = atteindre(this.code, this.chemin(r.fichier), r.noeud);
      const t = tablesTouchees(this.code, a);
      const studioT = (l: string[]) => l.filter((x) => /^studio_/.test(x));
      const lecture = r.methode === "GET";
      const ecrites = studioT(t.ecrites);
      const lues = studioT(t.lues);
      const source = lecture ? lues.map((x) => `${x} (lue)`) : ecrites.length ? ecrites.map((x) => `${x} (écrite)`) : lues.map((x) => `${x} (lue ; aucune écriture atteinte)`);
      if (lecture && !source.length) source.push(...REGISTRES_MODELE.filter((n) => [...a.declarations].some((d) => d.endsWith(`#${n}`))).map((n) => `${n} (registre du modèle, lu)`));
      if (!source.length) manques.push("source");
      const zod = schemasZod(this.code, a);
      const versions = contratsVersionnes(a);
      const besoin = besoins.get(r.route.replace(PREFIXE_STUDIO, "")) ?? null;
      const contrat = [
        besoin ? `droit « ${besoin} » (matrice X.2-02)` : "absent de la matrice des droits X.2-02",
        zod.length ? `entrée : ${zod.join(", ")}` : "entrée : aucun schéma zod nommé atteint",
        versions.length ? `versions : ${versions.join(", ")}` : "aucun contrat versionné atteint",
      ];
      if (!besoin) manques.push("contrat");
      if (!versions.length) manques.push("contrat-non-versionne");
      let os = (fonctionnelles.get(r.route) ?? []).slice().sort(ordre);
      // Route d'un format livré : les preuves de test que la matrice d'échanges lui associe.
      if (!os.length) {
        os = STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre" && e.route).filter((e) => {
          const [m, chemin] = e.route!.split(" ");
          return m === r.methode && gabaritDesigneRoute(chemin!, r.chemin);
        }).flatMap((e) => (e.preuves?.tests ?? []).map((p) => this.tests.aPosition(p.fichier, p.motif))).filter((o): o is Occurrence => o !== null).sort(ordre);
      }
      // Dernier recours : la matrice des droits exécute la route (statut de la réponse du propriétaire), sans plus.
      if (!os.length) {
        manques.push("test-fonctionnel");
        const m = this.tests.aPosition("apps/api/src/routes/studio-permissions.test.ts", "chaque cellule rend l'attendu");
        if (m && besoin) os = [m];
      }
      if (!os.length) manques.push("test");
      return { categorie: "route", id: r.route, groupe: r.groupe, source, contrat, test: os[0] ? preuve(os[0]) : null, controles: distincts(os), manques };
    });
  }

  // --- Formats d'échange --------------------------------------------------------------------------------------------

  formats(): Fonction[] {
    const toolIds = new Set<string>(STUDIO_TOOL_IDS);
    return STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre").map((e): Fonction => {
      const manques: Manque[] = [];
      const champs = new Set<string>();
      const tables = new Set<string>();
      const outils = new Set<string>();
      const versions = new Set<string>();
      const entrees = new Set<string>();
      for (const c of e.preuves?.code ?? []) {
        const d = this.code.exportee(this.chemin(c.fichier), c.motif) ?? this.code.declaration(this.chemin(c.fichier), c.motif);
        if (!d) continue;
        const a = atteindre(this.code, d.fichier, d.noeud);
        // Champs du document lus dans le fichier du symbole seulement (la validation atteinte lit tout le document).
        for (const x of champsLus({ noeuds: a.noeuds.filter((n) => n.fichier === d.fichier), declarations: new Set() }, CHAMPS_DOCUMENT)) champs.add(x);
        const typees = entreesTypees(this.code, d.fichier, d.noeud);
        if (typees.length) entrees.add(`${c.motif}(${typees.join(", ")})`);
        const t = tablesTouchees(this.code, a);
        for (const x of [...t.ecrites, ...t.lues, ...t.nommees].filter((y) => /^studio_/.test(y))) tables.add(x);
        for (const v of contratsVersionnes(a)) versions.add(v);
        const visiter = (n: ts.Node): void => { if (ts.isStringLiteral(n) && toolIds.has(n.text)) outils.add(n.text); ts.forEachChild(n, visiter); };
        for (const x of a.noeuds) visiter(x.noeud);
      }
      const source = [
        ...(champs.size ? [`StudioDocument : ${[...champs].sort().join(", ")} (lus)`] : []),
        ...(tables.size ? [`tables : ${[...tables].sort().join(", ")}`] : []),
        ...(e.sens === "import" && outils.size ? [`commandes produites : ${[...outils].sort().join(", ")}`] : []),
        ...(entrees.size ? [`entrées typées : ${[...entrees].sort().join(" ; ")}`] : []),
      ];
      // Code du format qui ne lit que des octets ou une horloge : la source se lit chez ses appelants du dépôt (la
      // déclaration de premier niveau qui l'appelle, ses champs du document lus et ses entrées typées), jamais supposée.
      if (!source.length) source.push(...(e.preuves?.code ?? []).flatMap((c) => this.appelants(c.fichier, c.motif)));
      if (!source.length) manques.push("source");
      const versionFormat = e.versionFormat && !/^non évaluée/.test(e.versionFormat) ? e.versionFormat : null;
      const contrat = [`${STUDIO_MATRICE_ECHANGES.schema} révision ${STUDIO_MATRICE_ECHANGES.revision}`, versionFormat ? `format : ${versionFormat}` : "version du format non déclarée", ...(versions.size ? [`contrats atteints : ${[...versions].sort().join(", ")}`] : [])];
      if (!versionFormat) manques.push("contrat");
      else if (/sans schéma versionné/.test(versionFormat)) manques.push("contrat-non-versionne");
      const trouves = (e.preuves?.tests ?? []).map((p) => this.tests.aPosition(p.fichier, p.motif)).filter((o): o is Occurrence => o !== null).sort(ordre);
      if (!trouves.length) manques.push("test");
      return { categorie: "format", id: e.id, groupe: e.famille, source, contrat, test: trouves[0] ? preuve(trouves[0]) : null, controles: distincts(trouves), manques };
    });
  }

  /**
   * Appelants de `symbole` (exporté par `fichier`) dans le même espace de code (`…/src/`), hors tests : pour chacun, la
   * déclaration de premier niveau qui l'appelle, les champs du document lus dans son corps et ses entrées typées.
   */
  private appelants(fichier: string, symbole: string): string[] {
    const cible = this.code.exportee(this.chemin(fichier), symbole) ?? this.code.declaration(this.chemin(fichier), symbole);
    const i = fichier.indexOf("/src/");
    if (!cible || i < 0) return [];
    const racine = this.chemin(fichier.slice(0, i + 5));
    const fichiers: string[] = [];
    const parcourir = (d: string): void => {
      for (const nom of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, nom.name);
        if (nom.isDirectory()) parcourir(p);
        else if (/\.tsx?$/.test(nom.name) && !/\.test\.tsx?$/.test(nom.name)) fichiers.push(p);
      }
    };
    parcourir(racine);
    const out: string[] = [];
    for (const f of fichiers.sort()) {
      const fi = this.code.fichier(f);
      if (!fi || f === cible.fichier) continue;
      const locaux = [...fi.imports].filter(([, v]) => v.nom !== "*" && this.code.exportee(v.module, v.nom)?.noeud === cible.noeud).map(([k]) => k);
      if (!locaux.length) continue;
      const vus = new Set<string>();
      const visiter = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && locaux.includes(n.expression.text)) {
          const decl = [...fi.declarations].find(([, d]) => d.getStart() <= n.getStart() && n.getEnd() <= d.getEnd());
          if (decl && !vus.has(decl[0])) {
            vus.add(decl[0]);
            const champs = champsLus({ noeuds: [{ fichier: f, noeud: decl[1] }], declarations: new Set() }, CHAMPS_DOCUMENT);
            const typees = entreesTypees(this.code, f, decl[1]);
            if (champs.length || typees.length) {
              out.push(`appelant ${decl[0]} (${this.code.relatif(f)})${champs.length ? ` : StudioDocument : ${champs.join(", ")} (lus)` : ""}${typees.length ? ` ; entrées typées : ${decl[0]}(${typees.join(", ")})` : ""}`);
            }
          }
        }
        ts.forEachChild(n, visiter);
      };
      visiter(fi.source);
    }
    return out;
  }

  toutes(): Fonction[] { return [...this.outils(), ...this.routes(), ...this.formats()]; }
}

/**
 * Paramètres d'une fonction (ou du constructeur d'une classe) dont le type est une donnée **du dépôt** (type déclaré ou
 * importé d'un module du dépôt) : `nom: Type`. Un type global (`Uint8Array`, `string`, `() => number`) n'en est pas une.
 */
function entreesTypees(code: IndexCode, fichier: string, n: ts.Node): string[] {
  let f: ts.SignatureDeclaration | undefined;
  if (ts.isFunctionDeclaration(n)) f = n;
  else if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) f = n.initializer;
  else if (ts.isClassDeclaration(n)) f = n.members.find(ts.isConstructorDeclaration);
  const duDepot = (t: ts.TypeNode): boolean => {
    let oui = false;
    const v = (x: ts.Node): void => {
      if (ts.isTypeReferenceNode(x) && ts.isIdentifier(x.typeName) && code.typeDuDepot(fichier, x.typeName.text)) oui = true;
      ts.forEachChild(x, v);
    };
    v(t);
    return oui;
  };
  return (f?.parameters ?? []).filter((p) => p.type && duDepot(p.type)).map((p) => `${ts.isIdentifier(p.name) ? p.name.text : "{…}"}: ${p.type!.getText()}`);
}

function skipAs(e: ts.Expression): ts.Expression {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}
