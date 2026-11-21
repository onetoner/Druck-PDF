// Ein "Blatt" ist eine Liste von Zeichenbefehlen in Millimetern (Ursprung oben links).
// Dieselbe Liste wird als PDF (pdf.js) und als Bild (canvas.js: Vorschau + Thermodruck) ausgegeben.
import { WIDTHS } from './metrics-data.js';

export const PT = 25.4 / 72; // 1 pt in mm

/** Ersetzt Zeichen, die die PDF-Standardschrift (WinAnsi) nicht kennt. */
export function clean(str) {
  let out = '';
  for (const ch of String(str ?? '')) {
    if (ch === '\n' || ch === '\t' || ch === '\r') { out += ' '; continue; }
    if (WIDTHS.r[ch] !== undefined) { out += ch; continue; }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (base && [...base].every((c) => WIDTHS.r[c] !== undefined)) out += base;
    else if (ch === '→' || ch === '➤') out += '>';
    else if (ch === '✓' || ch === '✔') out += 'x';
    else if (ch === ' ' || ch === ' ' || ch === ' ') out += ' ';
    else out += '?';
  }
  return out;
}

/** Textbreite in mm (Helvetica-Metrik, Schriftgröße in pt). */
export function textWidth(str, size, bold = false) {
  const table = bold ? WIDTHS.b : WIDTHS.r;
  let units = 0;
  for (const ch of clean(str)) units += table[ch] ?? 556;
  return (units / 1000) * size * PT;
}

/** Bricht Text auf eine maximale Breite (mm) um. Zeilenumbrüche im Text bleiben erhalten. */
export function wrap(str, maxW, size, bold = false) {
  const lines = [];
  for (const para of String(str ?? '').split(/\r?\n/)) {
    const words = clean(para).split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (let word of words) {
      // überlange Wörter hart teilen
      while (textWidth(word, size, bold) > maxW && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && textWidth(word.slice(0, n), size, bold) > maxW) n--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(word.slice(0, n));
        word = word.slice(n);
      }
      const probe = cur ? `${cur} ${word}` : word;
      if (textWidth(probe, size, bold) <= maxW) cur = probe;
      else { if (cur) lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Verkleinert die Schrift bis minSize, danach wird mit "…" gekürzt. */
export function fit(str, maxW, size, bold = false, minSize = size * 0.7) {
  let s = size;
  let text = clean(str);
  while (s > minSize && textWidth(text, s, bold) > maxW) s -= 0.25;
  if (textWidth(text, s, bold) > maxW) {
    while (text.length > 1 && textWidth(`${text}…`, s, bold) > maxW) text = text.slice(0, -1);
    text = `${text.trimEnd()}…`;
  }
  return { text, size: s };
}

export class Sheet {
  constructor(width = 210, height = 297) {
    this.width = width;
    this.height = height;
    this.ops = [];
  }

  /** y ist die Grundlinie. opts: size (pt), bold, align (left|center|right), color (0=schwarz, 1=weiß), spacing (mm Sperrung) */
  text(x, y, str, opts = {}) {
    const s = clean(str);
    if (!s) return 0;
    const size = opts.size ?? 10;
    const bold = !!opts.bold;
    if (opts.spacing) {
      // gesperrter Text: Zeichen einzeln setzen
      let cx = x;
      const total = [...s].reduce((sum, ch) => sum + textWidth(ch, size, bold) + opts.spacing, -opts.spacing);
      if (opts.align === 'center') cx = x - total / 2;
      else if (opts.align === 'right') cx = x - total;
      for (const ch of s) {
        this.ops.push({ t: 'text', x: cx, y, s: ch, size, bold, align: 'left', color: opts.color ?? 0, w: textWidth(ch, size, bold) });
        cx += textWidth(ch, size, bold) + opts.spacing;
      }
      return total;
    }
    const w = textWidth(s, size, bold);
    this.ops.push({ t: 'text', x, y, s, size, bold, align: opts.align ?? 'left', color: opts.color ?? 0, w });
    return w;
  }

  /** Mehrzeiliger Text; gibt die y-Position der nächsten Grundlinie zurück. */
  paragraph(x, y, str, maxW, opts = {}) {
    const size = opts.size ?? 10;
    const lead = opts.lead ?? size * PT * 1.35;
    for (const line of wrap(str, maxW, size, !!opts.bold)) {
      const lx = opts.align === 'center' ? x + maxW / 2 : opts.align === 'right' ? x + maxW : x;
      this.text(lx, y, line, opts);
      y += lead;
    }
    return y;
  }

  line(x1, y1, x2, y2, w = 0.25) { this.ops.push({ t: 'line', x1, y1, x2, y2, w }); }

  rect(x, y, w, h, opts = {}) { this.ops.push({ t: 'rect', x, y, w, h, fill: !!opts.fill, lw: opts.lw ?? 0.25 }); }

  circle(cx, cy, r, opts = {}) { this.ops.push({ t: 'circle', cx, cy, r, fill: !!opts.fill, lw: opts.lw ?? 0.25 }); }

  /** key verweist auf ein Bild in der images-Tabelle der Renderer (data-URL). Seitenverhältnis bleibt erhalten (contain). */
  image(key, x, y, w, h, opts = {}) { this.ops.push({ t: 'image', key, x, y, w, h, align: opts.align ?? 'left', valign: opts.valign ?? 'top' }); }
}

// ---------------------------------------------------------------- Datum/Zeit
const pad = (n) => String(n).padStart(2, '0');
export function todayIso(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function nowTime(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
/** 2026-11-20 -> 20.11.2026 */
export function deDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export function weekday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  return DAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
}
/** Dauer zwischen zwei Uhrzeiten in Stunden als "1,5" (leer, wenn unvollständig). */
export function hoursBetween(von, bis) {
  const a = /^(\d{1,2}):(\d{2})$/.exec(von || '');
  const b = /^(\d{1,2}):(\d{2})$/.exec(bis || '');
  if (!a || !b) return '';
  let min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  if (min < 0) min += 24 * 60;
  const h = Math.round((min / 60) * 100) / 100;
  return String(h).replace('.', ',');
}
