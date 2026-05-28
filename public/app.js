// Global state variables
let selectedCustomer = null;
let articlesList = [];

// DOM Elements
const ddtForm = document.getElementById('ddt-form');
const clienteInput = document.getElementById('cliente-input');
const suggestionsList = document.getElementById('cliente-suggestions');
const selectedClienteBadge = document.getElementById('selected-cliente-badge');
const selectedClienteText = document.getElementById('selected-cliente-text');
const clearClienteBtn = document.getElementById('clear-cliente-btn');

const dataInput = document.getElementById('data-input');
const causaleSelect = document.getElementById('causale-select');
const articleVocalInput = document.getElementById('articolo-vocal-input');
const articlesContainer = document.getElementById('articles-container');
const articleCountBadge = document.getElementById('article-count');
const addArticoloManualBtn = document.getElementById('add-articolo-manual-btn');

const simulaBtn = document.getElementById('simula-btn');
const inviaBtn = document.getElementById('invia-btn');

const listeningOverlay = document.getElementById('listening-overlay');
const listeningFieldName = document.getElementById('listening-field-name');
const liveTranscript = document.getElementById('live-transcript');

const devPanel = document.getElementById('dev-panel');
const devPanelHeader = document.getElementById('dev-panel-header');
const devLogsContainer = document.getElementById('dev-logs-container');
const devStatusBadge = document.getElementById('giobby-status');

const modalBackdrop = document.getElementById('modal-backdrop');
const successModal = document.getElementById('success-modal');
const successModalText = document.getElementById('success-modal-text');
const successModalClose = document.getElementById('success-modal-close');
const errorModal = document.getElementById('error-modal');
const errorModalText = document.getElementById('error-modal-text');
const errorModalClose = document.getElementById('error-modal-close');

// ----------------------------------------------------
// DEVELOPER LOGGING UTILITIES
// ----------------------------------------------------

function addLog(type, message, json = null) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}]`;
  entry.appendChild(timeSpan);
  
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  entry.appendChild(textSpan);
  
  if (json) {
    const pre = document.createElement('pre');
    pre.className = 'log-json';
    pre.innerHTML = syntaxHighlightJSON(json);
    entry.appendChild(pre);
  }
  
  devLogsContainer.appendChild(entry);
  devLogsContainer.scrollTop = devLogsContainer.scrollHeight;
}

// Utility to syntax highlight JSON strings for the log panel
function syntaxHighlightJSON(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  // Escape HTML tags
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------

// Set default date to today relative to system baseline May 28, 2026
dataInput.value = '2026-05-28';

// Toggle dev panel collapse/expand
devPanelHeader.addEventListener('click', () => {
  devPanel.classList.toggle('expanded');
});

// Setup online status
async function checkConnectivity() {
  try {
    devStatusBadge.className = 'status-badge';
    devStatusBadge.textContent = 'Verifica...';
    
    // Call customers list with empty search just to trigger oauth validation check
    const res = await fetch('/api/customers?q=');
    if (res.ok) {
      devStatusBadge.className = 'status-badge online';
      devStatusBadge.textContent = 'Giobby Connesso';
      addLog('success', 'Collegamento alle API Giobby verificato. Stato: ONLINE.');
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    devStatusBadge.className = 'status-badge offline';
    devStatusBadge.textContent = 'Giobby Disconnesso';
    addLog('error', `Errore di connessione a Giobby: ${err.message}`);
  }
}

// Initial check
checkConnectivity();

// ----------------------------------------------------
// AUTOCOMPLETE CLIENTE
// ----------------------------------------------------

let autocompleteTimeout;
clienteInput.addEventListener('input', () => {
  const query = clienteInput.value.trim();
  clearTimeout(autocompleteTimeout);
  
  if (query.length < 2) {
    suggestionsList.style.display = 'none';
    return;
  }
  
  autocompleteTimeout = setTimeout(async () => {
    try {
      addLog('info', `Ricerca anagrafica clienti per "${query}"...`);
      const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Fetch error');
      const customers = await res.json();
      
      renderSuggestions(customers);
    } catch (e) {
      addLog('error', `Ricerca clienti fallita: ${e.message}`);
    }
  }, 300);
});

function renderSuggestions(customers) {
  suggestionsList.innerHTML = '';
  if (customers.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'autocomplete-item';
    emptyItem.style.color = 'var(--text-muted)';
    emptyItem.style.cursor = 'default';
    emptyItem.textContent = 'Nessun cliente trovato';
    suggestionsList.appendChild(emptyItem);
    suggestionsList.style.display = 'block';
    return;
  }
  
  customers.forEach(c => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = c.contact.name;
    item.addEventListener('click', () => {
      selectCustomer(c);
    });
    suggestionsList.appendChild(item);
  });
  suggestionsList.style.display = 'block';
}

function selectCustomer(c) {
  selectedCustomer = {
    id: c.id,
    idContact: c.contact.id,
    name: c.contact.name
  };
  
  clienteInput.value = '';
  clienteInput.style.display = 'none';
  suggestionsList.style.display = 'none';
  
  selectedClienteText.textContent = selectedCustomer.name;
  selectedClienteBadge.style.display = 'flex';
  
  addLog('success', `Cliente selezionato ed associato: ${selectedCustomer.name} (ID Customer: ${selectedCustomer.id}, ID Contact: ${selectedCustomer.idContact})`);
}

clearClienteBtn.addEventListener('click', () => {
  selectedCustomer = null;
  selectedClienteBadge.style.display = 'none';
  clienteInput.style.display = 'block';
  clienteInput.focus();
  addLog('info', 'Selezione cliente annullata.');
});

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  if (e.target !== clienteInput) {
    suggestionsList.style.display = 'none';
  }
});

// ----------------------------------------------------
// ARTICLES STATE MANAGEMENT
// ----------------------------------------------------

function addArticle(quantita, descrizione, idVat = '22') {
  const article = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    quantity: quantita,
    description: descrizione,
    idVat: idVat,
    idPosType: 1
  };
  articlesList.push(article);
  renderArticles();
  addLog('nlp', `Articolo aggiunto al carrello: [Qtà: ${quantita}] ${descrizione}`);
}

function removeArticle(id) {
  articlesList = articlesList.filter(a => a.id !== id);
  renderArticles();
  addLog('info', 'Articolo rimosso dal riepilogo.');
}

function updateArticleQuantity(id, qty) {
  const art = articlesList.find(a => a.id === id);
  if (art) {
    art.quantity = parseFloat(qty) || 0;
  }
}

function updateArticleVat(id, vat) {
  const art = articlesList.find(a => a.id === id);
  if (art) {
    art.idVat = vat;
  }
}

function renderArticles() {
  articlesContainer.innerHTML = '';
  articleCountBadge.textContent = `${articlesList.length} articoli`;
  
  if (articlesList.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Nessun articolo inserito. Usa il pulsante vocale o inserisci manualmente.';
    articlesContainer.appendChild(emptyState);
    return;
  }
  
  articlesList.forEach(a => {
    const row = document.createElement('div');
    row.className = 'article-row';
    
    row.innerHTML = `
      <div class="article-header">
        <div class="article-desc">${a.description}</div>
        <button type="button" class="delete-article-btn" data-id="${a.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="article-details">
        <div class="article-field">
          <span>Qtà:</span>
          <input type="number" class="qty-field" value="${a.quantity}" min="1" step="any" data-id="${a.id}">
        </div>
        <div class="article-field">
          <span>IVA:</span>
          <select class="vat-field" data-id="${a.id}">
            <option value="22" ${a.idVat === '22' ? 'selected' : ''}>22%</option>
            <option value="10" ${a.idVat === '10' ? 'selected' : ''}>10%</option>
            <option value="4" ${a.idVat === '4' ? 'selected' : ''}>4%</option>
            <option value="0" ${a.idVat === '0' ? 'selected' : ''}>0%</option>
          </select>
        </div>
      </div>
    `;
    
    // Attach live listeners
    row.querySelector('.qty-field').addEventListener('input', (e) => {
      updateArticleQuantity(a.id, e.target.value);
    });
    row.querySelector('.vat-field').addEventListener('change', (e) => {
      updateArticleVat(a.id, e.target.value);
    });
    row.querySelector('.delete-article-btn').addEventListener('click', () => {
      removeArticle(a.id);
    });
    
    articlesContainer.appendChild(row);
  });
}

// Manual addition backup
addArticoloManualBtn.addEventListener('click', () => {
  const desc = prompt('Inserisci la descrizione del prodotto:');
  if (!desc) return;
  const qtyStr = prompt('Inserisci la quantità:', '1');
  const qty = parseFloat(qtyStr) || 1;
  addArticle(qty, desc);
});

// ----------------------------------------------------
// WEB SPEECH API & VOCAL RECOGNITION
// ----------------------------------------------------

let recognition = null;
let activeField = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechGen();
  recognition.lang = 'it-IT';
  recognition.continuous = false;
  recognition.interimResults = true;
  
  recognition.onstart = () => {
    liveTranscript.textContent = 'Ascolto in corso...';
    listeningOverlay.classList.add('active');
    addLog('info', `Riconoscimento vocale avviato per il campo: ${activeField.toUpperCase()}`);
  };
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    liveTranscript.textContent = `"${finalTranscript || interimTranscript}"`;
  };
  
  recognition.onend = async () => {
    listeningOverlay.classList.remove('active');
    const finalSpeech = liveTranscript.textContent.replace(/^"|"$/g, '').trim();
    
    if (!finalSpeech || finalSpeech === 'Ascolto in corso...') {
      addLog('warning', 'Nessuna dicitura vocale rilevata o registrazione interrotta.');
      return;
    }
    
    addLog('info', `Trascrizione grezza vocale ricevuta: "${finalSpeech}"`);
    await processSpeech(activeField, finalSpeech);
  };
  
  recognition.onerror = (event) => {
    addLog('error', `Errore nel riconoscimento vocale: ${event.error}`);
    listeningOverlay.classList.remove('active');
  };
} else {
  addLog('warning', 'Il tuo browser non supporta le API di sintesi vocale. Digita o simula i testi.');
}

// Attach microphone button triggers
function setupMicTrigger(buttonId, fieldName, displayName) {
  document.getElementById(buttonId).addEventListener('click', () => {
    if (!recognition) {
      // Simulate input if browser doesn't support mic
      const mockText = prompt(`Il tuo browser non supporta il microfono. Inserisci una simulazione di trascrizione vocale per [${displayName}]:`);
      if (mockText) {
        addLog('info', `Simulazione testo vocale per ${fieldName}: "${mockText}"`);
        processSpeech(fieldName, mockText);
      }
      return;
    }
    
    activeField = fieldName;
    listeningFieldName.textContent = displayName;
    recognition.start();
  });
}

setupMicTrigger('mic-cliente', 'cliente', 'Cliente');
setupMicTrigger('mic-data', 'data', 'Data Documento');
setupMicTrigger('mic-causale', 'causale', 'Causale Trasporto');
setupMicTrigger('mic-articolo', 'articolo', 'Aggiungi Articolo');

// ----------------------------------------------------
// PROCESS TRANSCRIPTION WITH NLP ENDPOINT
// ----------------------------------------------------

async function processSpeech(field, text) {
  try {
    addLog('info', `Invio trascrizione grezza al parser NLP (/api/parse) per campo [${field}]...`);
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, text })
    });
    
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    const result = data.result;
    
    addLog('nlp', `Risultato parser NLP per [${field}]`, result);
    
    // Map output to UI fields
    if (field === 'cliente') {
      clienteInput.value = result;
      // Trigger autocomplete lookup dynamically
      clienteInput.dispatchEvent(new Event('input'));
    } else if (field === 'data') {
      dataInput.value = result;
    } else if (field === 'causale') {
      // Find matching option or set value
      const cleanedCausale = result;
      let matched = false;
      for (let i = 0; i < causaleSelect.options.length; i++) {
        if (causaleSelect.options[i].value.toLowerCase() === cleanedCausale.toLowerCase()) {
          causaleSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) {
        addLog('warning', `Causale "${cleanedCausale}" non standardizzata per Giobby. Opzioni ammesse: Vendita, Conto Visione, Reso.`);
      }
    } else if (field === 'articolo') {
      if (result && typeof result === 'object') {
        const qty = result.quantita || 1;
        const desc = result.descrizione_prodotto || text;
        addArticle(qty, desc);
      } else {
        // Fallback
        addArticle(1, text);
      }
    }
    
  } catch (err) {
    addLog('error', `Processamento NLP fallito: ${err.message}`);
  }
}

// ----------------------------------------------------
// SEND DDT TO GIOBBY
// ----------------------------------------------------

async function submitDDT(isSimulation = false) {
  if (!selectedCustomer) {
    showErrorModal('Seleziona un cliente valido dall\'anagrafica prima di procedere.');
    return;
  }
  
  if (articlesList.length === 0) {
    showErrorModal('Inserisci almeno un articolo prima di inviare il DDT.');
    return;
  }
  
  const docDate = dataInput.value;
  const causale = causaleSelect.value;
  
  // Build API JSON request payload according to Giobby DocumentApi schema
  const payload = {
    idDocumentType: 1,
    idDocumentTypeExt: 0,
    idOrderType: 1,
    idCustomer: selectedCustomer.id,
    idContact: selectedCustomer.idContact,
    docDate: docDate,
    idNumerator: 1, // Numerator 'Num 1' standard for the account
    idBu: "U1",
    rows: articlesList.map((a, index) => ({
      idPos: index + 1,
      idMaterial: null, // text-only generic items
      idPosType: 1,
      quantity: a.quantity,
      idVat: a.idVat,
      description: a.description
    })),
    deliveryData: {
      reason: causale,
      idReasonType: -1, // personalizzato/custom reason text
      idGoodsAppearence: 1, // standard A VISTA
      idDeliveryChargeTo: 2, // standard Porto Assegnato
      idDeliveredBy: 2 // standard A mezzo Destinatario
    }
  };
  
  try {
    const actionLabel = isSimulation ? 'Simulazione validazione' : 'Invio DDT';
    addLog('request', `Richiesta in corso: ${actionLabel}... Payload inviato:`, payload);
    
    const url = `/api/goodsissue?simulation=${isSimulation}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw { message: data.error || 'Errore server', details: data.details };
    }
    
    addLog('success', `Risposta ricevuta con successo!`, data);
    
    if (isSimulation) {
      let warningText = '';
      if (data.concatWarningMessages) {
        warningText = `\n\nAttenzione: ${data.concatWarningMessages}`;
      }
      showSuccessModal(`La simulazione del DDT è andata a buon fine. Il documento è stato validato con successo da Giobby!${warningText}`);
    } else {
      const docNum = data.document.docNumber || 'generato';
      const docDesc = data.document.docDescription || '';
      showSuccessModal(`DDT creato con successo! Numero documento: ${docNum} (${docDesc})`);
      // Reset form on success
      resetForm();
    }
    
  } catch (err) {
    addLog('error', `Errore durante ${isSimulation ? 'simulazione' : 'invio'}: ${err.message}`, err.details || err);
    showErrorModal(`Impossibile completare l'operazione. ${err.message}.`);
  }
}

function resetForm() {
  articlesList = [];
  renderArticles();
  selectedCustomer = null;
  selectedClienteBadge.style.display = 'none';
  clienteInput.style.display = 'block';
  clienteInput.value = '';
}

simulaBtn.addEventListener('click', () => submitDDT(true));
inviaBtn.addEventListener('click', () => submitDDT(false));

// ----------------------------------------------------
// MODALS LOGIC
// ----------------------------------------------------

function showSuccessModal(text) {
  successModalText.textContent = text;
  modalBackdrop.classList.add('active');
  successModal.style.display = 'block';
  errorModal.style.display = 'none';
}

function showErrorModal(text) {
  errorModalText.textContent = text;
  modalBackdrop.classList.add('active');
  errorModal.style.display = 'block';
  successModal.style.display = 'none';
}

function closeModal() {
  modalBackdrop.classList.remove('active');
}

successModalClose.addEventListener('click', closeModal);
errorModalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});
