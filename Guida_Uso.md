# Guida all'Uso - Compilatore Vocale DDT Giobby

L'applicazione è stata sviluppata con successo ed è pronta per essere avviata localmente o pubblicata su Netlify. Il design è stato curato per offrire un'esperienza **mobile-first premium** ed è completamente funzionante con le API di Giobby e del browser.

---

## 🛠️ Cosa è stato Realizzato

1. **Architettura Zero-Dipendenze (Ottimizzazione Premium):**
   A causa delle restrizioni di scrittura dei file di lock in ambiente Windows su cartelle sincronizzate come Google Drive (`node_modules`), abbiamo riprogettato il server per utilizzare **esclusivamente i moduli nativi di Node.js** (`http`, `fs`, `path`) e le API standard `fetch` (supportate nativamente in Node v24). In questo modo, l'app si avvia all'istante ed è priva di dipendenze esterne.
2. **Backend Proxy (`server.js`):**
   - Gestisce in modo trasparente l'autenticazione OAuth con le credenziali di *Parquet Romagna*.
   - Memorizza in cache il token e l'URL dell'endpoint di Giobby, rigenerandoli e rieseguendo la chiamata in automatico qualora scadessero (stato `401`).
   - Fornisce endpoint per cercare clienti/prodotti su Giobby in tempo reale ed evitare le restrizioni CORS del browser.
   - Fornisce una rotta `/api/parse` per ripulire le trascrizioni vocali.
3. **Motore NLP locale + Gemini (`nlp-parser.js`):**
   - **Offline/Locale:** Utilizza algoritmi regolari JavaScript per convertire i numeri in cifre (es: *"dodici"* -> 12), calcolare le date relative (es: *"oggi"* -> `2026-05-28`, *"dopodomani"* -> `2026-05-30`), standardizzare le causali (Vendita, Conto Visione, Reso) e ripulire i prefissi dei clienti.
   - **Gemini (Opzionale):** Se configuri una chiave API Gemini, il server utilizzerà il modello Gemini Flash per interpretare il linguaggio naturale con i prompt specializzati ad altissima precisione.
4. **Interfaccia Utente Mobile-First (`public/`):**
   - Layout smartphone con tema scuro premium, glassmorphism e orbe di luce decorative sfocate.
   - Supporto nativo alle Web Speech API del browser: cliccando sui microfoni, l'app avvia la registrazione in italiano (`it-IT`), mostra un overlay di trascrizione in tempo reale ed elabora i risultati.
   - Autocompletamento clienti integrato con i dati in tempo reale estratti da Giobby.
   - Lista articoli dinamica con possibilità di eliminazione o modifica manuale rapida di quantità e aliquota IVA.
   - **Console Sviluppatore:** Un pannello espandibile posizionato a fondo pagina che mostra in tempo reale i flussi di log e i payload JSON inviati e ricevuti da Giobby (con evidenziazione sintattica colorata per chiavi, stringhe e numeri).

---

## 🚀 Come Avviare l'Applicazione in Locale

1. Assicurati che non ci siano altri servizi in esecuzione sulla porta `3000`.
2. Apri un terminale nella cartella del progetto (`H:\Il mio Drive\drive\Antigravity\Fogli blu`).
3. Avvia il server con il comando:
   ```bash
   node server.js
   ```
4. Apri il browser all'indirizzo:
   [http://localhost:3000](http://localhost:3000)

> [!TIP]
> **Utilizzo di Gemini Flash (Opzionale):**
> Se desideri abilitare l'NLP avanzato di Gemini, apri il file `.env` e inserisci la tua chiave API nella riga:
> `GEMINI_API_KEY=AIzaSy...`
> Dopodiché riavvia il server. Se la chiave è vuota o assente, l'applicazione utilizzerà automaticamente il motore di parsing locale.

---

## 📱 Guida all'Uso e Flusso di Lavoro

1. **Associazione Cliente:**
   - Clicca sul microfono accanto al campo Cliente e detta: *"Metti come cliente la ditta Bianchi e figli"* (oppure digita *"Daniel"* o *"Frank"* per testare con i clienti esistenti nel tuo database Giobby).
   - Seleziona il cliente desiderato dai suggerimenti dell'anagrafica per agganciarne l'ID.
2. **Data Documento:**
   - Clicca sul microfono e detta: *"Metti la data di dopodomani"*. La data verrà calcolata e aggiornata in `2026-05-30`.
3. **Causale Trasporto:**
   - Clicca sul microfono e detta: *"Metti conto visione"* per impostare automaticamente l'opzione "Conto Visione".
4. **Inserimento Articoli:**
   - Clicca sul pulsante **+ Voce** dell'articolo e detta ad esempio: *"Aggiungi dodici scatole di bulloni da otto"*. L'articolo verrà aggiunto al carrello con quantità `12` e descrizione *"scatole di bulloni da otto"*.
   - Puoi modificare manualmente la quantità o l'aliquota IVA dal riepilogo in qualsiasi momento.
5. **Verifica e Invio:**
   - Controlla la **Console Sviluppatore** a comparsa in basso per visualizzare i log delle chiamate eseguite.
   - Clicca su **Simula Invio** per testare la validità del payload contro i server Giobby (senza salvare il documento).
   - Clicca su **Invia a Giobby** per completare la creazione e visualizzare il numero di DDT generato.
