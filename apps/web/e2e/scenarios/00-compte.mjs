/**
 * Scénario de bout en bout · 00-compte — Compte : inscription du compte du scénario. Aucun contrôle aujourd'hui (l'inscription est un prérequis de tous les autres fichiers).
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** Inscription du compte du scénario (session partagée par tous les segments). */
export async function inscription(sc) {
  const { BASE, page } = sc;
  const email = `scenario-${Date.now()}@example.com`;
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "scenario-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  Object.assign(sc, { email });
}
