// Passt das von `npx cap add android` erzeugte Android-Projekt an:
//  - MainActivity: registriert das Zettel-Plugin, Zurück-Taste geht an die App (window.__zdBack)
//  - kopiert native/ZettelPlugin.java ins Projekt (Bluetooth-Druck, Druckdialog, Teilen, Speichern)
//  - Manifest: Bluetooth-Berechtigungen, Tastatur verkleinert die Ansicht
//  - FileProvider-Pfade für das Teilen von PDFs
//  - versionName aus package.json, versionCode aus der CI-Laufnummer, www/js/build-info.js
// Aufruf: node scripts/android-prepare.mjs   (nach `npx cap add android`, vor `npx cap sync android`)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');
if (!existsSync(androidDir)) {
  console.error('android/ fehlt – zuerst `npx cap add android` ausführen.');
  process.exit(1);
}
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };
const warn = (msg) => console.warn(`::warning::${msg}`);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const cap = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || process.env.VERSION_CODE || 1) || 1;

function findFiles(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) findFiles(p, pred, out);
    else if (pred(name)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- Build-Info für die App
writeFileSync(
  path.join(root, cap.webDir, 'js', 'build-info.js'),
  `// Beim APK-Build erzeugt.\nexport const BUILD = { version: ${JSON.stringify(pkg.version)}, run: ${runNumber} };\n`,
);
console.log(`build-info.js: ${pkg.version} (Build ${runNumber})`);

// ---------------------------------------------------------------- MainActivity + Plugin
const srcMain = path.join(androidDir, 'app', 'src', 'main');
const activities = findFiles(path.join(srcMain, 'java'), (n) => /^MainActivity\.(java|kt)$/.test(n));
if (activities.length !== 1) fail(`MainActivity nicht eindeutig gefunden (${activities.length}).`);
const activityFile = activities[0];
const original = readFileSync(activityFile, 'utf8');
const pkgName = (original.match(/^\s*package\s+([\w.]+)/m) || [])[1] || cap.appId;
const javaDir = path.dirname(activityFile);
const activityJava = path.join(javaDir, 'MainActivity.java');
if (activityFile.endsWith('.kt')) fail('MainActivity ist Kotlin – das Prepare-Skript erwartet die Java-Vorlage von Capacitor.');
writeFileSync(
  activityJava,
  `package ${pkgName};

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZettelPlugin.class);
        super.onCreate(savedInstanceState);
        // Zurück-Taste: erst die App fragen (schließt Dialog, Vorschau, Formular); auf der Startseite in den Hintergrund.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    moveTaskToBack(true);
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return window.__zdBack?!!window.__zdBack():false}catch(e){return false}})()",
                    value -> { if (!"true".equals(value)) moveTaskToBack(true); }
                );
            }
        });
    }
}
`,
);
console.log(`MainActivity angepasst: ${path.relative(root, activityJava)}`);

const pluginSrc = readFileSync(path.join(root, 'native', 'ZettelPlugin.java'), 'utf8').replace('__PACKAGE__', pkgName);
writeFileSync(path.join(javaDir, 'ZettelPlugin.java'), pluginSrc);
console.log('ZettelPlugin.java kopiert.');

// ---------------------------------------------------------------- AndroidManifest
const manifestPath = path.join(srcMain, 'AndroidManifest.xml');
if (!existsSync(manifestPath)) fail('AndroidManifest.xml nicht gefunden.');
let xml = readFileSync(manifestPath, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
  '<uses-feature android:name="android.hardware.bluetooth" android:required="false" />',
].filter((line) => !xml.includes(line.match(/android:name="([^"]+)"/)[1]));
if (perms.length) {
  const at = xml.indexOf('<application');
  if (at < 0) fail('<application> im Manifest nicht gefunden.');
  xml = `${xml.slice(0, at)}${perms.join('\n    ')}\n\n    ${xml.slice(at)}`;
  console.log(`Manifest: ${perms.length} Bluetooth-Einträge ergänzt.`);
}
if (!/android:windowSoftInputMode=/.test(xml)) {
  const idx = xml.indexOf('MainActivity');
  const start = idx >= 0 ? xml.lastIndexOf('<activity', idx) : -1;
  if (start >= 0) {
    const at = start + '<activity'.length;
    xml = `${xml.slice(0, at)}\n            android:windowSoftInputMode="adjustResize"${xml.slice(at)}`;
    console.log('Manifest: windowSoftInputMode=adjustResize gesetzt.');
  } else warn('MainActivity im Manifest nicht gefunden.');
}
if (!xml.includes('.fileprovider')) {
  const end = xml.lastIndexOf('</application>');
  xml = `${xml.slice(0, end)}    <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
        </provider>
    ${xml.slice(end)}`;
  console.log('Manifest: FileProvider ergänzt.');
}
writeFileSync(manifestPath, xml);

// ---------------------------------------------------------------- FileProvider-Pfade
const xmlDir = path.join(srcMain, 'res', 'xml');
mkdirSync(xmlDir, { recursive: true });
writeFileSync(
  path.join(xmlDir, 'file_paths.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
    <files-path name="my_files" path="." />
</paths>
`,
);
console.log('file_paths.xml geschrieben.');

// ---------------------------------------------------------------- Version
const gradlePath = ['build.gradle', 'build.gradle.kts'].map((n) => path.join(androidDir, 'app', n)).find((p) => existsSync(p));
if (gradlePath) {
  let g = readFileSync(gradlePath, 'utf8');
  const before = g;
  g = g.replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${runNumber}`);
  g = g.replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${pkg.version}"`);
  if (g === before) warn('versionCode/versionName in build.gradle nicht gefunden.');
  else {
    writeFileSync(gradlePath, g);
    console.log(`Version: ${pkg.version} (Code ${runNumber}).`);
  }
} else warn('app/build.gradle nicht gefunden.');
