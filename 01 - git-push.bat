@echo off
chcp 65001 >nul
title MyVolleyTeamAnalysis - Git Push
echo.
echo ========================================
echo   MyVolleyTeamAnalysis - Push su GitHub
echo ========================================
echo.
cd /d "%~dp0"

echo [1/4] Stato attuale del repository...
echo.
git status --short
echo.

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%B
if "%BRANCH%"=="" set BRANCH=main
for /f "delims=" %%R in ('git remote') do set REMOTE=%%R
if "%REMOTE%"=="" set REMOTE=origin

echo ========================================
echo   Vuoi procedere con il commit e push?
echo   Branch: %BRANCH%
echo   Remote: %REMOTE%
echo ========================================
echo.
set /p CONFERMA="Premi S per confermare, qualsiasi altro tasto per annullare: "
if /i not "%CONFERMA%"=="S" (
    echo.
    echo Operazione annullata.
    echo.
    pause
    exit /b
)

echo.
echo [2/4] Aggiunta di tutti i file modificati...
if exist ".git\index.lock" (
    echo Rimozione file di lock git rimasto da un processo precedente...
    del /f ".git\index.lock"
)
git add -A
if errorlevel 1 (
    echo ERRORE durante git add
    pause
    exit /b 1
)

echo.
set /p MSG="Inserisci il messaggio di commit (oppure premi INVIO per il default): "
if "%MSG%"=="" set MSG=Aggiornamento MVTA - fix e miglioramenti

echo.
echo [3/4] Commit in corso...
git commit -m "%MSG%"
if errorlevel 1 (
    echo.
    echo ATTENZIONE: Nessuna modifica da committare oppure errore durante il commit.
    pause
    exit /b 1
)

echo.
echo [4/4] Push su GitHub (origin/master)...
echo [4/4] Push su GitHub (%REMOTE%/%BRANCH%)...
git push %REMOTE% %BRANCH%
if errorlevel 1 (
    echo.
    echo ERRORE durante il push. Verifica la connessione e le credenziali GitHub.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Push completato con successo!
echo ========================================
echo.
pause
