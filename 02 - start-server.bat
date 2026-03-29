@echo off
title MyVolleyTeamAnalysis - Server di sviluppo
echo.
echo ========================================
echo   MyVolleyTeamAnalysis - Avvio server locale
echo ========================================
echo.
cd /d "%~dp0"
echo Avvio del server sulla porta 4000...
echo Apri il browser su: http://localhost:4000
echo.
echo Premi CTRL+C per fermare il server.
echo.
npx vite --port 4000
pause
