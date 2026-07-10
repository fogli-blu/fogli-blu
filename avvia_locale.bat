@echo off
echo.
echo ==========================================
echo   FOGLI BLU - Avvio Server Locale
echo ==========================================
echo.
echo Verifica requisiti in corso...
echo.

:: Cerca Node.js globale di sistema
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Rilevato Node.js globale di sistema.
    echo.
    start http://localhost:3000
    node server.js
    goto finished
)

:: Cerca Node.js in Adobe Creative Cloud
if exist "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" (
    echo [OK] Rilevato Node.js Adobe CC locale.
    echo.
    start http://localhost:3000
    "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" server.js
    goto finished
)

:: Cerca Node.js in Adobe Photoshop
if exist "C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe" (
    echo [OK] Rilevato Node.js Adobe Photoshop locale.
    echo.
    start http://localhost:3000
    "C:\Program Files\Adobe\Adobe Photoshop 2025\node.exe" server.js
    goto finished
)

:: Errore se non viene trovato nulla
echo [ERRORE] Node.js non e' installato su questo computer.
echo.
echo Per avviare il compilatore DDT in locale su questo PC:
echo 1. Scarica e installa Node.js (versione consigliata LTS) da:
echo    https://nodejs.org/
echo 2. Riavvia questo file avvia_locale.bat.
echo.
pause
exit /b 1

:finished
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRORE] Errore durante l'avvio o l'esecuzione del server.
    pause
)
