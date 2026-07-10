@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   FOGLI BLU — Pubblica su Internet   ║
echo  ╚══════════════════════════════════════╝
echo.

REM Controlla se git è disponibile
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ATTENZIONE] Git non è installato o non è nel PATH di questo sistema.
    echo  Non è possibile eseguire il push automatico su GitHub.
    echo.
    echo  Vuoi creare un pacchetto ZIP pulito per il caricamento manuale su Netlify?
    choice /M "Premi S per procedere, N per annullare" /C SN
    if errorlevel 2 (
        echo Pubblicazione annullata.
        pause
        exit /b 0
    )
    echo.
    call "%~dp0prepara_deploy.bat"
    exit /b 0
)

REM Vai nella cartella del progetto
cd /d "%~dp0"

REM Chiedi il messaggio di modifica
set /p MESSAGGIO="Cosa hai modificato? (es: aggiornato clienti): "

REM Se non scrive niente, usa un messaggio generico
if "%MESSAGGIO%"=="" set MESSAGGIO=Aggiornamento

echo.
echo  Pubblicazione in corso su GitHub...
echo.

REM Esegui i 3 comandi git
git add .
git commit -m "%MESSAGGIO%"
git push

if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERRORE] Errore durante il push su GitHub.
    echo  Controlla le credenziali o se hai configurato il repository remoto.
    echo.
    pause
    exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   ✅ Sito aggiornato con successo!   ║
echo  ║   Netlify si aggiorna in 30 sec...   ║
echo  ╚══════════════════════════════════════╝
echo.
pause
