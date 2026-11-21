@echo off
rem Zetteldruck - hinterlegt den Signatur-Schluessel als Secret DEBUG_KEYSTORE_BASE64 im GitHub-Repository.
rem Braucht die GitHub-Kommandozeile "gh" (https://cli.github.com), angemeldet mit dem eigenen Konto.
rem Der Schluessel wird direkt aus signatur\DEBUG_KEYSTORE_BASE64.txt gelesen. Ergebnis: signatur\eintragen-log.txt
setlocal
cd /d "%~dp0"
set LOG=signatur\eintragen-log.txt
echo ==== %date% %time% ==== > %LOG%
if not exist signatur\DEBUG_KEYSTORE_BASE64.txt (
  echo KEINE_SCHLUESSELDATEI >> %LOG%
  goto :ende
)
where gh >> %LOG% 2>&1
if errorlevel 1 (
  echo KEIN_GH >> %LOG%
  goto :ende
)
gh auth status >> %LOG% 2>&1
if errorlevel 1 (
  echo NICHT_ANGEMELDET >> %LOG%
  goto :ende
)
gh secret set DEBUG_KEYSTORE_BASE64 --repo onetoner/Druck-PDF < signatur\DEBUG_KEYSTORE_BASE64.txt >> %LOG% 2>&1
if errorlevel 1 (
  echo FEHLER_BEIM_SETZEN >> %LOG%
) else (
  echo GESETZT >> %LOG%
)
gh secret list --repo onetoner/Druck-PDF >> %LOG% 2>&1
:ende
echo fertig >> %LOG%
type %LOG%
timeout /t 10
endlocal
