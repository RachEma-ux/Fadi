/**
 * Composition de l'image PNG d'un export autorisé (D-GD-07, plan GD-09) : la carte telle qu'affichée, son titre, la date,
 * une barre d'échelle, la légende de chaque couche visible et TOUTES les attributions rendues par le serveur. Appelée
 * seulement après le verdict « autorisé » du serveur ; rien n'est omis silencieusement.
 */
import { formatNombre, type EntreeLegende } from "@parcours/geodata-model";

export interface LegendeExport { readonly titre: string; readonly entrees: readonly EntreeLegende[] | null; readonly couleur?: string }

export async function composerPng(p: { carte: HTMLCanvasElement; titre: string; date: Date; metresParPixel: number; legendes: readonly LegendeExport[]; attributions: readonly string[]; revision: number }): Promise<Blob> {
  const ratio = p.carte.width / Math.max(1, p.carte.clientWidth || p.carte.width);
  const largeurLegende = 300 * ratio;
  // Attributions repliées sur la largeur de l'image, jamais tronquées (concept § 6.4).
  const mesure = document.createElement("canvas").getContext("2d")!;
  mesure.font = `${11 * ratio}px system-ui, sans-serif`;
  const largeurUtile = p.carte.width + largeurLegende - 28 * ratio;
  const lignesAttribution = p.attributions.flatMap((a) => {
    const lignes: string[] = [];
    let ligne = "";
    for (const m of a.split(" ")) {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (mesure.measureText(essai).width > largeurUtile && ligne) { lignes.push(ligne); ligne = m; } else ligne = essai;
    }
    return ligne ? [...lignes, ligne] : lignes;
  });
  const bas = (64 + 18 * Math.max(1, lignesAttribution.length)) * ratio;
  const c = document.createElement("canvas");
  c.width = p.carte.width + largeurLegende;
  c.height = Math.max(p.carte.height, 120 * ratio) + bas;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(p.carte, 0, 0);
  const t = (taille: number, gras = false) => { g.font = `${gras ? "600 " : ""}${taille * ratio}px system-ui, sans-serif`; };
  g.fillStyle = "#173b43";
  let y = 24 * ratio;
  const x0 = p.carte.width + 14 * ratio;
  t(15, true);
  g.fillText(p.titre.slice(0, 40), x0, y);
  y += 20 * ratio;
  t(11);
  g.fillText(`Révision ${p.revision} · ${p.date.toISOString().slice(0, 16).replace("T", " ")} UTC`, x0, y);
  y += 22 * ratio;
  for (const l of p.legendes) {
    t(12, true);
    g.fillStyle = "#173b43";
    // Titre replié sur la largeur de la colonne, jamais tronqué.
    let ligne = "";
    for (const m of l.titre.split(" ")) {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (g.measureText(essai).width > largeurLegende - 24 * ratio && ligne) { g.fillText(ligne, x0, y); y += 15 * ratio; ligne = m; }
      else ligne = essai;
    }
    g.fillText(ligne, x0, y);
    y += 16 * ratio;
    const entrees = l.entrees ?? [{ classe: 0, couleur: l.couleur ?? "#2b8cbe", libelle: "Objets de la couche", effectif: 0 }];
    for (const e of entrees) {
      g.fillStyle = e.couleur;
      g.fillRect(x0, y - 10 * ratio, 14 * ratio, 12 * ratio);
      if (e.classe === "absente") {
        // Valeur absente : hachures en plus de la couleur (la couleur n'est pas le seul signe).
        g.save();
        g.beginPath();
        g.rect(x0, y - 10 * ratio, 14 * ratio, 12 * ratio);
        g.clip();
        g.strokeStyle = "#464646";
        g.lineWidth = ratio;
        for (let k = -12; k <= 14; k += 4) { g.beginPath(); g.moveTo(x0 + k * ratio, y + 2 * ratio); g.lineTo(x0 + (k + 12) * ratio, y - 10 * ratio); g.stroke(); }
        g.restore();
      }
      g.fillStyle = "#173b43";
      t(11);
      g.fillText(`${e.libelle}${l.entrees ? ` (${e.effectif})` : ""}`.slice(0, 44), x0 + 20 * ratio, y);
      y += 15 * ratio;
    }
    y += 8 * ratio;
  }
  // Barre d'échelle : longueur ronde la plus proche de 120 px.
  const cible = 120 * p.metresParPixel;
  const puissance = 10 ** Math.floor(Math.log10(cible));
  const ronde = [1, 2, 5, 10].map((k) => k * puissance).filter((v) => v <= cible).pop() ?? puissance;
  const px = (ronde / p.metresParPixel) * ratio;
  const yb = Math.max(p.carte.height, 120 * ratio) + 22 * ratio;
  g.fillStyle = "#173b43";
  g.fillRect(14 * ratio, yb, px, 4 * ratio);
  t(11);
  g.fillText(ronde >= 1000 ? `${formatNombre(ronde / 1000, 0)} km (échelle au centre)` : `${formatNombre(ronde, 0)} m (échelle au centre)`, 14 * ratio + px + 8 * ratio, yb + 5 * ratio);
  let ya = yb + 26 * ratio;
  for (const a of lignesAttribution) { g.fillText(a, 14 * ratio, ya); ya += 18 * ratio; }
  return new Promise((resoudre, rejeter) => c.toBlob((b) => (b ? resoudre(b) : rejeter(new Error("Capture de la carte refusée par le navigateur."))), "image/png"));
}

export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
