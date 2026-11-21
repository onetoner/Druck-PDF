// Setzt die vier Dokumenttypen auf ein Blatt (A4 oder Endlosrolle mit 210 mm Breite).
import { Sheet, PT, textWidth, wrap, fit, deDate, weekday, hoursBetween, todayIso } from './sheet.js';
import { MEDIEN, standardHinweise, AREAS, areaRows, areaTitle, visibleAreas } from './defs.js';

const A4 = { w: 210, h: 297 };

/** Briefkopf: Logo (oder Firmenname) links, Anschrift rechts. Gibt die Unterkante zurück. */
function letterhead(sh, firm, x0, x1, y) {
  if (firm.logo) sh.image('logo', x0, y, 66, 12);
  else sh.text(x0, y + 9, firm.name, { size: 22, bold: true });
  const lines = [firm.strasse, firm.plzOrt, firm.tel ? `Tel. ${firm.tel}` : '', firm.mail, firm.web].filter(Boolean);
  let ly = y + 3;
  lines.forEach((line, i) => {
    sh.text(x1, ly, line, { size: 9, bold: i < 3, align: 'right' });
    ly += 4.4;
  });
  return Math.max(y + 12, ly - 4.4);
}

/** Absatz mit fetten Teilstücken: tokens = [{s, bold}] */
function rich(sh, x, y, tokens, maxW, size, lead) {
  const words = [];
  for (const tok of tokens) {
    String(tok.s ?? '').split(/\s+/).filter(Boolean).forEach((w, i) => {
      // Satzzeichen am Anfang eines Stücks bleiben am vorherigen Wort kleben
      words.push({ s: w, bold: !!tok.bold, glue: i === 0 && words.length > 0 && /^[,.;:!?)]/.test(w) });
    });
  }
  const space = textWidth(' ', size, false);
  let line = [];
  let lineW = 0;
  const flush = () => {
    let cx = x;
    for (const w of line) {
      if (!w.glue && cx > x) cx += space;
      sh.text(cx, y, w.s, { size, bold: w.bold });
      cx += textWidth(w.s, size, w.bold);
    }
    y += lead;
    line = [];
    lineW = 0;
  };
  for (const w of words) {
    const ww = textWidth(w.s, size, w.bold) + (line.length && !w.glue ? space : 0);
    if (line.length && !w.glue && lineW + ww > maxW) flush();
    line.push(w);
    lineW += line.length === 1 ? textWidth(w.s, size, w.bold) : ww;
  }
  if (line.length) flush();
  return y;
}

function finish(sh, y, roll, minH = 90) {
  if (roll) sh.height = Math.max(minH, Math.ceil(y + 10));
  return sh;
}

// ================================================================ Mieterbenachrichtigung
export function layoutTermin(d, firm, opts = {}) {
  const sh = new Sheet(A4.w, A4.h);
  const L = 22;
  const R = A4.w - 22;
  const W = R - L;
  let y = letterhead(sh, firm, L, R, 14);

  y = Math.max(y + 22, 58);
  const blank = !d.name && !d.anrede;
  sh.text(L, y, blank ? 'Herrn / Frau / Familie' : d.anrede || '', { size: 12, bold: true });
  const ort = (firm.plzOrt || '').trim();
  sh.text(R, y, `${ort ? `${ort}, ` : ''}den ${deDate(d.datum) || '____________'}`, { size: 12, bold: true, align: 'right' });
  y += 8;
  if (d.name) {
    sh.text(L, y, d.name, { size: 13, bold: true });
    if (d.adresse) { y += 6; sh.text(L, y, d.adresse, { size: 12 }); }
  } else if (d.adresse) {
    sh.text(L, y, d.adresse, { size: 12, bold: true });
  } else {
    y += 4;
    sh.line(L, y, L + 88, y, 0.35);
  }

  y += 22;
  sh.text(L, y, 'TERMINVEREINBARUNG', { size: 12, bold: true, spacing: 1.5 });

  y += 13;
  let anrede = 'Sehr geehrte Damen und Herren,';
  if (d.name && d.anrede === 'Herrn') anrede = `Sehr geehrter Herr ${d.name},`;
  else if (d.name && d.anrede === 'Frau') anrede = `Sehr geehrte Frau ${d.name},`;
  else if (d.name && d.anrede === 'Familie') anrede = `Sehr geehrte Familie ${d.name},`;
  sh.text(L, y, anrede, { size: 12, bold: true });

  y += 13;
  const size = 12;
  const lead = 8.6;
  const datum = deDate(d.besuchDatum);
  const tokens = [
    { s: 'da wir Sie heute am' },
    { s: datum || '______________', bold: true },
    { s: ', um' },
    { s: d.besuchZeit ? `${d.besuchZeit} Uhr` : '__________ Uhr', bold: true },
    { s: 'nicht angetroffen haben, möchten wir Sie bitten, sich zu einer Terminvereinbarung für eine' },
    { s: d.anlass || 'Reparatur/Besichtigung', bold: true },
    { s: 'mit uns unter der Telefon-Nummer:' },
    { s: firm.tel || '', bold: true },
    { s: 'in Verbindung zu setzen.' },
  ];
  y = rich(sh, L, y, tokens, W, size, lead);

  if (d.neuerTermin && d.ntDatum) {
    y += 3;
    const zeit = d.ntVon && d.ntBis ? `zwischen ${d.ntVon} und ${d.ntBis} Uhr` : d.ntVon ? `um ${d.ntVon} Uhr` : '';
    y = rich(sh, L, y, [
      { s: 'Wir kommen erneut am' },
      { s: `${weekday(d.ntDatum)}, ${deDate(d.ntDatum)}`, bold: true },
      { s: zeit, bold: true },
      { s: '. Sollte Ihnen dieser Termin nicht passen, rufen Sie uns bitte an.' },
    ], W, size, lead);
  }
  if (d.notiz) {
    y += 3;
    y = sh.paragraph(L, y, d.notiz, W, { size, lead });
  }

  y += 6;
  sh.text(L, y, 'Mit freundlichen Grüßen', { size: 12, bold: true });
  y += 12;
  sh.text(L, y, firm.gruss || firm.name, { size: 12, bold: true });
  return finish(sh, y, opts.roll);
}

// ================================================================ Aushänge
function dateTime(datum, zeit) {
  if (!datum) return '';
  return `${weekday(datum)}, ${deDate(datum)}${zeit ? `, ${zeit} Uhr` : ''}`;
}

export function layoutAushang(type, d, firm, opts = {}) {
  // A4: so groß wie möglich setzen, solange alles auf ein Blatt passt. Rolle: Normalgröße, Länge nach Inhalt.
  if (opts.roll) return aushang(type, d, firm, opts, 1).sheet;
  let last = null;
  for (const k of [1.22, 1.14, 1.07, 1, 0.93, 0.86, 0.8]) {
    last = aushang(type, d, firm, opts, k);
    if (last.end <= A4.h - 10) break;
  }
  return last.sheet;
}

function aushang(type, d, firm, opts, k) {
  const sh = new Sheet(A4.w, A4.h);
  const L = 15;
  const R = A4.w - 15;
  const W = R - L;
  const med = MEDIEN[d.medium] || MEDIEN.wasser;
  const not = type === 'notsperrung';
  let y = letterhead(sh, firm, L, R, 12);

  y += 14 * k;
  sh.text(A4.w / 2, y, not ? 'WICHTIGE MIETERINFORMATION' : 'MIETERINFORMATION – ANKÜNDIGUNG', { size: 13 * k, bold: true, align: 'center', spacing: 0.7 });

  // Titelbalken
  y += 5;
  const title = not ? med.not : med.plan;
  let size = 44 * Math.min(k, 1.1);
  let lines = wrap(title, W - 12, size, true);
  while (lines.length > 2 && size > 22) { size -= 2; lines = wrap(title, W - 12, size, true); }
  if (lines.length === 2 && size > 36) { size = 36; lines = wrap(title, W - 12, size, true); }
  const lh = size * PT * 1.12;
  const bandH = lines.length * lh + 7;
  sh.rect(L, y, W, bandH, { fill: true });
  lines.forEach((line, i) => sh.text(A4.w / 2, y + 3.5 + lh * (i + 0.78), line, { size, bold: true, align: 'center', color: 1 }));
  y += bandH;

  if (d.objekt) {
    y += 10 * k;
    const f = fit(d.objekt, W, 17 * k, true, 11);
    sh.text(A4.w / 2, y, f.text, { size: f.size, bold: true, align: 'center' });
  }

  y += 12 * k;
  const body = 13 * k;
  const lead = 6.4 * k;
  sh.text(L, y, 'Sehr geehrte Mieterinnen und Mieter,', { size: body });
  y += lead + 2.5;
  const heiz = med.art === 'heizung';
  const satz = not
    ? `aufgrund eines Notfalls mussten wir ${med.satz} kurzfristig ${heiz ? 'außer Betrieb nehmen' : 'absperren'}. Wir arbeiten bereits an der Behebung.`
    : `für notwendige Arbeiten muss ${med.satz} vorübergehend ${heiz ? 'außer Betrieb genommen' : 'abgestellt'} werden.`;
  y = sh.paragraph(L, y, satz, W, { size: body, lead });

  // Faktentabelle
  const facts = [];
  if (not) {
    if (d.grund) facts.push(['Grund', d.grund]);
    if (d.bereich) facts.push(['Betroffen', d.bereich]);
    facts.push(['Abgesperrt seit', dateTime(d.seitDatum, d.seitZeit) || '–']);
    facts.push(['Voraussichtlich bis', d.bisOffen || !d.bisDatum ? 'bis auf Weiteres – wir informieren Sie per Aushang' : dateTime(d.bisDatum, d.bisZeit)]);
  } else {
    let wann = d.datum ? `${weekday(d.datum)}, ${deDate(d.datum)}` : '____________________';
    if (d.datumBis && d.datumBis !== d.datum) wann += ` bis ${weekday(d.datumBis)}, ${deDate(d.datumBis)}`;
    facts.push(['Wann', wann]);
    if (d.von || d.bis) facts.push(['Uhrzeit', d.von && d.bis ? `${d.von} bis ca. ${d.bis} Uhr` : d.von ? `ab ${d.von} Uhr` : `bis ca. ${d.bis} Uhr`]);
    if (d.bereich) facts.push(['Betroffen', d.bereich]);
    if (d.grund) facts.push(['Grund', d.grund]);
  }
  y += 4 * k;
  const labW = 50 * Math.min(k, 1.12);
  const valSize = 15 * k;
  const valLead = 6.8 * k;
  const top = y;
  for (const [label, value] of facts) {
    const vLines = wrap(value, W - labW - 8, valSize, true);
    const rowH = Math.max(11 * k, vLines.length * valLead + 4.4 * k);
    sh.text(L + 4, y + 7.2 * k, label, { size: 12 * k });
    vLines.forEach((line, i) => sh.text(L + labW, y + 7.4 * k + i * valLead, line, { size: valSize, bold: true }));
    y += rowH;
    sh.line(L, y, R, y, 0.2);
  }
  sh.rect(L, top, W, y - top, { lw: 0.7 });
  sh.line(L + labW - 3, top, L + labW - 3, y, 0.2);

  // Hinweise
  const hints = d.hinweise === false ? [] : standardHinweise(d.medium, type, d);
  if (hints.length || d.hinweis) {
    y += 11 * k;
    sh.text(L, y, 'Bitte beachten Sie:', { size: body, bold: true });
    y += lead + 1;
    const hs = 12 * k;
    const hl = 5.6 * k;
    for (const hint of hints) {
      sh.text(L + 1.5, y, '•', { size: hs, bold: true });
      y = sh.paragraph(L + 7, y, hint, W - 7, { size: hs, lead: hl }) + 1.6 * k;
    }
    if (d.hinweis) {
      sh.text(L + 1.5, y, '•', { size: hs, bold: true });
      y = sh.paragraph(L + 7, y, d.hinweis, W - 7, { size: hs, bold: true, lead: hl }) + 1.6 * k;
    }
  }

  y += 7 * k;
  y = sh.paragraph(L, y, 'Wir bitten, die Unannehmlichkeiten zu entschuldigen.', W, { size: body, lead });
  if (firm.tel) {
    y = rich(sh, L, y + 1, [{ s: 'Bei Rückfragen erreichen Sie uns unter Tel.' }, { s: firm.tel, bold: true }, { s: '.' }], W, body, lead);
  }
  y += 7 * k;
  sh.text(L, y, firm.gruss || firm.name, { size: body, bold: true });
  const ort = (firm.plzOrt || '').replace(/^\d+\s*/, '');
  const fuss = [`${ort ? `${ort}, ` : ''}${deDate(opts.date || todayIso())}`, d.auftraggeber ? `Im Auftrag: ${d.auftraggeber}` : ''].filter(Boolean).join('   ·   ');
  sh.text(R, y, fit(fuss, W - 70, 9).text, { size: 9, align: 'right' });
  finish(sh, y, opts.roll);
  return { sheet: sh, end: y };
}

// ================================================================ Erfassung Endabnahme
/** Alle Zeilen in Druckreihenfolge: {head: 'Bad'} oder {area, id, label, loc, st} */
export function endabnahmeRows(d) {
  const rows = [];
  for (const area of visibleAreas(d)) {
    const state = d.areas[area.id];
    const items = areaRows(area, state, d);
    if (!items.length) continue;
    rows.push({ head: areaTitle(area, d) });
    for (const it of items) rows.push({ ...it, area: area.id, st: state.items[it.id] || {} });
  }
  return rows;
}

export function layoutEndabnahme(d, firm) {
  const sh = new Sheet(A4.w, A4.h);
  const L = 8;
  const R = A4.w - 8;
  const W = R - L;

  // Kopf
  sh.text(L, 14, 'Erfassung Endabnahme', { size: 16, bold: true });
  if (firm.logo) sh.image('logo', R - 62, 6, 62, 10, { align: 'right' });
  else sh.text(R, 14, firm.name, { size: 16, bold: true, align: 'right' });

  const boxY = 23;
  const rh3 = 5.6;
  const boxH = rh3 * 3;
  const cell = (x, w, rows) => {
    sh.rect(x, boxY, w, boxH, { lw: 0.35 });
    for (let i = 1; i < 3; i++) sh.line(x, boxY + rh3 * i, x + w, boxY + rh3 * i, 0.2);
    rows.forEach((txt, i) => {
      if (!txt) return;
      const f = fit(txt, w - 2.4, 9, false, 6);
      sh.text(x + 1.2, boxY + rh3 * i + 3.95, f.text, { size: f.size });
    });
  };
  sh.text(L, boxY - 1.6, 'Objektadresse', { size: 8.5, bold: true });
  cell(L, 60, [d.strasse, [d.lage, d.mieter].filter(Boolean).join(' · '), d.plzOrt]);
  const agX = L + 62;
  sh.text(agX, boxY - 1.6, 'Auftraggeber', { size: 8.5, bold: true });
  cell(agX, 52, d.auftraggeber || []);
  // Datentabelle rechts: 3 Zeilen x (Label|Wert|Label|Wert)
  const tx = agX + 54;
  const tw = R - tx;
  const c = [0, 13.5, 13.5 + (tw - 30) / 2, 13.5 + (tw - 30) / 2 + 16.5, tw];
  sh.rect(tx, boxY, tw, boxH, { lw: 0.35 });
  for (let i = 1; i < 3; i++) sh.line(tx, boxY + rh3 * i, tx + tw, boxY + rh3 * i, 0.2);
  for (let i = 1; i < 4; i++) sh.line(tx + c[i], boxY, tx + c[i], boxY + boxH, 0.2);
  const zeit = d.von || d.bis ? `${d.von || '   '} – ${d.bis || ''}` : '';
  const grid = [
    ['Datum', deDate(d.datum), 'Monteur', d.monteur],
    ['WIE NR', d.wie, 'Uhrzeit', zeit],
    ['', '', 'Stunden', hoursBetween(d.von, d.bis)],
  ];
  grid.forEach((row, i) => {
    const by = boxY + rh3 * i + 3.95;
    sh.text(tx + c[0] + 1, by, row[0], { size: 8 });
    sh.text(tx + c[2] + 1, by, row[2], { size: 8 });
    if (row[1]) { const f = fit(row[1], c[2] - c[1] - 2, 9, true, 6); sh.text(tx + c[1] + 1, by, f.text, { size: f.size, bold: true }); }
    if (row[3]) { const f = fit(row[3], c[4] - c[3] - 2, 9, true, 6); sh.text(tx + c[3] + 1, by, f.text, { size: f.size, bold: true }); }
  });

  // Fuß: JA/NEIN-Block + zwei Unterschriften
  const footH = 31;
  const footY = A4.h - 8 - footH;
  // Weitere Bemerkungen (nur wenn vorhanden) direkt über dem Fuß
  let noteH = 0;
  let noteLines = [];
  if (d.bemerkung) {
    noteLines = wrap(d.bemerkung, W - 36, 8.5).slice(0, 3);
    noteH = noteLines.length * 3.7 + 2.4;
  }

  // Tabelle
  const headY = boxY + boxH + 6.5;
  const colLabel = 63;
  const colSt = 9.2;
  const stX = [0, 1, 2, 3].map((i) => L + colLabel + colSt * (i + 0.5));
  const remX = L + colLabel + colSt * 4 + 2.5;
  ['i.O.', 'Rep.', 'Ern.', 'MBL'].forEach((t, i) => sh.text(stX[i], headY, t, { size: 8.5, bold: true, align: 'center' }));
  sh.text(remX, headY, 'Bemerkungen:', { size: 8.5, bold: true });
  const rowsTop = headY + 1.8;
  sh.line(L, rowsTop, R, rowsTop, 0.45);

  const rows = endabnahmeRows(d);
  const avail = footY - 2.5 - noteH - rowsTop;
  const units = rows.reduce((sum, r) => sum + (r.head ? 0.85 : 1), 0) || 1;
  const rh = Math.max(3.3, Math.min(7, avail / units));
  const size = Math.min(9.5, (rh * 0.62) / PT);
  const rad = Math.min(1.45, rh * 0.3);
  let y = rowsTop;
  for (const r of rows) {
    if (r.head) {
      const h = rh * 0.85;
      sh.text(L + 0.6, y + h * 0.74, r.head.toUpperCase(), { size: size * 0.86, bold: true, spacing: 0.25 });
      const tw2 = textWidth(r.head.toUpperCase(), size * 0.86, true) + r.head.length * 0.25 + 2.5;
      sh.line(L + tw2, y + h * 0.5, R, y + h * 0.5, 0.45);
      y += h;
      continue;
    }
    const base = y + rh * 0.7;
    const cy = y + rh * 0.5;
    const label = r.label;
    if (r.loc) {
      // "WW Stranganbindung  o Bad  o Küche" – so weit verkleinern, bis alles in die Spalte passt
      const locs = [['bad', 'Bad'], ['kueche', 'Küche']];
      if (d.gaestebad) locs.splice(1, 0, ['gast', 'G-Bad']);
      let k = 1;
      const total = (kk) => textWidth(label, size * kk) + 2.2 + locs.reduce((sum, [, name]) => sum + rad * kk * 1.6 + 0.8 + textWidth(name, size * kk * 0.9) + 1.8, 0);
      while (k > 0.55 && total(k) > colLabel - 2.5) k -= 0.03;
      sh.text(L + 0.6, base, label, { size: size * k });
      let lx = L + 0.6 + textWidth(label, size * k) + 2.2;
      for (const [key, name] of locs) {
        sh.circle(lx + rad * k * 0.8, cy, rad * k * 0.8, { fill: !!r.st.loc?.[key], lw: 0.22 });
        sh.text(lx + rad * k * 1.6 + 0.8, base, name, { size: size * k * 0.9 });
        lx += rad * k * 1.6 + 0.8 + textWidth(name, size * k * 0.9) + 1.8;
      }
    } else {
      const f = fit(label, colLabel - 2, size, false, size * 0.72);
      sh.text(L + 0.6, base, f.text, { size: f.size });
    }
    const marks = [r.st.s === 'io', r.st.s === 'rep', r.st.s === 'ern', !!r.st.mbl];
    marks.forEach((on, i) => sh.circle(stX[i], cy, rad, { fill: on, lw: 0.22 }));
    if (r.st.note) {
      const f = fit(r.st.note, R - remX - 0.5, size, false, size * 0.68);
      sh.text(remX, base - 0.2, f.text, { size: f.size });
    }
    y += rh;
    sh.line(remX - 0.8, y - 0.1, R, y - 0.1, 0.18);
  }

  if (noteH) {
    const ny = footY - noteH - 0.8;
    sh.text(L, ny + 3.2, 'Weitere Bemerkungen:', { size: 8.5, bold: true });
    noteLines.forEach((line, i) => sh.text(L + 35, ny + 3.2 + i * 3.7, line, { size: 8.5 }));
  }

  // Fußkasten
  sh.rect(L, footY, W, footH, { lw: 0.8 });
  const jaX = L + 44;
  const neinX = L + 56;
  sh.text(jaX, footY + 5, 'JA', { size: 8.5, bold: true, align: 'center' });
  sh.text(neinX, footY + 5, 'NEIN', { size: 8.5, bold: true, align: 'center' });
  const yn = (label, value, yy) => {
    sh.text(L + 3, yy + 1.1, label, { size: 10, bold: true });
    sh.circle(jaX, yy, 1.5, { fill: value === 'ja', lw: 0.25 });
    sh.circle(neinX, yy, 1.5, { fill: value === 'nein', lw: 0.25 });
  };
  yn('Neuvermietung', d.neuvermietung, footY + 10.5);
  yn('Angebot benötigt', d.angebot, footY + 17.5);
  sh.rect(L + 3, footY + 22.6, 3, 3, { lw: 0.25 });
  if (d.keineMaengel) {
    sh.line(L + 3.5, footY + 24.2, L + 4.3, footY + 25.1, 0.45);
    sh.line(L + 4.3, footY + 25.1, L + 5.6, footY + 23.0, 0.45);
  }
  sh.text(L + 7.5, footY + 25.2, 'vom Mieter keine weiteren', { size: 7.5 });
  sh.text(L + 7.5, footY + 28.3, 'Mängel benannt', { size: 7.5 });
  const sx1 = L + 66;
  const sw = (R - sx1) / 2;
  sh.line(sx1, footY, sx1, footY + footH, 0.35);
  sh.line(sx1 + sw, footY, sx1 + sw, footY + footH, 0.35);
  const sig = (x, key, label) => {
    if (d[key]) sh.image(key, x + 18, footY + 1.5, sw - 20, footH - 8.5, { align: 'center', valign: 'bottom' });
    if (d[key] || key === 'sigMonteur') sh.text(x + 2, footY + footH - 6.6, deDate(d.datum), { size: 8 });
    sh.line(x + 2, footY + footH - 5.6, x + sw - 2, footY + footH - 5.6, 0.25);
    sh.text(x + sw / 2, footY + footH - 2, label, { size: 7.5, align: 'center' });
  };
  sig(sx1, 'sigKunde', 'Datum / Unterschrift des Kunden');
  sig(sx1 + sw, 'sigMonteur', 'Datum / Unterschrift des Monteurs');
  sh.meta = { rowHeight: rh, rows: rows.length };
  return sh;
}

/** Blatt für ein Dokument. opts.roll: Endlosrolle (Höhe = Inhalt). */
export function layoutDoc(doc, settings, opts = {}) {
  const firm = settings.firm;
  const o = { ...opts, date: (doc.created || '').slice(0, 10) || todayIso() };
  if (doc.type === 'termin') return layoutTermin(doc.data, firm, o);
  if (doc.type === 'endabnahme') return layoutEndabnahme(doc.data, firm);
  return layoutAushang(doc.type, doc.data, firm, o);
}

/** Bilder, die ein Dokument braucht: {key: data-URL oder Pfad} */
export function docImages(doc, settings) {
  const images = {};
  if (settings.firm.logo) images.logo = settings.firm.logo;
  if (doc.type === 'endabnahme') {
    if (doc.data.sigKunde) images.sigKunde = doc.data.sigKunde;
    if (doc.data.sigMonteur) images.sigMonteur = doc.data.sigMonteur;
  }
  return images;
}

export { AREAS };
