# Zetteldruck

Android-App für Monteure im SHK-Handwerk: Mieterbenachrichtigungen und Aushänge vor Ort auf dem
Thermodrucker ausdrucken, geplante Aushänge im Büro auf dem normalen Drucker, und die
**Erfassung Endabnahme** am Tablet ausfüllen, unterschreiben lassen und als PDF an Inform übergeben.

**[Zetteldruck.apk herunterladen](https://github.com/onetoner/Druck-PDF/releases/latest/download/Zetteldruck.apk)**

## Was die App kann

| Vorlage | Gedacht für | Ausgabe |
| --- | --- | --- |
| Mieterbenachrichtigung („nicht angetroffen“, Terminvereinbarung) | vor Ort | Thermodruck, Drucken, PDF |
| Aushang Notsperrung (Wasser, Heizung, Gas) | vor Ort | Thermodruck, Drucken, PDF |
| Aushang geplante Sperrung | Büro | Drucken (WLAN-Drucker), PDF |
| Erfassung Endabnahme | Tablet in der Wohnung | PDF an Inform, Drucken, Thermodruck |

- **Thermodruck** geht direkt per Bluetooth an den Phomemo M832 (A4-Endlosrolle, 300 dpi). Briefe und
  Aushänge werden auf der Rolle nach Inhalt gekürzt, das spart Papier.
- **Drucken** öffnet den Android-Druckdialog (WLAN-Drucker im Büro).
- **PDF an Inform / PDF teilen** öffnet das Teilen-Menü; dort die Inform-App (oder E-Mail) wählen.
- **Speichern** legt das PDF mit sprechendem Dateinamen an einem Ort deiner Wahl ab,
  z. B. `Endabnahme_Lipschitzallee-34_4-OG-rechts_WIE-4711_2026-11-20.pdf`.
- Alles wird automatisch gespeichert und steht unter „Zuletzt bearbeitet“ wieder bereit.

### Erfassung Endabnahme

- Alle 27 Positionen des Papierformulars mit i.O. / Rep. / Ern. / MBL und Bemerkung je Zeile.
- **Gästebad** per Schalter: Das Hauptbad bleibt, das Gästebad bekommt eigene Positionen.
- Unter „Vorhanden“ lässt sich Ausstattung abwählen (z. B. keine Badewanne). Abgewählte Zeilen
  erscheinen nicht auf dem Blatt.
- „Rest i.O.“ setzt alle noch offenen Zeilen eines Bereichs auf i.O.
- Zusätzliche Positionen je Bereich, Unterschrift von Kunde und Monteur direkt auf dem Tablet.
- Das Protokoll passt **immer auf ein A4-Blatt**: Die Zeilenhöhe richtet sich nach der Anzahl der Positionen.

## Einrichten

1. APK über den Link oben auf dem Gerät öffnen und installieren (ggf. „Installation aus unbekannten
   Quellen“ erlauben).
2. Drucker einschalten und einmalig in den Android-Einstellungen unter **Bluetooth** koppeln.
3. In der App beim ersten **Thermodruck** den Drucker auswählen und „Geräte in der Nähe“ erlauben.
4. Unter **Einstellungen** (Zahnrad): Monteurname, Briefkopf, Logo und Auftraggeber anpassen.

Falls der Thermodruck nichts ausgibt: In den Einstellungen die Befehlsfolge auf **B** stellen und den
Testdruck wiederholen. Der Drucker darf nicht gleichzeitig mit der Phomemo-App verbunden sein.
Als Ausweichweg funktioniert immer „PDF teilen“ an die Phomemo-App.

## Updates

Jeder Upload nach GitHub baut automatisch eine neue APK und legt sie als Release ab. Die App sucht
beim Start nach einer neueren Version (auch unter Einstellungen → „Nach Update suchen“).

**Wichtig – Signatur dauerhaft machen:** Damit sich die App immer ohne Deinstallation aktualisieren
lässt (sonst gehen die gespeicherten Dokumente verloren), den Signatur-Schlüssel einmalig als
Repository-Secret `DEBUG_KEYSTORE_BASE64` hinterlegen (Settings → Secrets and variables → Actions).
Ohne Secret liegt der Schlüssel nur im Actions-Cache, der nach 7 Tagen ohne Build verfällt.

## Entwicklung

```
www/                 Web-App (ohne Build-Schritt)
  js/sheet.js        Zeichenbefehle in Millimetern, Textumbruch
  js/layout.js       Satz der vier Dokumenttypen
  js/render.js       Ausgabe als PDF (pdf-lib) und Canvas, Raster + M832-Befehlsfolge
  js/app.js          Oberfläche
  js/native.js       Brücke zum Android-Teil
native/ZettelPlugin.java   Bluetooth-Druck, Druckdialog, Teilen, Speichern
scripts/android-prepare.mjs   passt das Capacitor-Projekt beim Build an
.github/workflows/android-apk.yml   APK-Build und Release
```

- `vorschau-am-pc.bat` startet die App im Browser (ohne Bluetooth).
- `github-upload.bat` lädt den aktuellen Stand hoch und stößt den APK-Build an.
- `npm test` prüft Layout, PDF und Druckdaten.

## Quellen

- Befehlsfolge des M832: [vivier/phomemo-tools, PR #54](https://github.com/vivier/phomemo-tools/pull/54)
  und [Mohtimad/m832-android-print](https://github.com/Mohtimad/m832-android-print) (MIT).
- PDF-Erzeugung: [pdf-lib](https://pdf-lib.js.org) (MIT), liegt unter `www/vendor/`.
