/**
 * Composition de l'image PNG d'un export autorisé (D-GD-07, plan GD-09) : la carte telle qu'affichée, son titre, la date,
 * une barre d'échelle, la légende de chaque couche visible et TOUTES les attributions rendues par le serveur. Appelée
 * seulement après le verdict « autorisé » du serveur ; rien n'est omis silencieusement.
 */
import { formatNombre, type EntreeLegende } from "@parcours/geodata-model";

export interface LegendeExport { readonly titre: string; readonly entrees: readonly EntreeLegende[] | null; readonly couleur?: string; /** Entrées sans effectif (une couleur par entité). */ readonly sansEffectif?: boolean }

export async function composerPng(p: { carte: HTMLCanvasElement; titre: string; date: Date; metresParPixel: number; legendes: readonly LegendeExport[]; attributions: readonly string[]; revision: number; /** Mini-carte de situation (lot G), en encart en bas à gauche de la carte. */ miniCarte?: HTMLCanvasElement | null }): Promise<Blob> {
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
  // Hauteur de la légende mesurée AVANT d'allouer l'image : aucune entrée ne sort du canevas (20 couches possibles).
  mesure.font = `600 ${12 * ratio}px system-ui, sans-serif`;
  const lignesTitre = (titre: string) => {
    let n = 1;
    let ligne = "";
    for (const m of titre.split(" ")) {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (mesure.measureText(essai).width > largeurLegende - 24 * ratio && ligne) { n++; ligne = m; } else ligne = essai;
    }
    return n;
  };
  const hauteurLegende = (66 + p.legendes.reduce((h, l) => h + 15 * (lignesTitre(l.titre) - 1) + 16 + 15 * (l.entrees?.length ?? 1) + 8, 0)) * ratio;
  const hauteurHaut = Math.max(p.carte.height, 120 * ratio, hauteurLegende);
  const c = document.createElement("canvas");
  c.width = p.carte.width + largeurLegende;
  c.height = hauteurHaut + bas;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(p.carte, 0, 0);
  if (p.miniCarte && p.miniCarte.width > 0) {
    // Encart de situation : même proportion que la mini-carte affichée, cadre blanc puis trait foncé.
    const lm = Math.min(200 * ratio, p.carte.width / 3);
    const hm = lm * (p.miniCarte.height / p.miniCarte.width);
    const xm = 10 * ratio, ym = p.carte.height - hm - 10 * ratio;
    g.fillStyle = "#ffffff";
    g.fillRect(xm - 3 * ratio, ym - 3 * ratio, lm + 6 * ratio, hm + 6 * ratio);
    g.drawImage(p.miniCarte, xm, ym, lm, hm);
    g.strokeStyle = "#29434a";
    g.lineWidth = ratio;
    g.strokeRect(xm, ym, lm, hm);
  }
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
      // Ligne de reste (« … et N autres entités ») : sans pastille.
      if (e.couleur) {
        g.fillStyle = e.couleur;
        g.fillRect(x0, y - 10 * ratio, 14 * ratio, 12 * ratio);
      }
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
      g.fillText(`${e.libelle}${l.entrees && !l.sansEffectif ? ` (${e.effectif})` : ""}`.slice(0, 44), e.couleur ? x0 + 20 * ratio : x0, y);
      y += 15 * ratio;
    }
    y += 8 * ratio;
  }
  // Barre d'échelle : longueur ronde la plus proche de 120 px.
  const cible = 120 * p.metresParPixel;
  const puissance = 10 ** Math.floor(Math.log10(cible));
  const ronde = [1, 2, 5, 10].map((k) => k * puissance).filter((v) => v <= cible).pop() ?? puissance;
  const px = (ronde / p.metresParPixel) * ratio;
  const yb = hauteurHaut + 22 * ratio;
  g.fillStyle = "#173b43";
  g.fillRect(14 * ratio, yb, px, 4 * ratio);
  t(11);
  g.fillText(ronde >= 1000 ? `${formatNombre(ronde / 1000, 0)} km (échelle au centre)` : `${formatNombre(ronde, 0)} m (échelle au centre)`, 14 * ratio + px + 8 * ratio, yb + 5 * ratio);
  let ya = yb + 26 * ratio;
  for (const a of lignesAttribution) { g.fillText(a, 14 * ratio, ya); ya += 18 * ratio; }
  return new Promise((resoudre, rejeter) => c.toBlob((b) => (b ? resoudre(b) : rejeter(new Error("Capture de la carte refusée par le navigateur."))), "image/png"));
}

/**
 * Impression directe (lot G, D-GD-27) : la fenêtre est ouverte AU CLIC (sinon le navigateur la bloque), avec un avis
 * d'attente ; l'image autorisée y est posée ensuite, puis la boîte d'impression s'ouvre. Renvoie null si la fenêtre est
 * bloquée.
 */
export function ouvrirFenetreImpression(titre: string): { poser(png: Blob): void; erreur(message: string): void } | null {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return null;
  // Langue de la page (posée par l'interface bilingue) : la fenêtre d'impression est hors de sa traduction automatique.
  const LANGUE = document.documentElement.lang.startsWith("en") ? "en" : "fr";
  const echapper = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html lang="${LANGUE}"><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>body{margin:0;font:14px system-ui,sans-serif;color:#173b43}p{margin:24px}img{display:block;max-width:100%;height:auto;margin:0 auto}@page{size:landscape;margin:10mm}</style></head><body><p id="etat">${LANGUE === "en" ? "Preparing to print…" : "Préparation de l'impression…"}</p></body></html>`);
  w.document.close();
  return {
    poser(png) {
      const url = URL.createObjectURL(png);
      const img = w.document.createElement("img");
      img.alt = titre;
      img.onload = () => { w.document.getElementById("etat")?.remove(); w.focus(); w.print(); setTimeout(() => URL.revokeObjectURL(url), 60_000); };
      img.src = url;
      w.document.body.appendChild(img);
    },
    erreur(message) {
      const e = w.document.getElementById("etat");
      if (e) e.textContent = message;
    },
  };
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
