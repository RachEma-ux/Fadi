/**
 * Démarrage de la langue de l'interface (D-163) : en anglais, le dictionnaire est chargé à la demande, puis la
 * traduction de l'affichage démarre avant le premier rendu (aucun texte français n'apparaît d'abord). Les boîtes
 * de dialogue du navigateur (alert, confirm, prompt) sont traduites de même.
 */
import { LANGUE } from "./index";

export async function demarrerLangue(): Promise<void> {
  document.documentElement.lang = LANGUE;
  if (LANGUE !== "en") return;
  const [{ Traducteur }, { demarrerTraductionDom }, dico] = await Promise.all([import("./traduire"), import("./dom"), import("./en.json")]);
  const t = new Traducteur((dico as { default: Record<string, string> }).default);
  demarrerTraductionDom(t, document.body);
  const { alert: a, confirm: c, prompt: p } = window;
  window.alert = (m?: unknown) => a.call(window, typeof m === "string" ? t.traduire(m) : m);
  window.confirm = (m?: string) => c.call(window, typeof m === "string" ? t.traduire(m) : m);
  window.prompt = (m?: string, d?: string) => p.call(window, typeof m === "string" ? t.traduire(m) : m, d);
}
