# Guida al Deploy Cloud - Compilatore Vocale DDT Giobby

Questa guida spiega passo dopo passo come caricare il codice dell'applicazione su GitHub e distribuirlo gratuitamente su piattaforme Cloud come **Netlify**, **Render** o **Railway**.

---

## 📦 FASE 1: Caricare il codice su GitHub

Per effettuare il deploy sulle piattaforme cloud moderne, il metodo più semplice è collegare un repository GitHub.

1. **Inizializza un repository Git locale:**
   Apri il terminale o PowerShell nella cartella del progetto (`H:\Il mio Drive\drive\Antigravity\Fogli blu`) ed esegui:
   ```bash
   git init
   ```
2. **Crea un file `.gitignore` per escludere i file locali sensibili:**
   Un file `.gitignore` è già presente nella cartella per impedire a Git di caricare le credenziali locali:
   ```text
   .env
   node_modules/
   ```
3. **Esegui il commit dei file di progetto:**
   ```bash
   git add .
   git commit -m "Initial commit of Vocal DDT Giobby Compiler"
   ```
4. **Crea un nuovo repository su GitHub:**
   - Vai su [GitHub](https://github.com) e crea un nuovo repository pubblico o privato (es: `giobby-vocal-ddt`).
   - Associalo al tuo repository locale ed esegui il push:
     ```bash
     git remote add origin https://github.com/tuo-username/giobby-vocal-ddt.git
     git branch -M main
     git push -u origin main
     ```

---

## 🛜 FASE 2A: Deploy su NETLIFY (Serverless - Gratis & Consigliato)

Netlify è una delle migliori piattaforme per ospitare siti statici e logica serverless. Abbiamo configurato un file `netlify.toml` e una funzione serverless in `netlify/functions/api.js` per far funzionare l'applicazione senza modifiche.

1. Accedi a [Netlify.com](https://www.netlify.com/) utilizzando il tuo account GitHub.
2. Nel tuo pannello di controllo (Dashboard), clicca su **Add new site** e seleziona **Import an existing project**.
3. Scegli **GitHub** come provider e seleziona il repository `giobby-vocal-ddt`.
4. Netlify leggerà automaticamente il file `netlify.toml` pre-configurato nel progetto. I campi di configurazione del build si popoleranno da soli:
   - **Base directory:** *(lascia vuoto)*
   - **Build command:** *(lascia vuoto)*
   - **Publish directory:** `public`
5. Clicca su **Deploy site**.
6. **Configura le variabili d'ambiente (Opzionale per Gemini):**
   - Nel pannello del tuo sito su Netlify, vai su **Site configuration** ➔ **Environment variables**.
   - Clicca su **Add a variable** e inserisci:
     - Key: `GEMINI_API_KEY`
     - Value: *(inserisci la tua API Key di Google Gemini)*
7. Netlify compilerà e distribuirà il sito in pochi secondi. L'app sarà accessibile al link autogenerato da Netlify (es. `https://tuo-sito.netlify.app`).

---

## 🚀 FASE 2B: Deploy su RENDER (Web Service - Gratis)

Render rileva automaticamente il file `render.yaml` che abbiamo preparato nel progetto per configurare l'infrastruttura.

1. Vai su [Render.com](https://render.com) e accedi con il tuo account GitHub.
2. Clicca su **New +** in alto a destra e seleziona **Web Service**.
3. Collega il tuo account GitHub e seleziona il repository `giobby-vocal-ddt`.
4. Render leggerà la configurazione. Verifica che i campi corrispondano:
   - **Name:** `giobby-vocal-ddt`
   - **Environment:** `Node`
   - **Build Command:** *(lascia vuoto)*
   - **Start Command:** `node server.js`
5. Scorri in basso e clicca su **Advanced**, poi su **Add Environment Variable**:
   - Aggiungi la chiave `PORT` con valore `3000`.
   - Se desideri usare l'NLP avanzato di Gemini, aggiungi `GEMINI_API_KEY` inserendo il valore della tua API Key di Google.
6. Clicca su **Create Web Service**.
7. Nel giro di 1-2 minuti, l'applicazione sarà live all'indirizzo `https://giobby-vocal-ddt.onrender.com`.

---

## ⚡ FASE 2C: Deploy su RAILWAY

Railway distribuisce applicazioni Node in pochi secondi leggendo la nostra configurazione.

1. Vai su [Railway.app](https://railway.app) e accedi con GitHub.
2. Clicca su **New Project** ➔ **Deploy from GitHub repo**.
3. Seleziona il repository `giobby-vocal-ddt`.
4. Clicca su **Variables** all'interno del pannello del servizio appena creato e aggiungi:
   - `PORT` = `3000`
   - `GEMINI_API_KEY` = *(opzionale, inserisci la tua chiave Gemini)*
5. Vai nella scheda **Settings** del servizio su Railway, scorri fino alla sezione **Networking** e clicca su **Generate Domain** per ottenere un URL pubblico (es. `https://giobby-vocal-ddt.up.railway.app`).
6. Il deploy si avvierà automaticamente. L'applicazione sarà pronta all'uso nel giro di un minuto.
