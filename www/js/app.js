// Oberfläche: Start, Editor mit Vorschau, Einstellungen.
import { TYPES, MEDIEN, GRUENDE_NOT, GRUENDE_PLAN, BEREICHE, ANLAESSE, STATUS, AREAS, areaRows, areaTitle, visibleAreas, newData, docTitle, fileName } from './defs.js';
import { layoutDoc, docImages } from './layout.js';
import { loadAssets, renderPdf, renderCanvas, canvasToMono, buildM832Job } from './render.js';
import { loadSettings, saveSettings, listDocs, putDoc, deleteDoc, newId } from './store.js';
import * as native from './native.js';
import { todayIso, nowTime, deDate } from './sheet.js';
import { BUILD } from './build-info.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const S = { settings: loadSettings(), view: 'home', doc: null, dirty: false, roll: false, previewOpen: false };

// ================================================================ kleine Helfer
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-2.6-1.5L14 2.6h-4l-.5 2.5a7.6 7.6 0 00-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 002.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 002.6-1.5l2.3 1 2-3.4z"/>'),
  roll: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  print: svg('<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/><path d="M17 11.5h.01"/>'),
  share: svg('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"/>'),
  save: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};
const icon = (name) => h('span', { html: ICON[name], style: 'display:contents' });

let toastTimer = 0;
function toast(msg, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

const backStack = [];
/** Dialog; liefert den Wert des gedrückten Knopfs (oder null beim Schließen). */
function dialog({ title, body, buttons, wide }) {
  return new Promise((resolve) => {
    const close = (value) => { veil.remove(); backStack.splice(backStack.indexOf(onBack), 1); resolve(value); };
    const onBack = () => close(null);
    const veil = h('div', { class: 'veil', onclick: (e) => { if (e.target === veil) close(null); } },
      h('div', { class: 'dlg', style: wide ? 'width:min(720px,100%)' : null },
        title && h('h2', null, title),
        h('div', { class: 'body' }, typeof body === 'function' ? body(close) : body),
        h('div', { class: 'btns' }, (buttons || [{ label: 'OK', value: true, primary: true }]).map((b) =>
          h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label))),
      ));
    backStack.push(onBack);
    layer.append(veil);
  });
}
const alertDlg = (title, text) => dialog({ title, body: text });
const confirmDlg = (title, text, yes = 'Ja', danger = false) => dialog({ title, body: text, buttons: [{ label: 'Abbrechen', value: false }, { label: yes, value: true, primary: !danger, danger }] });
function promptDlg(title, value = '', placeholder = '') {
  let inp;
  return dialog({
    title,
    body: () => { inp = h('input', { class: 'inp', value, placeholder }); setTimeout(() => inp.focus(), 50); return inp; },
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', value: () => inp.value.trim(), primary: true }],
  });
}
function busy(text) {
  const veil = h('div', { class: 'veil' }, h('div', { class: 'busy' }, h('div', { class: 'spin' }), text));
  layer.append(veil);
  return () => veil.remove();
}

// Zurück-Taste von Android
window.__zdBack = () => {
  if (backStack.length) { backStack[backStack.length - 1](); return true; }
  if (S.previewOpen) { togglePreview(false); return true; }
  if (S.view !== 'home') { goHome(); return true; }
  return false;
};

// ================================================================ Start
const COLOR = { termin: '', notsperrung: 'red', geplant: 'dark', endabnahme: 'green' };
const SHORT = { termin: 'TERMIN', notsperrung: 'NOTSPERRUNG', geplant: 'GEPLANT', endabnahme: 'ENDABNAHME' };
const KICK = { termin: 'Vor Ort · Thermodruck', notsperrung: 'Vor Ort · Thermodruck', geplant: 'Büro · Normaldrucker', endabnahme: 'Tablet · PDF an Inform' };

async function goHome() {
  await flushSave();
  S.view = 'home';
  S.doc = null;
  S.previewOpen = false;
  render();
}

async function renderHome() {
  const list = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Lade …'));
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('b', null, 'Zetteldruck'), h('span', null, S.settings.firm.name)),
      h('button', { class: 'icon-btn', 'aria-label': 'Einstellungen', onclick: () => { S.view = 'settings'; render(); } }, icon('gear'))),
    h('main', { class: 'home' }, h('div', { class: 'home-inner' },
      h('div', { class: 'tiles' }, Object.entries(TYPES).map(([type, t]) =>
        h('button', { class: `tile ${COLOR[type]}`, onclick: () => newDoc(type) },
          h('span', { class: 'k' }, KICK[type]), h('span', { class: 't' }, t.title), h('span', { class: 's' }, t.sub)))),
      h('div', { class: 'sect-title' }, 'Zuletzt bearbeitet'),
      list)));
  const docs = await listDocs();
  if (S.view !== 'home') return;
  if (!docs.length) { list.replaceChildren(h('div', { class: 'empty' }, 'Noch nichts gespeichert. Oben eine Vorlage antippen.')); return; }
  list.replaceChildren(...docs.slice(0, 60).map((doc) =>
    h('div', { class: 'item' },
      h('span', { class: `badge ${COLOR[doc.type]}` }, SHORT[doc.type]),
      h('button', { class: 'main', onclick: () => openDoc(doc) }, h('b', null, docTitle(doc)), h('small', null, `${deDate((doc.updated || '').slice(0, 10))} · ${(doc.updated || '').slice(11, 16)} Uhr`)),
      h('button', { class: 'mini', 'aria-label': 'Als neue Kopie öffnen', onclick: () => duplicate(doc) }, icon('copy')),
      h('button', { class: 'mini', 'aria-label': 'Löschen', onclick: async () => { if (await confirmDlg('Löschen?', `„${docTitle(doc)}“ wird aus dem Verlauf entfernt.`, 'Löschen', true)) { await deleteDoc(doc.id); renderHome(); } } }, icon('trash')))));
}

function stamp() {
  const d = new Date();
  return `${todayIso(d)}T${nowTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function newDoc(type) {
  const now = stamp();
  openDoc({ id: newId(), type, created: now, updated: now, data: newData(type, S.settings) }, false);
}
function duplicate(doc) {
  const now = stamp();
  const copy = JSON.parse(JSON.stringify(doc));
  copy.id = newId();
  copy.created = now;
  copy.updated = now;
  if (copy.type === 'endabnahme') { copy.data.sigKunde = ''; copy.data.sigMonteur = ''; copy.data.datum = todayIso(); }
  S.dirty = true;
  openDoc(copy, true);
}
function openDoc(doc, dirty = false) {
  S.doc = doc;
  S.dirty = dirty;
  S.view = 'edit';
  S.roll = false;
  S.previewOpen = false;
  render();
}

// ================================================================ Speichern + Vorschau
let saveTimer = 0;
let previewTimer = 0;
function changed(rebuild = false) {
  S.dirty = true;
  S.doc.updated = stamp();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
  const st = document.querySelector('.top .state');
  if (st) st.textContent = 'Speichert …';
  if (rebuild) rebuildForm();
  schedulePreview();
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (!S.doc || !S.dirty) return;
  S.dirty = false;
  try {
    await putDoc(S.doc);
    const st = document.querySelector('.top .state');
    if (st) st.textContent = 'Gespeichert';
  } catch (e) { console.error(e); toast('Speichern fehlgeschlagen'); }
}
function schedulePreview(delay = 180) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, delay);
}
let previewRun = 0;
async function refreshPreview() {
  const canvas = document.querySelector('.paper canvas');
  if (!canvas || !S.doc) return;
  const pane = document.querySelector('.preview-pane');
  if (pane && getComputedStyle(pane).display === 'none') return;
  const run = ++previewRun;
  const doc = S.doc;
  const sheet = layoutDoc(doc, S.settings, { roll: S.roll && doc.type !== 'endabnahme' });
  const assets = await loadAssets(docImages(doc, S.settings));
  if (run !== previewRun || !canvas.isConnected) return;
  const cssW = Math.min(720, canvas.parentElement.clientWidth || 600);
  const width = Math.round(Math.max(700, Math.min(1700, cssW * (window.devicePixelRatio || 1) * 1.25)));
  renderCanvas(sheet, assets, 0, canvas, width);
  const warn = document.querySelector('.form-pane .warn');
  if (warn) warn.style.display = sheet.meta && sheet.meta.rowHeight < 3.9 ? '' : 'none';
}
function togglePreview(open) {
  S.previewOpen = open;
  document.querySelector('.preview-pane')?.classList.toggle('open', open);
  if (open) schedulePreview(30);
}

// ================================================================ Formular-Bausteine
function field(label, control, cls = '') {
  return h('div', { class: `f ${cls}` }, label && h('label', null, label), control);
}
function input(obj, key, opts = {}) {
  const el = h(opts.area ? 'textarea' : 'input', {
    class: 'inp', type: opts.type || 'text', placeholder: opts.ph, value: obj[key] ?? '',
    inputmode: opts.inputmode, autocomplete: 'off', autocapitalize: opts.caps || 'sentences', enterkeyhint: opts.area ? null : 'done',
    oninput: () => { obj[key] = el.value; (opts.onchange || changed)(); },
  });
  if (!opts.area) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  return el;
}
function chips(options, get, set, cls = '') {
  const wrap = h('div', { class: 'chips' });
  const paint = () => wrap.replaceChildren(...options.map(([value, label]) =>
    h('button', { class: `chip ${cls} ${get() === value ? 'on' : ''}`, onclick: () => { set(value); paint(); } }, label)));
  paint();
  return wrap;
}
function combo(obj, key, presets, opts = {}) {
  const inp = input(obj, key, opts);
  return h('div', null, inp, h('div', { class: 'chips presets' }, presets.map((p) =>
    h('button', { class: 'chip preset', onclick: () => { inp.value = p; obj[key] = p; (opts.onchange || changed)(); } }, p))));
}
function toggle(label, get, set, sub) {
  const el = h('button', { class: `toggle ${get() ? 'on' : ''}`, onclick: () => { set(!get()); el.classList.toggle('on', !!get()); } },
    h('span', { class: 'sw' }), h('span', null, label, sub && h('small', null, sub)));
  return el;
}
function stepper(get, set, min = 1, max = 20) {
  const val = h('span', null, String(get()));
  const step = (d) => { const v = Math.max(min, Math.min(max, get() + d)); set(v); val.textContent = String(v); };
  return h('div', { class: 'stepper' }, h('button', { onclick: () => step(-1), 'aria-label': 'weniger' }, '−'), val, h('button', { onclick: () => step(1), 'aria-label': 'mehr' }, '+'));
}
function dateTimeRow(d, dateKey, timeKey, label, cls = 'c8') {
  const date = input(d, dateKey, { type: 'date' });
  const time = input(d, timeKey, { type: 'time' });
  return [
    field(label, h('div', { class: 'with-btn' }, date, h('button', { class: 'btn small', onclick: () => { d[dateKey] = todayIso(); d[timeKey] = nowTime(); date.value = d[dateKey]; time.value = d[timeKey]; changed(); } }, 'Jetzt')), cls),
    field('Uhrzeit', time, 'c4'),
  ];
}

// ================================================================ Formulare
function formTermin(d) {
  return [
    h('div', { class: 'card' }, h('h3', null, 'Empfänger'), h('div', { class: 'grid' },
      field('Anrede', chips([['', 'offen lassen'], ['Herrn', 'Herrn'], ['Frau', 'Frau'], ['Familie', 'Familie']], () => d.anrede, (v) => { d.anrede = v; changed(); })),
      field('Name', input(d, 'name', { ph: 'leer = Linie zum Ausfüllen von Hand', caps: 'words' }), 'c6'),
      field('Wohnung / Adresse (optional)', input(d, 'adresse', { ph: 'z. B. 3. OG links' }), 'c6'))),
    h('div', { class: 'card' }, h('h3', null, 'Besuch'), h('div', { class: 'grid' },
      ...dateTimeRow(d, 'besuchDatum', 'besuchZeit', 'Nicht angetroffen am'),
      field('Termin für', combo(d, 'anlass', ANLAESSE)),
      field(null, toggle('Neuen Termin vorschlagen', () => d.neuerTermin, (v) => { d.neuerTermin = v; changed(true); })),
      d.neuerTermin && [
        field('Wir kommen erneut am', input(d, 'ntDatum', { type: 'date' }), 'c6'),
        field('von', input(d, 'ntVon', { type: 'time' }), 'c3'),
        field('bis', input(d, 'ntBis', { type: 'time' }), 'c3'),
      ],
      field('Zusatztext (optional)', input(d, 'notiz', { area: true })),
      field('Datum des Schreibens', input(d, 'datum', { type: 'date' }), 'c6'))),
  ];
}

function formAushang(type, d) {
  const not = type === 'notsperrung';
  const ags = S.settings.auftraggeber.map((a) => a.name).filter(Boolean);
  return [
    h('div', { class: 'card' }, h('h3', null, not ? 'Was ist abgesperrt?' : 'Was wird abgesperrt?'), h('div', { class: 'grid' },
      field(null, chips(Object.entries(MEDIEN).map(([k, m]) => [k, m.label]), () => d.medium, (v) => { d.medium = v; changed(); })),
      field('Objekt / Adresse', input(d, 'objekt', { ph: 'Straße Hausnr., Aufgang', caps: 'words' })),
      field('Betroffen', combo(d, 'bereich', BEREICHE)),
      field('Grund', combo(d, 'grund', not ? GRUENDE_NOT : GRUENDE_PLAN)))),
    not
      ? h('div', { class: 'card' }, h('h3', null, 'Zeit'), h('div', { class: 'grid' },
        ...dateTimeRow(d, 'seitDatum', 'seitZeit', 'Abgesperrt seit'),
        field(null, toggle('Ende noch offen', () => d.bisOffen, (v) => { d.bisOffen = v; changed(true); }, 'druckt „bis auf Weiteres“')),
        !d.bisOffen && [field('Voraussichtlich bis', input(d, 'bisDatum', { type: 'date' }), 'c8'), field('Uhrzeit', input(d, 'bisZeit', { type: 'time' }), 'c4')]))
      : h('div', { class: 'card' }, h('h3', null, 'Termin'), h('div', { class: 'grid' },
        field('Am', input(d, 'datum', { type: 'date' }), 'c6'),
        field('bis einschließlich (nur bei mehreren Tagen)', input(d, 'datumBis', { type: 'date' }), 'c6'),
        field('von', input(d, 'von', { type: 'time' }), 'c6'),
        field('bis ca.', input(d, 'bis', { type: 'time' }), 'c6'),
        field(null, toggle('Zugang zur Wohnung erforderlich', () => d.zugang, (v) => { d.zugang = v; changed(); })))),
    h('div', { class: 'card' }, h('h3', null, 'Hinweise'), h('div', { class: 'grid' },
      field(null, toggle('Standard-Hinweise drucken', () => d.hinweise !== false, (v) => { d.hinweise = v; changed(); }, 'passend zu Wasser, Heizung oder Gas')),
      field('Zusätzlicher Hinweis (optional)', input(d, 'hinweis', { area: true })),
      field('Im Auftrag von (optional)', ags.length ? combo(d, 'auftraggeber', ags) : input(d, 'auftraggeber')),
      field('Exemplare beim Thermodruck', stepper(() => d.kopien || 1, (v) => { d.kopien = v; changed(); })))),
  ];
}

function formEndabnahme(d) {
  const out = [];
  out.push(h('div', { class: 'warn', style: 'display:none' }, 'Sehr viele Positionen: Die Schrift auf dem Blatt wird klein. Nicht vorhandene Ausstattung abwählen spart Platz.'));
  const ags = S.settings.auftraggeber;
  out.push(h('div', { class: 'card' }, h('h3', null, 'Objekt und Auftrag'), h('div', { class: 'grid' },
    field('Straße, Hausnummer', input(d, 'strasse', { caps: 'words' }), 'c6'),
    field('Lage / Wohnung', input(d, 'lage', { ph: 'z. B. 2. OG rechts, WE 12' }), 'c6'),
    field('PLZ, Ort', input(d, 'plzOrt', { caps: 'words' }), 'c6'),
    field('Mieter (optional)', input(d, 'mieter', { caps: 'words' }), 'c6'),
    field('Auftraggeber', h('div', null,
      ags.length > 0 && h('div', { class: 'chips', style: 'margin-bottom:8px' }, ags.map((a) =>
        h('button', { class: 'chip small', onclick: () => { d.auftraggeber = [...a.zeilen]; changed(true); } }, a.name || a.zeilen[0]))),
      h('div', { class: 'grid' }, [0, 1, 2].map((i) => field(null, input(d.auftraggeber, i, { ph: `Zeile ${i + 1}` }), 'c4'))))),
    field('Datum', input(d, 'datum', { type: 'date' }), 'c4'),
    field('WIE NR', input(d, 'wie', { caps: 'characters' }), 'c4'),
    field('Monteur', input(d, 'monteur', { caps: 'words' }), 'c4'),
    field('Uhrzeit von', input(d, 'von', { type: 'time' }), 'c4'),
    field('bis', (() => {
      const bis = input(d, 'bis', { type: 'time' });
      return h('div', { class: 'with-btn' }, bis, h('button', { class: 'btn small', onclick: () => { d.bis = nowTime(); bis.value = d.bis; changed(); } }, 'Jetzt'));
    })(), 'c4'),
    field(null, toggle('Gästebad vorhanden', () => d.gaestebad, (v) => { d.gaestebad = v; changed(true); }, 'zweites Bad mit eigenen Positionen')))));

  for (const area of visibleAreas(d)) out.push(areaCard(area, d));

  out.push(h('div', { class: 'card' }, h('h3', null, 'Abschluss'),
    ynRow('Neuvermietung', d, 'neuvermietung'),
    ynRow('Angebot benötigt', d, 'angebot'),
    toggle('Vom Mieter keine weiteren Mängel benannt', () => d.keineMaengel, (v) => { d.keineMaengel = v; changed(); }),
    h('div', { style: 'margin-top:8px' }, h('span', { class: 'lab' }, 'Weitere Bemerkungen (max. 3 Zeilen auf dem Blatt)'), input(d, 'bemerkung', { area: true }))));

  out.push(h('div', { class: 'card' }, h('h3', null, 'Unterschriften'), h('div', { class: 'sigs' },
    sigBox(d, 'sigKunde', 'Unterschrift Kunde'), sigBox(d, 'sigMonteur', 'Unterschrift Monteur'))));
  return out;
}

function ynRow(label, d, key) {
  return h('div', { class: 'yn' }, h('span', null, label),
    chips([['ja', 'Ja'], ['nein', 'Nein']], () => d[key], (v) => { d[key] = d[key] === v ? '' : v; changed(); }));
}

function sigBox(d, key, label) {
  const box = h('button', { class: 'sig' });
  const paint = () => box.replaceChildren(...[d[key] && h('img', { src: d[key], alt: label }), h('span', null, d[key] ? `${label} – antippen zum Ändern` : `${label} – antippen`)].filter(Boolean));
  box.addEventListener('click', async () => {
    const res = await signaturePad(label);
    if (res === null) return;
    d[key] = res;
    paint();
    changed();
  });
  paint();
  return box;
}

function areaCard(area, d) {
  const st = d.areas[area.id];
  const openEl = h('span', { class: 'open' });
  const rowsEl = h('div');
  const countOpen = () => {
    const rows = areaRows(area, st, d);
    const n = rows.filter((r) => !st.items[r.id]?.s).length;
    openEl.textContent = n ? `${n} offen` : 'vollständig';
    openEl.classList.toggle('done', !n);
  };
  const itemState = (id) => (st.items[id] ||= { s: '', mbl: false, note: '' });
  const buildRows = () => {
    rowsEl.replaceChildren(...areaRows(area, st, d).map((r) => {
      const it = itemState(r.id);
      const seg = h('div', { class: 'seg' }, STATUS.map(([value, label]) =>
        h('button', { 'data-s': value, class: it.s === value ? 'on' : '', onclick: (e) => {
          it.s = it.s === value ? '' : value;
          for (const b of seg.children) b.classList.toggle('on', b.dataset.s === it.s);
          countOpen();
          changed();
          e.currentTarget.blur();
        } }, label)));
      const mbl = h('button', { class: `mbl ${it.mbl ? 'on' : ''}`, onclick: () => { it.mbl = !it.mbl; mbl.classList.toggle('on', it.mbl); changed(); } }, 'MBL');
      const locs = r.loc && h('div', { class: 'locs' }, [['bad', d.gaestebad ? 'Hauptbad' : 'Bad'], d.gaestebad && ['gast', 'Gästebad'], ['kueche', 'Küche']].filter(Boolean).map(([key, name]) => {
        it.loc ||= {};
        const b = h('button', { class: `chip small ${it.loc[key] ? 'on' : ''}`, onclick: () => { it.loc[key] = !it.loc[key]; b.classList.toggle('on', it.loc[key]); changed(); } }, name);
        return b;
      }));
      return h('div', { class: 'row' },
        h('div', { class: 'lbl' }, r.label,
          r.custom && h('button', { class: 'del', onclick: () => { st.custom = st.custom.filter((c) => c.id !== r.id); delete st.items[r.id]; buildRows(); countOpen(); changed(); } }, 'entfernen'),
          locs),
        seg, mbl,
        h('div', { class: 'note' }, input(it, 'note', { ph: 'Bemerkung' })));
    }));
  };
  const groupChips = area.groups.length > 1 && h('div', { class: 'have' }, h('span', null, 'Vorhanden:'), area.groups.map((g) => {
    const b = h('button', { class: `chip small ${st.groups[g.id] ? 'on' : ''}`, onclick: () => { st.groups[g.id] = !st.groups[g.id]; b.classList.toggle('on', st.groups[g.id]); buildRows(); countOpen(); changed(); } }, g.label);
    return b;
  }));
  buildRows();
  countOpen();
  return h('div', { class: 'card area' },
    h('div', { class: 'area-head' }, h('h3', null, areaTitle(area, d)), openEl,
      h('button', { class: 'btn small', onclick: () => { for (const r of areaRows(area, st, d)) { const it = itemState(r.id); if (!it.s) it.s = 'io'; } buildRows(); countOpen(); changed(); } }, 'Rest i.O.')),
    groupChips, rowsEl,
    h('button', { class: 'btn small ghost', style: 'margin-top:6px', onclick: async () => {
      const label = await promptDlg(`Weitere Position – ${areaTitle(area, d)}`, '', 'Bezeichnung');
      if (!label) return;
      st.custom.push({ id: `c_${newId()}`, label });
      buildRows(); countOpen(); changed();
    } }, '+ Weitere Position'));
}

// ================================================================ Unterschrift
function signaturePad(title) {
  return new Promise((resolve) => {
    const canvas = h('canvas');
    let drawn = false;
    let last = null;
    const close = (value) => { veil.remove(); backStack.splice(backStack.indexOf(onBack), 1); resolve(value); };
    const onBack = () => close(null);
    const veil = h('div', { class: 'veil' }, h('div', { class: 'sigpad' },
      h('h2', null, title), h('div', { class: 'base' }, canvas),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => close(null) }, 'Abbrechen'),
        h('button', { class: 'btn', onclick: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; } }, 'Leeren'),
        h('button', { class: 'btn danger', onclick: () => close('') }, 'Entfernen'),
        h('button', { class: 'btn primary', onclick: () => close(drawn ? exportSig() : '') }, 'Übernehmen'))));
    backStack.push(onBack);
    layer.append(veil);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }; };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      drawn = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const p = pos(ev);
        ctx.lineWidth = 2.8 * dpr;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
      }
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // Auf die gezeichnete Fläche zuschneiden, transparent, höchstens 900 px breit
    function exportSig() {
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      let x0 = width, y0 = height, x1 = 0, y1 = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < x0) return '';
      const pad = Math.round(6 * dpr);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
      const w = x1 - x0 + 1;
      const hh = y1 - y0 + 1;
      const k = Math.min(1, 900 / w);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * k));
      out.height = Math.max(1, Math.round(hh * k));
      out.getContext('2d').drawImage(canvas, x0, y0, w, hh, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }
  });
}

// ================================================================ Editor
function rebuildForm() {
  const pane = document.querySelector('.form-pane');
  if (!pane) return;
  const top = pane.scrollTop;
  const d = S.doc.data;
  const parts = S.doc.type === 'termin' ? formTermin(d) : S.doc.type === 'endabnahme' ? formEndabnahme(d) : formAushang(S.doc.type, d);
  pane.replaceChildren(...parts.flat().filter(Boolean));
  pane.scrollTop = top;
}

function renderEdit() {
  const doc = S.doc;
  const isProtocol = doc.type === 'endabnahme';
  const formatChips = !isProtocol && chips([[false, 'A4'], [true, 'Thermo-Rolle']], () => S.roll, (v) => { S.roll = v; schedulePreview(0); }, 'small');
  app.replaceChildren(
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onclick: goHome }, icon('back')),
      h('h1', null, TYPES[doc.type].title),
      h('span', { class: 'state' }, '')),
    h('div', { class: 'split' },
      h('div', { class: 'form-pane' }),
      h('div', { class: 'preview-pane' },
        h('div', { class: 'preview-bar' }, h('span', null, 'Vorschau'), h('span', { class: 'grow' }), formatChips,
          h('button', { class: 'btn small preview-close', onclick: () => togglePreview(false) }, icon('x'), 'Schließen')),
        h('div', { class: 'preview-scroll' }, h('div', { class: 'paper' }, h('canvas'))))),
    h('footer', { class: 'actions' },
      h('button', { class: 'btn only-narrow', onclick: () => togglePreview(true) }, icon('eye'), 'Vorschau'),
      h('button', { class: 'btn dark', onclick: () => guard(thermoPrint) }, icon('roll'), 'Thermodruck'),
      h('button', { class: 'btn', onclick: () => guard(officePrint) }, icon('print'), 'Drucken'),
      h('button', { class: `btn ${isProtocol ? 'primary' : ''}`, onclick: () => guard(share) }, icon('share'), isProtocol ? 'PDF an Inform' : 'PDF teilen'),
      h('button', { class: 'btn', onclick: () => guard(save) }, icon('save'), 'Speichern')));
  rebuildForm();
  schedulePreview(30);
}

// ================================================================ Ausgabe
let working = false;
async function guard(fn) {
  if (working) return;
  working = true;
  document.activeElement?.blur?.();
  try { await flushSave(); await fn(); } catch (e) {
    console.error(e);
    await alertDlg('Das hat nicht geklappt', String(e?.message || e));
  } finally { working = false; }
}

async function makePdf() {
  const doc = S.doc;
  const sheet = layoutDoc(doc, S.settings, { roll: false });
  const assets = await loadAssets(docImages(doc, S.settings));
  return renderPdf([sheet], assets, { title: `${TYPES[doc.type].title} ${docTitle(doc)}`.trim(), author: S.settings.firm.name });
}

async function officePrint() {
  const done = busy('Erstelle PDF …');
  let pdf;
  try { pdf = await makePdf(); } finally { done(); }
  await native.printPdf(pdf, fileName(S.doc).replace(/\.pdf$/, ''));
}
async function share() {
  const done = busy('Erstelle PDF …');
  let pdf;
  try { pdf = await makePdf(); } finally { done(); }
  await native.sharePdf(pdf, fileName(S.doc), TYPES[S.doc.type].title);
}
async function save() {
  const done = busy('Erstelle PDF …');
  let pdf;
  try { pdf = await makePdf(); } finally { done(); }
  const res = await native.savePdf(pdf, fileName(S.doc));
  if (res?.saved) toast('PDF gespeichert');
}

async function buildThermoJob(doc) {
  const pr = S.settings.printer;
  const roll = doc.type !== 'endabnahme' && pr.rollCut !== false;
  const sheet = layoutDoc(doc, S.settings, { roll });
  const assets = await loadAssets(docImages(doc, S.settings));
  const dots = Math.max(8, Math.round((Number(pr.dots) || 2480) / 8) * 8);
  const canvas = renderCanvas(sheet, assets, 0, null, dots);
  const mono = canvasToMono(canvas, Number(pr.threshold) || 150);
  return { job: buildM832Job(mono, { variant: pr.variant, density: Number(pr.density) || 0, feed: Number(pr.feed) || 0 }), canvas, mono };
}

async function choosePrinter() {
  let devices = [];
  const done = busy('Suche gekoppelte Drucker …');
  try { devices = await native.listPrinters(); } finally { done(); }
  if (!devices.length) {
    await alertDlg('Kein Drucker gekoppelt', 'Bitte den Phomemo einschalten und einmalig in den Android-Einstellungen unter „Bluetooth“ koppeln. Danach hier erneut auf „Thermodruck“ tippen.');
    return false;
  }
  devices.sort((a, b) => Number(/M832|M08F|M83|P831|Q302/i.test(b.name)) - Number(/M832|M08F|M83|P831|Q302/i.test(a.name)));
  const pick = await dialog({
    title: 'Thermodrucker wählen',
    body: (close) => h('div', { class: 'pick' }, devices.map((dev) =>
      h('button', { class: 'btn', onclick: () => close(dev) }, h('span', null, dev.name || 'Unbenanntes Gerät', h('small', null, dev.address))))),
    buttons: [{ label: 'Abbrechen', value: null }],
  });
  if (!pick) return false;
  S.settings.printer.address = pick.address;
  S.settings.printer.name = pick.name || pick.address;
  saveSettings(S.settings);
  return true;
}

async function thermoPrint() {
  const doc = S.doc;
  if (!native.isNative()) {
    // Im Browser: Rasterbild zur Kontrolle herunterladen
    const { canvas, mono } = await buildThermoJob(doc);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < mono.height; y++) for (let x = 0; x < mono.width; x++) {
      const on = mono.data[y * mono.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7));
      const p = (y * mono.width + x) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = on ? 0 : 255;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    canvas.toBlob((blob) => blob.arrayBuffer().then((buf) => native.download(new Uint8Array(buf), 'thermodruck-raster.png', 'image/png')));
    toast('Bluetooth-Druck gibt es nur in der Android-App. Rasterbild zur Kontrolle gespeichert.', 4500);
    return;
  }
  if (!S.settings.printer.address && !(await choosePrinter())) return;
  const copies = doc.type === 'endabnahme' || doc.type === 'termin' ? 1 : Math.max(1, doc.data.kopien || 1);
  const done = busy('Bereite Druck vor …');
  try {
    const { job, mono } = await buildThermoJob(doc);
    // Der Drucker schafft rund 10 mm/s; die Verbindung bleibt bis zum geschätzten Druckende offen
    const holdMs = Math.round((mono.height / 110) * 1000) + 2500;
    for (let i = 0; i < copies; i++) {
      done();
      const d2 = busy(copies > 1 ? `Drucke Exemplar ${i + 1} von ${copies} …` : `Drucke auf ${S.settings.printer.name || 'Thermodrucker'} …`);
      try { await native.printRaw(S.settings.printer.address, job, holdMs); } finally { d2(); }
    }
    toast('An den Drucker gesendet');
  } catch (e) {
    done();
    const again = await dialog({
      title: 'Thermodruck fehlgeschlagen',
      body: `${e?.message || e}\n\nIst der Drucker eingeschaltet, in Reichweite und nicht mit der Phomemo-App verbunden?`,
      buttons: [{ label: 'Schließen', value: '' }, { label: 'Anderen Drucker wählen', value: 'pick' }, { label: 'Über Phomemo-App (PDF teilen)', value: 'share', primary: true }],
    });
    if (again === 'pick') { if (await choosePrinter()) await thermoPrint(); } else if (again === 'share') await share();
  } finally { done(); }
}

// ================================================================ Einstellungen
let settingsTimer = 0;
function settingsChanged() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveSettings(S.settings), 300);
}
function sInput(obj, key, opts = {}) { return input(obj, key, { ...opts, onchange: settingsChanged }); }

function renderSettings() {
  const st = S.settings;
  const f = st.firm;
  const pr = st.printer;
  const again = () => { saveSettings(st); renderSettings(); };

  const logoImg = f.logo ? h('img', { src: f.logo, alt: 'Logo' }) : h('span', { class: 'hint' }, 'Kein Logo – der Firmenname wird als Text gedruckt.');
  const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: () => {
    const fl = file.files?.[0];
    if (!fl) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1400 / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        f.logo = c.toDataURL('image/png');
        again();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(fl);
  } });

  const agCards = st.auftraggeber.map((a, i) => h('div', { class: 'ag' }, h('div', { class: 'grid' },
    field('Kurzname (Knopf)', sInput(a, 'name'), 'c4'),
    field('Zeile 1', sInput(a.zeilen, 0), 'c8'),
    field('Zeile 2', sInput(a.zeilen, 1), 'c6'),
    field('Zeile 3', sInput(a.zeilen, 2), 'c6')),
    h('button', { class: 'btn small ghost', style: 'margin-top:6px', onclick: async () => { if (await confirmDlg('Auftraggeber entfernen?', a.name || a.zeilen[0] || '', 'Entfernen', true)) { st.auftraggeber.splice(i, 1); again(); } } }, 'Entfernen')));

  const select = (obj, key, options) => {
    const el = h('select', { class: 'inp', onchange: () => { obj[key] = isNaN(Number(el.value)) || el.value === '' ? el.value : Number(el.value); settingsChanged(); } },
      options.map(([v, l]) => h('option', { value: v, selected: String(obj[key]) === String(v) }, l)));
    return el;
  };

  app.replaceChildren(
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onclick: () => { saveSettings(st); goHome(); } }, icon('back')),
      h('h1', null, 'Einstellungen')),
    h('main', { class: 'settings' }, h('div', { class: 'settings-inner' },
      h('div', { class: 'card' }, h('h3', null, 'Thermodrucker (Bluetooth)'),
        h('div', { class: 'kv' }, h('span', null, 'Gewählter Drucker'), h('b', null, pr.name || pr.address || 'noch keiner')),
        h('div', { class: 'chips', style: 'margin:6px 0 12px' },
          h('button', { class: 'btn small', onclick: async () => { try { if (await choosePrinter()) renderSettings(); } catch (e) { alertDlg('Bluetooth', String(e?.message || e)); } } }, 'Drucker wählen'),
          h('button', { class: 'btn small', onclick: () => guard(testPrint) }, 'Testdruck')),
        h('div', { class: 'grid' },
          field('Druckbreite in Punkten', sInput(pr, 'dots', { type: 'number', inputmode: 'numeric' }), 'c6'),
          field('Schwärzung', select(pr, 'density', [[0, 'Vorgabe des Druckers'], [1, 'Hell'], [2, 'Mittel'], [3, 'Dunkel']]), 'c6'),
          field('Vorschub nach dem Druck (Zeilen)', sInput(pr, 'feed', { type: 'number', inputmode: 'numeric' }), 'c6'),
          field('Befehlsfolge', select(pr, 'variant', [['a', 'A – Endlosrolle (Standard)'], ['b', 'B – Minimal (falls A nicht druckt)']]), 'c6'),
          field(null, toggle('Briefe und Aushänge nach Inhalt kürzen', () => pr.rollCut !== false, (v) => { pr.rollCut = v; settingsChanged(); }, 'spart Papier auf der Endlosrolle; aus = volle A4-Länge'))),
        h('p', { class: 'hint' }, 'M832: 2480 Punkte (300 dpi). M08F: 1728 Punkte (203 dpi). Der Drucker muss in den Android-Einstellungen gekoppelt sein.')),
      h('div', { class: 'card' }, h('h3', null, 'Firma / Briefkopf'), h('div', { class: 'grid' },
        field('Firmenname', sInput(f, 'name'), 'c6'),
        field('Grußzeile', sInput(f, 'gruss'), 'c6'),
        field('Straße', sInput(f, 'strasse'), 'c6'),
        field('PLZ Ort', sInput(f, 'plzOrt'), 'c6'),
        field('Telefon', sInput(f, 'tel', { inputmode: 'tel' }), 'c4'),
        field('E-Mail', sInput(f, 'mail', { inputmode: 'email', caps: 'none' }), 'c4'),
        field('Internet', sInput(f, 'web', { caps: 'none' }), 'c4'),
        field('Logo', h('div', { class: 'logo-prev' }, logoImg, file,
          h('button', { class: 'btn small', onclick: () => file.click() }, 'Bild wählen'),
          h('button', { class: 'btn small', onclick: () => { f.logo = 'img/logo.png'; again(); } }, 'Standard'),
          h('button', { class: 'btn small', onclick: () => { f.logo = ''; again(); } }, 'Ohne Logo'))))),
      h('div', { class: 'card' }, h('h3', null, 'Monteur'), h('div', { class: 'grid' },
        field('Name (wird bei neuen Endabnahmen vorbelegt)', sInput(st, 'monteur', { caps: 'words' })))),
      h('div', { class: 'card' }, h('h3', null, 'Auftraggeber'), agCards,
        h('button', { class: 'btn small', style: 'margin-top:12px', onclick: () => { st.auftraggeber.push({ name: '', zeilen: ['', '', ''] }); again(); } }, '+ Auftraggeber')),
      h('div', { class: 'card' }, h('h3', null, 'App'),
        h('div', { class: 'kv' }, h('span', null, 'Version'), h('b', null, BUILD.run ? `${BUILD.version} (Build ${BUILD.run})` : BUILD.version)),
        h('div', { class: 'kv' }, h('span', null, 'Updates von'), h('b', null, `github.com/${st.update.repo}`)),
        h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => checkUpdate(true) }, 'Nach Update suchen')))));
}

async function testPrint() {
  const now = stamp();
  const doc = { id: 'test', type: 'notsperrung', created: now, updated: now, data: { ...newData('notsperrung', S.settings), objekt: 'Testdruck', grund: 'Druckertest', bereich: 'Nur ein Test', hinweise: false } };
  const keep = S.doc;
  S.doc = doc;
  try { await thermoPrint(); } finally { S.doc = keep; }
}

// ================================================================ Update über GitHub-Releases
async function checkUpdate(manual) {
  const st = S.settings;
  let done = manual ? busy('Suche nach Updates …') : () => {};
  try {
    const res = await fetch(`https://api.github.com/repos/${st.update.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    st.update.lastCheck = Date.now();
    saveSettings(st);
    if (!res.ok) throw new Error(res.status === 404 ? 'Noch keine Version auf GitHub veröffentlicht.' : `GitHub antwortet mit Fehler ${res.status}.`);
    const rel = await res.json();
    const run = Number((/build(\d+)/.exec(rel.tag_name || '') || [])[1] || 0);
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    done();
    done = () => {};
    if (apk && run > BUILD.run && BUILD.run > 0) {
      const ok = await dialog({ title: 'Neue Version verfügbar', body: `${rel.name || rel.tag_name}\n\nDie APK wird im Browser heruntergeladen. Danach die Datei öffnen und „Aktualisieren“ wählen. Deine gespeicherten Dokumente bleiben erhalten.`, buttons: [{ label: 'Später', value: false }, { label: 'Jetzt laden', value: true, primary: true }] });
      if (ok) await native.openUrl(apk.browser_download_url);
    } else if (manual) {
      await alertDlg('Alles aktuell', BUILD.run ? `Installiert ist Build ${BUILD.run}, auf GitHub liegt Build ${run || '–'}.` : `Diese Vorschau läuft ohne Build-Nummer. Neueste Version auf GitHub: ${rel.tag_name || '–'}.`);
    }
  } catch (e) {
    done();
    if (manual) await alertDlg('Update-Prüfung', String(e?.message || e));
  }
}

// ================================================================ Start
function render() {
  if (S.view === 'edit') renderEdit();
  else if (S.view === 'settings') renderSettings();
  else renderHome();
}
window.addEventListener('resize', () => schedulePreview(120));
// Tastatur: Platz unter dem Formular lassen und das aktive Feld sichtbar halten
if (window.visualViewport) {
  const kb = () => document.documentElement.style.setProperty('--kb', `${Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop)}px`);
  window.visualViewport.addEventListener('resize', kb);
  window.visualViewport.addEventListener('scroll', kb);
}
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el?.matches?.('input, textarea') || ['date', 'time', 'file'].includes(el.type)) return;
  setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 350);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
window.addEventListener('pagehide', () => { flushSave(); });
render();
if (native.isNative() && Date.now() - (S.settings.update.lastCheck || 0) > 12 * 3600 * 1000) setTimeout(() => checkUpdate(false), 2500);

// Für Tests und Fehlersuche
window.__zd = { S, layoutDoc, buildThermoJob, makePdf: async () => makePdf(), openType: newDoc };
