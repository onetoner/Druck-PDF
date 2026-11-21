// Brücke zum Android-Teil (Capacitor-Plugin "Zettel"). Im Browser greifen einfache Ersatzwege.
import { toBase64 } from './render.js';

export function isNative() {
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
  return !!window.androidBridge || !!(cap && cap.platform && cap.platform !== 'web');
}

function call(method, opts = {}) {
  const cap = window.Capacitor;
  const plugin = cap?.Plugins?.Zettel;
  if (plugin && typeof plugin[method] === 'function') return plugin[method](opts);
  if (cap && typeof cap.nativePromise === 'function') return cap.nativePromise('Zettel', method, opts);
  return Promise.reject(new Error('Diese Funktion gibt es nur in der Android-App.'));
}

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Gekoppelte Bluetooth-Geräte: [{name, address}] */
export async function listPrinters() {
  if (!isNative()) return [];
  const res = await call('listPrinters');
  return res?.devices || [];
}

/** Sendet einen fertigen Druckauftrag (Bytes) per Bluetooth. */
export async function printRaw(address, bytes, holdMs = 3000) {
  if (!isNative()) throw new Error('Thermodruck per Bluetooth funktioniert nur in der Android-App.');
  return call('printRaw', { address, data: toBase64(bytes), holdMs });
}

/** Android-Druckdialog (WLAN-Drucker, "Als PDF speichern" …). */
export async function printPdf(bytes, name) {
  if (isNative()) return call('printPdf', { data: toBase64(bytes), name });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank');
  return {};
}

/** Teilen-Menü: PDF an Inform, E-Mail, Messenger … */
export async function sharePdf(bytes, name, title) {
  if (isNative()) return call('sharePdf', { data: toBase64(bytes), name, title });
  const file = new File([bytes], name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title });
  download(bytes, name, 'application/pdf');
  return {};
}

/** Speichern unter … (Ordnerauswahl von Android, Dateiname bleibt erhalten). */
export async function savePdf(bytes, name) {
  if (isNative()) return call('savePdf', { data: toBase64(bytes), name });
  download(bytes, name, 'application/pdf');
  return { saved: true };
}

export async function openUrl(url) {
  if (isNative()) return call('openUrl', { url });
  window.open(url, '_blank');
  return {};
}

export { download };
