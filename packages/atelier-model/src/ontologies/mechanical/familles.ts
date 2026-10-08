/**
 * Familles paramétriques, tables, configurations et règles (P2-2 ; DA-06-03 à 06, 09, 10) : des paramètres nommés avec
 * unité, liés par des expressions (`evaluer`, arithmétique bornée du lot 8), des configurations qui fixent certaines
 * valeurs, des règles (comparaisons) contrôlées sur les valeurs évaluées. Fonctions pures ; aucune valeur normative.
 */
import { evaluer } from "../../automatisation/scripts.js";

export interface ParametreFamille { expression: string; unite: string | null }
export interface ParamsFamille {
  parametres: Record<string, ParametreFamille>;
  /** Configurations (table de famille) : valeurs qui remplacent l'expression du paramètre. */
  configurations: Record<string, Record<string, number>>;
  /** Configuration active (état du modèle, DA-06-06) ; null : expressions seules. */
  active: string | null;
}
export interface ParamsRegle { expression: string; message: string; familleId: string | null }

const NOM = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export const estNomParametre = (n: string): boolean => NOM.test(n);

/** Valeurs évaluées de la famille dans l'ordre des dépendances ; cycle ou division par zéro : erreur nommée. */
export function evaluerFamille(f: ParamsFamille, configuration: string | null = f.active): Record<string, number> {
  const fixes = configuration ? (f.configurations[configuration] ?? null) : null;
  if (configuration && !fixes) throw new Error(`configuration inconnue : ${configuration}`);
  const valeurs: Record<string, number> = {};
  const enCours = new Set<string>();
  const noms = Object.keys(f.parametres);
  const calculer = (nom: string, chemin: string[]): number => {
    if (nom in valeurs) return valeurs[nom]!;
    if (enCours.has(nom)) throw new Error(`cycle d'expressions : ${[...chemin, nom].join(" → ")}`);
    const p = f.parametres[nom];
    if (!p) throw new Error(`paramètre inconnu : ${nom}`);
    enCours.add(nom);
    let v: number;
    if (fixes && nom in fixes) v = fixes[nom]!;
    else {
      const refs = (p.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((r) => noms.includes(r));
      const vars: Record<string, number> = {};
      for (const r of refs) vars[r] = calculer(r, [...chemin, nom]);
      v = evaluer(p.expression, vars);
      if (!Number.isFinite(v)) throw new Error(`${nom} : résultat non fini (division par zéro ?)`);
    }
    enCours.delete(nom);
    valeurs[nom] = v;
    return v;
  };
  for (const n of noms) calculer(n, []);
  return valeurs;
}

/** Contrôle d'une règle « expr1 op expr2 » (op : <=, >=, <, >, =) sur des valeurs ; retourne null si tenue, le message sinon. */
export function controlerRegle(r: ParamsRegle, valeurs: Readonly<Record<string, number>>): string | null {
  const m = r.expression.match(/^(.*?)(<=|>=|=|<|>)(.*)$/);
  if (!m) throw new Error(`règle « ${r.expression} » : comparaison attendue (<=, >=, <, >, =)`);
  const g = evaluer(m[1]!.trim(), valeurs), d = evaluer(m[3]!.trim(), valeurs);
  const ok = m[2] === "<=" ? g <= d + 1e-12 : m[2] === ">=" ? g >= d - 1e-12 : m[2] === "<" ? g < d : m[2] === ">" ? g > d : Math.abs(g - d) <= 1e-12;
  return ok ? null : `${r.message} (${r.expression} : ${Math.round(g * 1e6) / 1e6} contre ${Math.round(d * 1e6) / 1e6})`;
}
