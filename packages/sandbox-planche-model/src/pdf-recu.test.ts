import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { versPlan } from "./fonds.js";
import { modeleVide } from "./geometrie-libre.js";
import { MM_PAR_POINT, accrocherPdf, arcDeBezier, echelleDeLaBarre, echellesDuTexte, estCercleComplet, insererPagePdf, lirePdfRecu, lirePdfRecuAsync, mesurePdf, poseImagePdf, type PagePdf } from "./pdf-recu.js";

const inflate = (o: Uint8Array): Uint8Array | null => {
  try {
    return new Uint8Array(inflateSync(o));
  } catch {
    return null;
  }
};
const octets = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const latin = (o: Uint8Array) => String.fromCharCode(...o);

/** PDF minimal : catalogue, pages, une page par contenu ; `compresser` passe les contenus en FlateDecode. */
function pdf(pages: readonly { contenu: string; mediaBox?: string; rotate?: number; ressources?: string }[], o: { compresser?: boolean; extra?: string[] } = {}): Uint8Array {
  const objets: string[] = [];
  const kids: string[] = [];
  objets[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  let n = 3;
  const extra = o.extra ?? [];
  const base = 3 + pages.length * 2;
  extra.forEach((e, i) => (objets[base + i] = e));
  for (const p of pages) {
    const page = n++;
    const flux = n++;
    kids.push(`${page} 0 R`);
    const data = o.compresser ? latin(new Uint8Array(deflateSync(Buffer.from(p.contenu, "latin1")))) : p.contenu;
    objets[page] = `<< /Type /Page /Parent 2 0 R /MediaBox ${p.mediaBox ?? "[0 0 595.276 841.89]"}${p.rotate ? ` /Rotate ${p.rotate}` : ""} /Contents ${flux} 0 R${p.ressources ? ` /Resources ${p.ressources}` : ""} >>`;
    objets[flux] = `<< /Length ${data.length}${o.compresser ? " /Filter /FlateDecode" : ""} >>\nstream\n${data}\nendstream`;
  }
  objets[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let s = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  for (let i = 1; i < objets.length; i++) if (objets[i] !== undefined) s += `${i} 0 obj\n${objets[i]}\nendobj\n`;
  s += "trailer\n<< /Root 1 0 R >>\n%%EOF\n";
  return octets(s);
}
const lire = (o: Uint8Array): readonly PagePdf[] => {
  const r = lirePdfRecu(o, inflate);
  if (!r.ok) throw new Error(r.erreur);
  return r.pages;
};
const mm = (pt: number) => pt * MM_PAR_POINT;
// Cercle en quatre Bézier (k = 0,5523), centre (cx ; cy), rayon r, en points.
const cerclePt = (cx: number, cy: number, r: number) => {
  const k = 0.5522847498 * r;
  return `${cx + r} ${cy} m ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c S`;
};

describe("Lecture d'un PDF reçu", () => {
  it("traits peints en segments (mm papier), aplats comptés et non repris, rectangle et fermeture ; contenu compressé", () => {
    const contenu = "0.5 w 72 72 m 144 72 l S\n10 10 100 50 re f\n200 200 100 100 re S\n300 300 m 350 300 l 350 350 l h S\n10 10 m 20 20 l n";
    for (const compresser of [false, true]) {
      const [p] = lire(pdf([{ contenu }], { compresser }));
      expect(p!.largeur).toBeCloseTo(210, 1);
      expect(p!.hauteur).toBeCloseTo(297, 1);
      expect(p!.traits).toHaveLength(1 + 4 + 3);
      expect(p!.traits[0]!.a.x).toBeCloseTo(25.4, 6);
      expect(p!.traits[0]!.b.x).toBeCloseTo(50.8, 6);
      expect(p!.aplats).toBe(1);
    }
  });

  it("découpe (W n) : tracé hors du rectangle écarté, tracé à cheval coupé, restaurée par Q ; autre forme non lue", () => {
    const k = MM_PAR_POINT;
    const [dehors] = lire(pdf([{ contenu: "0 0 10 10 re W n 20 20 m 30 20 l S" }]));
    expect(dehors!.traits).toEqual([]);
    expect(dehors!.nonLus).toBe(0);
    const [cheval] = lire(pdf([{ contenu: "q 0 0 10 10 re W n 5 5 m 30 5 l S Q 20 20 m 30 20 l S" }]));
    expect(cheval!.traits).toHaveLength(2);
    expect(cheval!.traits[0]!.a.x).toBeCloseTo(5 * k, 6);
    expect(cheval!.traits[0]!.b.x).toBeCloseTo(10 * k, 6);
    expect(cheval!.traits[1]!.a.x).toBeCloseTo(20 * k, 6);
    const [triangle] = lire(pdf([{ contenu: "0 0 m 10 0 l 0 10 l h W n 1 1 m 2 1 l S" }]));
    expect(triangle!.traits).toEqual([]);
    expect(triangle!.nonLus).toBe(1);
  });

  it("matrices (cm, q/Q), formulaires (XObject Form avec /Matrix) et rotation de la page", () => {
    const form = "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [1 0 0 1 10 0] /Length 13 >>\nstream\n0 0 m 10 0 l S\nendstream";
    const ress = `<< /XObject << /F1 ${3 + 2} 0 R >> >>`;
    const [p] = lire(pdf([{ contenu: "q 2 0 0 2 100 100 cm 0 0 m 10 0 l S Q 0 0 m 0 10 l S q 1 0 0 1 0 50 cm /F1 Do Q", ressources: ress }], { extra: [form] }));
    const t = p!.traits.map((x) => [mm(0) + x.a.x, x.a.y, x.b.x, x.b.y].map((v) => Math.round(v / MM_PAR_POINT)));
    expect(t).toEqual([
      [100, 100, 120, 100],
      [0, 0, 0, 10],
      [10, 50, 20, 50],
    ]);
    // Page tournée de 90° : affichée en paysage, le point (0 ; 0) passe en haut à gauche.
    const [r] = lire(pdf([{ contenu: "0 0 m 100 0 l S", rotate: 90 }]));
    expect(r!.largeur).toBeCloseTo(297, 1);
    expect(r!.traits[0]!.a.x).toBeCloseTo(0, 6);
    expect(r!.traits[0]!.a.y).toBeCloseTo(210, 1);
    expect(r!.traits[0]!.b.y).toBeCloseTo(210 - mm(100), 3);
  });

  it("arcs reconstruits : cercle en quatre Bézier réuni en un cercle, quart d'arc, courbe libre posée en segments", () => {
    const [p] = lire(pdf([{ contenu: `${cerclePt(300, 300, 50)}\n100 100 m 100 127.614 122.386 150 150 150 c S\n0 0 m 50 100 100 -100 150 0 c S\n0 0 m 10 0 20 0 30 0 c S` }]));
    expect(p!.arcs).toHaveLength(2);
    const cercle = p!.arcs.find(estCercleComplet)!;
    expect(cercle.rayon).toBeCloseTo(mm(50), 2);
    expect(cercle.centre.x).toBeCloseTo(mm(300), 2);
    const quart = p!.arcs.find((a) => !estCercleComplet(a))!;
    expect(Math.abs(quart.angle)).toBeCloseTo(Math.PI / 2, 2);
    expect(quart.angle).toBeLessThan(0);
    expect(p!.courbesEnSegments).toBe(1);
    // La courbe alignée est un seul trait ; la courbe libre, plusieurs.
    expect(p!.traits.length).toBeGreaterThan(4);
    expect(arcDeBezier([{ x: 0, y: 0 }, { x: 5, y: 20 }, { x: 15, y: -20 }, { x: 20, y: 0 }])).toBeNull();
    // Coordonnées arrondies dans le fichier (deux décimales) : le cercle reste un cercle complet.
    const arrondi = cerclePt(300.123, 300.456, 50.789).replace(/-?\d+\.\d+/g, (v) => Number(v).toFixed(2));
    const [q] = lire(pdf([{ contenu: arrondi }]));
    expect(q!.arcs).toHaveLength(1);
    expect(estCercleComplet(q!.arcs[0]!)).toBe(true);
  });

  it("textes relevés, échelle proposée d'après le texte ; barre d'échelle ; refus : signature, chiffré, sans page", () => {
    const [p] = lire(pdf([{ contenu: "BT /F1 10 Tf 10 10 Td (ECHELLE 1:100) Tj ET BT [(Plan ) -300 (1/50)] TJ ET BT (1:100) Tj (Indice 2/3) Tj ET" }]));
    expect(p!.textes).toContain("ECHELLE 1:100");
    expect(echellesDuTexte(p!.textes)).toEqual([
      { echelle: 100, texte: "ECHELLE 1:100" },
      { echelle: 50, texte: "Plan  1/50" },
    ]);
    expect(echellesDuTexte(["Échelle 1 : 1 000", "1:2,5", "11:30"])).toEqual([{ echelle: 1000, texte: "Échelle 1 : 1 000" }]);
    expect(echelleDeLaBarre(50, 5)).toBeCloseTo(100, 9);
    expect(echelleDeLaBarre(0, 5)).toBeNull();
    expect(mesurePdf({ x: 0, y: 0 }, { x: 123.1, y: 0 }, 100)).toBeCloseTo(12.31, 9);
    expect(lirePdfRecu(octets("bonjour"), inflate)).toEqual({ ok: false, erreur: "signature" });
    expect(lirePdfRecu(octets("%PDF-1.7\ntrailer << /Encrypt 5 0 R /Root 1 0 R >>"), inflate)).toEqual({ ok: false, erreur: "chiffre" });
    expect(lirePdfRecu(octets("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj"), inflate)).toEqual({ ok: false, erreur: "pages" });
  });

  it("flux d'objets (PDF 1.5) : pages rangées dans un ObjStm compressé", () => {
    const contenu = "0 0 m 72 0 l S";
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 5 0 R >>"];
    let pos = 0;
    const entete = objs.map((o, i) => { const e = `${i + 1} ${pos}`; pos += o.length + 1; return e; }).join(" ") + " ";
    const dans = entete + objs.join(" ");
    const z = latin(new Uint8Array(deflateSync(Buffer.from(dans, "latin1"))));
    const s = `%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /N 3 /First ${entete.length} /Filter /FlateDecode /Length ${z.length} >>\nstream\n${z}\nendstream\nendobj\n5 0 obj\n<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream\nendobj\n%%EOF\n`;
    const [p] = lire(octets(s));
    expect(p!.largeur).toBeCloseTo(mm(200), 6);
    expect(p!.traits).toHaveLength(1);
  });

  it("image de page scannée (JPEG) : relevée avec sa matrice, posée en fond à l'échelle de la page", () => {
    const jpeg = "\xff\xd8\xff\xe0JFIF\xff\xd9";
    const img = `<< /Type /XObject /Subtype /Image /Width 400 /Height 200 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`;
    const [p] = lire(pdf([{ contenu: "q 400 0 0 200 72 72 cm /Im0 Do Q", ressources: "<< /XObject << /Im0 5 0 R >> >>" }], { extra: [img] }));
    expect(p!.images).toHaveLength(1);
    const im = p!.images[0]!;
    expect(im.format).toBe("jpeg");
    expect(latin(im.octets)).toBe(jpeg);
    const r = poseImagePdf(im, 100, 0, 0);
    if (!("pose" in r)) throw new Error(r.erreur);
    // Pixel (0 ; 0) = coin haut gauche de l'image : (72 ; 272) points ; pixel (400 ; 200) = (472 ; 72).
    const k = (MM_PAR_POINT * 100) / 1000;
    const hg = versPlan(r.pose, { u: 0, v: 0 });
    const bd = versPlan(r.pose, { u: 400, v: 200 });
    expect(hg.x).toBeCloseTo(72 * k, 6);
    expect(hg.y).toBeCloseTo(272 * k, 6);
    expect(bd.x).toBeCloseTo(472 * k, 6);
    expect(bd.y).toBeCloseTo(72 * k, 6);
    expect(poseImagePdf({ ...im, matrice: [400, 0, 0, -200, 0, 0] }, 100, 0, 0)).toEqual({ erreur: "cisaillement" });
  });
});

describe("Insertion d'une page", () => {
  it("à l'échelle confirmée : arêtes et arcs dans un groupe décrit ; échelle absente, page vide ou trop lourde refusées", () => {
    const [p] = lire(pdf([{ contenu: `0 0 m 72 0 l S ${cerclePt(300, 300, 50)} 100 100 m 100 127.614 122.386 150 150 150 c S` }]));
    const r = insererPagePdf(modeleVide(), p!, { echelle: 100, x: 1, y: 2, altitude: 3, nom: "plan.pdf · p. 1", description: "PDF reçu" });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.traits).toBe(1);
    expect(r.arcs).toBe(2);
    const d = r.modele.definitions[r.modele.racine.occurrences[r.occurrence]!.definition];
    expect(d?.nom).toBe("plan.pdf · p. 1");
    expect(d?.description).toBe("PDF reçu");
    const zs = new Set(Object.values(d!.contenu.sommets).map((s) => s.position.z));
    expect([...zs]).toEqual([3]);
    const xs = Object.values(d!.contenu.sommets).map((s) => s.position.x);
    // 72 pt = 25,4 mm à 1:100 = 2,54 m, depuis X = 1.
    expect(xs.some((x) => Math.abs(x - 3.54) < 1e-9)).toBe(true);
    expect(Object.keys(d!.contenu.courbes)).toHaveLength(2);
    expect(insererPagePdf(modeleVide(), p!, { echelle: 0, x: 0, y: 0, altitude: 0, nom: "", description: "" })).toEqual({ ok: false, erreur: "echelle" });
    expect(insererPagePdf(modeleVide(), { ...p!, traits: [], arcs: [] }, { echelle: 100, x: 0, y: 0, altitude: 0, nom: "", description: "" })).toEqual({ ok: false, erreur: "vide" });
    expect(insererPagePdf(modeleVide(), { ...p!, tropDeTraits: true }, { echelle: 100, x: 0, y: 0, altitude: 0, nom: "", description: "" })).toEqual({ ok: false, erreur: "limite" });
  });

  it("mesure accrochée aux extrémités des traits et des arcs", () => {
    const [p] = lire(pdf([{ contenu: "0 0 m 72 0 l S" }]));
    expect(accrocherPdf(p!, { x: 25.3, y: 0.2 }, 1)).toEqual({ point: { x: 25.4, y: 0 }, accroche: true });
    expect(accrocherPdf(p!, { x: 12, y: 5 }, 1)).toEqual({ point: { x: 12, y: 5 }, accroche: false });
  });
});

describe("PDF reçu : décompression des navigateurs (décision « 3 A »)", () => {
  it("lirePdfRecuAsync lit un PDF compressé sans décompression fournie, comme la lecture avec zlib", async () => {
    const fichier = pdf([{ contenu: "0 0 m 100 0 l 100 100 l S" }], { compresser: true });
    const attendu = lirePdfRecu(fichier, inflate);
    const lu = await lirePdfRecuAsync(fichier);
    expect(lu).toEqual(attendu);
    expect(lu.ok).toBe(true);
    // Sans décompression, la lecture synchrone ne voit aucun trait.
    const sans = lirePdfRecu(fichier);
    expect(sans.ok && sans.pages[0]!.traits.length).toBe(0);
    expect(lu.ok && lu.pages[0]!.traits.length).toBeGreaterThan(0);
  });
});
