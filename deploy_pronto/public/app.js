// Global state variables
const isOnlineDeployment = window.location.hostname !== 'localhost' && 
                           window.location.hostname !== '127.0.0.1' && 
                           !window.location.hostname.startsWith('192.168.');

let selectedCustomer = null;
let articlesList = [];
let warehousesList = [];
let selectedProductForQty = null;
let draftsList = [];
let selectedDraftsIds = new Set();
let currentEditingDraftId = null;
let isVoiceQuantityCancelled = false;
let voiceQtyTimeout = null;
let showAllWarehouseFilters = false;
let pendingVoiceQty = null;
let currentFormula = '1';
let calculationHistory = [];
let qtyRec = null;
let isKeypadReset = true;

// Clear any legacy or stale products cache on startup
try {
  localStorage.removeItem('prodotti_cache');
} catch (e) {
  console.warn('Failed to clear legacy prodotti_cache:', e);
}

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
const tabHistory = document.getElementById('tab-history');
const tabReorder = document.getElementById('tab-reorder');
const compileView = document.getElementById('compile-view');
const draftsView = document.getElementById('drafts-view');
const historyView = document.getElementById('history-view');
const reorderView = document.getElementById('reorder-view');
const editingBanner = document.getElementById('editing-banner');
const editingDraftInfo = document.getElementById('editing-draft-info');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const saveDraftBtn = document.getElementById('save-draft-btn');
const bulkSendBtn = document.getElementById('bulk-send-btn');
const selectAllDraftsChk = document.getElementById('select-all-drafts-chk');

const dataInput = document.getElementById('data-input');
const causaleSelect = document.getElementById('causale-select');
const listinoSelect = document.getElementById('listino-select');
const articleVocalInput = document.getElementById('articolo-vocal-input');
const articlesContainer = document.getElementById('articles-container');
const articleCountBadge = document.getElementById('article-count');
const addArticoloManualBtn = document.getElementById('add-articolo-manual-btn');
const addArticlesCard = document.getElementById('add-articles-card');
const addArticlesTitle = document.getElementById('add-articles-title');

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

// Set default date to today's actual local date
const getTodayStr = () => {
  const localDate = new Date();
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayStr = getTodayStr();
dataInput.value = todayStr;

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
  // Sync sidebar status badge (PC layout)
  const sidebarStatus = document.getElementById('sidebar-giobby-status');
  if (sidebarStatus) {
    sidebarStatus.className = devStatusBadge.className;
    sidebarStatus.textContent = devStatusBadge.textContent;
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
  window.pendingCustomerSearchQuery = null; // Annulla ricerca pendente se l'utente digita altro
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
    emptyItem.className = 'autocomplete-no-results';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = 'Nessun cliente trovato.';
    emptyItem.appendChild(textSpan);
    
    const link = document.createElement('a');
    link.href = 'https://app.giobby.com/Giobby00553/company/Contact.xhtml?ftrID=cust_n';
    link.target = '_blank';
    link.textContent = '➕ Aggiungi cliente su Giobby';
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const query = clienteInput.value.trim();
      if (query.length >= 2) {
        window.pendingCustomerSearchQuery = query;
        addLog('info', `Salvata ricerca pendente per recupero automatico al rientro: "${query}"`);
      }
    });
    
    emptyItem.appendChild(link);
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

// Rileva quando l'utente torna sulla scheda dopo aver aggiunto il cliente o prodotto su Giobby
window.addEventListener('focus', async () => {
  if (window.pendingCustomerSearchQuery) {
    const query = window.pendingCustomerSearchQuery;
    
    try {
      addLog('info', `Rientro nella finestra rilevato. Tentativo di recupero automatico per cliente: "${query}"...`);
      const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Fetch error');
      const customers = await res.json();
      
      if (customers && customers.length > 0) {
        const queryCleaned = query.toLowerCase().trim();
        const matchedCustomer = customers.find(c => {
          const name = c.contact.name.toLowerCase();
          return name.includes(queryCleaned) || queryCleaned.includes(name);
        }) || customers[0];
        
        if (matchedCustomer) {
          selectCustomer(matchedCustomer);
          window.pendingCustomerSearchQuery = null; // Azzera la ricerca pendente dato che è stata trovata e associata
          addLog('success', `Cliente rilevato e associato automaticamente al rientro: "${matchedCustomer.contact.name}"`);
          showSuccessModal(`Cliente rilevato e associato automaticamente:\n${matchedCustomer.contact.name}`, "Cliente Associato");
        }
      }
    } catch (e) {
      console.warn('Recupero automatico cliente fallito:', e);
    }
  }

  if (window.pendingProductSyncSuggest) {
    window.pendingProductSyncSuggest = false;
    setTimeout(() => {
      const code = prompt("Hai creato un nuovo prodotto su Giobby?\n\n• Inserisci il CODICE o BARCODE per sincronizzare al volo solo questo articolo.\n• Lascia VUOTO e premi OK per sincronizzare l'intero catalogo.\n• Premi ANNULLA per non sincronizzare nulla.");
      if (code === null) {
        return; // Annulla
      }
      const trimmedCode = code.trim();
      if (trimmedCode === "") {
        syncProductsCatalog();
      } else {
        syncSingleProduct(trimmedCode);
      }
    }, 500);
  }
});

async function syncSingleProduct(code) {
  addLog('info', `Avvio verifica magazzino su Giobby per: "${code}"...`);
  const syncBtn = document.getElementById('catbrowser-sync-btn');
  const sidebarSyncBtn = document.getElementById('sidebar-sync-btn');
  
  const setSyncState = (syncing) => {
    if (syncBtn) {
      syncBtn.disabled = syncing;
      syncBtn.classList.toggle('spinning', syncing);
    }
    if (sidebarSyncBtn) {
      sidebarSyncBtn.disabled = syncing;
    }
  };

  try {
    setSyncState(true);
    
    // Step 1: Richiesta preliminare per verificare il magazzino associato su Giobby
    const checkRes = await fetch('/api/products/sync-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, checkOnly: true })
    });
    
    if (!checkRes.ok) {
      const errData = await checkRes.json();
      throw new Error(errData.error || `Errore verifica ${checkRes.status}`);
    }
    
    const checkData = await checkRes.json();
    if (!checkData.success || !checkData.product) {
      throw new Error("Impossibile recuperare i dettagli del prodotto da Giobby.");
    }
    
    const prod = checkData.product;
    const warehouse = prod.defaultStorage || 'MB';
    
    // Rilascia lo stato per consentire l'interazione con il modale personalizzato
    setSyncState(false);
    
    // Verifica magazzino tramite modale custom
    const proceed = await confirmWarehouse(prod);
    if (!proceed) {
      addLog('warning', `Sincronizzazione annullata dall'utente dopo verifica magazzino ("${warehouse}").`);
      return;
    }
    
    // Ripristina lo stato di caricamento per il salvataggio
    setSyncState(true);
    
    // Step 2: Procedi con il salvataggio effettivo in cache
    addLog('info', `Salvataggio in corso del prodotto "${prod.id}" nella cache locale...`);
    const res = await fetch('/api/products/sync-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `Errore salvataggio ${res.status}`);
    }
    
    const data = await res.json();
    if (data.success && data.product) {
      localStorage.removeItem('prodotti_cache');
      addLog('success', `Prodotto "${data.product.id}" sincronizzato con successo!`);
      showSuccessModal(`Prodotto sincronizzato correttamente:\n${data.product.description} (${data.product.id})\nMagazzino: ${data.product.defaultStorage}`, "Sincronizzazione Singola Completata");
      
      const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
      if (query.length >= 2) {
        searchProductsLocally(query);
      } else if (currentCategoryView) {
        loadProductsByCategory(currentCategoryView);
      } else {
        loadAllProducts();
      }
    }
  } catch (err) {
    addLog('error', `Sincronizzazione singola fallita: ${err.message}`);
    showErrorModal(`Impossibile sincronizzare il singolo prodotto.\nErrore: ${err.message}`);
  } finally {
    setSyncState(false);
  }
}

function confirmWarehouse(prod) {
  return new Promise((resolve) => {
    const confirmModal = document.getElementById('confirm-warehouse-modal');
    const nameEl = document.getElementById('conf-wh-name');
    const codeEl = document.getElementById('conf-wh-code');
    const storageEl = document.getElementById('conf-wh-storage');
    const cancelBtn = document.getElementById('conf-wh-cancel');
    const confirmBtn = document.getElementById('conf-wh-confirm');
    
    // Assegna i valori al modale
    nameEl.textContent = prod.description;
    codeEl.textContent = prod.id;
    
    const warehouse = prod.defaultStorage || 'MB';
    storageEl.textContent = warehouse;
    
    // Evidenzia in rosso lampeggiante se NON è MPR (Magazzino Parquet Romagna)
    if (warehouse !== 'MPR') {
      storageEl.className = 'flashing-red-storage';
    } else {
      storageEl.className = 'correct-green-storage';
    }
    
    // Mostra il modale e lo sfondo
    modalBackdrop.classList.add('active');
    confirmModal.style.display = 'block';
    successModal.style.display = 'none';
    errorModal.style.display = 'none';
    
    const cleanup = () => {
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      confirmModal.style.display = 'none';
      modalBackdrop.classList.remove('active');
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    
    confirmBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
  });
}

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

function updateArticlePrice(id, price) {
  const art = articlesList.find(a => a.id === id);
  if (art) {
    art.price = price !== '' ? parseFloat(price) : null;
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
  
  const listinoVal = listinoSelect ? listinoSelect.value : '';

  articlesList.forEach(a => {
    const row = document.createElement('div');
    row.className = 'article-row';
    
    const autoPrice = getArticlePriceForListino(a, listinoVal);
    const placeholderText = autoPrice !== null ? autoPrice.toFixed(2) : 'Auto';

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
        <div class="article-field wh-field-wrap" style="flex: 1;">
          <span>🏭</span>
          <select class="wh-field" data-id="${a.id}">
            <option value="">— Magazzino —</option>
            ${warehousesList.map(w => `<option value="${w.id}" ${a.idWarehouse === String(w.id) ? 'selected' : ''}>${w.description || w.id}</option>`).join('')}
          </select>
        </div>
        <div class="article-field price-field-wrap">
          <span>€:</span>
          <input type="number" class="price-field" value="${a.price !== undefined && a.price !== null ? a.price : ''}" step="any" placeholder="${placeholderText}" style="width: 70px;" data-id="${a.id}">
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
    row.querySelector('.price-field').addEventListener('input', (e) => {
      updateArticlePrice(a.id, e.target.value);
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
      let qty = 1;
      let desc = text;
      if (result && typeof result === 'object') {
        qty = result.quantita || 1;
        desc = result.descrizione_prodotto || text;
      }
      openAndSearchProduct(desc, qty);
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
      showSuccessModal(`La simulazione del DDT è andata a buon fine. Il documento è stato validato con successo da Giobby!${warningText}`, "Simulazione DDT OK");
    } else {
      const docNum = (data.document && data.document.docNumber) ? data.document.docNumber : (data.docNumber || data.id || 'generato');
      const docDesc = (data.document && data.document.docDescription) ? data.document.docDescription : (data.docDescription || '');
      showSuccessModal(`DDT creato con successo! Numero documento: ${docNum}${docDesc ? ' (' + docDesc + ')' : ''}`, "DDT Creato con Successo!");
      
      // Apri automaticamente il DDT per la stampa
      if (data.giobbyFrontendUrl) {
        addLog('info', `Apertura automatica per stampa DDT Giobby: ${data.giobbyFrontendUrl}`);
        window.open(data.giobbyFrontendUrl, '_blank');
      }
      
      saveToHistoryIfNeeded(payload, data, selectedCustomer.name);
      notifyHistoryChange();
      
      // If we successfully submitted to Giobby and were editing a draft, delete the draft
      if (currentEditingDraftId) {
        await deleteDraftFromAPI(currentEditingDraftId);
        clearEditingMode();
        updateDraftsBadgeCount();
      }

      // Reset form on success
      resetForm();
      loadHistory();
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
  if (listinoSelect) {
    listinoSelect.value = '';
  }
  clearEditingMode();
}

simulaBtn.addEventListener('click', () => submitDDT(true));
inviaBtn.addEventListener('click', () => submitDDT(false));

// ====================================================
// DRAFTS SYSTEM (LOCAL & LOCALSTORAGE SYNC)
// ====================================================

function getArticlePriceForListino(article, listinoId) {
  if (!article.prices) return null;
  const p = article.prices;
  switch (String(listinoId)) {
    case '26': // Privati
      return p.privati;
    case '27': // Posatori
      return p.posatori;
    case '24': // Bologna
      return p.bologna;
    case '10': // Parquettisti (raw listino 10)
      return p.l10 !== undefined && p.l10 !== null ? p.l10 : (p.privati ? parseFloat((p.privati / 1.35).toFixed(4)) : null);
    case '22': // Parquet Bologna (raw listino 22)
      return p.l22 !== undefined && p.l22 !== null ? p.l22 : (p.bologna ? p.bologna : null);
    case '28': // Prova Giobby (raw listino 28)
      return p.l28 !== undefined && p.l28 !== null ? p.l28 : (p.bologna ? p.bologna : null);
    default:
      return null;
  }
}

function buildPayload(customer, docDate, causale, articles) {
  const listinoVal = listinoSelect ? listinoSelect.value : '';
  const payload = {
    _customerName: customer.name, // Custom property for history logging
    idDocumentType: 1,
    idDocumentTypeExt: 0,
    idOrderType: 1,
    idCustomer: customer.id,
    idContact: customer.idContact,
    docDate: docDate,
    idNumerator: 1, // Numerator 'Num 1' standard for the account
    idBu: "U1",
    rows: articles.map((a, index) => {
      const priceVal = (a.price !== undefined && a.price !== null) ? a.price : getArticlePriceForListino(a, listinoVal);
      const row = {
        idPos: index + 1,
        idMaterial: a.idMaterial || null,
        idPosType: 1,
        quantity: a.quantity,
        idVat: a.idVat,
        description: a.description,
        ...(a.idWarehouse ? { idWarehouse: a.idWarehouse } : {})
      };
      if (priceVal !== null && priceVal !== undefined) {
        row.priceSales = priceVal;
        row.unitPrice = priceVal;
        row.price = priceVal;
        row.netPrice = priceVal;
        row.taxableAmount = priceVal;
      }
      return row;
    }),
    deliveryData: {
      reason: causale,
      idReasonType: -1, // personalizzato/custom reason text
      idGoodsAppearence: 1, // standard A VISTA
      idDeliveryChargeTo: 2, // standard Porto Assegnato
      idDeliveredBy: 2 // standard A mezzo Destinatario
    }
  };

  if (listinoVal) {
    payload.idPricelist = parseInt(listinoVal, 10);
  }

  return payload;
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
  // Sync sidebar badge (PC layout)
  const sidebarBadge = document.getElementById('sidebar-drafts-badge');
  if (sidebarBadge) {
    sidebarBadge.textContent = drafts.length;
    sidebarBadge.style.display = drafts.length > 0 ? 'inline-block' : 'none';
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
  
  const frame = document.querySelector('.smartphone-frame');
  if (frame) {
    frame.classList.remove('edit-light-theme');
    if (tabCompile.classList.contains('active')) {
      frame.classList.remove('pc-expanded');
    }
  }
  
  if (addArticlesCard) {
    addArticlesCard.classList.remove('collapsed');
  }
}

async function saveDraft() {
  if (!selectedCustomer && articlesList.length === 0) {
    showErrorModal('Non puoi salvare una bozza vuota. Seleziona un cliente o aggiungi almeno un articolo.');
    return;
  }
  
  const docDate = dataInput.value;
  const causale = causaleSelect.value;
  
  const listinoVal = listinoSelect ? listinoSelect.value : '';
  const draft = {
    data: docDate,
    causale: causale,
    idPricelist: listinoVal ? parseInt(listinoVal, 10) : null,
    selectedCustomer: selectedCustomer,
    articles: articlesList.map(a => ({
      quantity: a.quantity,
      description: a.description,
      idVat: a.idVat,
      idMaterial: a.idMaterial || null,
      idWarehouse: a.idWarehouse || null,
      prices: a.prices || null,
      price: a.price !== undefined ? a.price : null
    }))
  };
  
  if (currentEditingDraftId) {
    draft.id = currentEditingDraftId;
    addLog('info', `Salvataggio modifiche bozza ID: ${currentEditingDraftId}...`);
  } else {
    addLog('info', 'Creazione nuova bozza...');
  }
  
  const wasEditing = !!currentEditingDraftId;
  const saved = await saveDraftToAPI(draft);
  addLog('success', `Bozza salvata con successo. ID: ${saved.id}`);
  
  clearEditingMode();
  resetForm();
  updateDraftsBadgeCount();
  showSuccessModal('Bozza salvata con successo.', "Bozza Salvata");
  if (wasEditing) {
    setActiveTab('drafts');
  }
}

function editDraft(d) {
  clearEditingMode();
  currentEditingDraftId = d.id;
  
  const frame = document.querySelector('.smartphone-frame');
  if (frame) {
    frame.classList.add('pc-expanded');
    frame.classList.add('edit-light-theme');
  }
  
  if (addArticlesCard) {
    addArticlesCard.classList.add('collapsed');
  }
  
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
  
  dataInput.value = d.data || todayStr;
  
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

  if (listinoSelect) {
    listinoSelect.value = d.idPricelist ? String(d.idPricelist) : '';
  }
  
  articlesList = (d.articles || []).map(a => ({
    id: Date.now() + Math.random().toString(36).substr(2, 5) + Math.random().toString(36).substr(2, 2),
    quantity: a.quantity,
    description: a.description,
    idVat: a.idVat || '22',
    idPosType: 1,
    idMaterial: a.idMaterial || null,
    idWarehouse: a.idWarehouse || null,
    prices: a.prices || {},
    price: a.price !== undefined ? a.price : null
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
    showSuccessModal(`DDT creato con successo dalla bozza! Numero documento: ${docNum}`, "DDT Creato con Successo!");
    
    if (data.giobbyFrontendUrl) {
      addLog('info', `Apertura automatica per stampa DDT Giobby (Bozza): ${data.giobbyFrontendUrl}`);
      window.open(data.giobbyFrontendUrl, '_blank');
    }
    
    saveToHistoryIfNeeded(payload, data, d.selectedCustomer.name);
    
    loadHistory();
    
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
      saveToHistoryIfNeeded(payload, data, d.selectedCustomer.name);
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
  if (successCount > 0) {
    loadHistory();
  }
  
  if (failCount === 0) {
    showSuccessModal(`Tutti i DDT selezionati sono stati creati con successo! (${successCount} inviati)`, "DDT Creati con Successo!");
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
  const frame = document.querySelector('.smartphone-frame');
  if (tab === 'compile') {
    tabCompile.classList.add('active');
    tabDrafts.classList.remove('active');
    if (tabHistory) tabHistory.classList.remove('active');
    if (tabReorder) tabReorder.classList.remove('active');
    compileView.style.display = 'block';
    draftsView.style.display = 'none';
    if (historyView) historyView.style.display = 'none';
    if (reorderView) reorderView.style.display = 'none';
    if (currentEditingDraftId) {
      if (frame) {
        frame.classList.add('pc-expanded');
        frame.classList.add('edit-light-theme');
      }
    } else {
      if (frame) {
        frame.classList.remove('pc-expanded');
        frame.classList.remove('edit-light-theme');
      }
    }
  } else if (tab === 'drafts') {
    tabCompile.classList.remove('active');
    tabDrafts.classList.add('active');
    if (tabHistory) tabHistory.classList.remove('active');
    if (tabReorder) tabReorder.classList.remove('active');
    compileView.style.display = 'none';
    draftsView.style.display = 'block';
    if (historyView) historyView.style.display = 'none';
    if (reorderView) reorderView.style.display = 'none';
    if (frame) {
      frame.classList.add('pc-expanded');
      frame.classList.remove('edit-light-theme');
    }
    loadDrafts();
  } else if (tab === 'history') {
    tabCompile.classList.remove('active');
    tabDrafts.classList.remove('active');
    if (tabHistory) tabHistory.classList.add('active');
    if (tabReorder) tabReorder.classList.remove('active');
    compileView.style.display = 'none';
    draftsView.style.display = 'none';
    if (historyView) historyView.style.display = 'block';
    if (reorderView) reorderView.style.display = 'none';
    if (frame) {
      frame.classList.add('pc-expanded');
      frame.classList.remove('edit-light-theme');
    }
    loadHistory();
  } else if (tab === 'reorder') {
    tabCompile.classList.remove('active');
    tabDrafts.classList.remove('active');
    if (tabHistory) tabHistory.classList.remove('active');
    if (tabReorder) tabReorder.classList.add('active');
    compileView.style.display = 'none';
    draftsView.style.display = 'none';
    if (historyView) historyView.style.display = 'none';
    if (reorderView) reorderView.style.display = 'block';
    if (frame) {
      frame.classList.add('pc-expanded');
      frame.classList.remove('edit-light-theme');
    }
    loadReorderList();
  }
  // Sync sidebar nav items
  const sidebarCompile = document.getElementById('sidebar-nav-compile');
  const sidebarDrafts  = document.getElementById('sidebar-nav-drafts');
  const sidebarHistory = document.getElementById('sidebar-nav-history');
  const sidebarReorder = document.getElementById('sidebar-nav-reorder');
  if (sidebarCompile) sidebarCompile.classList.toggle('active', tab === 'compile');
  if (sidebarDrafts)  sidebarDrafts.classList.toggle('active',  tab === 'drafts');
  if (sidebarHistory) sidebarHistory.classList.toggle('active', tab === 'history');
  if (sidebarReorder) sidebarReorder.classList.toggle('active', tab === 'reorder');
}

// BIND TABS AND ACTION BUTTON LISTENERS
tabCompile.addEventListener('click', () => setActiveTab('compile'));
tabDrafts.addEventListener('click', () => setActiveTab('drafts'));
if (tabHistory) tabHistory.addEventListener('click', () => setActiveTab('history'));
if (tabReorder) tabReorder.addEventListener('click', () => setActiveTab('reorder'));
saveDraftBtn.addEventListener('click', saveDraft);
bulkSendBtn.addEventListener('click', sendBulkDrafts);

// Sidebar navigation links (PC layout)
const sidebarNavCompile = document.getElementById('sidebar-nav-compile');
const sidebarNavDrafts  = document.getElementById('sidebar-nav-drafts');
const sidebarNavDevlog  = document.getElementById('sidebar-nav-devlog');
const sidebarNavHistory = document.getElementById('sidebar-nav-history');
const sidebarNavReorder = document.getElementById('sidebar-nav-reorder');

if (sidebarNavCompile) sidebarNavCompile.addEventListener('click', () => setActiveTab('compile'));
if (sidebarNavDrafts)  sidebarNavDrafts.addEventListener('click',  () => setActiveTab('drafts'));
if (sidebarNavHistory) sidebarNavHistory.addEventListener('click', () => setActiveTab('history'));
if (sidebarNavReorder) sidebarNavReorder.addEventListener('click', () => setActiveTab('reorder'));
if (sidebarNavDevlog)  sidebarNavDevlog.addEventListener('click',  () => {
  devPanel.classList.toggle('expanded');
});


if (addArticlesTitle && addArticlesCard) {
  addArticlesTitle.addEventListener('click', () => {
    addArticlesCard.classList.toggle('collapsed');
  });
}

if (articleVocalInput) {
  articleVocalInput.addEventListener('input', () => {
    const val = articleVocalInput.value;
    if (val.trim()) {
      openAndSearchProduct(val.trim(), 1);
      articleVocalInput.value = '';
    }
  });
}

async function openAndSearchProduct(query, qty = 1) {
  pendingVoiceQty = qty;
  await openCategoryBrowser(query);
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    clearEditingMode();
    resetForm();
    addLog('info', 'Modifica bozza annullata.');
    setActiveTab('drafts');
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
        renderWarehouseFilters();
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

document.getElementById('cat-browse-btn').addEventListener('click', () => {
  pendingVoiceQty = null;
  openCategoryBrowser();
});
catbrowserCloseBtn.addEventListener('click', closeCategoryBrowser);
catbrowserOverlay.addEventListener('click', (e) => { if (e.target === catbrowserOverlay) closeCategoryBrowser(); });

const catbrowserSearchInput = document.getElementById('catbrowser-search-input');
let currentCategoryView = null;

if (catbrowserSearchInput) {
  catbrowserSearchInput.addEventListener('input', () => {
    const query = catbrowserSearchInput.value.trim();
    if (query.length < 2) {
      if (currentCategoryView) {
        loadProductsByCategory(currentCategoryView);
      } else {
        loadAllProducts();
      }
      return;
    }
    searchProductsLocally(query);
  });
}

// Render warehouse checkboxes dynamically
function renderWarehouseFilters() {
  const container = document.getElementById('wh-checkboxes-row');
  if (!container) return;

  // Preserve checked states
  const checkedVals = new Set();
  container.querySelectorAll('input').forEach(input => {
    if (input.checked) {
      checkedVals.add(input.value);
    }
  });

  // Default initial checked warehouses if none selected
  if (checkedVals.size === 0) {
    checkedVals.add("CCIW");
    checkedVals.add("MPR");
  }

  container.innerHTML = '';
  // Only show CCIW and MPR by default, or all if toggled
  const visibleWhs = showAllWarehouseFilters
    ? warehousesList
    : warehousesList.filter(w => w.id === "CCIW" || w.id === "MPR");

  visibleWhs.forEach(w => {
    const isChecked = checkedVals.has(w.id);
    const label = document.createElement('label');
    label.className = 'custom-checkbox wh-filter-lbl';
    label.innerHTML = `
      <input type="checkbox" class="wh-filter-chk" value="${w.id}" ${isChecked ? 'checked' : ''}>
      <span class="checkmark"></span>
      ${w.id}
    `;
    
    label.querySelector('input').addEventListener('change', () => {
      const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
      if (query.length >= 2) {
        searchProductsLocally(query);
      } else if (currentCategoryView) {
        loadProductsByCategory(currentCategoryView);
      } else {
        loadAllProducts();
      }
    });

    container.appendChild(label);
  });
}

// Bind Sync buttons
const catbrowserSyncBtn = document.getElementById('catbrowser-sync-btn');
const sidebarSyncBtn = document.getElementById('sidebar-sync-btn');

if (catbrowserSyncBtn) catbrowserSyncBtn.addEventListener('click', syncProductsCatalog);
if (sidebarSyncBtn) sidebarSyncBtn.addEventListener('click', syncProductsCatalog);

// Bind Giobby New Product button
const catbrowserNewProdBtn = document.getElementById('catbrowser-new-prod-btn');
if (catbrowserNewProdBtn) {
  catbrowserNewProdBtn.addEventListener('click', () => {
    window.pendingProductSyncSuggest = true;
    addLog('info', 'Apertura scheda nuovo prodotto su Giobby. Sincronizzazione proposta al rientro.');
  });
}

// Intercetta i click sui link di creazione prodotto negli empty states
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('catbrowser-new-product-link')) {
    window.pendingProductSyncSuggest = true;
    addLog('info', 'Apertura scheda nuovo prodotto su Giobby da ricerca vuota. Sincronizzazione proposta al rientro.');
  }
});

// Check sync status on load
checkProductsSyncStatus();

async function openCategoryBrowser(searchQuery = null) {
  catbrowserOverlay.classList.add('active');
  catbrowserBackBtn.classList.add('hidden');
  catbrowserTitle.textContent = 'Catalogo Prodotti';
  if (catbrowserSearchInput) catbrowserSearchInput.value = searchQuery || '';
  renderWarehouseFilters();

  // Bind toggle for showing all warehouses
  const whShowAllBtn = document.getElementById('wh-show-all-btn');
  if (whShowAllBtn) {
    whShowAllBtn.onclick = () => {
      showAllWarehouseFilters = !showAllWarehouseFilters;
      whShowAllBtn.textContent = showAllWarehouseFilters ? 'Nascondi altri' : 'Mostra altri';
      renderWarehouseFilters();
    };
    whShowAllBtn.textContent = showAllWarehouseFilters ? 'Nascondi altri' : 'Mostra altri';
  }

  // Bind change for obsolete products filter
  const hideObsoleteChk = document.getElementById('hide-obsolete-chk');
  if (hideObsoleteChk) {
    hideObsoleteChk.onchange = () => {
      const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
      if (query.length >= 2) {
        searchProductsLocally(query);
      } else if (currentCategoryView) {
        loadProductsByCategory(currentCategoryView);
      } else {
        loadAllProducts();
      }
    };
  }

  try {
    if (!_categoriesCache) {
      catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento categorie...</div>';
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      _categoriesCache = await res.json();
    }
    
    // Render sidebar categories navigation
    renderCategorySidebar(_categoriesCache);
    updateCatBrowserCartCount();

    if (searchQuery) {
      // Highlight "Tutti" in sidebar without triggering loadAllProducts
      const allBtn = document.getElementById('cat-btn-all');
      const container = document.getElementById('catbrowser-sidebar');
      if (container && allBtn) {
        container.querySelectorAll('.cat-sidebar-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        allBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      currentCategoryView = null;
      searchProductsLocally(searchQuery);
      
      // Focus the input and place cursor at the end
      if (catbrowserSearchInput) {
        catbrowserSearchInput.focus();
        const len = catbrowserSearchInput.value.length;
        catbrowserSearchInput.setSelectionRange(len, len);
      }
    } else {
      // Select active sidebar item or default to Tutti
      const allBtn = document.getElementById('cat-btn-all');
      if (currentCategoryView) {
        const activeBtn = document.getElementById(`cat-btn-${currentCategoryView.id}`);
        if (activeBtn) {
          selectCategorySidebar(currentCategoryView, activeBtn);
        } else {
          selectCategorySidebar(null, allBtn);
        }
      } else {
        selectCategorySidebar(null, allBtn);
      }
    }
  } catch (e) {
    catbrowserBody.innerHTML = `<div class="catbrowser-error">Impossibile caricare le categorie.<br><small>${e.message}</small></div>`;
    addLog('error', `Errore categorie: ${e.message}`);
  }
}

function closeCategoryBrowser() {
  catbrowserOverlay.classList.remove('active');
  hideCartTooltipImmediately();
  pendingVoiceQty = null;
}

function renderCategorySidebar(categories) {
  const container = document.getElementById('catbrowser-sidebar');
  if (!container) return;

  container.innerHTML = '';

  // Add "Tutti" button at the beginning
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'cat-sidebar-btn';
  allBtn.id = 'cat-btn-all';
  allBtn.innerHTML = '🌐 Tutti';
  allBtn.addEventListener('click', () => {
    selectCategorySidebar(null, allBtn);
  });
  container.appendChild(allBtn);

  const ICONS = ['📦', '🪵', '🧱', '🔩', '🪣', '🛠️', '🏷️', '📋', '🧩', '🔧', '⚙️', '🏗️'];
  categories.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-sidebar-btn';
    btn.id = `cat-btn-${cat.id}`;
    
    const icon = ICONS[i % ICONS.length];
    btn.innerHTML = `<span>${icon}</span> <span>${cat.description || cat.name}</span>`;
    btn.title = cat.description || cat.name;
    btn.addEventListener('click', () => {
      selectCategorySidebar(cat, btn);
    });
    container.appendChild(btn);
  });
}

function selectCategorySidebar(cat, btnElement) {
  const container = document.getElementById('catbrowser-sidebar');
  if (!container) return;
  
  container.querySelectorAll('.cat-sidebar-btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  btnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Reset search input when switching categories
  if (catbrowserSearchInput) catbrowserSearchInput.value = '';

  if (cat === null) {
    currentCategoryView = null;
    catbrowserTitle.textContent = 'Tutti i Prodotti';
    loadAllProducts();
  } else {
    currentCategoryView = cat;
    catbrowserTitle.textContent = cat.description || cat.name;
    loadProductsByCategory(cat);
  }
}

async function loadAllProducts() {
  catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento prodotti...</div>';
  
  // Try client-side cache first
  const cached = getCachedProducts({ limit: 100 });
  if (cached !== null) {
    renderProductList(cached);
    return;
  }

  try {
    const res = await fetch('/api/products?limit=100');
    if (!res.ok) throw new Error(`Errore ${res.status}`);
    const products = await res.json();
    renderProductList(products);
  } catch (e) {
    catbrowserBody.innerHTML = `<div class="catbrowser-error">Impossibile caricare i prodotti.<br><small>${e.message}</small></div>`;
  }
}

function updateCatBrowserCartCount() {
  const countSpan = document.getElementById('catbrowser-cart-count');
  const indicator = document.getElementById('catbrowser-cart-indicator');
  if (countSpan) {
    countSpan.textContent = articlesList.length;
  }
  if (indicator) {
    indicator.classList.remove('bounce');
    void indicator.offsetWidth; // trigger reflow
    indicator.classList.add('bounce');
    setTimeout(() => {
      indicator.classList.remove('bounce');
    }, 300);
  }
}

function getCachedProducts({ query, idCategory, limit = 100 }) {
  // Disable client-side localStorage cache for products to prevent desyncs with server's prodotti_cache.json
  return null;
}

function toggleLocalObsoleteInBrowser(code, obsolete) {
  try {
    let list = [];
    const saved = localStorage.getItem('obsoleti_locali');
    if (saved) {
      list = JSON.parse(saved);
    }
    const set = new Set(list);
    if (obsolete) {
      set.add(code);
    } else {
      set.delete(code);
    }
    localStorage.setItem('obsoleti_locali', JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Error saving local obsolete list:', e);
  }
}

async function searchProductsLocally(query) {
  const catParam = currentCategoryView ? `&idCategory=${encodeURIComponent(currentCategoryView.id)}` : '';
  const catName = currentCategoryView ? ` in ${currentCategoryView.description}` : '';
  catbrowserTitle.textContent = `Risultati per: "${query}"${catName}`;
  catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Ricerca in corso...</div>';
  
  // Try client-side cache first
  const cached = getCachedProducts({
    query,
    idCategory: currentCategoryView ? currentCategoryView.id : null,
    limit: 100
  });
  if (cached !== null) {
    renderProductList(cached);
    return;
  }

  try {
    const res = await fetch(`/api/products?q=${encodeURIComponent(query)}${catParam}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const products = await res.json();
    renderProductList(products);
  } catch (err) {
    catbrowserBody.innerHTML = `<div class="catbrowser-error">Errore di ricerca.<br><small>${err.message}</small></div>`;
  }
}

async function loadProductsByCategory(cat) {
  currentCategoryView = cat;
  const catName = cat.description || cat.name || String(cat.id);
  catbrowserTitle.textContent = catName;
  catbrowserBackBtn.classList.add('hidden');
  catbrowserBody.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento prodotti...</div>';
  addLog('info', `Caricamento prodotti categoria: "${catName}"...`);

  // Try client-side cache first
  const cached = getCachedProducts({
    idCategory: cat.id,
    limit: 1000
  });
  if (cached !== null) {
    renderProductList(cached);
    addLog('success', `Prodotti: ${cached.length} trovati in "${catName}" (da cache locale).`);
    return;
  }

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

function getSelectedWarehouses() {
  const chks = document.querySelectorAll('.wh-filter-chk');
  const selected = [];
  chks.forEach(chk => {
    if (chk.checked) {
      selected.push(chk.value);
    }
  });
  return selected;
}

async function syncProductsCatalog() {
  const syncBtn = document.getElementById('catbrowser-sync-btn');
  const sidebarSyncBtn = document.getElementById('sidebar-sync-btn');
  
  const setSyncState = (syncing) => {
    if (syncBtn) {
      syncBtn.disabled = syncing;
      syncBtn.classList.toggle('spinning', syncing);
    }
    if (sidebarSyncBtn) {
      sidebarSyncBtn.disabled = syncing;
      sidebarSyncBtn.innerHTML = syncing ? '<div class="draft-spinner"></div> Sincronizzazione...' : '🔄 Sincronizza Catalogo';
    }
  };

  const sidebarProgress = document.getElementById('sidebar-sync-progress');
  const sidebarProgressBar = document.getElementById('sidebar-sync-progress-bar');
  const sidebarProgressText = document.getElementById('sidebar-sync-progress-text');

  const catbrowserProgress = document.getElementById('catbrowser-sync-progress');
  const catbrowserProgressBar = document.getElementById('catbrowser-sync-progress-bar');
  const catbrowserProgressText = document.getElementById('catbrowser-sync-progress-text');

  const showInlineProgress = () => {
    if (sidebarProgress) sidebarProgress.classList.add('active');
    if (catbrowserProgress) catbrowserProgress.classList.add('active');
    updateInlineProgress(0, 2500, 'Inizializzazione...');
  };

  const hideInlineProgress = () => {
    if (sidebarProgress) sidebarProgress.classList.remove('active');
    if (catbrowserProgress) catbrowserProgress.classList.remove('active');
  };

  const updateInlineProgress = (current, total, label = '') => {
    const percent = Math.min(100, Math.round((current / total) * 100));
    const textContent = label ? `${label} (${percent}%)` : `${current} / ${total} prodotti (${percent}%)`;
    
    if (sidebarProgressBar) sidebarProgressBar.style.width = `${percent}%`;
    if (sidebarProgressText) sidebarProgressText.textContent = textContent;

    if (catbrowserProgressBar) catbrowserProgressBar.style.width = `${percent}%`;
    if (catbrowserProgressText) catbrowserProgressText.textContent = textContent;
  };

  try {
    addLog('info', 'Richiesta di sincronizzazione catalogo inviata al server...');
    setSyncState(true);
    showInlineProgress();
    
    const res = await fetch('/api/products/sync', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `Status ${res.status}`);
    }
    
    const initialData = await res.json();
    addLog('info', `Stato sincronizzazione: ${initialData.status}`);

    // Poll the sync progress until completed or failed
    await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const progressRes = await fetch('/api/products/sync/progress');
          if (!progressRes.ok) throw new Error(`Status ${progressRes.status}`);
          const progress = await progressRes.json();
          
          if (progress.status === 'running') {
            const current = progress.current || 0;
            const total = progress.estimatedTotal || 2500;
            updateInlineProgress(current, total);
          } else if (progress.status === 'completed') {
            clearInterval(interval);
            hideInlineProgress();
            localStorage.removeItem('prodotti_cache');
            showSuccessModal(`Sincronizzazione completata! Caricati ${progress.count} prodotti da Giobby.`, "Sincronizzazione Completata!");
            resolve();
          } else if (progress.status === 'failed') {
            clearInterval(interval);
            hideInlineProgress();
            reject(new Error(progress.error || 'Errore sconosciuto durante la sincronizzazione.'));
          }
        } catch (pollErr) {
          console.warn('Errore polling progresso:', pollErr);
        }
      }, 500);
    });
    
    await checkProductsSyncStatus();
    
    _categoriesCache = null;
    if (catbrowserOverlay.classList.contains('active')) {
      const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
      if (query.length >= 2) {
        searchProductsLocally(query);
      } else if (currentCategoryView) {
        loadProductsByCategory(currentCategoryView);
      } else {
        openCategoryBrowser();
      }
    }
  } catch (err) {
    hideInlineProgress();
    addLog('error', `Sincronizzazione fallita: ${err.message}`);
    showErrorModal(`Impossibile sincronizzare i prodotti. ${err.message}`);
  } finally {
    setSyncState(false);
  }
}

async function checkProductsSyncStatus() {
  const sidebarSyncTime = document.getElementById('sidebar-sync-time');
  
  // Fetch from server API as the single source of truth
  try {
    const res = await fetch('/api/products/status');
    if (res.ok) {
      const data = await res.json();
      if (sidebarSyncTime) {
        if (data.lastSync) {
          const date = new Date(data.lastSync);
          const formatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          sidebarSyncTime.textContent = `Ultima sync: ${formatted} (${data.count} art.)`;
        } else {
          sidebarSyncTime.textContent = `Ultima sync: mai eseguita`;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to fetch product sync status:', e);
  }
}

function renderProductList(products) {
  catbrowserBody.innerHTML = '';
  if (!products || products.length === 0) {
    catbrowserBody.innerHTML = '<div class="catbrowser-empty">Nessun prodotto trovato.<br><br><a href="https://app.giobby.com/Giobby00553/company/Material.xhtml?ftrID=mat_n" target="_blank" class="catbrowser-new-product-link">➕ Aggiungi nuovo prodotto su Giobby</a></div>';
    return;
  }
  
  const selectedWhs = getSelectedWarehouses();

  // Filter out obsolete products if checked
  const hideObsoleteChk = document.getElementById('hide-obsolete-chk');
  const hideObsolete = hideObsoleteChk ? hideObsoleteChk.checked : true;
  let filtered = products;
  if (hideObsolete) {
    filtered = products.filter(p => {
      const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
      const gDesc = p.materialGroupDesc ?? '';
      const isGiobbyObsolete = String(gId) === '38' || String(gDesc).toUpperCase() === 'OBSOLETO';
      return !isGiobbyObsolete && !p.localObsolete;
    });
  }

  // Filter by selected/flagged warehouses
  filtered = filtered.filter(p => {
    const whCode = p.defaultStorage || 'MB';
    return selectedWhs.includes(whCode);
  });

  if (filtered.length === 0) {
    catbrowserBody.innerHTML = '<div class="catbrowser-empty">Nessun prodotto trovato.<br><br><a href="https://app.giobby.com/Giobby00553/company/Material.xhtml?ftrID=mat_n" target="_blank" class="catbrowser-new-product-link">➕ Aggiungi nuovo prodotto su Giobby</a></div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'prod-list';
  filtered.forEach(prod => {
    const name = prod.description || prod.name || String(prod.id);
    const code = prod.id || prod.code || prod.sku || '';
    
    const whCode = prod.defaultStorage || 'MB';
    let whDesc = whCode;
    if (typeof warehousesList !== 'undefined') {
      const matchedWh = warehousesList.find(w => String(w.id) === String(whCode));
      if (matchedWh) {
        whDesc = matchedWh.description || whCode;
      }
    }

    let stocksMarkup = '';
    if (prod.stocks) {
      const qty = prod.stocks[whCode] ?? 0;
      const qtyClass = qty > 0 ? 'qty-positive' : 'qty-zero';
      stocksMarkup = `<span class="wh-stock-badge ${qtyClass}" title="Giacenza magazzino di appartenenza ${whCode}">🏭 ${whCode}: <strong>${qty}</strong></span>`;
    } else {
      stocksMarkup = `<span class="prod-badge badge-warehouse" title="${whDesc}">🏭 ${whCode}</span>`;
    }

    let boxQtyMarkup = '';
    if (prod.boxQty && prod.boxQty > 0) {
      const umLabel = prod.um || 'pz.';
      boxQtyMarkup = `<span class="prod-badge badge-boxqty" title="Confezionamento (Logistica Giobby)">📦 Conf: <strong>${prod.boxQty}</strong> ${umLabel}</span>`;
    }

    const gId = prod.idMaterialGroup ?? prod.idProductsGroup ?? prod.idProductGroup ?? prod.idGroup ?? prod.groupId;
    const gDesc = prod.materialGroupDesc ?? '';
    const isGiobbyObsolete = String(gId) === '38' || String(gDesc).toUpperCase() === 'OBSOLETO';
    const isObsolete = isGiobbyObsolete || !!prod.localObsolete;

    let obsoleteButtonMarkup = '';
    if (!isGiobbyObsolete) {
      obsoleteButtonMarkup = `
        <button class="prod-obsolete-toggle-btn ${prod.localObsolete ? 'active' : ''}" title="${prod.localObsolete ? 'Ripristina articolo' : 'Segna come obsoleto nella app'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
      `;
    } else {
      obsoleteButtonMarkup = `
        <div class="prod-obsolete-badge-static" title="Obsoleto su Giobby">🚫</div>
      `;
    }

    // Price display logic
    let pricesMarkup = '';
    const prices = prod.prices || {};
    const pPriv = prices.privati !== null && prices.privati !== undefined
      ? `€ ${parseFloat(prices.privati).toFixed(2)}`
      : '€ —';
    const pPos = prices.posatori !== null && prices.posatori !== undefined
      ? `€ ${parseFloat(prices.posatori).toFixed(2)}`
      : '€ —';
    const pBol = prices.bologna !== null && prices.bologna !== undefined
      ? `€ ${parseFloat(prices.bologna).toFixed(2)}`
      : '€ —';
    
    pricesMarkup = `
      <div class="prod-prices-wrap">
        <span class="price-badge price-privati" title="Listino Privati (ID 26)">Privati: <strong>${pPriv}</strong></span>
        <span class="price-badge price-posatori" title="Listino Posatori PR + BO (ID 27)">Posatori: <strong>${pPos}</strong></span>
        <span class="price-badge price-bologna" title="Listino Parquet Bologna (ID 24)">Bologna: <strong>${pBol}</strong></span>
      </div>
    `;

    const item = document.createElement('div');
    item.className = 'prod-item' + (isObsolete ? ' prod-obsolete-item' : '');
    item.innerHTML = `
      <div class="prod-info">
        <div class="prod-name" title="${name}">${name}</div>
        <div class="prod-meta">
          ${code ? `
            <div style="display: flex; align-items: center; gap: 4px;">
              <a class="prod-code-link" href="${prod.giobbyUrl || '#'}" target="_blank" title="Apri scheda prodotto su Giobby" onclick="event.stopPropagation();"><span class="prod-code">${code}</span></a>
              <button type="button" class="prod-code-sync-btn" title="Aggiorna questo prodotto da Giobby" onclick="event.stopPropagation(); syncSingleProduct('${code}');">🔄</button>
            </div>
          ` : ''}
          <div class="prod-stocks-wrap">${stocksMarkup}${boxQtyMarkup}</div>
        </div>
        ${pricesMarkup}
      </div>
      <div class="prod-actions-wrap" style="display: flex; align-items: center;">
        <label class="prod-reorder-checkbox-wrap" onclick="event.stopPropagation();" title="Seleziona per ordinare manualmente questo prodotto">
          <input type="checkbox" class="prod-reorder-chk" data-sku="${code}" ${prod.ordina ? 'checked' : ''}>
          <span>Ordina</span>
        </label>
        ${obsoleteButtonMarkup}
        <a class="prod-giobby-link-btn" href="${prod.giobbyUrl || '#'}" target="_blank" title="Apri anagrafica su Giobby" onclick="event.stopPropagation();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </a>
        <button class="prod-delete-btn" title="Elimina Prodotto dall'inventario" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; margin-right: 6px; cursor: pointer; transition: all 0.2s;" onclick="event.stopPropagation(); deleteProductFromFogliBlu('${code}');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 16px; height: 16px;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
        <button class="prod-add-btn" title="Aggiungi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    `;

    item.querySelector('.prod-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startVoiceQuantity(prod);
    });

    const reorderChk = item.querySelector('.prod-reorder-chk');
    if (reorderChk) {
      reorderChk.addEventListener('change', (e) => {
        const checked = e.target.checked;
        prod.ordina = checked;
        toggleManualReorder(code, checked);
      });
    }

    const toggleBtn = item.querySelector('.prod-obsolete-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextState = !prod.localObsolete;
        
        try {
          toggleBtn.disabled = true;
          
          // Also save in localStorage
          toggleLocalObsoleteInBrowser(code, nextState);

          const res = await fetch('/api/products/obsolete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: code, obsolete: nextState })
          });
          const resData = await res.json();
          if (resData.success) {
            prod.localObsolete = nextState;
            
            if (nextState) {
              item.classList.add('prod-obsolete-item');
              toggleBtn.classList.add('active');
              toggleBtn.title = 'Ripristina articolo';
              
              const hideObsoleteChk = document.getElementById('hide-obsolete-chk');
              if (hideObsoleteChk && hideObsoleteChk.checked) {
                item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'scale(0.9)';
                setTimeout(() => {
                  item.remove();
                  if (list.children.length === 0) {
                    catbrowserBody.innerHTML = '<div class="catbrowser-empty">Nessun prodotto trovato.<br><br><a href="https://app.giobby.com/Giobby00553/company/Material.xhtml?ftrID=mat_n" target="_blank" class="catbrowser-new-product-link">➕ Aggiungi nuovo prodotto su Giobby</a></div>';
                  }
                }, 300);
              }
            } else {
              item.classList.remove('prod-obsolete-item');
              toggleBtn.classList.remove('active');
              toggleBtn.title = 'Segna come obsoleto nella app';
            }
          }
        } catch (err) {
          console.error('Failed to toggle obsolete:', err);
        } finally {
          toggleBtn.disabled = false;
        }
      });
    }

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
let activeKeyDownHandler = null;

function safeEvaluate(expr) {
  if (!expr) return null;
  const cleanExpr = expr.replace(/[^0-9+\-*/().\s]/g, '');
  
  // Auto-close open parentheses
  const openCount = (cleanExpr.match(/\(/g) || []).length;
  const closeCount = (cleanExpr.match(/\)/g) || []).length;
  let evalExpr = cleanExpr;
  if (openCount > closeCount) {
    evalExpr += ')'.repeat(openCount - closeCount);
  }
  
  try {
    const result = new Function(`return (${evalExpr})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return parseFloat(result.toFixed(4));
    }
  } catch (e) {}
  return null;
}

function startVoiceQuantity(product) {
  isVoiceQuantityCancelled = false;
  selectedProductForQty = product;
  const name = product.description || product.name || String(product.id);
  voicequtyProductName.textContent = name;
  voicequtyTranscript.textContent = '"..."';
  
  // Reset manual input to 1 or pendingVoiceQty
  const voicequtyManualInput = document.getElementById('voicequty-manual-input');
  const voicequtyFormulaBody = document.getElementById('voicequty-formula-body');
  const initialQty = pendingVoiceQty !== null ? pendingVoiceQty : 1;
  currentFormula = "";
  calculationHistory = [];

  if (voicequtyManualInput) {
    voicequtyManualInput.value = String(initialQty);
  }
  if (voicequtyFormulaBody) {
    voicequtyFormulaBody.value = "";
  }
  
  voicequtyOverlay.classList.remove('manual-mode');
  voicequtyOverlay.classList.add('active');

  const SpeechGen = window.SpeechRecognition || window.webkitSpeechRecognition;
  qtyRec = null;

  // Function to switch to manual mode
  const switchToManualMode = () => {
    isVoiceQuantityCancelled = true;
    if (voiceQtyTimeout) {
      clearTimeout(voiceQtyTimeout);
      voiceQtyTimeout = null;
    }
    voicequtyOverlay.classList.add('manual-mode');
    if (voicequtyTranscript.textContent === '"..."') {
      voicequtyTranscript.textContent = '"Inserimento manuale"';
    }
    if (qtyRec) {
      try {
        qtyRec.abort();
      } catch (e) {}
    }
  };

  if (pendingVoiceQty !== null) {
    switchToManualMode();
    voicequtyTranscript.textContent = '"Quantità da dettatura"';
    pendingVoiceQty = null;
  }

  isKeypadReset = true;

  // Function to insert text at textarea cursor position
  const insertAtCursor = (inputElement, value) => {
    const startPos = inputElement.selectionStart;
    const endPos = inputElement.selectionEnd;
    const oldVal = inputElement.value;
    inputElement.value = oldVal.substring(0, startPos) + value + oldVal.substring(endPos, oldVal.length);
    const newPos = startPos + value.length;
    inputElement.selectionStart = newPos;
    inputElement.selectionEnd = newPos;
    inputElement.focus();
  };

  // Function to evaluate and apply formula to quantity display
  const evaluateAndApplyFormula = (applyToQuantity = false) => {
    if (!voicequtyFormulaBody) return;
    
    // Split by '=' to calculate the expression before the '=' sign
    const expr = voicequtyFormulaBody.value.split('=')[0].trim();
    if (!expr) return;
    
    const res = safeEvaluate(expr);
    if (res !== null) {
      voicequtyFormulaBody.value = expr + ' = ' + res;
      isKeypadReset = true;
      if (applyToQuantity && voicequtyManualInput) {
        voicequtyManualInput.value = String(res);
        addLog('info', `Risultato della formula applicato alla quantità: ${res}`);
      }
    }
    voicequtyFormulaBody.focus();
  };

  // Main virtual keypad event handler
  const handleKeypadToFormula = (val) => {
    if (!voicequtyFormulaBody) return;

    if (val === 'C') {
      voicequtyFormulaBody.value = '';
      if (voicequtyManualInput) {
        voicequtyManualInput.value = '1';
      }
      isKeypadReset = true;
      voicequtyFormulaBody.focus();
    } else if (val === 'backspace') {
      if (isKeypadReset) {
        // If backspace is pressed right after =, remove the result suffix
        const parts = voicequtyFormulaBody.value.split('=');
        if (parts.length > 1) {
          voicequtyFormulaBody.value = parts[0].trim();
          isKeypadReset = false;
          voicequtyFormulaBody.selectionStart = voicequtyFormulaBody.selectionEnd = voicequtyFormulaBody.value.length;
          voicequtyFormulaBody.focus();
          return;
        }
      }
      const startPos = voicequtyFormulaBody.selectionStart;
      const endPos = voicequtyFormulaBody.selectionEnd;
      const oldVal = voicequtyFormulaBody.value;
      if (startPos === endPos) {
        if (startPos > 0) {
          voicequtyFormulaBody.value = oldVal.substring(0, startPos - 1) + oldVal.substring(endPos);
          voicequtyFormulaBody.selectionStart = voicequtyFormulaBody.selectionEnd = startPos - 1;
        }
      } else {
        voicequtyFormulaBody.value = oldVal.substring(0, startPos) + oldVal.substring(endPos);
        voicequtyFormulaBody.selectionStart = voicequtyFormulaBody.selectionEnd = startPos;
      }
      isKeypadReset = false;
      voicequtyFormulaBody.focus();
    } else if (val === '=') {
      evaluateAndApplyFormula(false); // only calculate, do not apply to quantity automatically
    } else if (['+', '-', '*', '/'].includes(val)) {
      if (isKeypadReset) {
        // If operator is pressed right after =, start next calculation using the previous result
        const parts = voicequtyFormulaBody.value.split('=');
        const lastPart = parts[parts.length - 1].trim();
        const lastNum = parseFloat(lastPart);
        const startVal = (!isNaN(lastNum) && isFinite(lastNum)) ? String(lastNum) : '1';
        
        voicequtyFormulaBody.value = startVal + val;
        isKeypadReset = false;
        voicequtyFormulaBody.focus();
      } else {
        insertAtCursor(voicequtyFormulaBody, val);
      }
    } else {
      // Digits, dots, parentheses
      if (isKeypadReset) {
        voicequtyFormulaBody.value = val;
        isKeypadReset = false;
        voicequtyFormulaBody.focus();
      } else {
        insertAtCursor(voicequtyFormulaBody, val);
      }
    }
  };

  // Synchronize isKeypadReset if user types manually in textarea
  if (voicequtyFormulaBody) {
    voicequtyFormulaBody.oninput = () => {
      isKeypadReset = false;
    };
  }

  // Click on "Formula" title calculates and applies quantity
  const formulaTitle = document.getElementById('voicequty-formula-title');
  if (formulaTitle) {
    formulaTitle.onclick = (e) => {
      e.preventDefault();
      evaluateAndApplyFormula(true); // Calculates AND applies!
    };
  }

  // Wire custom on-screen keypad buttons:
  const keypadButtons = voicequtyOverlay.querySelectorAll('.keypad-btn');
  keypadButtons.forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      switchToManualMode();
      const val = btn.getAttribute('data-val');
      handleKeypadToFormula(val);
    };
  });

  // Handle physical keyboard inputs
  activeKeyDownHandler = (e) => {
    if (!voicequtyOverlay.classList.contains('active')) return;
    
    // Se la calcolatrice ausiliaria è aperta, non intercettare la tastiera qui
    const auxCalc = document.getElementById('aux-calc-overlay');
    if (auxCalc && auxCalc.classList.contains('active')) return;

    const key = e.key;
    const isFormulaFocused = (document.activeElement === voicequtyFormulaBody);

    if (isFormulaFocused) {
      // If user is typing directly in formula textarea, let browser handle typing natively
      // except for '=', 'Enter', 'Escape'
      if (key === '=') {
        e.preventDefault();
        handleKeypadToFormula('=');
      } else if (key === 'Enter') {
        e.preventDefault();
        evaluateAndApplyFormula(true); // calculate and apply on Enter in textarea
      } else if (key === 'Escape') {
        e.preventDefault();
        if (voicequtyCancelBtn) voicequtyCancelBtn.click();
      }
      return;
    }

    if (/[0-9+\-*/().]/.test(key)) {
      e.preventDefault();
      switchToManualMode();
      handleKeypadToFormula(key);
    } else if (key === ',') {
      e.preventDefault();
      switchToManualMode();
      handleKeypadToFormula('.');
    } else if (key === 'Backspace') {
      e.preventDefault();
      switchToManualMode();
      handleKeypadToFormula('backspace');
    } else if (key === 'Enter') {
      e.preventDefault();
      if (!isKeypadReset) {
        switchToManualMode();
        evaluateAndApplyFormula(true); // Enter evaluates and applies!
      } else {
        if (voicequtyConfirmBtn) voicequtyConfirmBtn.click();
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      if (voicequtyCancelBtn) voicequtyCancelBtn.click();
    } else if (key === 'c' || key === 'C' || key === 'Delete') {
      e.preventDefault();
      switchToManualMode();
      handleKeypadToFormula('C');
    } else if (key === '=') {
      e.preventDefault();
      switchToManualMode();
      handleKeypadToFormula('=');
    }
  };
  window.addEventListener('keydown', activeKeyDownHandler);

  const voicequtyConfirmBtn = document.getElementById('voicequty-confirm-btn');
  if (voicequtyConfirmBtn) {
    voicequtyConfirmBtn.onclick = () => {
      console.log('[VoiceQty] Confirm clicked for product:', product);
      switchToManualMode(); // stop voice recognition

      // Auto-evaluate formula if present and not yet evaluated
      if (voicequtyFormulaBody && voicequtyFormulaBody.value.trim() && !voicequtyFormulaBody.value.includes('=')) {
        evaluateAndApplyFormula(true);
      }

      let qty = 1;
      if (voicequtyManualInput) {
        qty = parseFloat(voicequtyManualInput.value) || 1;
      }
      console.log('[VoiceQty] Adding quantity:', qty);
      addProductFromCatalog(product, qty);
      closeVoiceQuantity();
    };
  }

  const voicequtyCancelBtn = document.getElementById('voicequty-cancel-btn');
  if (voicequtyCancelBtn) {
    voicequtyCancelBtn.onclick = () => {
      isVoiceQuantityCancelled = true;
      if (voiceQtyTimeout) {
        clearTimeout(voiceQtyTimeout);
        voiceQtyTimeout = null;
      }
      if (qtyRec) {
        try {
          qtyRec.abort();
        } catch (e) {}
      }
      closeVoiceQuantity();
    };
  }

  if (isVoiceQuantityCancelled) {
    return;
  }

  if (!SpeechGen) {
    addLog('warning', 'Speech recognition non supportata. Inserimento manuale...');
    voicequtyOverlay.classList.add('manual-mode');
    voicequtyTranscript.textContent = '"Inserimento manuale"';
    return;
  }

  // Create a separate instance specifically for the quantity to avoid conflicts
  qtyRec = new SpeechGen();
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
    const txt = final || interim;
    voicequtyTranscript.textContent = `"${txt}"`;
  };

  qtyRec.onend = async () => {
    if (isVoiceQuantityCancelled) {
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

    if (voicequtyManualInput) {
      voicequtyManualInput.value = qty;
    }

    // Set currentFormula and isKeypadReset so that user can append or edit
    currentFormula = String(qty);
    isKeypadReset = true;
    updateLiveResult();

    // Auto-confirm with a 1.5s delay if not cancelled by switching to manual mode
    if (voiceQtyTimeout) clearTimeout(voiceQtyTimeout);
    voiceQtyTimeout = setTimeout(() => {
      if (!isVoiceQuantityCancelled) {
        addProductFromCatalog(product, qty);
        closeVoiceQuantity();
      }
    }, 1500);
  };

  qtyRec.onerror = (event) => {
    addLog('error', `Errore nel riconoscimento vocale quantità: ${event.error}`);
    if (event.error !== 'aborted') {
      switchToManualMode();
    }
  };

  addLog('info', `🎤 Ascolto quantità per: "${name}"...`);
  qtyRec.start();
}

function closeVoiceQuantity() {
  voicequtyOverlay.classList.remove('active');
  selectedProductForQty = null;
  if (activeKeyDownHandler) {
    window.removeEventListener('keydown', activeKeyDownHandler);
    activeKeyDownHandler = null;
  }
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
    idWarehouse: product.defaultStorage ? String(product.defaultStorage) : null,
    prices: product.prices || {}
  };
  articlesList.push(article);
  renderArticles();
  updateCatBrowserCartCount();
  addLog('nlp', `✅ Da catalogo: [Qtà: ${quantity}] ${name} (ID: ${product.id || '-'})`);

  // Clear search bar and refocus to prepare for the next product search
  if (catbrowserSearchInput) {
    catbrowserSearchInput.value = '';
    catbrowserSearchInput.dispatchEvent(new Event('input'));
    catbrowserSearchInput.focus();
  }
}

// ----------------------------------------------------
// MODALS LOGIC
// ----------------------------------------------------

function showSuccessModal(text, title = "DDT Creato con Successo!") {
  const modalTitle = successModal.querySelector('h2');
  if (modalTitle) {
    modalTitle.textContent = title;
  }
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
  const confirmModal = document.getElementById('confirm-warehouse-modal');
  if (confirmModal) {
    confirmModal.style.display = 'none';
  }
}

successModalClose.addEventListener('click', closeModal);
errorModalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// ====================================================
// DDT HISTORY SYSTEM
// ====================================================

const clearHistoryBtn = document.getElementById('clear-history-btn');
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', clearHistory);
}

// Local Storage History Helpers
function getLocalHistory() {
  try {
    const data = localStorage.getItem('ddt_history');
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error reading local history:', err);
    return [];
  }
}

function saveLocalHistory(history) {
  try {
    localStorage.setItem('ddt_history', JSON.stringify(history));
    return true;
  } catch (err) {
    console.error('Error saving local history:', err);
    return false;
  }
}

function addLocalHistoryEntry(payload, responseData, customerName) {
  try {
    const history = getLocalHistory();
    const docNum = (responseData.document && responseData.document.docNumber) ? responseData.document.docNumber : (responseData.docNumber || responseData.id || 'Generato');
    const docDate = payload.docDate || new Date().toISOString().slice(0, 10);
    const causale = payload.deliveryData ? payload.deliveryData.reason : 'Vendita';
    const numArticles = payload.rows ? payload.rows.length : 0;
    
    const articles = payload.rows ? payload.rows.map(r => ({
      idMaterial: r.idMaterial || null,
      description: r.description,
      quantity: r.quantity,
      idVat: r.idVat || '22',
      idWarehouse: r.idWarehouse || null,
      price: r.priceSales || r.unitPrice || r.price || null
    })) : [];

    const newEntry = {
      id: responseData.id || Date.now().toString(),
      docNumber: docNum,
      docDate: docDate,
      idCustomer: payload.idCustomer || null,
      idContact: payload.idContact || null,
      customerName: customerName,
      causale: causale,
      idPricelist: payload.idPricelist || null,
      numArticles: numArticles,
      articles: articles,
      createdAt: new Date().toISOString()
    };

    history.unshift(newEntry);
    saveLocalHistory(history);
    notifyHistoryChange();
    addLog('info', `DDT registrato nello storico del browser: N. ${docNum} per ${customerName}`);
  } catch (err) {
    console.error('Error adding local history entry:', err);
  }
}

function notifyHistoryChange() {
  localStorage.setItem('ddt_history_updated', Date.now().toString());
}

function saveToHistoryIfNeeded(payload, responseData, customerName) {
  if (isOnlineDeployment) {
    addLocalHistoryEntry(payload, responseData, customerName);
  }
}

async function loadHistory() {
  const container = document.getElementById('history-list-container');
  const compileContainer = document.getElementById('compile-history-container');
  
  if (!container && !compileContainer) return;

  if (container) {
    container.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento storico...</div>';
  }
  if (compileContainer) {
    compileContainer.innerHTML = '<div class="catbrowser-loading"><div class="spinner"></div>Caricamento storico...</div>';
  }

  try {
    let history = [];
    if (isOnlineDeployment) {
      history = getLocalHistory();
    } else {
      const res = await fetch('/api/ddt-history');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      history = await res.json();
    }

    const renderItems = (targetContainer, itemsList) => {
      if (!targetContainer) return;
      if (itemsList.length === 0) {
        targetContainer.innerHTML = '<div class="empty-state">Nessun DDT creato di recente.</div>';
        return;
      }

      targetContainer.innerHTML = '';
      itemsList.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = index === 0 ? 'history-card' : 'history-card collapsed';

        const formattedDate = item.docDate ? formatDateIT(item.docDate) : 'Nessuna data';
        let itemsSummary = '';
        const articlesListToSummary = item.articles || item.items || [];
        if (articlesListToSummary.length > 0) {
          itemsSummary = articlesListToSummary.map(a => {
            const priceText = (a.price !== null && a.price !== undefined) ? ` (€ ${parseFloat(a.price).toFixed(2)})` : '';
            return `${a.quantity}x ${a.description}${priceText}`;
          }).join(', ');
          if (itemsSummary.length > 110) {
            itemsSummary = itemsSummary.substring(0, 107) + '...';
          }
        } else {
          itemsSummary = 'Nessun articolo';
        }

        card.innerHTML = `
          <div class="history-card-header">
            <div class="history-info">
              <div class="history-customer">${item.customerName || 'Cliente non specificato'}</div>
              <div class="history-meta">
                <span>📄 N. ${item.docNumber}</span>
                <span>📅 ${formattedDate}</span>
                <span>📝 ${item.causale || 'Vendita'}</span>
                <span>📦 ${item.numArticles || 0} art.</span>
              </div>
            </div>
            <div class="history-card-actions" style="display: flex; gap: 8px;">
              <button type="button" class="history-btn-edit" data-id="${item.id}" title="Riapri per modificare">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Modifica
              </button>
              <button type="button" class="history-btn-delete" data-id="${item.id}" title="Elimina dallo storico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Elimina
              </button>
            </div>
          </div>
          <div class="history-card-body">
            <div class="history-items-summary">${itemsSummary}</div>
          </div>
        `;

        card.querySelector('.history-btn-edit').addEventListener('click', (e) => {
          e.stopPropagation();
          editHistoryItem(item);
        });

        card.querySelector('.history-btn-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Sei sicuro di voler eliminare questa voce dallo storico locale?')) {
            await deleteHistoryItem(item.id);
          }
        });

        // Toggle collapse on card click
        card.addEventListener('click', () => {
          card.classList.toggle('collapsed');
        });

        targetContainer.appendChild(card);
      });
    };

    renderItems(container, history);
    renderItems(compileContainer, history);

  } catch (err) {
    console.error('Error loading history:', err);
    if (container) {
      container.innerHTML = `<div class="catbrowser-error">Errore caricamento storico.<br><small>${err.message}</small></div>`;
    }
    if (compileContainer) {
      compileContainer.innerHTML = `<div class="catbrowser-error">Errore caricamento storico.<br><small>${err.message}</small></div>`;
    }
  }
}

async function deleteHistoryItem(id) {
  try {
    if (isOnlineDeployment) {
      const updated = getLocalHistory().filter(h => String(h.id) !== String(id));
      saveLocalHistory(updated);
      addLog('info', `Voce dello storico DDT eliminata localmente: ID ${id}`);
      loadHistory();
      notifyHistoryChange();
    } else {
      const res = await fetch(`/api/ddt-history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addLog('info', `Voce dello storico DDT eliminata: ID ${id}`);
        loadHistory();
        notifyHistoryChange();
      } else {
        throw new Error(`Status ${res.status}`);
      }
    }
  } catch (err) {
    addLog('error', `Eliminazione voce storico fallita: ${err.message}`);
    showErrorModal(`Impossibile eliminare la voce dello storico. ${err.message}`);
  }
}

async function clearHistory() {
  if (confirm('Sei sicuro di voler svuotare interamente lo storico dei DDT creati? Questa azione non può essere annullata.')) {
    try {
      if (isOnlineDeployment) {
        saveLocalHistory([]);
        addLog('info', 'Storico dei DDT creati interamente svuotato localmente.');
        loadHistory();
        notifyHistoryChange();
      } else {
        const res = await fetch('/api/ddt-history', {
          method: 'DELETE'
        });
        if (res.ok) {
          addLog('info', 'Storico dei DDT creati interamente svuotato.');
          loadHistory();
          notifyHistoryChange();
        } else {
          throw new Error(`Status ${res.status}`);
        }
      }
    } catch (err) {
      addLog('error', `Svuotamento storico fallito: ${err.message}`);
      showErrorModal(`Impossibile svuotare lo storico. ${err.message}`);
    }
  }
}

function editHistoryItem(item) {
  clearEditingMode();
  
  if (item.idCustomer && item.customerName) {
    selectedCustomer = {
      id: item.idCustomer,
      idContact: item.idContact,
      name: item.customerName
    };
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
  
  dataInput.value = item.docDate || todayStr;
  
  let matched = false;
  for (let i = 0; i < causaleSelect.options.length; i++) {
    if (causaleSelect.options[i].value === item.causale) {
      causaleSelect.selectedIndex = i;
      matched = true;
      break;
    }
  }
  if (!matched) {
    causaleSelect.selectedIndex = 0;
  }

  if (listinoSelect) {
    listinoSelect.value = item.idPricelist ? String(item.idPricelist) : '';
  }
  
  const articlesToLoad = item.articles || item.items || [];
  articlesList = articlesToLoad.map(a => ({
    id: Date.now() + Math.random().toString(36).substr(2, 5) + Math.random().toString(36).substr(2, 2),
    quantity: a.quantity,
    description: a.description,
    idVat: a.idVat || '22',
    idPosType: 1,
    idMaterial: a.idMaterial || null,
    idWarehouse: a.idWarehouse || null,
    prices: a.prices || (a.price !== undefined ? { privati: a.price, posatori: a.price, bologna: a.price } : {}),
    price: a.price !== undefined ? a.price : null
  }));
  
  renderArticles();
  
  addLog('info', `DDT dello storico caricato nel modulo di compilazione per modifiche. N. ${item.docNumber}`);
  setActiveTab('compile');
}

let cartTooltipTimeout = null;

function updateCatBrowserReminder() {
  const cartTooltip = document.getElementById('cart-tooltip');
  if (cartTooltip && cartTooltip.classList.contains('active')) {
    renderCartTooltipContent();
  }
}

function renderCartTooltipContent() {
  const cartTooltip = document.getElementById('cart-tooltip');
  if (!cartTooltip) return;

  if (articlesList.length === 0) {
    hideCartTooltipImmediately();
    return;
  }

  cartTooltip.innerHTML = `
    <div class="cart-tooltip-header">Articoli Selezionati (${articlesList.length})</div>
    <div class="cart-tooltip-items" id="cart-tooltip-items"></div>
  `;

  const itemsContainer = cartTooltip.querySelector('#cart-tooltip-items');
  articlesList.forEach(a => {
    const itemEl = document.createElement('div');
    itemEl.className = 'cart-tooltip-item';
    itemEl.innerHTML = `
      <span class="cart-item-qty">${a.quantity}x</span>
      <span class="cart-item-name" title="${a.description}">${a.description}</span>
      <button type="button" class="cart-item-remove" data-id="${a.id}" title="Rimuovi">&times;</button>
    `;

    itemEl.querySelector('.cart-item-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeArticle(a.id);
      updateCatBrowserReminder();
      updateCatBrowserCartCount();
    });
    itemsContainer.appendChild(itemEl);
  });
}

function initCartTooltip() {
  const cartIndicator = document.getElementById('catbrowser-cart-indicator');
  const cartTooltip = document.getElementById('cart-tooltip');
  if (!cartIndicator || !cartTooltip) return;

  const showCartTooltip = () => {
    if (articlesList.length === 0) return;
    if (cartTooltipTimeout) {
      clearTimeout(cartTooltipTimeout);
      cartTooltipTimeout = null;
    }

    renderCartTooltipContent();

    cartTooltip.style.display = 'flex';
    cartTooltip.offsetHeight; // force reflow

    const rect = cartIndicator.getBoundingClientRect();
    const tooltipWidth = cartTooltip.offsetWidth;
    const tooltipHeight = cartTooltip.offsetHeight;

    let left = rect.left + (rect.width - tooltipWidth) / 2;
    let top = rect.bottom + 8;

    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }
    if (top + tooltipHeight > window.innerHeight - 10) {
      top = rect.top - tooltipHeight - 8;
    }

    cartTooltip.style.left = `${left}px`;
    cartTooltip.style.top = `${top}px`;
    cartTooltip.classList.add('active');
  };

  const hideCartTooltipWithDelay = () => {
    if (cartTooltipTimeout) clearTimeout(cartTooltipTimeout);
    cartTooltipTimeout = setTimeout(() => {
      hideCartTooltipImmediately();
    }, 200);
  };

  cartIndicator.addEventListener('mouseenter', showCartTooltip);
  cartIndicator.addEventListener('mouseleave', hideCartTooltipWithDelay);
  
  cartTooltip.addEventListener('mouseenter', () => {
    if (cartTooltipTimeout) {
      clearTimeout(cartTooltipTimeout);
      cartTooltipTimeout = null;
    }
  });
  cartTooltip.addEventListener('mouseleave', hideCartTooltipWithDelay);
}

function hideCartTooltipImmediately() {
  const cartTooltip = document.getElementById('cart-tooltip');
  if (!cartTooltip) return;
  cartTooltip.classList.remove('active');
  setTimeout(() => {
    if (!cartTooltip.classList.contains('active')) {
      cartTooltip.style.display = 'none';
    }
  }, 200);
}

// Initialize tooltip interaction
initCartTooltip();

// ====================================================
// AUXILIARY CALCULATOR LOGIC
// ====================================================

const auxCalcOverlay = document.getElementById('aux-calc-overlay');
const auxCalcFormula = document.getElementById('aux-calc-formula');
const auxCalcDisplay = document.getElementById('aux-calc-display');
const voicequtyCalcBtn = null;
const auxCalcCloseBtn = document.getElementById('aux-calc-close-btn');
const auxCalcApplyBtn = document.getElementById('aux-calc-apply-btn');
const auxCalcCopyBtn = document.getElementById('aux-calc-copy-btn');

let auxFormula = '0';
let auxIsReset = true;
let auxActiveKeyDownHandler = null;

function openAuxCalculator() {
  if (!auxCalcOverlay) return;
  
  // Stop voice quantity listening if active
  isVoiceQuantityCancelled = true;
  if (voiceQtyTimeout) {
    clearTimeout(voiceQtyTimeout);
    voiceQtyTimeout = null;
  }
  if (typeof qtyRec !== 'undefined' && qtyRec) {
    try {
      qtyRec.abort();
    } catch (e) {}
  }
  
  // Expose manual mode on voicequty overlay
  const voicequtyOverlay = document.getElementById('voicequty-overlay');
  if (voicequtyOverlay) {
    voicequtyOverlay.classList.add('manual-mode');
    const voicequtyTranscript = document.getElementById('voicequty-transcript');
    if (voicequtyTranscript && voicequtyTranscript.textContent === '"..."') {
      voicequtyTranscript.textContent = '"Calcolatrice ausiliaria"';
    }
  }

  auxCalcOverlay.classList.add('active');
  auxFormula = '0';
  auxIsReset = true;
  updateAuxCalcUI();
  addLog('info', 'Calcolatrice ausiliaria aperta.');
  
  // Attach keydown listener
  if (auxActiveKeyDownHandler) {
    window.removeEventListener('keydown', auxActiveKeyDownHandler);
  }
  auxActiveKeyDownHandler = handleAuxCalcKeyDown;
  window.addEventListener('keydown', auxActiveKeyDownHandler);
}

function closeAuxCalculator() {
  if (!auxCalcOverlay) return;
  auxCalcOverlay.classList.remove('active');
  if (auxActiveKeyDownHandler) {
    window.removeEventListener('keydown', auxActiveKeyDownHandler);
    auxActiveKeyDownHandler = null;
  }
}

function updateAuxCalcUI() {
  if (auxCalcFormula) {
    auxCalcFormula.textContent = auxFormula === '0' ? '' : auxFormula;
  }
  if (auxCalcDisplay) {
    let evaluated = safeEvaluate(auxFormula);
    if (evaluated !== null) {
      auxCalcDisplay.value = String(evaluated);
    } else {
      let temp = auxFormula.replace(/[+\-*/(]+$/, '');
      let tempRes = safeEvaluate(temp);
      auxCalcDisplay.value = tempRes !== null ? String(tempRes) : '0';
    }
  }
}

function handleAuxCalcInput(val) {
  if (val === 'C') {
    auxFormula = '0';
    auxIsReset = true;
    updateAuxCalcUI();
  } else if (val === 'backspace') {
    if (auxIsReset) {
      auxFormula = '0';
    } else {
      let newVal = auxFormula.slice(0, -1);
      if (newVal === '' || newVal === '-') {
        newVal = '0';
        auxIsReset = true;
      }
      auxFormula = newVal;
    }
    updateAuxCalcUI();
  } else if (val === '=') {
    const res = safeEvaluate(auxFormula);
    if (res !== null) {
      auxFormula = String(res);
      auxIsReset = true;
    }
    updateAuxCalcUI();
  } else if (val === '.') {
    if (auxIsReset) {
      auxFormula = '0.';
      auxIsReset = false;
    } else {
      const tokens = auxFormula.split(/[+\-*/()]/);
      const lastToken = tokens[tokens.length - 1];
      if (!lastToken.includes('.')) {
        auxFormula = auxFormula + '.';
      }
    }
    updateAuxCalcUI();
  } else if (['(', ')'].includes(val)) {
    if (auxIsReset) {
      auxFormula = val;
      auxIsReset = false;
    } else {
      auxFormula = auxFormula + val;
    }
    updateAuxCalcUI();
  } else if (['+', '-', '*', '/'].includes(val)) {
    if (/[+\-*/]$/.test(auxFormula)) {
      auxFormula = auxFormula.slice(0, -1) + val;
      updateAuxCalcUI();
      return;
    }
    if (auxIsReset) {
      if (val === '-') {
        auxFormula = val;
        auxIsReset = false;
      } else {
        auxFormula = auxFormula + val;
        auxIsReset = false;
      }
    } else {
      auxFormula = auxFormula + val;
    }
    updateAuxCalcUI();
  } else {
    // Digit (0-9)
    if (auxIsReset) {
      auxFormula = val;
      auxIsReset = false;
    } else {
      if (auxFormula === '0') {
        auxFormula = val;
      } else {
        auxFormula = auxFormula + val;
      }
    }
    updateAuxCalcUI();
  }
}

function handleAuxCalcKeyDown(e) {
  if (!auxCalcOverlay || !auxCalcOverlay.classList.contains('active')) return;
  const key = e.key;
  
  if (/[0-9+\-*/().]/.test(key)) {
    e.preventDefault();
    handleAuxCalcInput(key);
  } else if (key === ',') {
    e.preventDefault();
    handleAuxCalcInput('.');
  } else if (key === 'Backspace') {
    e.preventDefault();
    handleAuxCalcInput('backspace');
  } else if (key === 'Enter') {
    e.preventDefault();
    handleAuxCalcInput('=');
  } else if (key === 'Escape') {
    e.preventDefault();
    closeAuxCalculator();
  } else if (key === 'c' || key === 'C' || key === 'Delete') {
    e.preventDefault();
    handleAuxCalcInput('C');
  } else if (key === '=') {
    e.preventDefault();
    handleAuxCalcInput('=');
  }
}

// Wire events
if (voicequtyCalcBtn) {
  voicequtyCalcBtn.addEventListener('click', openAuxCalculator);
}
if (auxCalcCloseBtn) {
  auxCalcCloseBtn.addEventListener('click', closeAuxCalculator);
}
if (auxCalcOverlay) {
  auxCalcOverlay.addEventListener('click', (e) => {
    if (e.target === auxCalcOverlay) closeAuxCalculator();
  });
}

// Wire keypad keys
if (auxCalcOverlay) {
  const keys = auxCalcOverlay.querySelectorAll('.aux-key');
  keys.forEach(k => {
    k.addEventListener('click', (e) => {
      e.preventDefault();
      const val = k.getAttribute('data-val');
      handleAuxCalcInput(val);
    });
  });
}

// Apply button
if (auxCalcApplyBtn) {
  auxCalcApplyBtn.addEventListener('click', () => {
    const val = auxCalcDisplay ? auxCalcDisplay.value : '0';
    
    // Set the value in the quantity popup
    const voicequtyManualInput = document.getElementById('voicequty-manual-input');
    const voicequtyFormulaBody = document.getElementById('voicequty-formula-body');
    
    if (voicequtyManualInput) {
      voicequtyManualInput.value = val;
    }
    
    // Set values in global variables so keyboard keypad is synced
    currentFormula = val;
    calculationHistory = [];
    
    if (voicequtyFormulaBody) {
      voicequtyFormulaBody.value = val;
    }
    isKeypadReset = true;
    
    closeAuxCalculator();
    addLog('info', `Risultato calcolatrice applicato alla quantità: ${val}`);
  });
}

// Copy button
if (auxCalcCopyBtn) {
  auxCalcCopyBtn.addEventListener('click', async () => {
    const val = auxCalcDisplay ? auxCalcDisplay.value : '0';
    try {
      await navigator.clipboard.writeText(val);
      const originalText = auxCalcCopyBtn.innerHTML;
      auxCalcCopyBtn.innerHTML = '✅ Copiato!';
      addLog('info', `Risultato calcolo copiato negli appunti: ${val}`);
      setTimeout(() => {
        auxCalcCopyBtn.innerHTML = originalText;
      }, 1500);
    } catch (err) {
      addLog('error', 'Impossibile copiare il risultato negli appunti.');
    }
  });
}

// ── Open History in new Window logic ──
const openHistoryWinSidebar = document.getElementById('open-history-win-sidebar');
if (openHistoryWinSidebar) {
  openHistoryWinSidebar.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open('/?view=history', 'StoricoDDT', 'width=900,height=700,menubar=no,toolbar=no,location=no,status=no');
  });
}

const openHistoryWinMain = document.getElementById('open-history-win-main');
if (openHistoryWinMain) {
  openHistoryWinMain.addEventListener('click', () => {
    window.open('/?view=history', 'StoricoDDT', 'width=900,height=700,menubar=no,toolbar=no,location=no,status=no');
  });
}

// Initialize view based on query parameters (Dedicated history view mode)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('view') === 'history') {
  document.body.classList.add('view-only-history');
  setTimeout(() => {
    setActiveTab('history');
  }, 100);
} else {
  // Load history at startup to populate the real-time side history widget!
  loadHistory();
}

if (listinoSelect) {
  listinoSelect.addEventListener('change', () => {
    renderArticles();
  });
}

// Automatic synchronization of history across different tabs/windows
window.addEventListener('storage', (event) => {
  if (event.key === 'ddt_history_updated' || event.key === 'storico_ddt') {
    addLog('info', 'Aggiornamento dello storico ricevuto da un\'altra finestra.');
    loadHistory();
  }
});

// ====================================================
// FLUSSO RIORDINO E GESTIONE PRODOTTI
// ====================================================

async function loadReorderList() {
  const container = document.getElementById('reorder-list-container');
  if (!container) return;
  
  container.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px auto;"></div>Caricamento della lista di riordino...</td></tr>';
  
  try {
    const res = await fetch('/api/products/reorder');
    if (!res.ok) throw new Error(`Errore ${res.status}`);
    const list = await res.json();
    
    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center; color: var(--text-muted);">Nessun articolo da riordinare al momento.</td></tr>';
      return;
    }
    
    container.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-glass)';
      
      const badgeClass = item.isManual ? 'reorder-type-manual' : 'reorder-type-auto';
      const badgeText = item.isManual ? 'Manuale' : 'Sotto Scorta';
      
      tr.innerHTML = `
        <td style="padding: 12px; font-weight: 500; font-family: monospace;">${item.id}</td>
        <td style="padding: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.description}">${item.description}</td>
        <td style="padding: 12px; color: var(--text-muted);">${item.category}</td>
        <td style="padding: 12px; text-align: center; color: var(--text-muted);">${item.storage}</td>
        <td style="padding: 12px; text-align: right; font-weight: bold;">${item.currentQty}</td>
        <td style="padding: 12px; text-align: right; color: var(--text-muted);">${item.minStock}</td>
        <td style="padding: 12px; text-align: right; font-weight: bold; color: #f87171;">${item.deficit}</td>
        <td style="padding: 12px; text-align: center;">
          <span class="reorder-type-badge ${badgeClass}">${badgeText}</span>
        </td>
      `;
      container.appendChild(tr);
    });
  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #f87171;">Impossibile caricare il riordino: ${err.message}</td></tr>`;
  }
}

// Esporta CSV per Excel
const btnDownloadReorderCsv = document.getElementById('btn-download-reorder-csv');
if (btnDownloadReorderCsv) {
  btnDownloadReorderCsv.addEventListener('click', () => {
    window.location.href = '/api/products/reorder?excel=true';
  });
}

// Toggle flag Ordina
async function toggleManualReorder(sku, ordina) {
  try {
    const res = await fetch('/api/products/reorder-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, ordina })
    });
    if (res.ok) {
      addLog('success', `Flag Ordina per ${sku} aggiornato a ${ordina}`);
    } else {
      const err = await res.json();
      alert(`Impossibile modificare il riordino manuale: ${err.error}`);
    }
  } catch (e) {
    console.error('Failed to toggle manual reorder:', e);
  }
}
window.toggleManualReorder = toggleManualReorder;

// Elimina Prodotto da Fogli blu
async function deleteProductFromFogliBlu(sku) {
  if (confirm(`Sei sicuro di voler eliminare definitivamente il prodotto "${sku}" dall'inventario?\n\nQuesta operazione rimuoverà il prodotto sia da Fogli blu che da Inventario.`)) {
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(sku)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addLog('success', `Prodotto ${sku} eliminato con successo.`);
        alert(`Prodotto ${sku} eliminato.`);
        
        // Ricarica la vista corrente
        const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
        if (query.length >= 2) {
          searchProductsLocally(query);
        } else if (currentCategoryView) {
          loadProductsByCategory(currentCategoryView);
        } else {
          loadAllProducts();
        }
      } else {
        const err = await res.json();
        alert(`Errore eliminazione: ${err.error}`);
      }
    } catch (e) {
      alert(`Errore connessione: ${e.message}`);
    }
  }
}
window.deleteProductFromFogliBlu = deleteProductFromFogliBlu;

// Nuovo Prodotto Modale
const newProductModal = document.getElementById('new-product-modal');
const newProdCancel = document.getElementById('new-prod-cancel');
const newProdForm = document.getElementById('new-prod-form');
const catbrowserNewProdBtn = document.getElementById('catbrowser-new-prod-btn');

if (catbrowserNewProdBtn) {
  catbrowserNewProdBtn.removeAttribute('href');
  catbrowserNewProdBtn.removeAttribute('target');
  catbrowserNewProdBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openNewProductModal();
  });
}

function openNewProductModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop && newProductModal) {
    document.getElementById('success-modal').style.display = 'none';
    document.getElementById('error-modal').style.display = 'none';
    document.getElementById('confirm-warehouse-modal').style.display = 'none';
    
    newProductModal.style.display = 'block';
    backdrop.classList.add('active');
    
    document.getElementById('new-prod-sku').value = '';
    document.getElementById('new-prod-desc').value = '';
    document.getElementById('new-prod-loc').value = 'MB';
    document.getElementById('new-prod-cat').value = 'Generale';
    document.getElementById('new-prod-qty').value = '0';
    document.getElementById('new-prod-sales-price').value = '0';
  }
}

function closeNewProductModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop && newProductModal) {
    newProductModal.style.display = 'none';
    backdrop.classList.remove('active');
  }
}

if (newProdCancel) {
  newProdCancel.addEventListener('click', closeNewProductModal);
}

if (newProdForm) {
  newProdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sku = document.getElementById('new-prod-sku').value.trim();
    const desc = document.getElementById('new-prod-desc').value.trim();
    const loc = document.getElementById('new-prod-loc').value.trim();
    const cat = document.getElementById('new-prod-cat').value.trim();
    const qty = parseFloat(document.getElementById('new-prod-qty').value) || 0;
    const salesPrice = parseFloat(document.getElementById('new-prod-sales-price').value) || 0;
    
    if (!sku || !desc) {
      alert('Codice e Descrizione sono obbligatori.');
      return;
    }
    
    const saveBtn = document.getElementById('new-prod-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvataggio...';
    
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, desc, loc, cat, qty, salesPrice })
      });
      if (res.ok) {
        addLog('success', `Nuovo prodotto ${sku} creato con successo.`);
        closeNewProductModal();
        alert(`Prodotto ${sku} creato con successo.`);
        
        // Ricarica la vista
        const query = catbrowserSearchInput ? catbrowserSearchInput.value.trim() : '';
        if (query.length >= 2) {
          searchProductsLocally(query);
        } else if (currentCategoryView) {
          loadProductsByCategory(currentCategoryView);
        } else {
          loadAllProducts();
        }
      } else {
        const err = await res.json();
        alert(`Errore creazione prodotto: ${err.error}`);
      }
    } catch (err) {
      alert(`Errore connessione: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salva Prodotto';
    }
  });
}

