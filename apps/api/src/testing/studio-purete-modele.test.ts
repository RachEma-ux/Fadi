/**
 * ARC-05 (ADR-STUDIO-PILOTE-01, P-12) : les modèles purs de Studio restent dans `packages/atelier-model/src/studio`,
 * exposés par le paquet `@parcours/atelier-model`, sans extraction nouvelle. Contrôle de pureté de ce dossier, en plus de
 * la garde générale des paquets (`scripts/check-module-deps.mjs`, règles `modelePur` et `BROWSER_API`) :
 *  - aucun fichier JSX (`.tsx`, `.jsx`) ;
 *  - aucun import (statique, dynamique, `require`, `import type`) d'un paquet autre que les paquets purs du dépôt
 *    (`@parcours/core-geometry`, `@parcours/domain-model`, `@parcours/planche-model`) : ni React, ni DOM, ni three, ni
 *    gestionnaire d'état graphique, ni `apps/*` ; les modules `node:` restent réservés aux tests ;
 *  - aucune expression JSX, aucune déclaration globale (`declare global`, `declare var`) ;
 *  - aucune API du navigateur (`document.…`, `window.…`, `localStorage`…) employée comme objet global ;
 *  - la bibliothèque de types DOM n'est pas déclarée par le tsconfig du paquet (la compilation refuse donc tout global du
 *    navigateur) ;
 *  - le point d'entrée du paquet réexporte le modèle Studio.
 * Pur : lecture de fichiers et analyse syntaxique (TypeScript, disponible dans l'API ; un test de paquet pur n'importe
 * que vitest et node:) seulement.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PAQUET = join(RACINE, "packages/atelier-model");
const ICI = join(PAQUET, "src/studio");
const PAQUETS_PERMIS = new Set(["@parcours/core-geometry", "@parcours/domain-model", "@parcours/planche-model"]);
const GLOBAUX_NAVIGATEUR = /^(document|window|navigator|localStorage|sessionStorage|indexedDB|HTMLElement|HTMLCanvasElement|customElements|requestAnimationFrame|getComputedStyle|DOMParser|location|history)$/;

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else out.push(chemin);
  }
  return out;
}
const estTest = (f: string) => /\.test\.tsx?$/.test(f);

/** Écarts de pureté d'un fichier source : `[règle, détail]`. */
export function ecartsPurete(nom: string, texte: string): [string, string][] {
  const out: [string, string][] = [];
  if (/\.(tsx|jsx)$/.test(nom)) out.push(["JSX", nom]);
  const sf = ts.createSourceFile(nom, texte, ts.ScriptTarget.ES2022, true, /\.tsx$/.test(nom) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declares = new Set<string>();
  const declarer = (n: ts.Node) => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n) || ts.isBindingElement(n)) && n.name && ts.isIdentifier(n.name)) declares.add(n.name.text);
    ts.forEachChild(n, declarer);
  };
  declarer(sf);
  const cible = (spec: string) => {
    if (spec.startsWith(".")) return;
    const racine = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
    if (!PAQUETS_PERMIS.has(racine)) out.push(["IMPORT", spec]);
  };
  const visiter = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) cible(n.moduleSpecifier.text);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) cible(n.argument.literal.text);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteral(a)) cible(a.text);
      else out.push(["IMPORT", "cible calculée"]);
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) out.push(["JSX", "expression JSX"]);
    if (ts.isModuleDeclaration(n) && n.name.getText(sf) === "global") out.push(["GLOBAL", "declare global"]);
    if (ts.isVariableStatement(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) out.push(["GLOBAL", n.getText(sf).slice(0, 60)]);
    if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) && ts.isIdentifier(n.expression)
      && GLOBAUX_NAVIGATEUR.test(n.expression.text) && !declares.has(n.expression.text)) out.push(["NAVIGATEUR", n.expression.text]);
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
}

describe("ARC-05 — modèles purs de Studio : ni React, ni DOM, ni état graphique dans packages/atelier-model/src/studio", () => {
  it("ARC-05 [+] dépôt réel : aucune source de src/studio n'importe React, le DOM, three ou une application, ni n'emploie un global du navigateur", () => {
    const sources = fichiers(ICI).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !estTest(f));
    expect(sources.length).toBeGreaterThan(100);
    const ecarts = sources.flatMap((f) => ecartsPurete(f, readFileSync(f, "utf8")).map(([r, d]) => `${relative(PAQUET, f)} : ${r} : ${d}`));
    expect(ecarts).toEqual([]);
    expect(fichiers(ICI).filter((f) => /\.(tsx|jsx)$/.test(f))).toEqual([]);
  });

  it("ARC-05 [+] le tsconfig du paquet ne déclare pas la bibliothèque DOM et le paquet expose le modèle Studio", () => {
    const config = JSON.parse(readFileSync(join(PAQUET, "tsconfig.json"), "utf8")) as { compilerOptions: { lib?: string[]; types?: string[]; jsx?: string } };
    expect((config.compilerOptions.lib ?? []).some((l) => /^dom/i.test(l))).toBe(false);
    expect(config.compilerOptions.jsx).toBeUndefined();
    const manifeste = JSON.parse(readFileSync(join(PAQUET, "package.json"), "utf8")) as { name: string; exports: Record<string, string>; dependencies?: Record<string, string> };
    expect(manifeste.name).toBe("@parcours/atelier-model");
    expect(Object.keys(manifeste.dependencies ?? {}).filter((d) => !PAQUETS_PERMIS.has(d))).toEqual([]);
    expect(readFileSync(join(PAQUET, manifeste.exports["."]!), "utf8")).toMatch(/from "\.\/studio\//);
  });

  it("ARC-05 [−] garde construite : React, un import dynamique de three, un global du navigateur, du JSX ou un declare global sont détectés", () => {
    expect(ecartsPurete("a.ts", 'import { useState } from "react";\nexport const x = 1;')).toEqual([["IMPORT", "react"]]);
    expect(ecartsPurete("b.ts", 'export const charger = () => import("three");')).toEqual([["IMPORT", "three"]]);
    expect(ecartsPurete("c.ts", "export const l = () => window.innerWidth + localStorage.length;")).toEqual([["NAVIGATEUR", "window"], ["NAVIGATEUR", "localStorage"]]);
    expect(ecartsPurete("d.tsx", "export const V = () => <div />;").map(([r]) => r)).toEqual(["JSX", "JSX"]);
    expect(ecartsPurete("e.ts", "declare global { interface Window { x: 1 } }\nexport {};").map(([r]) => r)).toEqual(["GLOBAL"]);
    expect(ecartsPurete("f.ts", 'import type { StudioPoint } from "@fadi/web";')).toEqual([["IMPORT", "@fadi/web"]]);
    expect(ecartsPurete("g.ts", 'import { readFileSync } from "node:fs";')).toEqual([["IMPORT", "node:fs"]]);
    // Une variable locale nommée `document` (document Studio) n'est pas le global du navigateur.
    expect(ecartsPurete("h.ts", 'import { x } from "./x.js";\nexport function f(document: { id: string }) { return document.id; }')).toEqual([]);
    expect(ecartsPurete("i.ts", 'import { a } from "@parcours/core-geometry";\nexport const b = a;')).toEqual([]);
  });
});
