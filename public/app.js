// Global state variables
let selectedCustomer = null;
let articlesList = [];
let warehousesList = [];
let selectedProductForQty = null;
let draftsList = [];
let selectedDraftsIds = new Set();
let currentEditingDraftId = null;
let isVoiceQuantityCancelled = false;
let voiceQtyTimeout = null;

// DOM Elements
const ddtForm = document.getElementById('ddt-form');
const clienteInput = document.getElementById('cliente-input');
const suggestionsList = document.getElementById('cliente-suggestions');
const selectedClienteBadge = document.getElementById('selected-cliente-badge');
const selectedClienteText = document.getElementById('selected-cliente-text');
const clearClienteBtn = document.getElementById('clear-cliente-btn');

// Drafts & Navigation elements
const tabCompile = document.getElementById('tab-compile');
const tabDrafts = document.getElementById('tab-drafts');
const compileView = document.getElementById('compile-view');
const draftsView = document.getElementById('drafts-view');
const editingBanner = document.getElementById('editing-banner');
const editingDraftInfo = document.getElementById('editing-draft-info');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const saveDraftBtn = document.getElementById('save-draft-btn');
const bulkSendBtn = document.getElementById('bulk-send-btn');
const selectAllDraftsChk = document.getElementById('select-all-drafts-chk');

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
loadWarehouses();
updateDraftsBadgeCount();

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

function addArticle(quantita, descrizione, idVat = '22', idMaterial = null) {
  const article = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    quantity: quantita,
    description: descrizione,
    idVat: idVat,
    idPosType: 1,
    idMaterial: idMaterial,
    idWarehouse: null
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

function updateArticleWarehouse(id, whId) {
  const art = articlesList.find(a => a.id === id);
  if (art) {
    art.idWarehouse = whId || null;
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
      <div class="article-warehouse-row">
        <div class="article-field wh-field-wrap">
          <span>🏭</span>
          <select class="wh-field" data-id="${a.id}">
            <option value="">— Magazzino —</option>
            ${warehousesList.map(w => `<option value="${w.id}" ${a.idWarehouse === String(w.id) ? 'selected' : ''}>${w.description || w.id}</option>`).join('')}
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
    row.querySelector('.wh-field').addEventListener('change', (e) => {
      updateArticleWarehouse(a.id, e.target.value);
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
    
    // Keyword detection: "categoria" → open category browser
    if (activeField === 'articolo' && /\bcategor/i.test(finalSpeech)) {
      addLog('info', '🗂️ Parola chiave "categoria" rilevata → apertura browser categorie.');
      openCategoryBrowser();
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

if (listeningOverlay) {
  listeningOverlay.addEventListener('click', (e) => {
    if (e.target === listeningOverlay) {
      if (recognition) {
        try {
          recognition.abort();
        } catch (err) {}
      }
      listeningOverlay.classList.remove('active');
      addLog('info', 'Riconoscimento vocale principale annullato dall\'utente cliccando sullo sfondo.');
    }
  });
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
  const payload = buildPayload(selectedCustomer, docDate, causale, articlesList);
  
  try {
    const actionLabel = isSimulation ? 'Simulazione validazione' : 'Invio DDT';
    addLog('request', `Richiesta in corso: ${actionLabel}... Payload inviato:`, payload);
    
    let data;
    if (isSimulation) {
      const url = `/api/goodsissue?simulation=true`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await res.json();
      if (!res.ok) {
        throw { message: data.error || 'Errore server', details: data.details };
      }
    } else {
      data = await postDDTToGiobby(payload);
    }
    
    addLog('success', `Risposta ricevuta con successo!`, data);
    
    if (isSimulation) {
      let warningText = '';
      if (data.concatWarningMessages) {
        warningText = `\n\nAttenzione: ${data.concatWarningMessages}`;
      }
      showSuccessModal(`La simulazione del DDT è andata a buon fine. Il documento è stato validato con successo da Giobby!${warningText}`);
    } else {
      const docNum = (data.document && data.document.docNumber) ? data.document.docNumber : (data.docNumber || data.id || 'generato');
      const docDesc = (data.document && data.document.docDescription) ? data.document.docDescription : (data.docDescription || '');
      showSuccessModal(`DDT creato con successo! Numero documento: ${docNum}${docDesc ? ' (' + docDesc + ')' : ''}`);
      
      // If we successfully submitted to Giobby and were editing a draft, delete the draft
      if (currentEditingDraftId) {
        await deleteDraftFromAPI(currentEditingDraftId);
        clearEditingMode();
        updateDraftsBadgeCount();
      }

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
  clearEditingMode();
}

simulaBtn.addEventListener('click', () => submitDDT(true));
inviaBtn.addEventListener('click', () => submitDDT(false));

// ====================================================
// DRAFTS SYSTEM (LOCAL & LOCALSTORAGE SYNC)
// ====================================================

function buildPayload(customer, docDate, causale, articles) {
  return {
    idDocumentType: 1,
    idDocumentTypeExt: 0,
    idOrderType: 1,
    idCustomer: customer.id,
    idContact: customer.idContact,
    docDate: docDate,
    idNumerator: 1, // Numerator 'Num 1' standard for the account
    idBu: "U1",
    rows: articles.map((a, index) => ({
      idPos: index + 1,
      idMaterial: a.idMaterial || null,
      idPosType: 1,
      quantity: a.quantity,
      idVat: a.idVat,
      description: a.description,
      ...(a.idWarehouse ? { idWarehouse: a.idWarehouse } : {})
    })),
    deliveryData: {
      reason: causale,
      idReasonType: -1, // personalizzato/custom reason text
      idGoodsAppearence: 1, // standard A VISTA
      idDeliveryChargeTo: 2, // standard Porto Assegnato
      idDeliveredBy: 2 // standard A mezzo Destinatario
    }
  };
}

async function postDDTToGiobby(payload) {
  const url = `/api/goodsissue?simulation=false`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw { message: data.error || 'Errore server', details: data.details };
  }
  return data;
}

async function getDraftsFromAPI() {
  try {
    const res = await fetch('/api/drafts');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('API GET /api/drafts failed, falling back to localStorage:', err);
  }
  try {
    const local = localStorage.getItem('bozze_ddt');
    return local ? JSON.parse(local) : [];
  } catch (e) {
    return [];
  }
}

async function saveDraftToAPI(draft) {
  let savedDraft = draft;
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    if (res.ok) {
      const respData = await res.json();
      savedDraft = respData.draft || draft;
    }
  } catch (err) {
    console.warn('API POST /api/drafts failed, using local storage fallback:', err);
  }
  
  try {
    let localDrafts = [];
    const local = localStorage.getItem('bozze_ddt');
    if (local) localDrafts = JSON.parse(local);
    
    if (savedDraft.id) {
      const idx = localDrafts.findIndex(d => String(d.id) === String(savedDraft.id));
      if (idx !== -1) {
        localDrafts[idx] = { ...localDrafts[idx], ...savedDraft, updatedAt: new Date().toISOString() };
      } else {
        localDrafts.push(savedDraft);
      }
    } else {
      savedDraft.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      savedDraft.createdAt = new Date().toISOString();
      localDrafts.push(savedDraft);
    }
    localStorage.setItem('bozze_ddt', JSON.stringify(localDrafts));
  } catch (e) {
    console.error('Failed to sync to localStorage:', e);
  }
  return savedDraft;
}

async function deleteDraftFromAPI(id) {
  try {
    const res = await fetch(`/api/drafts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('API DELETE /api/drafts failed, using local storage fallback:', err);
  }
  
  try {
    const local = localStorage.getItem('bozze_ddt');
    if (local) {
      let localDrafts = JSON.parse(local);
      localDrafts = localDrafts.filter(d => String(d.id) !== String(id));
      localStorage.setItem('bozze_ddt', JSON.stringify(localDrafts));
    }
  } catch (e) {
    console.error('Failed to sync delete to localStorage:', e);
  }
}

async function updateDraftsBadgeCount() {
  const drafts = await getDraftsFromAPI();
  const badge = document.getElementById('drafts-count');
  if (badge) {
    badge.textContent = drafts.length;
    badge.style.display = drafts.length > 0 ? 'inline-block' : 'none';
  }
}

function formatDateIT(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function clearEditingMode() {
  currentEditingDraftId = null;
  if (editingBanner) editingBanner.style.display = 'none';
  if (editingDraftInfo) editingDraftInfo.textContent = '';
}

async function saveDraft() {
  if (!selectedCustomer && articlesList.length === 0) {
    showErrorModal('Non puoi salvare una bozza vuota. Seleziona un cliente o aggiungi almeno un articolo.');
    return;
  }
  
  const docDate = dataInput.value;
  const causale = causaleSelect.value;
  
  const draft = {
    data: docDate,
    causale: causale,
    selectedCustomer: selectedCustomer,
    articles: articlesList.map(a => ({
      quantity: a.quantity,
      description: a.description,
      idVat: a.idVat,
      idMaterial: a.idMaterial || null,
      idWarehouse: a.idWarehouse || null
    }))
  };
  
  if (currentEditingDraftId) {
    draft.id = currentEditingDraftId;
    addLog('info', `Salvataggio modifiche bozza ID: ${currentEditingDraftId}...`);
  } else {
    addLog('info', 'Creazione nuova bozza...');
  }
  
  const saved = await saveDraftToAPI(draft);
  addLog('success', `Bozza salvata con successo. ID: ${saved.id}`);
  
  clearEditingMode();
  resetForm();
  updateDraftsBadgeCount();
  showSuccessModal('Bozza salvata con successo.');
}

function editDraft(d) {
  clearEditingMode();
  currentEditingDraftId = d.id;
  
  if (d.selectedCustomer) {
    selectedCustomer = { ...d.selectedCustomer };
    clienteInput.value = '';
    clienteInput.style.display = 'none';
    suggestionsList.style.display = 'none';
    selectedClienteText.textContent = selectedCustomer.name;
    selectedClienteBadge.style.display = 'flex';
  } else {
    selectedCustomer = null;
    clienteInput.style.display = 'block';
    clienteInput.value = '';
    selectedClienteBadge.style.display = 'none';
  }
  
  dataInput.value = d.data || '2026-05-28';
  
  let matched = false;
  for (let i = 0; i < causaleSelect.options.length; i++) {
    if (causaleSelect.options[i].value === d.causale) {
      causaleSelect.selectedIndex = i;
      matched = true;
      break;
    }
  }
  if (!matched) {
    causaleSelect.selectedIndex = 0;
  }
  
  articlesList = (d.articles || []).map(a => ({
    id: Date.now() + Math.random().toString(36).substr(2, 5) + Math.random().toString(36).substr(2, 2),
    quantity: a.quantity,
    description: a.description,
    idVat: a.idVat || '22',
    idPosType: 1,
    idMaterial: a.idMaterial || null,
    idWarehouse: a.idWarehouse || null
  }));
  
  renderArticles();
  
  if (editingBanner) {
    const customerName = d.selectedCustomer ? d.selectedCustomer.name : 'Senza Cliente';
    editingDraftInfo.textContent = `${customerName} (${d.articles ? d.articles.length : 0} art.)`;
    editingBanner.style.display = 'flex';
  }
  
  addLog('info', `Bozza caricata nel modulo di compilazione. ID: ${d.id}`);
  setActiveTab('compile');
}

async function sendSingleDraft(d) {
  if (!d.selectedCustomer) {
    showErrorModal('La bozza non ha un cliente associato. Clicca su "Modifica" per associarne uno.');
    return;
  }
  if (!d.articles || d.articles.length === 0) {
    showErrorModal('La bozza non ha articoli. Clicca su "Modifica" per aggiungerne.');
    return;
  }
  
  const statusDiv = document.getElementById(`sending-status-${d.id}`);
  if (statusDiv) {
    statusDiv.className = 'draft-sending-status';
    statusDiv.style.display = 'flex';
    statusDiv.innerHTML = '<div class="draft-spinner"></div> Invio a Giobby...';
  }
  
  const payload = buildPayload(d.selectedCustomer, d.data, d.causale || 'Vendita', d.articles);
  addLog('request', `Invio singolo bozza ID ${d.id}...`, payload);
  
  try {
    const data = await postDDTToGiobby(payload);
    addLog('success', `Bozza ID ${d.id} inviata con successo.`, data);
    
    if (statusDiv) {
      statusDiv.className = 'draft-sending-status success';
      statusDiv.innerHTML = '✅ Inviato con successo!';
    }
    
    await deleteDraftFromAPI(d.id);
    
    const docNum = (data.document && data.document.docNumber) ? data.document.docNumber : (data.docNumber || data.id || 'generato');
    showSuccessModal(`DDT creato con successo dalla bozza! Numero documento: ${docNum}`);
    
    setTimeout(() => {
      loadDrafts();
      updateDraftsBadgeCount();
    }, 1500);
    
  } catch (err) {
    addLog('error', `Invio bozza ID ${d.id} fallito: ${err.message}`, err.details || err);
    if (statusDiv) {
      statusDiv.className = 'draft-sending-status error';
      statusDiv.innerHTML = `❌ Errore: ${err.message}`;
    }
    showErrorModal(`Impossibile inviare la bozza. ${err.message}`);
  }
}

async function sendBulkDrafts() {
  if (selectedDraftsIds.size === 0) {
    showErrorModal('Nessuna bozza selezionata.');
    return;
  }
  
  const idsToSend = Array.from(selectedDraftsIds);
  addLog('info', `Inizio invio massivo per ${idsToSend.length} bozze.`);
  
  if (bulkSendBtn) bulkSendBtn.disabled = true;
  if (selectAllDraftsChk) selectAllDraftsChk.disabled = true;
  
  let successCount = 0;
  let failCount = 0;
  
  for (let id of idsToSend) {
    const d = draftsList.find(item => String(item.id) === id);
    if (!d) continue;
    
    const statusDiv = document.getElementById(`sending-status-${d.id}`);
    if (statusDiv) {
      statusDiv.className = 'draft-sending-status';
      statusDiv.style.display = 'flex';
      statusDiv.innerHTML = '<div class="draft-spinner"></div> Invio...';
    }
    
    if (!d.selectedCustomer) {
      if (statusDiv) {
        statusDiv.className = 'draft-sending-status error';
        statusDiv.innerHTML = '❌ Errore: Cliente mancante';
      }
      addLog('error', `Invio bozza ID ${d.id} fallito: Cliente non specificato.`);
      failCount++;
      continue;
    }
    
    if (!d.articles || d.articles.length === 0) {
      if (statusDiv) {
        statusDiv.className = 'draft-sending-status error';
        statusDiv.innerHTML = '❌ Errore: Nessun articolo';
      }
      addLog('error', `Invio bozza ID ${d.id} fallito: Nessun articolo.`);
      failCount++;
      continue;
    }
    
    const payload = buildPayload(d.selectedCustomer, d.data, d.causale || 'Vendita', d.articles);
    
    try {
      const data = await postDDTToGiobby(payload);
      addLog('success', `Bozza ID ${d.id} inviata con successo.`, data);
      
      if (statusDiv) {
        statusDiv.className = 'draft-sending-status success';
        statusDiv.innerHTML = '✅ Inviato!';
      }
      
      await deleteDraftFromAPI(d.id);
      selectedDraftsIds.delete(id);
      successCount++;
    } catch (err) {
      addLog('error', `Invio bozza ID ${d.id} fallito: ${err.message}`, err.details || err);
      if (statusDiv) {
        statusDiv.className = 'draft-sending-status error';
        statusDiv.innerHTML = `❌ Errore: ${err.message}`;
      }
      failCount++;
    }
    
    await new Promise(r => setTimeout(r, 600));
  }
  
  if (bulkSendBtn) bulkSendBtn.disabled = false;
  if (selectAllDraftsChk) {
    selectAllDraftsChk.disabled = false;
    selectAllDraftsChk.checked = false;
  }
  
  addLog('success', `Invio massivo completato. Successi: ${successCount}, Falliti: ${failCount}`);
  
  if (failCount === 0) {
    showSuccessModal(`Tutti i DDT selezionati sono stati creati con successo! (${successCount} inviati)`);
  } else {
    showErrorModal(`Invio massivo completato con errori. Successi: ${successCount}, Falliti: ${failCount}. Controlla gli indicatori sulle bozze.`);
  }
  
  loadDrafts();
  updateDraftsBadgeCount();
}

async function loadDrafts() {
  const container = document.getElementById('drafts-list-container');
  const bulkBar = document.getElementById('bulk-actions-bar');
  const draftsCount = document.getElementById('drafts-total-count');
  
  if (!container) return;
  
  container.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento bozze...</div>';
  
  try {
    draftsList = await getDraftsFromAPI();
    
    const validIds = new Set(draftsList.map(d => String(d.id)));
    for (let id of selectedDraftsIds) {
      if (!validIds.has(id)) {
        selectedDraftsIds.delete(id);
      }
    }
    
    draftsCount.textContent = `${draftsList.length} bozze`;
    
    if (draftsList.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessuna bozza salvata.</div>';
      if (bulkBar) bulkBar.style.display = 'none';
      updateBulkActionsUI();
      return;
    }
    
    if (bulkBar) bulkBar.style.display = 'flex';
    container.innerHTML = '';
    
    draftsList.forEach(d => {
      const card = document.createElement('div');
      card.className = 'draft-card';
      card.id = `draft-card-${d.id}`;
      
      const customerName = d.selectedCustomer ? d.selectedCustomer.name : 'Cliente non specificato';
      const articlesCount = d.articles ? d.articles.length : 0;
      const formattedDate = d.data ? formatDateIT(d.data) : 'Nessuna data';
      const isSelected = selectedDraftsIds.has(String(d.id));
      
      let itemsSummary = '';
      if (d.articles && d.articles.length > 0) {
        itemsSummary = d.articles.map(a => `${a.quantity}x ${a.description}`).join(', ');
        if (itemsSummary.length > 60) {
          itemsSummary = itemsSummary.substring(0, 57) + '...';
        }
      } else {
        itemsSummary = 'Nessun articolo';
      }
      
      card.innerHTML = `
        <div class="draft-card-header">
          <div class="draft-select-wrap">
            <label class="custom-checkbox">
              <input type="checkbox" class="draft-select-chk" data-id="${d.id}" ${isSelected ? 'checked' : ''}>
              <span class="checkmark"></span>
            </label>
          </div>
          <div class="draft-info">
            <div class="draft-customer">${customerName}</div>
            <div class="draft-meta">
              <span>📅 ${formattedDate}</span>
              <span>📝 ${d.causale || 'Vendita'}</span>
              <span>📦 ${articlesCount} art.</span>
            </div>
          </div>
        </div>
        <div class="draft-card-body">
          <div class="draft-items-summary">${itemsSummary}</div>
          <div class="draft-sending-status" id="sending-status-${d.id}" style="display: none;"></div>
        </div>
        <div class="draft-actions">
          <button type="button" class="draft-btn-delete" data-id="${d.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Elimina
          </button>
          <button type="button" class="draft-btn-edit" data-id="${d.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Modifica
          </button>
          <button type="button" class="draft-btn-send" data-id="${d.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Invia
          </button>
        </div>
      `;
      
      card.querySelector('.draft-select-chk').addEventListener('change', (e) => {
        const id = String(e.target.dataset.id);
        if (e.target.checked) {
          selectedDraftsIds.add(id);
        } else {
          selectedDraftsIds.delete(id);
        }
        updateBulkActionsUI();
      });
      
      card.querySelector('.draft-btn-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Sei sicuro di voler eliminare questa bozza?')) {
          await deleteDraftFromAPI(d.id);
          addLog('info', `Bozza eliminata. ID: ${d.id}`);
          loadDrafts();
          updateDraftsBadgeCount();
        }
      });
      
      card.querySelector('.draft-btn-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editDraft(d);
      });
      
      card.querySelector('.draft-btn-send').addEventListener('click', async (e) => {
        e.stopPropagation();
        await sendSingleDraft(d);
      });
      
      container.appendChild(card);
    });
    
    updateBulkActionsUI();
  } catch (err) {
    container.innerHTML = `<div class="catbrowser-error">Errore caricamento bozze.<br><small>${err.message}</small></div>`;
  }
}

function updateBulkActionsUI() {
  const selectedCount = document.getElementById('selected-drafts-count');
  const bulkSendCount = document.getElementById('bulk-send-count');
  const chkAll = document.getElementById('select-all-drafts-chk');
  
  if (selectedCount) selectedCount.textContent = selectedDraftsIds.size;
  if (bulkSendCount) bulkSendCount.textContent = selectedDraftsIds.size;
  
  if (chkAll && draftsList.length > 0) {
    chkAll.checked = selectedDraftsIds.size === draftsList.length;
  }
}

function setActiveTab(tab) {
  if (tab === 'compile') {
    tabCompile.classList.add('active');
    tabDrafts.classList.remove('active');
    compileView.style.display = 'block';
    draftsView.style.display = 'none';
  } else {
    tabCompile.classList.remove('active');
    tabDrafts.classList.add('active');
    compileView.style.display = 'none';
    draftsView.style.display = 'block';
    loadDrafts();
  }
}

// BIND TABS AND ACTION BUTTON LISTENERS
tabCompile.addEventListener('click', () => setActiveTab('compile'));
tabDrafts.addEventListener('click', () => setActiveTab('drafts'));
saveDraftBtn.addEventListener('click', saveDraft);
bulkSendBtn.addEventListener('click', sendBulkDrafts);

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    clearEditingMode();
    resetForm();
    addLog('info', 'Modifica bozza annullata.');
  });
}

if (selectAllDraftsChk) {
  selectAllDraftsChk.addEventListener('change', (e) => {
    if (e.target.checked) {
      draftsList.forEach(d => selectedDraftsIds.add(String(d.id)));
    } else {
      selectedDraftsIds.clear();
    }
    const cardChks = document.querySelectorAll('.draft-select-chk');
    cardChks.forEach(chk => {
      chk.checked = e.target.checked;
    });
    updateBulkActionsUI();
  });
}

// ====================================================
// LOAD WAREHOUSES
// ====================================================

async function loadWarehouses() {
  try {
    const res = await fetch('/api/warehouses');
    if (res.ok) {
      const data = await res.json();
      warehousesList = Array.isArray(data) ? data : [];
      if (warehousesList.length > 0) {
        addLog('info', `🏭 Magazzini caricati: ${warehousesList.length} disponibili.`);
      }
    }
  } catch (e) {
    addLog('warning', `Impossibile caricare i magazzini: ${e.message}`);
  }
}

// ====================================================
// CATEGORY BROWSER
// ====================================================

const catbrowserOverlay = document.getElementById('catbrowser-overlay');
const catbrowserBody = document.getElementById('catbrowser-body');
const catbrowserTitle = document.getElementById('catbrowser-title');
const catbrowserBackBtn = document.getElementById('catbrowser-back-btn');
const catbrowserCloseBtn = document.getElementById('catbrowser-close-btn');

let _categoriesCache = null;

document.getElementById('cat-browse-btn').addEventListener('click', openCategoryBrowser);
catbrowserCloseBtn.addEventListener('click', closeCategoryBrowser);
catbrowserOverlay.addEventListener('click', (e) => { if (e.target === catbrowserOverlay) closeCategoryBrowser(); });

async function openCategoryBrowser() {
  catbrowserOverlay.classList.add('active');
  catbrowserBackBtn.classList.add('hidden');
  catbrowserTitle.textContent = 'Scegli Categoria';
  catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento categorie...</div>';

  try {
    if (!_categoriesCache) {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      _categoriesCache = await res.json();
    }
    renderCategoryGrid(_categoriesCache);
  } catch (e) {
    catbrowserBody.innerHTML = `<div class="catbrowser-error">Impossibile caricare le categorie.<br><small>${e.message}</small></div>`;
    addLog('error', `Errore categorie: ${e.message}`);
  }
}

function closeCategoryBrowser() {
  catbrowserOverlay.classList.remove('active');
}

function renderCategoryGrid(categories) {
  catbrowserTitle.textContent = 'Scegli Categoria';
  catbrowserBackBtn.classList.add('hidden');
  catbrowserBody.innerHTML = '';

  if (!categories || categories.length === 0) {
    catbrowserBody.innerHTML = '<div class="catbrowser-empty">🗂️ Nessuna categoria trovata.</div>';
    return;
  }

  const ICONS = ['📦', '🪵', '🧱', '🔩', '🪣', '🛠️', '🏷️', '📋', '🧩', '🔧', '⚙️', '🏗️'];
  const grid = document.createElement('div');
  grid.className = 'cat-grid';

  categories.forEach((cat, i) => {
    const name = cat.description || cat.name || String(cat.id);
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `<div class="cat-icon">${ICONS[i % ICONS.length]}</div><div class="cat-name">${name}</div>`;
    card.addEventListener('click', () => loadProductsByCategory(cat));
    grid.appendChild(card);
  });

  catbrowserBody.appendChild(grid);
}

async function loadProductsByCategory(cat) {
  const catName = cat.description || cat.name || String(cat.id);
  catbrowserTitle.textContent = catName;
  catbrowserBackBtn.classList.remove('hidden');
  catbrowserBackBtn.onclick = () => renderCategoryGrid(_categoriesCache);
  catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento prodotti...</div>';
  addLog('info', `Caricamento prodotti categoria: "${catName}"...`);

  try {
    const res = await fetch(`/api/products?idCategory=${encodeURIComponent(cat.id)}`);
    if (!res.ok) throw new Error(`Errore ${res.status}`);
    const products = await res.json();
    renderProductList(products);
    addLog('success', `Prodotti: ${products.length} trovati in "${catName}".`);
  } catch (e) {
    catbrowserBody.innerHTML = `<div class="catbrowser-error">Impossibile caricare i prodotti.<br><small>${e.message}</small></div>`;
    addLog('error', `Errore prodotti: ${e.message}`);
  }
}

function renderProductList(products) {
  catbrowserBody.innerHTML = '';
  if (!products || products.length === 0) {
    catbrowserBody.innerHTML = '<div class="catbrowser-empty">Nessun prodotto in questa categoria.</div>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'prod-list';
  products.forEach(prod => {
    const name = prod.description || prod.name || String(prod.id);
    const code = prod.id || prod.code || prod.sku || '';
    
    // Mappatura magazzino di default
    const whCode = prod.defaultStorage || '';
    let whDesc = whCode;
    if (whCode && typeof warehousesList !== 'undefined') {
      const matchedWh = warehousesList.find(w => String(w.id) === String(whCode));
      if (matchedWh) {
        whDesc = matchedWh.description || whCode;
      }
    }

    const item = document.createElement('div');
    item.className = 'prod-item';
    item.innerHTML = `
      <div class="prod-info">
        <div class="prod-name" title="${name}">${name}</div>
        <div class="prod-meta">
          ${code ? `<span class="prod-code">${code}</span>` : ''}
          ${whCode ? `<span class="prod-badge badge-warehouse" title="${whDesc}">🏭 ${whCode}</span>` : ''}
        </div>
      </div>
      <button class="prod-add-btn" title="Aggiungi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    `;
    item.querySelector('.prod-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startVoiceQuantity(prod);
    });
    list.appendChild(item);
  });
  catbrowserBody.appendChild(list);
}

// ====================================================
// VOICE QUANTITY
// ====================================================

const voicequtyOverlay = document.getElementById('voicequty-overlay');
const voicequtyProductName = document.getElementById('voicequty-product-name');
const voicequtyTranscript = document.getElementById('voicequty-transcript');

function startVoiceQuantity(product) {
  isVoiceQuantityCancelled = false;
  selectedProductForQty = product;
  const name = product.description || product.name || String(product.id);
  voicequtyProductName.textContent = name;
  voicequtyTranscript.textContent = '"..."';
  voicequtyOverlay.classList.add('active');

  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechGen) {
    addLog('warning', 'Speech recognition non supportata. Inserimento manuale...');
    voiceQtyTimeout = setTimeout(() => {
      if (!isVoiceQuantityCancelled) {
        addProductFromCatalog(product, 1);
        closeVoiceQuantity();
      }
    }, 1500);
    return;
  }

  // Create a separate instance specifically for the quantity to avoid conflicts
  const qtyRec = new SpeechGen();
  qtyRec.lang = 'it-IT';
  qtyRec.continuous = false;
  qtyRec.interimResults = true;

  qtyRec.onstart = () => {
    addLog('info', `Riconoscimento vocale quantità avviato per: ${name}`);
  };

  qtyRec.onresult = (event) => {
    if (isVoiceQuantityCancelled) return;
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    voicequtyTranscript.textContent = `"${final || interim}"`;
  };

  qtyRec.onend = async () => {
    if (isVoiceQuantityCancelled) {
      closeVoiceQuantity();
      addLog('info', `Dettatura quantità annullata per: "${name}"`);
      return;
    }

    const spokenText = voicequtyTranscript.textContent.replace(/^"|"$/g, '').trim();
    let qty = 1;
    if (spokenText && spokenText !== '...') {
      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'quantita', text: spokenText })
        });
        const data = await res.json();
        qty = parseFloat(data.result) || 1;
      } catch (e) { qty = 1; }
    }

    addProductFromCatalog(product, qty);
    closeVoiceQuantity();
  };

  qtyRec.onerror = (event) => {
    addLog('error', `Errore nel riconoscimento vocale quantità: ${event.error}`);
    if (event.error !== 'aborted') {
      closeVoiceQuantity();
    }
  };

  // Wire buttons inside the quantity popup
  const voicequtyCancelBtn = document.getElementById('voicequty-cancel-btn');
  if (voicequtyCancelBtn) {
    voicequtyCancelBtn.onclick = () => {
      isVoiceQuantityCancelled = true;
      if (voiceQtyTimeout) {
        clearTimeout(voiceQtyTimeout);
        voiceQtyTimeout = null;
      }
      try {
        qtyRec.abort();
      } catch (e) {
        closeVoiceQuantity();
      }
    };
  }

  const voicequtySkipBtn = document.getElementById('voicequty-skip-btn');
  if (voicequtySkipBtn) {
    voicequtySkipBtn.onclick = () => {
      isVoiceQuantityCancelled = true; // prevent onend from adding
      if (voiceQtyTimeout) {
        clearTimeout(voiceQtyTimeout);
        voiceQtyTimeout = null;
      }
      try {
        qtyRec.abort();
      } catch (e) {}
      addProductFromCatalog(product, 1);
      closeVoiceQuantity();
    };
  }

  addLog('info', `🎤 Ascolto quantità per: "${name}"...`);
  qtyRec.start();
}

function closeVoiceQuantity() {
  voicequtyOverlay.classList.remove('active');
  selectedProductForQty = null;
}

function addProductFromCatalog(product, quantity) {
  const name = product.description || product.name || String(product.id);
  const article = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    quantity: quantity,
    description: name,
    idVat: '22',
    idPosType: 1,
    idMaterial: String(product.id || ''),
    idWarehouse: product.defaultStorage ? String(product.defaultStorage) : null
  };
  articlesList.push(article);
  renderArticles();
  closeCategoryBrowser();
  addLog('nlp', `✅ Da catalogo: [Qtà: ${quantity}] ${name} (ID: ${product.id || '-'})`);
}

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
