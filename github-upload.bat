@echo off
rem Zetteldruck - Projekt nach GitHub hochladen (loest dort den APK-Build aus)
setlocal
cd /d "%~dp0"
set REPO=https://github.com/onetoner/Druck-PDF.git

where git >nul 2>nul
if errorlevel 1 (
  echo Git ist auf diesem PC nicht installiert.
  echo Bitte "Git for Windows" von https://git-scm.com/download/win installieren und das Skript erneut starten.
  goto :ende
)

if not exist .git (
  echo Richte lokales Git-Repository ein ...
  git init -b main || goto :fehler
  git remote add origin %REPO% || goto :fehler
  rem Liegt auf GitHub schon ein Stand, darauf aufsetzen; eigene Aenderungen bleiben als Aenderungen erhalten
  git fetch origin main >nul 2>nul
  if not errorlevel 1 git reset origin/main >nul
)

for /f "delims=" %%n in ('git config user.name') do set GITNAME=%%n
if not defined GITNAME (
  git config user.name "onetoner"
  git config user.email "49093807+onetoner@users.noreply.github.com"
)

rem Build-Anleitung fuer GitHub Actions an ihren Platz kopieren (Vorlage: scripts\github-workflow.yml)
if not exist .github\workflows mkdir .github\workflows
copy /y scripts\github-workflow.yml .github\workflows\android-apk.yml >nul || goto :fehler

git add -A || goto :fehler
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Zetteldruck: Stand %date% %time:~0,5%" || goto :fehler
) else (
  echo Keine neuen Aenderungen zum Committen.
)

echo Lade nach GitHub hoch ...
git push -u origin main || goto :fehler
echo.
echo Fertig. GitHub baut jetzt die APK: https://github.com/onetoner/Druck-PDF/actions
goto :ende

:fehler
echo.
echo Das Hochladen ist fehlgeschlagen ^(siehe Meldung oben^).
echo Haeufige Ursachen: der GitHub-Login im Browserfenster wurde nicht abgeschlossen, oder auf GitHub liegt ein neuerer Stand.

:ende
echo.
timeout /t 20
endlocal
