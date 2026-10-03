// Description de la machine qui exécute les mesures (partie « banc déclaré »).
import os from "node:os";
import { readFileSync } from "node:fs";

function lire(chemin) {
  try { return readFileSync(chemin, "utf8"); } catch { return null; }
}

export function decrireMachine() {
  const cpus = os.cpus();
  const ga = process.env.GITHUB_ACTIONS === "true";
  const proot = !!process.env.PROOT_TMP_DIR || /PRoot/i.test(os.release()) || !!lire("/proc/self/status")?.match(/^TracerPid:\s+[1-9]/m);
  return {
    lieu: ga ? "GitHub Actions" : "poste local",
    detailLieu: ga
      ? { runnerOs: process.env.RUNNER_OS ?? null, runnerArch: process.env.RUNNER_ARCH ?? null, runnerName: process.env.RUNNER_NAME ?? null, imageOs: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, workflow: process.env.GITHUB_WORKFLOW ?? null, runId: process.env.GITHUB_RUN_ID ?? null, sha: process.env.GITHUB_SHA ?? null }
      : { prootSoupconne: proot },
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpu: { modele: cpus[0]?.model ?? null, coeurs: cpus.length },
    memoireTotaleMo: Math.round(os.totalmem() / 2 ** 20),
    memoireLibreMo: Math.round(os.freemem() / 2 ** 20),
    node: process.version,
    v8: process.versions.v8,
    date: new Date().toISOString(),
  };
}
