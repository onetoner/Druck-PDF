// Tests für Layout, PDF und Druckdaten:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.self = globalThis;
await import('../www/vendor/pdf-lib.min.js');
const { layoutDoc, endabnahmeRows } = await import('../www/js/layout.js');
const { renderPdf, toMono, buildM832Job, toBase64 } = await import('../www/js/render.js');
const { DEFAULT_SETTINGS, newData, AREAS, areaRows, fileName, TYPES } = await import('../www/js/defs.js');
const { clean, wrap, textWidth, hoursBetween, deDate, weekday } = await import('../www/js/sheet.js');

const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
settings.firm.logo = '';
const mk = (type, patch = {}) => ({ id: 't', type, created: '2026-11-20T09:50:00', updated: '2026-11-20T09:50:00', data: { ...newData(type, settings), ...patch } });

test('Texthelfer', () => {
  assert.equal(clean('Größe → 5 €'), 'Größe > 5 €');
  assert.equal(clean('Zeile1\nZeile2'), 'Zeile1 Zeile2');
  assert.equal(hoursBetween('08:10', '09:25'), '1,25');
  assert.equal(hoursBetween('', '09:25'), '');
  assert.equal(deDate('2026-11-20'), '20.11.2026');
  assert.equal(weekday('2026-11-20'), 'Freitag');
  for (const line of wrap('Ein langer Satz mit vielen Wörtern, der sicher umbrochen werden muss.', 40, 12)) assert.ok(textWidth(line, 12) <= 40);
});

test('Alle Dokumenttypen ergeben ein gültiges einseitiges PDF', async () => {
  for (const type of Object.keys(TYPES)) {
    const doc = mk(type);
    const sheet = layoutDoc(doc, settings, {});
    assert.equal(sheet.width, 210);
    assert.equal(sheet.height, 297);
    for (const op of sheet.ops) {
      const ys = op.t === 'text' ? [op.y] : op.t === 'line' ? [op.y1, op.y2] : op.t === 'circle' ? [op.cy] : [op.y, op.y + op.h];
      for (const y of ys) assert.ok(y >= 0 && y <= 297, `${type}: Element außerhalb des Blatts (${y})`);
    }
    const pdf = await renderPdf([sheet], {}, { title: type });
    assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
    const parsed = await globalThis.PDFLib.PDFDocument.load(pdf);
    assert.equal(parsed.getPageCount(), 1);
  }
});

test('Rolle: Briefe und Aushänge werden nach Inhalt gekürzt', () => {
  for (const type of ['termin', 'notsperrung', 'geplant']) {
    const sheet = layoutDoc(mk(type), settings, { roll: true });
    assert.ok(sheet.height < 297 && sheet.height >= 90, `${type}: ${sheet.height}`);
  }
});

test('Endabnahme: Original-Positionen, Gästebad, immer ein Blatt', () => {
  const doc = mk('endabnahme');
  assert.equal(endabnahmeRows(doc.data).filter((r) => !r.head).length, 27);
  doc.data.gaestebad = true;
  assert.equal(endabnahmeRows(doc.data).filter((r) => !r.head).length, 34);
  assert.ok(endabnahmeRows(doc.data).some((r) => r.head === 'Hauptbad'));
  // alles einschalten + Zusatzpositionen
  for (const a of AREAS) for (const g of a.groups) doc.data.areas[a.id].groups[g.id] = true;
  for (let i = 0; i < 6; i++) doc.data.areas.bad.custom.push({ id: `c${i}`, label: `Zusatz ${i}` });
  doc.data.bemerkung = 'x '.repeat(400);
  const sheet = layoutDoc(doc, settings, {});
  assert.equal(sheet.meta.rows, 50 + 4);
  for (const op of sheet.ops) if (op.t === 'text') assert.ok(op.y <= 297 - 8, 'Text unterhalb des Blattrands');
  // Zeilen überlappen den Fußkasten nicht
  const footY = 297 - 8 - 31;
  const rowText = sheet.ops.filter((op) => op.t === 'text' && /^Zusatz 5|^WM - Tülle/.test(op.s));
  assert.ok(rowText.length === 2 && rowText.every((op) => op.y < footY));
});

test('Dateinamen', () => {
  const d = mk('endabnahme', { strasse: 'Lipschitzallee 34', lage: '4. OG rechts', wie: '4711/08', datum: '2026-11-20' });
  assert.equal(fileName(d), 'Endabnahme_Lipschitzallee-34_4-OG-rechts_WIE-4711-08_2026-11-20.pdf');
  assert.match(fileName(mk('notsperrung', { objekt: 'Müllerstraße 3' })), /^Notsperrung_Kalt-und-Warmwasser_Muellerstrasse-3_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('Raster und M832-Befehlsfolge', () => {
  // 16 x 2 Bildpunkte: erste Zeile links schwarz, zweite Zeile weiß
  const rgba = new Uint8ClampedArray(16 * 2 * 4).fill(255);
  for (let x = 0; x < 3; x++) { rgba[x * 4] = 0; rgba[x * 4 + 1] = 0; rgba[x * 4 + 2] = 0; }
  const mono = toMono(rgba, 16, 2, 150);
  assert.deepEqual([...mono.data], [0b11100000, 0, 0, 0]);
  const a = buildM832Job(mono, { variant: 'a', density: 0, feed: 3 });
  assert.deepEqual([...a], [0x1f, 0x11, 0x0b, 0x1f, 0x11, 0x35, 0x00, 0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0, 0xe0, 0, 0, 0, 0x1b, 0x64, 3, 0x1f, 0x11, 0x11]);
  const dark = buildM832Job(mono, { variant: 'a', density: 3, feed: 0 });
  assert.deepEqual([...dark.slice(0, 11)], [0x1f, 0x11, 0x0b, 0x1f, 0x11, 0x02, 0x04, 0x1f, 0x11, 0x35, 0x00]);
  const b = buildM832Job(mono, { variant: 'b', density: 1, feed: 0 });
  assert.deepEqual([...b], [0x1f, 0x11, 0x12, 0x1b, 0x40, 0x1b, 0x4e, 0x07, 0x04, 0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0, 0xe0, 0, 0, 0]);
  // A4 bei 300 dpi: 310 Bytes je Zeile, Höhe als 16-Bit-Wert
  const big = buildM832Job({ width: 2480, height: 3507, bytesPerRow: 310, data: new Uint8Array(310 * 3507) }, {});
  assert.deepEqual([...big.slice(7, 15)], [0x1d, 0x76, 0x30, 0x00, 0x36, 0x01, 0xb3, 0x0d]);
  assert.throws(() => buildM832Job({ width: 8, height: 70000, bytesPerRow: 1, data: new Uint8Array(70000) }, {}));
  assert.equal(toBase64(new Uint8Array([1, 2, 3])), 'AQID');
});

test('Plugin-Quelle und Prepare-Skript passen zusammen', async () => {
  const fs = await import('node:fs');
  const java = fs.readFileSync(new URL('../native/ZettelPlugin.java', import.meta.url), 'utf8');
  assert.ok(java.startsWith('package __PACKAGE__;'));
  for (const m of ['listPrinters', 'printRaw', 'printPdf', 'sharePdf', 'savePdf', 'openUrl']) assert.match(java, new RegExp(`public void ${m}\\(PluginCall call\\)`));
  const wf = new URL('../.github/workflows/android-apk.yml', import.meta.url);
  if (fs.existsSync(wf)) assert.equal(fs.readFileSync(wf, 'utf8').replace(/\r/g, ''), fs.readFileSync(new URL('../scripts/github-workflow.yml', import.meta.url), 'utf8').replace(/\r/g, ''), 'Workflow weicht von der Vorlage ab');
  const nativeJs = fs.readFileSync(new URL('../www/js/native.js', import.meta.url), 'utf8');
  for (const m of ['listPrinters', 'printRaw', 'printPdf', 'sharePdf', 'savePdf', 'openUrl']) assert.ok(nativeJs.includes(`call('${m}'`));
});
