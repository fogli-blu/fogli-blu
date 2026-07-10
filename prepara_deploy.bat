@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   FOGLI BLU — Prepara Cartella Deploy    ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Questo script prepara una cartella pulita (deploy_pronto)
echo  contenente solo i file necessari per il deploy su Netlify.
echo.
echo  [1/2] Pulizia vecchia cartella...
if exist deploy_pronto rmdir /s /q deploy_pronto

echo  [2/2] Creazione cartella e copia dei file...
powershell -NoProfile -Command "$null = New-Item -ItemType Directory -Path 'deploy_pronto' -Force; Copy-Item 'netlify.toml', 'package.json', 'nlp-parser.js' -Destination 'deploy_pronto' -ErrorAction SilentlyContinue; if (Test-Path 'giacenze_prodotti.json') { Copy-Item 'giacenze_prodotti.json' -Destination 'deploy_pronto' }; if (Test-Path 'obsoleti_locali.json') { Copy-Item 'obsoleti_locali.json' -Destination 'deploy_pronto' }; if (Test-Path 'prodotti_cache.json') { Copy-Item 'prodotti_cache.json' -Destination 'deploy_pronto' }; Copy-Item -Path 'public' -Destination 'deploy_pronto' -Recurse; Copy-Item -Path 'netlify' -Destination 'deploy_pronto' -Recurse"

if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERRORE] Impossibile copiare i file di progetto.
    pause
    exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║  ✅ Cartella 'deploy_pronto' creata!  ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Puoi trascinare questa cartella direttamente su Netlify:
echo  1. Apri la pagina: https://app.netlify.com/drop
echo  2. Trascina la cartella 'deploy_pronto' nel riquadro di caricamento
echo.
echo  Il tuo sito sarà online in pochi secondi!
echo.
pause
