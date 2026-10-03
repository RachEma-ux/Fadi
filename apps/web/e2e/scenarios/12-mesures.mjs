/**
 * Scénario de bout en bout · 12-mesures — Mesures : contrôle final « aucune erreur JavaScript » et impression des mesures indicatives.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** Fin : aucune erreur JavaScript, mesures indicatives. */
export async function bilan(sc) {
  const { consoleErrors, check, measures } = sc;
  check("aucune erreur JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
  console.log(`⏱ mesures indicatives (Chromium headless, cette machine) : ${measures.map((m) => `${m.label} = ${m.ms} ms`).join(" ; ")}`);
}
