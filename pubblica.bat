@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   FOGLI BLU — Pubblica su Internet   ║
echo  ╚══════════════════════════════════════╝
echo.

REM Vai nella cartella del progetto
cd /d "i:\Il mio Drive\drive\Antigravity\Fogli blu"

REM Chiedi il messaggio di modifica
set /p MESSAGGIO="Cosa hai modificato? (es: aggiornato clienti): "

REM Se non scrive niente, usa un messaggio generico
if "%MESSAGGIO%"=="" set MESSAGGIO=Aggiornamento

echo.
echo  Pubblicazione in corso...
echo.

REM Esegui i 3 comandi git
git add .
git commit -m "%MESSAGGIO%"
git push

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   ✅ Sito aggiornato con successo!   ║
echo  ║   Netlify si aggiorna in 30 sec...   ║
echo  ╚══════════════════════════════════════╝
echo.
pause
