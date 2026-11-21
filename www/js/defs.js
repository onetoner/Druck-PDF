// Stammdaten, Kataloge und Vorbelegungen.
import { todayIso, nowTime } from './sheet.js';

export const DEFAULT_SETTINGS = {
  firm: {
    name: 'ROESCH GmbH',
    strasse: 'Gundelfinger Straße 47',
    plzOrt: '10318 Berlin',
    tel: '015115694530',
    mail: 'wolff@roesch.berlin',
    web: 'www.roesch.berlin',
    gruss: 'Ihr ROESCH-Team',
    logo: 'img/logo.png', // Pfad oder data-URL; leer = Firmenname als Text
  },
  monteur: '',
  auftraggeber: [
    { name: 'Gropiuswohnen', zeilen: ['Gropiuswohnen Objekt', 'GmbH & Co. KG', 'Imbuschweg 41, 12353 Bln'] },
  ],
  printer: {
    address: '', // Bluetooth-Adresse des gekoppelten Druckers
    name: '',
    dots: 2480, // Druckbreite in Punkten (M832: 2480 bei 300 dpi auf 210 mm)
    variant: 'a', // Befehlsfolge: a = Herstellertreiber (Endlosrolle), b = Minimalfolge
    density: 0, // 0 = Druckervorgabe, 1 hell, 2 mittel, 3 dunkel
    feed: 3, // Vorschub nach dem Druck (Zeilen)
    tail: 20, // weißer Nachlauf in mm, damit das Blattende bis zur Abrisskante herauskommt
    threshold: 150,
  },
  update: { repo: 'onetoner/Druck-PDF', lastCheck: 0 },
};

export const TYPES = {
  termin: { title: 'Mieterbenachrichtigung', sub: 'Nicht angetroffen – Bitte um Terminvereinbarung', file: 'Terminvereinbarung' },
  notsperrung: { title: 'Aushang Notsperrung', sub: 'Sofort vor Ort drucken und aushängen', file: 'Notsperrung' },
  geplant: { title: 'Aushang geplante Sperrung', sub: 'Ankündigung für Wasser oder Heizung', file: 'Sperrung' },
  endabnahme: { title: 'Erfassung Endabnahme', sub: 'Protokoll auf einem Blatt, als PDF an Inform', file: 'Endabnahme' },
};

// ---------------------------------------------------------------- Aushänge
export const MEDIEN = {
  wasser: { label: 'Kalt- und Warmwasser', not: 'Wasser abgestellt', plan: 'Wasserabsperrung', satz: 'die gesamte Wasserversorgung (Kalt- und Warmwasser)', art: 'wasser' },
  kw: { label: 'Kaltwasser', not: 'Kaltwasser abgestellt', plan: 'Absperrung Kaltwasser', satz: 'die Kaltwasserversorgung', art: 'wasser' },
  ww: { label: 'Warmwasser', not: 'Warmwasser abgestellt', plan: 'Absperrung Warmwasser', satz: 'die Warmwasserversorgung', art: 'wasser' },
  heizung: { label: 'Heizung', not: 'Heizung außer Betrieb', plan: 'Heizungsabsperrung', satz: 'die Heizungsanlage', art: 'heizung' },
  hzww: { label: 'Heizung + Warmwasser', not: 'Heizung und Warmwasser außer Betrieb', plan: 'Absperrung Heizung und Warmwasser', satz: 'die Heizungs- und Warmwasserversorgung', art: 'heizung' },
  gas: { label: 'Gas', not: 'Gas abgestellt', plan: 'Gasabsperrung', satz: 'die Gasversorgung', art: 'gas' },
};

export const GRUENDE_NOT = ['Rohrbruch', 'Undichtigkeit an der Leitung', 'Wasserschaden', 'Defektes Absperrventil', 'Störung der Heizungsanlage', 'Defekte Pumpe'];
export const GRUENDE_PLAN = ['Reparaturarbeiten', 'Austausch von Absperrventilen', 'Zählerwechsel', 'Arbeiten am Strang', 'Wartungsarbeiten', 'Austausch der Heizungspumpe'];
export const BEREICHE = ['Gesamtes Haus', 'Gesamter Aufgang', 'Strang links', 'Strang rechts', 'Alle Wohnungen am Küchenstrang', 'Alle Wohnungen am Badstrang'];
export const ANLAESSE = ['Reparatur/Besichtigung', 'Reparatur', 'Besichtigung', 'Wartung', 'Zählerwechsel', 'Endabnahme'];

export function standardHinweise(mediumKey, typ, d = {}) {
  const art = (MEDIEN[mediumKey] || MEDIEN.wasser).art;
  const out = [];
  if (art === 'wasser') {
    if (typ === 'geplant') out.push('Bitte bevorraten Sie sich rechtzeitig mit Wasser.');
    out.push('Halten Sie während der Absperrung alle Wasserhähne geschlossen, damit beim Wiederanstellen kein Wasserschaden entsteht.');
    out.push('Nach dem Wiederanstellen kann das Wasser kurz getrübt sein oder Luft in der Leitung sein. Lassen Sie es dann einige Minuten laufen.');
  } else if (art === 'heizung') {
    out.push('Bitte lassen Sie die Thermostatventile an den Heizkörpern unverändert.');
    out.push('Nach der Wiederinbetriebnahme kann es einige Stunden dauern, bis alle Heizkörper wieder warm sind.');
  } else {
    out.push('Bitte schließen Sie die Absperrhähne an Ihren Gasgeräten.');
    out.push('Die Wiederinbetriebnahme erfolgt ausschließlich durch unsere Monteure.');
  }
  if (typ === 'geplant' && d.zugang) out.push('Für die Arbeiten benötigen wir Zugang zu Ihrer Wohnung. Bitte sorgen Sie dafür, dass in dieser Zeit jemand anwesend ist.');
  return out;
}

// ---------------------------------------------------------------- Endabnahme
const BAD_GROUPS = [
  { id: 'wc', label: 'WC', items: [['wc_becken', 'WC-Becken'], ['wc_abfluss', 'WC - Abfluss'], ['spuelkasten', 'Spülkasten']] },
  { id: 'wt', label: 'Waschtisch', items: [['wt', 'Waschtisch'], ['wt_arm', 'Waschtisch - Armatur'], ['wt_eck', 'Waschtisch - Eckventile'], ['wt_abfl', 'Waschtisch - Abfluss']] },
  { id: 'wanne', label: 'Badewanne', items: [['bw', 'Badewanne'], ['bw_schuerze', 'Badewannen Schürze'], ['bw_arm', 'Badewannen - Armatur'], ['bw_abfl', 'Badewannen - Abfluss'], ['bw_stoepsel', 'Badewannen - Stöpsel']] },
  { id: 'dusche', label: 'Brause', items: [['brause', 'Brausegarnitur'], ['rb_aufsteck', 'Rückbau d. Duschst. > Aufsteckz. / Gelenkst.'], ['rb_halter', 'Rückbau d. Duschst. > Brausewandhalter']] },
  { id: 'absperr', label: 'Absperrventile', items: [['abs_kw', 'WE-Absperrventil Kaltwasser {ort}'], ['abs_ww', 'WE-Absperrventil Warmwasser {ort}']] },
];

export const AREAS = [
  { id: 'bad', title: 'Bad', titleMitGast: 'Hauptbad', ort: 'Bad', groups: BAD_GROUPS, on: ['wc', 'wt', 'wanne', 'dusche', 'absperr'] },
  { id: 'gast', title: 'Gästebad', ort: 'Gästebad', optional: true, groups: BAD_GROUPS, on: ['wc', 'wt'] },
  { id: 'strang', title: 'Stranganbindung', ort: '', groups: [{ id: 'strang', label: 'Strang', items: [['strang_ww', 'WW Stranganbindung'], ['strang_kw', 'KW Stranganbindung']], loc: true }], on: ['strang'] },
  {
    id: 'kueche', title: 'Küche', ort: 'Küche',
    groups: [
      { id: 'absperr', label: 'Absperrventile', items: [['abs_kw', 'WE-Absperrventil Kaltwasser {ort}'], ['abs_ww', 'WE-Absperrventil Warmwasser {ort}']] },
      { id: 'spuele', label: 'Spültisch', items: [['sp', 'Spültisch ( Becken )'], ['sp_arm', 'Spültisch - Armatur'], ['sp_abfl', 'Spültisch - Abfluss'], ['sp_eck', 'Spültisch - Eckventile']] },
      { id: 'wm', label: 'Waschmaschine', items: [['wm_hahn', 'WM - Hahn'], ['wm_tuelle', 'WM - Tülle']] },
    ],
    on: ['absperr', 'spuele', 'wm'],
  },
];

export const STATUS = [['io', 'i.O.'], ['rep', 'Rep.'], ['ern', 'Ern.']];

function newArea(area) {
  const groups = {};
  for (const g of area.groups) groups[g.id] = area.on.includes(g.id);
  return { groups, items: {}, custom: [] };
}

/** Liefert die zu druckenden/anzuzeigenden Zeilen eines Bereichs: [{id, label, loc}] */
export function areaRows(area, state, data) {
  const rows = [];
  for (const g of area.groups) {
    if (!state.groups[g.id]) continue;
    for (const [id, label] of g.items) rows.push({ id, label: label.replace('{ort}', area.ort).trim(), loc: !!g.loc, group: g.id });
  }
  for (const c of state.custom || []) rows.push({ id: c.id, label: c.label, custom: true });
  return rows;
}

export function areaTitle(area, data) {
  return data.gaestebad && area.titleMitGast ? area.titleMitGast : area.title;
}

export function visibleAreas(data) {
  return AREAS.filter((a) => !a.optional || data.gaestebad);
}

// ---------------------------------------------------------------- neue Dokumente
export function newData(type, settings) {
  const today = todayIso();
  const now = nowTime();
  if (type === 'termin') {
    return { anrede: '', name: '', adresse: '', datum: today, besuchDatum: today, besuchZeit: now, anlass: ANLAESSE[0], neuerTermin: false, ntDatum: '', ntVon: '', ntBis: '', notiz: '' };
  }
  if (type === 'notsperrung') {
    return { medium: 'wasser', grund: 'Rohrbruch', objekt: '', bereich: 'Gesamtes Haus', seitDatum: today, seitZeit: now, bisOffen: true, bisDatum: today, bisZeit: '', hinweise: true, hinweis: '', auftraggeber: '', kopien: 1 };
  }
  if (type === 'geplant') {
    return { medium: 'wasser', grund: 'Reparaturarbeiten', objekt: '', bereich: 'Gesamtes Haus', datum: '', datumBis: '', von: '08:00', bis: '12:00', zugang: false, hinweise: true, hinweis: '', auftraggeber: '', kopien: 1 };
  }
  const areas = {};
  for (const a of AREAS) areas[a.id] = newArea(a);
  const ag = settings?.auftraggeber?.[0];
  return {
    strasse: '', lage: '', plzOrt: '', mieter: '',
    auftraggeber: ag ? [...ag.zeilen] : ['', '', ''],
    datum: today, wie: '', monteur: settings?.monteur || '', von: now, bis: '',
    gaestebad: false, areas,
    neuvermietung: '', angebot: '', keineMaengel: false, bemerkung: '',
    sigKunde: '', sigMonteur: '',
  };
}

export function docTitle(doc) {
  const d = doc.data;
  if (doc.type === 'termin') return [d.anrede, d.name].filter(Boolean).join(' ') || d.adresse || 'ohne Namen';
  if (doc.type === 'endabnahme') return [d.strasse, d.lage].filter(Boolean).join(', ') || 'ohne Adresse';
  return [MEDIEN[d.medium]?.label, d.objekt].filter(Boolean).join(' – ');
}

export function fileName(doc) {
  const d = doc.data;
  const uml = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  const safe = (s) => String(s || '').replace(/[äöüÄÖÜß]/g, (c) => uml[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let parts;
  if (doc.type === 'endabnahme') parts = [TYPES.endabnahme.file, safe(d.strasse), safe(d.lage), d.wie ? `WIE-${safe(d.wie)}` : '', d.datum];
  else if (doc.type === 'termin') parts = [TYPES.termin.file, safe(d.name) || safe(d.adresse), d.datum];
  else parts = [TYPES[doc.type].file, safe(MEDIEN[d.medium]?.label), safe(d.objekt), doc.type === 'geplant' ? d.datum : d.seitDatum];
  return `${parts.filter(Boolean).join('_')}.pdf`;
}
