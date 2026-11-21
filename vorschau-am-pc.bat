@echo off
rem Zetteldruck - Vorschau im Browser am PC (ohne Bluetooth-Druck)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert: https://nodejs.org
  timeout /t 15
  exit /b 1
)
start "" http://localhost:5173
node scripts\serve.mjs
