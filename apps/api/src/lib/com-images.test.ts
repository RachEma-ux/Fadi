import { describe, expect, it } from "vitest";
import { nettoyerPhoto, PhotoRefusee, positionValide, typeDePhoto } from "./com-images.js";

const seg = (marqueur: number, corps: Buffer) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marqueur; h.writeUInt16BE(corps.length + 2, 2); return Buffer.concat([h, corps]); };
const sof = (w: number, h: number) => { const c = Buffer.alloc(15); c[0] = 8; c.writeUInt16BE(h, 1); c.writeUInt16BE(w, 3); c[5] = 3; return seg(0xc0, c); };
const GPS = Buffer.from("Exif\0\0GPSLatitude 48.8566 GPSLongitude 2.3522", "latin1");
function jpeg(w = 800, h = 600, extra: Buffer[] = []): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01", "latin1")), seg(0xe1, GPS), seg(0xe2, Buffer.from("XMPdata", "latin1")),
    seg(0xfe, Buffer.from("commentaire privé", "utf8")), ...extra, sof(w, h), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]), Buffer.from([0xff, 0xd9]),
  ]);
}
function chunk(type: string, data: Buffer): Buffer { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); return Buffer.concat([l, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); }
function png(w = 640, h = 480): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("tEXt", Buffer.from("Comment\0GPS 48.85,2.35", "latin1")), chunk("eXIf", GPS), chunk("IDAT", Buffer.from([1, 2, 3])), chunk("IEND", Buffer.alloc(0))]);
}

describe("photos COM : type par signature, dimensions, métadonnées retirées (COM-D15, COM-D16)", () => {
  it("type reconnu par la signature seulement", () => {
    expect(typeDePhoto(jpeg())).toBe("image/jpeg");
    expect(typeDePhoto(png())).toBe("image/png");
    expect(typeDePhoto(Buffer.from("GIF89a"))).toBeNull();
    expect(() => nettoyerPhoto(Buffer.from("<svg></svg>"))).toThrow(PhotoRefusee);
  });
  it("JPEG : EXIF, XMP et commentaire retirés, JFIF, trame et données gardées", () => {
    const r = nettoyerPhoto(jpeg(800, 600));
    expect(r).toMatchObject({ mime: "image/jpeg", width: 800, height: 600 });
    const s = r.content.toString("latin1");
    expect(s).not.toContain("GPSLatitude");
    expect(s).not.toContain("XMPdata");
    expect(s).toContain("JFIF");
    expect(r.content.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(r.content.includes(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]))).toBe(true);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("JPEG : métadonnées entre deux balayages et octets après EOI retirés ; données bourrées et RST gardées", () => {
    const sos = seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const donnees1 = Buffer.from([0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]);
    const progressif = Buffer.concat([
      Buffer.from([0xff, 0xd8]), sof(320, 240), sos, donnees1, seg(0xe1, GPS), seg(0xfe, Buffer.from("note", "latin1")), seg(0xc4, Buffer.from([0, 1, 2])),
      sos, Buffer.from([0x44, 0x55]), Buffer.from([0xff, 0xd9]), Buffer.from("APRES-EOI GPSLatitude 48.85", "latin1"),
    ]);
    const r = nettoyerPhoto(progressif);
    const t = r.content.toString("latin1");
    expect(t).not.toContain("GPSLatitude");
    expect(t).not.toContain("APRES-EOI");
    expect(t).not.toContain("note");
    expect(r.content.includes(donnees1)).toBe(true);
    expect(r.content.includes(Buffer.from([0xff, 0xc4]))).toBe(true);
    expect(r.content.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(() => nettoyerPhoto(progressif.subarray(0, progressif.indexOf(Buffer.from([0xff, 0xd9]))))).toThrow(PhotoRefusee);
  });
  it("PNG : tEXt et eXIf retirés, IHDR, IDAT et IEND gardés", () => {
    const r = nettoyerPhoto(png(640, 480));
    expect(r).toMatchObject({ mime: "image/png", width: 640, height: 480 });
    const s = r.content.toString("latin1");
    expect(s).not.toContain("GPS");
    expect(s).toContain("IHDR");
    expect(s).toContain("IDAT");
    expect(s).toContain("IEND");
  });
  it("au-delà de 2 560 px : 422 ; au-delà de 2 Mo : 413 ; vide ou tronqué : 422", () => {
    const grand = (() => { try { nettoyerPhoto(jpeg(3000, 2000)); return null; } catch (e) { return e as PhotoRefusee; } })();
    expect(grand?.status).toBe(422);
    expect(grand?.code).toBe("photo_trop_grande");
    const lourd = (() => { try { nettoyerPhoto(jpeg(100, 100, [seg(0xe0, Buffer.alloc(60000))].concat(Array.from({ length: 40 }, () => seg(0xdb, Buffer.alloc(60000)))))); return null; } catch (e) { return e as PhotoRefusee; } })();
    expect(lourd?.status).toBe(413);
    expect(() => nettoyerPhoto(Buffer.alloc(0))).toThrow(PhotoRefusee);
    expect(() => nettoyerPhoto(jpeg().subarray(0, 30))).toThrow(PhotoRefusee);
  });
  it("position déclarée : WGS84 borné, précision positive", () => {
    expect(positionValide({ lat: 48.85, lon: 2.35, precisionM: 12 })).toBe(true);
    expect(positionValide({ lat: 91, lon: 0 })).toBe(false);
    expect(positionValide({ lat: 0, lon: 181 })).toBe(false);
    expect(positionValide({ lat: 0, lon: 0, precisionM: -1 })).toBe(false);
    expect(positionValide({ lat: Number.NaN, lon: 0 })).toBe(false);
  });
});
