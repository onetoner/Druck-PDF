// Gibt Blätter (sheet.js) als PDF und als Canvas aus und erzeugt daraus die Rasterdaten für den Thermodrucker.
import { PT } from './sheet.js';

const K = 72 / 25.4; // mm -> pt

// ---------------------------------------------------------------- Bilder laden
const cache = new Map();
function dataUrlBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function loadOne(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const bytes = url.startsWith('data:') ? dataUrlBytes(url) : new Uint8Array(await (await fetch(url)).arrayBuffer());
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    let img = null;
    if (typeof Image !== 'undefined') {
      img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Bild konnte nicht geladen werden')); img.src = url; });
    }
    return { bytes, png, img, w: img?.naturalWidth || 0, h: img?.naturalHeight || 0 };
  })();
  cache.set(url, p);
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}
/** images: {key: url|data-URL} -> {key: {bytes, png, img, w, h}}; fehlerhafte Bilder werden ausgelassen. */
export async function loadAssets(images) {
  const out = {};
  await Promise.all(Object.entries(images || {}).map(async ([key, url]) => {
    try { out[key] = await loadOne(url); } catch (e) { console.warn(key, e); }
  }));
  return out;
}

function contain(op, iw, ih) {
  const s = Math.min(op.w / iw, op.h / ih);
  const w = iw * s;
  const h = ih * s;
  const x = op.align === 'right' ? op.x + op.w - w : op.align === 'center' ? op.x + (op.w - w) / 2 : op.x;
  const y = op.valign === 'bottom' ? op.y + op.h - h : op.valign === 'middle' ? op.y + (op.h - h) / 2 : op.y;
  return { x, y, w, h };
}

// ---------------------------------------------------------------- PDF
export async function renderPdf(sheets, assets = {}, info = {}) {
  const { PDFDocument, StandardFonts, rgb } = globalThis.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(info.title || 'Dokument');
  pdf.setAuthor(info.author || '');
  pdf.setCreator('Zetteldruck');
  pdf.setProducer('Zetteldruck');
  const fonts = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const embedded = {};
  for (const sheet of sheets) {
    const H = sheet.height;
    const page = pdf.addPage([sheet.width * K, H * K]);
    for (const op of sheet.ops) {
      if (op.t === 'text') {
        const x = op.align === 'center' ? op.x - op.w / 2 : op.align === 'right' ? op.x - op.w : op.x;
        page.drawText(op.s, { x: x * K, y: (H - op.y) * K, size: op.size, font: op.bold ? fonts.b : fonts.r, color: op.color ? white : black });
      } else if (op.t === 'line') {
        page.drawLine({ start: { x: op.x1 * K, y: (H - op.y1) * K }, end: { x: op.x2 * K, y: (H - op.y2) * K }, thickness: op.w * K, color: black });
      } else if (op.t === 'rect') {
        const base = { x: op.x * K, y: (H - op.y - op.h) * K, width: op.w * K, height: op.h * K };
        if (op.fill) page.drawRectangle({ ...base, color: black });
        else page.drawRectangle({ ...base, borderColor: black, borderWidth: op.lw * K });
      } else if (op.t === 'circle') {
        const base = { x: op.cx * K, y: (H - op.cy) * K, size: op.r * K };
        if (op.fill) page.drawCircle({ ...base, color: black });
        else page.drawCircle({ ...base, borderColor: black, borderWidth: op.lw * K });
      } else if (op.t === 'image') {
        const a = assets[op.key];
        if (!a) continue;
        if (!embedded[op.key]) embedded[op.key] = a.png ? await pdf.embedPng(a.bytes) : await pdf.embedJpg(a.bytes);
        const im = embedded[op.key];
        const box = contain(op, im.width, im.height);
        page.drawImage(im, { x: box.x * K, y: (H - box.y - box.h) * K, width: box.w * K, height: box.h * K });
      }
    }
  }
  return pdf.save();
}

// ---------------------------------------------------------------- Canvas
const FONT = 'Helvetica, Arial, "Liberation Sans", Roboto, sans-serif';

/** Zeichnet ein Blatt mit pxPerMm Bildpunkten je Millimeter. Breite wird auf targetWidth (falls angegeben) festgelegt. */
export function renderCanvas(sheet, assets = {}, pxPerMm = 5, canvas = null, targetWidth = 0) {
  const c = canvas || document.createElement('canvas');
  const s = targetWidth ? targetWidth / sheet.width : pxPerMm;
  c.width = targetWidth || Math.round(sheet.width * s);
  c.height = Math.max(1, Math.round(sheet.height * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = 'alphabetic';
  for (const op of sheet.ops) {
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    if (op.t === 'text') {
      ctx.fillStyle = op.color ? '#fff' : '#000';
      ctx.font = `${op.bold ? 'bold ' : ''}${op.size * PT * s}px ${FONT}`;
      ctx.textAlign = op.align;
      // maxWidth staucht den Text, falls die Bildschirmschrift breiter läuft als die PDF-Schrift
      ctx.fillText(op.s, op.x * s, op.y * s, op.w * s * 1.01);
    } else if (op.t === 'line') {
      ctx.lineWidth = Math.max(1, op.w * s);
      ctx.beginPath();
      const off = ctx.lineWidth < 1.5 ? 0.5 : 0;
      ctx.moveTo(Math.round(op.x1 * s) + off, Math.round(op.y1 * s) + off);
      ctx.lineTo(Math.round(op.x2 * s) + off, Math.round(op.y2 * s) + off);
      ctx.stroke();
    } else if (op.t === 'rect') {
      if (op.fill) ctx.fillRect(op.x * s, op.y * s, op.w * s, op.h * s);
      else { ctx.lineWidth = Math.max(1, op.lw * s); ctx.strokeRect(op.x * s, op.y * s, op.w * s, op.h * s); }
    } else if (op.t === 'circle') {
      ctx.beginPath();
      ctx.arc(op.cx * s, op.cy * s, op.r * s, 0, Math.PI * 2);
      if (op.fill) ctx.fill();
      else { ctx.lineWidth = Math.max(1, op.lw * s); ctx.stroke(); }
    } else if (op.t === 'image') {
      const a = assets[op.key];
      if (!a?.img) continue;
      const box = contain(op, a.w, a.h);
      ctx.drawImage(a.img, box.x * s, box.y * s, box.w * s, box.h * s);
    }
  }
  return c;
}

// ---------------------------------------------------------------- Raster (1 Bit je Punkt)
/** rgba: Uint8ClampedArray (RGBA), liefert {width, height, bytesPerRow, data}; 1 = schwarz, höchstwertiges Bit links. */
export function toMono(rgba, width, height, threshold = 150) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4) {
      const a = rgba[p + 3] / 255;
      const lum = ((rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000) * a + 255 * (1 - a);
      if (lum < threshold) data[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, bytesPerRow, data };
}

export function canvasToMono(canvas, threshold = 150) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return toMono(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, threshold);
}

/**
 * Befehlsfolge für den Phomemo M832 (Bluetooth seriell).
 * Variante a: Folge des Herstellertreibers (Medium Endlos, Kompression aus, GS v 0, Vorschub).
 * Variante b: Minimalfolge (Deckelabfrage, ESC @, GS v 0).
 */
export function buildM832Job(mono, opts = {}) {
  const { variant = 'a', density = 0, feed = 3 } = opts;
  if (mono.height > 65535) throw new Error('Dokument ist zu lang für einen Druckauftrag.');
  if (mono.bytesPerRow > 65535 || mono.height < 1) throw new Error('Ungültige Rastergröße.');
  const head = [];
  if (variant === 'b') {
    head.push(0x1f, 0x11, 0x12, 0x1b, 0x40);
    if (density === 1 || density === 3) head.push(0x1b, 0x4e, 0x07, density === 1 ? 4 : 12);
  } else {
    head.push(0x1f, 0x11, 0x0b);
    if (density >= 1 && density <= 3) head.push(0x1f, 0x11, 0x02, [1, 2, 4][density - 1]);
    head.push(0x1f, 0x11, 0x35, 0x00);
  }
  head.push(0x1d, 0x76, 0x30, 0x00, mono.bytesPerRow & 0xff, mono.bytesPerRow >> 8, mono.height & 0xff, mono.height >> 8);
  const tail = [];
  const n = Math.max(0, Math.min(255, Math.round(feed)));
  if (n > 0) tail.push(0x1b, 0x64, n);
  if (variant !== 'b') tail.push(0x1f, 0x11, 0x11);
  const out = new Uint8Array(head.length + mono.data.length + tail.length);
  out.set(head, 0);
  out.set(mono.data, head.length);
  out.set(tail, head.length + mono.data.length);
  return out;
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
