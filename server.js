import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { parseField } from './nlp-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple manual .env parser to eliminate dotenv dependency
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/(^["']|["']$)/g, '');
            process.env[key] = val;
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Server] Impossibile caricare il file .env:', err.message);
  }
}

loadEnv();

const PORT = process.env.PORT || 3000;

// Local Drafts file path and helpers
const DRAFTS_FILE = path.join(__dirname, 'bozze_ddt.json');

function readDrafts() {
  try {
    if (fs.existsSync(DRAFTS_FILE)) {
      const data = fs.readFileSync(DRAFTS_FILE, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere le bozze:', err.message);
  }
  return [];
}

function writeDrafts(drafts) {
  try {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Server Error] Impossibile salvare le bozze:', err.message);
    return false;
  }
}

// ================= SINCRONIZZAZIONE GIACENZE CON INVENTARIO =================
const SOTTRATTO_FILE = path.join(__dirname, 'inventario_sottratto.json');

function readSottratto() {
  try {
    if (fs.existsSync(SOTTRATTO_FILE)) {
      return JSON.parse(fs.readFileSync(SOTTRATTO_FILE, 'utf8') || '{}');
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere inventario_sottratto.json:', err.message);
  }
  return {};
}

function writeSottratto(data) {
  try {
    fs.writeFileSync(SOTTRATTO_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Server Error] Impossibile scrivere inventario_sottratto.json:', err.message);
    return false;
  }
}

function syncDocumentExits(documentId, articles, isDelete = false) {
  try {
    const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
    if (!fs.existsSync(activeSessionTxtPath)) {
      console.warn('[Sync Inventario] Nessuna sessione attiva configurata (active_session.txt mancante).');
      return;
    }

    const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
    if (!sessionName) {
      console.warn('[Sync Inventario] Nome sessione attiva vuoto.');
      return;
    }

    const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
    if (!fs.existsSync(sessionFilePath)) {
      console.warn(`[Sync Inventario] File sessione non trovato: ${sessionFilePath}`);
      return;
    }

    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
    if (!sessionData || !Array.isArray(sessionData.products)) {
      console.warn('[Sync Inventario] Dati sessione non validi.');
      return;
    }

    const sottratto = readSottratto();
    const prevMap = sottratto[documentId] || {};
    const currentMap = {};

    if (!isDelete && articles && Array.isArray(articles)) {
      articles.forEach(art => {
        const sku = String(art.idMaterial || art.id || art.code || art.codice || '').trim();
        const qty = parseFloat(art.quantity || art.qty || art.quantita || 0);
        if (sku && qty > 0) {
          currentMap[sku] = (currentMap[sku] || 0) + qty;
        }
      });
    }

    // Unione di tutte le chiavi (precedenti ed attuali) per calcolare il delta
    const allSkus = new Set([...Object.keys(prevMap), ...Object.keys(currentMap)]);
    let modified = false;

    allSkus.forEach(sku => {
      const prevQty = prevMap[sku] || 0;
      const currentQty = currentMap[sku] || 0;
      const delta = currentQty - prevQty;

      if (delta !== 0) {
        // Cerca il prodotto nella sessione attiva di Inventario
        const prod = sessionData.products.find(p => p.CodiceArticolo === sku);
        if (prod) {
          prod.GiacenzaTeorica = (prod.GiacenzaTeorica || 0) - delta;
          modified = true;
          console.log(`[Sync Inventario] SKU: ${sku} | Giacenza teorica aggiornata: delta = ${delta} | Nuova Qty: ${prod.GiacenzaTeorica}`);
        } else {
          console.warn(`[Sync Inventario] SKU: ${sku} non trovato nell'inventario attivo.`);
        }
      }
    });

    if (modified) {
      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      console.log(`[Sync Inventario] Sincronizzato con successo l'inventario per il documento ${documentId}.`);
    }

    if (isDelete || Object.keys(currentMap).length === 0) {
      delete sottratto[documentId];
    } else {
      sottratto[documentId] = currentMap;
    }
    writeSottratto(sottratto);

  } catch (err) {
    console.error('[Sync Inventario Error] Sincronizzazione fallita:', err);
  }
}

// Local Products Cache file path and helpers
const PRODUCTS_CACHE_FILE = path.join(__dirname, 'prodotti_cache.json');

function readProductsFromSession() {
  try {
    const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
    if (fs.existsSync(activeSessionTxtPath)) {
      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      if (sessionName) {
        const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
        if (fs.existsSync(sessionFilePath)) {
          const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
          if (sessionData && Array.isArray(sessionData.products)) {
            // Load cache to fetch listini prices fallback
            const cachedPricesMap = {};
            const cachePath = path.join(__dirname, 'prodotti_cache.json');
            if (fs.existsSync(cachePath)) {
              try {
                const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                if (cacheData && Array.isArray(cacheData.products)) {
                  cacheData.products.forEach(cp => {
                    if (cp.id) cachedPricesMap[String(cp.id).toLowerCase()] = cp.prices;
                  });
                }
              } catch (e) {
                console.warn('Failed to parse cache in session read:', e.message);
              }
            }

            const localObsoleteList = readObsoleteList();
            const mapped = sessionData.products.map(p => {
              const defaultWh = p._defaultStorage || 'MB';
              const stocks = {
                "MB": 0, "CCIW": 0, "PR 26": 0, "CATALOGO": 0, "IW": 0,
                "MBB": 0, "MGR": 0, "MP": 0, "MPR": 0, "SANTINI": 0
              };
              stocks[defaultWh] = p.GiacenzaTeorica || 0;
              
              const skuLower = String(p.CodiceArticolo).toLowerCase();
              let pPrices = cachedPricesMap[skuLower];
              
              if (!pPrices) {
                const pSales = parseFloat(p.SalesPrice || p.Prezzo || p.prezzo || 0);
                const pPur = parseFloat(p.PurchasePrice || 0);
                pPrices = {
                  acquisto: pPur || pSales / 1.35 || 0,
                  privati: pSales || pPur * 1.35 || 0,
                  posatori: pPur || pSales / 1.35 || 0,
                  bologna: pPur || pSales / 1.35 || 0
                };
              }
              
              return {
                id: p.CodiceArticolo,
                barcode: p.Barcode || '',
                description: p.Descrizione || '',
                idMaterialGroup: p.Categoria || 'Generale',
                materialGroupDesc: p.Categoria || 'Generale',
                defaultStorage: defaultWh,
                stocks: stocks,
                idVat: p.idVat || '22',
                localObsolete: !!p.Obsoleto || localObsoleteList.includes(p.CodiceArticolo),
                boxQty: p.BoxQty || p.boxQty || 0,
                um: p._um || p.UM || 'pz',
                minStock: p.ScortaMinima || 0,
                ordina: !!p.Ordina,
                prices: {
                  acquisto: pPrices.acquisto !== undefined ? pPrices.acquisto : (pPrices.privati ? pPrices.privati / 1.35 : 0),
                  privati: pPrices.privati || 0,
                  posatori: pPrices.posatori || 0,
                  bologna: pPrices.bologna || 0
                }
              };
            });
            return {
              lastSync: new Date().toISOString(),
              products: mapped
            };
          }
        }
      }
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere i prodotti dalla sessione Inventario:', err.message);
  }
  return null;
}

function readProductsCache() {
  const sessionProducts = readProductsFromSession();
  if (sessionProducts) return sessionProducts;

  try {
    if (fs.existsSync(PRODUCTS_CACHE_FILE)) {
      const data = fs.readFileSync(PRODUCTS_CACHE_FILE, 'utf8');
      return JSON.parse(data || '{"products":[]}');
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere cache prodotti:', err.message);
  }
  
  // Fallback se la cache non esiste: legge le giacenze statiche
  try {
    const giacenzePath = path.join(__dirname, 'giacenze_prodotti.json');
    if (fs.existsSync(giacenzePath)) {
      const raw = fs.readFileSync(giacenzePath, 'utf8');
      const giacenze = JSON.parse(raw || '{}');
      const products = Object.keys(giacenze).map(id => ({
        id: id,
        description: id,
        defaultStorage: "MB",
        stocks: {
          "MB": giacenze[id],
          "CCIW": 0,
          "PR 26": 0,
          "CATALOGO": 0,
          "IW": 0,
          "MBB": 0,
          "MGR": 0,
          "MP": 0,
          "MPR": 0,
          "SANTINI": 0
        },
        idVat: "22"
      }));
      return { lastSync: null, products };
    }
  } catch (err) {
    console.error('[Server Error] Fallback giacenze di base fallito:', err.message);
  }
  return { lastSync: null, products: [] };
}

function filterActiveProducts(products) {
  if (!Array.isArray(products)) return [];
  const localObsoleteList = readObsoleteList();
  return products.filter(p => {
    // Obsolete on Giobby (group description is OBSOLETO or group ID is 38)
    const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
    const gDesc = p.materialGroupDesc ?? '';
    const isGiobbyObsolete = String(gId) === '38' || String(gDesc).toUpperCase() === 'OBSOLETO';
    
    // Obsolete in session or local obsolete
    const pId = p.id || p.CodiceArticolo;
    const isObsolete = isGiobbyObsolete || !!p.localObsolete || !!p.Obsoleto || (pId && localObsoleteList.includes(String(pId)));
    
    return !isObsolete;
  });
}

// Local Obsolete Products List helper
const OBSOLETE_FILE = path.join(__dirname, 'obsoleti_locali.json');

function readObsoleteList() {
  try {
    if (fs.existsSync(OBSOLETE_FILE)) {
      const data = fs.readFileSync(OBSOLETE_FILE, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere obsoleti locali:', err.message);
  }
  return [];
}

function writeObsoleteList(list) {
  try {
    fs.writeFileSync(OBSOLETE_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Server Error] Impossibile salvare obsoleti locali:', err.message);
    return false;
  }
}

// Local DDT History helper
const HISTORY_FILE = path.join(__dirname, 'storico_ddt.json');

function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    console.error('[Server Error] Impossibile leggere lo storico DDT:', err.message);
  }
  return [];
}

function writeHistory(list) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Server Error] Impossibile salvare lo storico DDT:', err.message);
    return false;
  }
}

function logCreatedDDT(payload, responseData, customerName) {
  try {
    const history = readHistory();
    const docNum = (responseData.document && responseData.document.docNumber) ? responseData.document.docNumber : (responseData.docNumber || responseData.id || 'Generato');
    const docDate = payload.docDate || new Date().toISOString().slice(0, 10);
    const causale = payload.deliveryData ? payload.deliveryData.reason : 'Vendita';
    const numArticles = payload.rows ? payload.rows.length : 0;
    
    // Log complete article details for editing fallback
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

    history.unshift(newEntry); // newest first
    writeHistory(history);
    console.log(`[Server] DDT registrato nello storico: N. ${docNum} per ${customerName}`);
  } catch (err) {
    console.error('[Server Error] Registrazione storico fallita:', err.message);
  }
}


// Giobby static credentials
const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

// Memory cache for tokens
let cachedToken = null;
let cachedApiUrl = null;

// Giobby authentication helper
async function authenticateGiobby() {
  console.log('[Giobby Proxy] Autenticazione con Giobby OAuth...');
  const tokenUrl = `https://auth.giobby.com/auth/realms/${GIOBBY_REALM}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('cid', GIOBBY_CID);
  params.append('username', GIOBBY_USERNAME);
  params.append('password', GIOBBY_PASSWORD);
  params.append('grant_type', 'password');
  params.append('client_id', GIOBBY_CLIENT_ID);

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Giobby Auth Failed: ${tokenRes.status} - ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token;
  console.log('[Giobby Proxy] Token di accesso Giobby acquisito.');

  // Fetch API endpoint base URL
  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await fetch(endpointUrl);
  if (!endpointRes.ok) {
    throw new Error(`Failed to retrieve API endpoint: ${endpointRes.status}`);
  }
  const endpointData = await endpointRes.json();
  cachedApiUrl = endpointData.GiobbyApiURL;
  console.log('[Giobby Proxy] API URL base in cache:', cachedApiUrl);
}

// Request Giobby with auto-retry on 401
async function requestGiobby(endpoint, method = 'GET', body = null, queryParams = {}) {
  if (!cachedToken || !cachedApiUrl) {
    await authenticateGiobby();
  }

  const runRequest = async () => {
    let url = `${cachedApiUrl}${endpoint}`;
    const qKeys = Object.keys(queryParams);
    if (qKeys.length > 0) {
      const qString = qKeys.map(k => `${k}=${encodeURIComponent(queryParams[k])}`).join('&');
      url += `?${qString}`;
    }

    const headers = {
      'Authorization': `Bearer ${cachedToken}`,
      'X-Giobby-Realm': GIOBBY_REALM,
      'Content-Type': 'application/json'
    };

    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }

    console.log(`[Giobby Proxy] Chiamata: ${method} ${url}`);
    const res = await fetch(url, config);

    if (res.status === 401) {
      console.warn('[Giobby Proxy] Non autorizzato (401). Rigenerazione token...');
      await authenticateGiobby();
      headers['Authorization'] = `Bearer ${cachedToken}`;
      const retryRes = await fetch(url, { ...config, headers });
      return retryRes;
    }

    return res;
  };

  const response = await runRequest();
  const resText = await response.text();
  let resJson = null;

  try {
    resJson = JSON.parse(resText);
  } catch (err) {
    throw new Error(`Failed to parse response: ${response.status} - ${resText}`);
  }

  if (!response.ok || (resJson && resJson.errorCode !== 0)) {
    throw {
      status: response.status,
      message: resJson ? (resJson.userMessage || resJson.developerMessage || 'Giobby API Error') : 'Unknown API Error',
      data: resJson
    };
  }

  return resJson;
}

// Helper to read incoming request body stream
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', err => {
      reject(err);
    });
  });
}

// Helper to respond with JSON
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(JSON.stringify(data));
}

// MIME types dictionary for static file server
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Static file serving logic
function serveStaticFile(res, relativePath) {
  const filePath = path.join(__dirname, 'public', relativePath === '/' ? 'index.html' : relativePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback for single page app routing: serve index.html if file doesn't exist
        const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexHtmlPath, (idxErr, idxContent) => {
          if (idxErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('File non trovato');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(idxContent);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Errore interno del server');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(content, 'utf-8');
    }
  });
}

let syncProgress = {
  status: 'idle', // 'idle', 'running', 'completed', 'failed'
  current: 0,
  estimatedTotal: 2500,
  error: null,
  count: 0
};

async function runSyncInBackground() {
  try {
    console.log('[Sync] Avvio sincronizzazione in background...');
    await authenticateGiobby();
    
    // 2. Read local giacenze_prodotti.json to merge stock quantities
    let giacenze = {};
    const giacenzePath = path.join(__dirname, 'giacenze_prodotti.json');
    if (fs.existsSync(giacenzePath)) {
      const rawGiacenze = fs.readFileSync(giacenzePath, 'utf8');
      giacenze = JSON.parse(rawGiacenze || '{}');
    }

    // 2.b.2 Fetch base pricelists from Giobby
    console.log('[Sync] Download listini base da Giobby...');
    let listino29Rows = [];
    let listino31Rows = [];
    let listino32Rows = [];
    let listino34Rows = [];

    try {
      console.log('[Sync] Download Listino 29 ("PREZZI ACQUISTO")...');
      const listino29Data = await requestGiobby('/pricelists/29', 'GET', null, {});
      listino29Rows = listino29Data.pricelist?.rows || [];
      console.log(`[Sync] Ricevute ${listino29Rows.length} righe per Listino 29.`);
    } catch (err) {
      console.error('[Sync Warning] Impossibile scaricare Listino 29:', err.message || err);
    }

    try {
      console.log('[Sync] Download Listino 31 ("LISTINO ARTIGIANI NUOVO")...');
      const listino31Data = await requestGiobby('/pricelists/31', 'GET', null, {});
      listino31Rows = listino31Data.pricelist?.rows || [];
      console.log(`[Sync] Ricevute ${listino31Rows.length} righe per Listino 31.`);
    } catch (err) {
      console.error('[Sync Warning] Impossibile scaricare Listino 31:', err.message || err);
    }

    try {
      console.log('[Sync] Download Listino 32 ("LISTINO BOLOGNA NUOVO")...');
      const listino32Data = await requestGiobby('/pricelists/32', 'GET', null, {});
      listino32Rows = listino32Data.pricelist?.rows || [];
      console.log(`[Sync] Ricevute ${listino32Rows.length} righe per Listino 32.`);
    } catch (err) {
      console.error('[Sync Warning] Impossibile scaricare Listino 32:', err.message || err);
    }

    try {
      console.log('[Sync] Download Listino 34 ("LISTINO PRIVATI NUOVO")...');
      const listino34Data = await requestGiobby('/pricelists/34', 'GET', null, {});
      listino34Rows = listino34Data.pricelist?.rows || [];
      console.log(`[Sync] Ricevute ${listino34Rows.length} righe per Listino 34.`);
    } catch (err) {
      console.error('[Sync Warning] Impossibile scaricare Listino 34:', err.message || err);
    }

    // Build pricelist maps: idMaterial -> salesPrice
    const priceMap29 = {};
    listino29Rows.forEach(r => { if (r.id) priceMap29[r.id] = parseFloat(r.salesPrice ?? 0); });

    const priceMap31 = {};
    listino31Rows.forEach(r => { if (r.id) priceMap31[r.id] = parseFloat(r.salesPrice ?? 0); });

    const priceMap32 = {};
    listino32Rows.forEach(r => { if (r.id) priceMap32[r.id] = parseFloat(r.salesPrice ?? 0); });

    const priceMap34 = {};
    listino34Rows.forEach(r => { if (r.id) priceMap34[r.id] = parseFloat(r.salesPrice ?? 0); });

    // 2.b Fetch all stocks availability from Giobby
    console.log('[Sync] Download disponibilità magazzini da Giobby...');
    let stockPage = 1;
    let stockLimit = 500;
    let allStocks = [];
    let stockHasMore = true;
    let stockOffset = 0;

    while (stockHasMore) {
      console.log(`[Sync] Download disponibilità magazzini pagina ${stockPage}...`);
      const stockParams = { limit: stockLimit, offset: stockOffset };
      const stockData = await requestGiobby('/stocks/avaibility', 'GET', null, stockParams);
      const stocksList = Array.isArray(stockData) ? stockData : (stockData.stocks || stockData.stocksAvailability || stockData.availability || stockData.data || []);
      console.log(`[Sync] Ricevute ${stocksList.length} righe di disponibilità per la pagina ${stockPage}.`);
      
      if (stocksList.length === 0) {
        stockHasMore = false;
      } else {
        allStocks = allStocks.concat(stocksList);
        if (stocksList.length < stockLimit) {
          stockHasMore = false;
        } else {
          stockOffset += stockLimit;
          stockPage++;
        }
      }
    }

    // Build stock lookup map: idMaterial -> { idStorage -> quantity }
    const stockLookup = {};
    allStocks.forEach(item => {
      const matId = item.idMaterial;
      const storageId = item.idStorage;
      const qty = parseFloat(item.quantity ?? 0);
      if (matId) {
        if (!stockLookup[matId]) {
          stockLookup[matId] = {};
        }
        if (storageId !== undefined) {
          stockLookup[matId][storageId] = qty;
        }
      }
    });

    // 2.c Read local obsolete list to carry flags over synchronization
    const localObsoleteList = readObsoleteList();
    const localObsoleteSet = new Set(localObsoleteList);

    let page = 1;
    let limit = 200;
    let allProducts = [];
    let hasMore = true;

    while (hasMore) {
      console.log(`[Sync] Download pagina ${page}...`);
      const params = { limit, offset: (page - 1) * limit, salesEnabled: true };
      const data = await requestGiobby('/products', 'GET', null, params);
      const products = data.products || [];
      
      console.log(`[Sync] Ricevuti ${products.length} prodotti per la pagina ${page}.`);
      if (products.length === 0) {
        hasMore = false;
      } else {
        allProducts = allProducts.concat(products);
        syncProgress.current = allProducts.length;
        page++;
        if (products.length < limit) {
          hasMore = false;
        }
      }
    }

    console.log(`[Sync] Totale prodotti scaricati: ${allProducts.length}. Elaborazione giacenze...`);

    // 3. Process products to add stocks object
    const processedProducts = allProducts.map(p => {
      const defaultWh = p.defaultStorage || 'MB';
      
      // Initialize stocks dictionary for all 10 warehouses
      const stocks = {
        "MB": 0,
        "CCIW": 0,
        "PR 26": 0,
        "CATALOGO": 0,
        "IW": 0,
        "MBB": 0,
        "MGR": 0,
        "MP": 0,
        "MPR": 0,
        "SANTINI": 0
      };
      
      const productStocks = stockLookup[p.id];
      if (productStocks) {
        for (const wh in stocks) {
          if (productStocks.hasOwnProperty(wh)) {
            stocks[wh] = productStocks[wh];
          }
        }
      } else {
        // Fallback to local giacenze_prodotti.json only if product was not in Giobby stocks list
        const totalQty = giacenze[p.id] ?? 0;
        if (stocks.hasOwnProperty(defaultWh)) {
          stocks[defaultWh] = totalQty;
        } else {
          stocks["MB"] = totalQty; // Fallback to MB
        }
      }

      const isLocalObsolete = localObsoleteSet.has(p.id);

      // Calcolo prezzi derivati
      const p29 = priceMap29[p.id] !== undefined ? priceMap29[p.id] : null;
      const p31 = priceMap31[p.id] !== undefined ? priceMap31[p.id] : null;
      const p32 = priceMap32[p.id] !== undefined ? priceMap32[p.id] : null;
      const p34 = priceMap34[p.id] !== undefined ? priceMap34[p.id] : null;

      // 1. Privati: Listino 34 diretto, fallback Listino 29 * 1.35
      let pricePrivati = null;
      if (p34 !== null) {
        pricePrivati = p34;
      } else if (p29 !== null) {
        pricePrivati = p29 * 1.35;
      }

      // 2. Posatori: Listino 31 diretto, fallback Listino 29 * 1.15
      let pricePosatori = null;
      if (p31 !== null) {
        pricePosatori = p31;
      } else if (p29 !== null) {
        pricePosatori = p29 * 1.15;
      }

      // 3. Bologna: Listino 32 diretto, fallback Listino 29
      let priceBologna = null;
      if (p32 !== null) {
        priceBologna = p32;
      } else if (p29 !== null) {
        priceBologna = p29;
      }

      return {
        id: p.id,
        barcode: p.barcode || '',
        description: p.description || p.description_IT || '',
        idMaterialGroup: p.idMaterialGroup,
        materialGroupDesc: p.materialGroupDesc,
        defaultStorage: defaultWh,
        stocks: stocks,
        idVat: p.idVat || '22',
        localObsolete: isLocalObsolete,
        boxQty: p.boxQty || 0,
        um: p.um || '',
        prices: {
          acquisto: p29 !== null ? parseFloat(p29.toFixed(4)) : null,
          privati: pricePrivati !== null ? parseFloat(pricePrivati.toFixed(4)) : null,
          posatori: pricePosatori !== null ? parseFloat(pricePosatori.toFixed(4)) : null,
          bologna: priceBologna !== null ? parseFloat(priceBologna.toFixed(4)) : null
        }
      };
    });

    // 4. Save to prodotti_cache.json
    const cacheData = {
      lastSync: new Date().toISOString(),
      products: processedProducts
    };
    fs.writeFileSync(PRODUCTS_CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
    
    console.log(`[Sync] Sincronizzazione completata con successo! Salvati ${processedProducts.length} prodotti.`);
    syncProgress.status = 'completed';
    syncProgress.current = processedProducts.length;
    syncProgress.estimatedTotal = processedProducts.length;
    syncProgress.count = processedProducts.length;
  } catch (err) {
    console.error('[Sync Error] Background sync failed:', err);
    syncProgress.status = 'failed';
    syncProgress.error = err.message || 'Errore durante la sincronizzazione.';
  }
}

// Create the native http server
const server = http.createServer(async (req, res) => {
  // Enforce CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Giobby-Realm',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Parse path and query
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // ROUTE: API Parse Vocale
  if (pathname === '/api/parse' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      const { field, text } = JSON.parse(rawBody);

      if (!field || !text) {
        return sendJSON(res, 400, { error: 'Campi "field" e "text" obbligatori.' });
      }

      console.log(`[NLP Input] Parsing field: "${field}", text: "${text}"`);
      const parsed = await parseField(field, text, process.env.GEMINI_API_KEY);
      console.log(`[NLP Output] Field: "${field}", result:`, parsed);
      sendJSON(res, 200, { result: parsed });
    } catch (err) {
      console.error('[NLP Error] Errore NLP:', err);
      sendJSON(res, 500, { error: 'Errore interno nell\'elaborazione vocale.' });
    }
    return;
  }

  // ROUTE: GET /api/customers (Proxy lookup)
  if (pathname === '/api/customers' && req.method === 'GET') {
    try {
      const query = parsedUrl.searchParams.get('q') || '';
      const params = { limit: 15 };
      if (query) {
        params.freeText = query;
      }
      const data = await requestGiobby('/customers', 'GET', null, params);
      sendJSON(res, 200, data.customers || []);
    } catch (err) {
      console.error('[Proxy Error] Customers lookup failed:', err);
      sendJSON(res, err.status || 500, { error: err.message || 'Errore ricerca clienti.' });
    }
    return;
  }

  // ROUTE: GET /api/categories → carica o estrae i gruppi di prodotti
  if (pathname === '/api/categories' && req.method === 'GET') {
    try {
      // Prova prima a estrarre le categorie dall'inventario attivo condiviso
      const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
      if (fs.existsSync(activeSessionTxtPath)) {
        const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
        if (sessionName) {
          const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
          if (fs.existsSync(sessionFilePath)) {
            const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
            if (sessionData && Array.isArray(sessionData.products)) {
              const cats = new Set();
              const localObsoleteList = readObsoleteList();
              sessionData.products.forEach(p => {
                const isObsolete = !!p.Obsoleto || localObsoleteList.includes(p.CodiceArticolo);
                if (p.Categoria && !isObsolete) cats.add(p.Categoria.trim());
              });
              if (cats.size === 0) cats.add('Generale');
              const groups = Array.from(cats).map(cat => ({
                id: cat,
                description: cat
              }));
              console.log(`[Fogli blu] Categorie estratte da sessione attiva: ${groups.length}`);
              return sendJSON(res, 200, groups);
            }
          }
        }
      }

      console.log('[Proxy] Richiesta categorie da GET /productsgroups...');
      const data = await requestGiobby('/productsgroups', 'GET', null, {});
      const groupMap = new Map();
      (data.productsGroups || []).forEach(g => {
        const rawDesc = g.description || g.description_IT || String(g.id);
        const trimmed = rawDesc.trim();
        const key = trimmed.toUpperCase();
        if (groupMap.has(key)) {
          const existing = groupMap.get(key);
          if (!existing.ids.includes(g.id)) {
            existing.ids.push(g.id);
          }
        } else {
          groupMap.set(key, {
            ids: [g.id],
            description: trimmed
          });
        }
      });
      const groups = Array.from(groupMap.values()).map(g => ({
        id: g.ids.join(','),
        description: g.description
      }));
      console.log(`[Proxy] Categorie caricate correttamente: ${groups.length}`);
      sendJSON(res, 200, groups);
    } catch (err) {
      console.warn('[Proxy Warning] GET /productsgroups fallito, avvio estrazione di fallback dai prodotti:', err.message || err);
      try {
        // Fallback: carica i prodotti per raccogliere gli idMaterialGroup/idProductsGroup unici
        const prodData = await requestGiobby('/products', 'GET', null, { limit: 200, salesEnabled: true });
        const products = prodData.products || [];

        const groupMap = new Map();
        products.forEach(p => {
          const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
          const gDesc = p.materialGroupDesc ?? p.productsGroupDescription ?? p.productGroupDescription ?? p.groupDescription ?? p.groupName;
          if (gId != null && !groupMap.has(String(gId))) {
            groupMap.set(String(gId), { id: gId, description: gDesc || String(gId) });
          }
        });

        // Arricchisce con GET /productsgroups/{id} dove manca la descrizione
        const enrichPromises = [];
        for (const [, g] of groupMap) {
          if (!g.description || g.description === String(g.id)) {
            enrichPromises.push(
              requestGiobby(`/productsgroups/${g.id}`, 'GET', null, {})
                .then(d => {
                  const det = d.productsGroup || d.productGroup || d;
                  g.description = det.description || det.name || g.description;
                })
                .catch(() => {/* lascia la descrizione di default */})
            );
          }
        }
        await Promise.all(enrichPromises);

        // Raggruppa per descrizione normalizzata dopo l'arricchimento
        const mergedMap = new Map();
        for (const [, g] of groupMap) {
          const trimmed = (g.description || '').trim();
          const key = trimmed.toUpperCase() || String(g.id);
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            if (!existing.ids.includes(g.id)) {
              existing.ids.push(g.id);
            }
          } else {
            mergedMap.set(key, {
              ids: [g.id],
              description: trimmed || String(g.id)
            });
          }
        }

        const groups = Array.from(mergedMap.values()).map(g => ({
          id: g.ids.join(','),
          description: g.description
        }));
        console.log(`[Proxy] Categorie estratte dai prodotti (fallback): ${groups.length}`);
        sendJSON(res, 200, groups);
      } catch (fallbackErr) {
        console.error('[Proxy Error] Categories extraction fallback failed:', fallbackErr);
        sendJSON(res, fallbackErr.status || 500, { error: fallbackErr.message || 'Errore estrazione categorie.' });
      }
    }
    return;
  }



  // ROUTE: GET /api/drafts
  if (pathname === '/api/drafts' && req.method === 'GET') {
    try {
      const drafts = readDrafts();
      sendJSON(res, 200, drafts);
    } catch (err) {
      console.error('[Proxy Error] Failed to get drafts:', err);
      sendJSON(res, 500, { error: 'Impossibile caricare le bozze.' });
    }
    return;
  }

  // ROUTE: POST /api/drafts
  if (pathname === '/api/drafts' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      const draft = JSON.parse(rawBody);

      if (!draft.data || !draft.articles || !Array.isArray(draft.articles)) {
        return sendJSON(res, 400, { error: 'Dati bozza non validi o incompleti.' });
      }

      const drafts = readDrafts();
      if (draft.id) {
        // Modifica bozza esistente
        const idx = drafts.findIndex(d => String(d.id) === String(draft.id));
        if (idx !== -1) {
          drafts[idx] = { ...drafts[idx], ...draft, updatedAt: new Date().toISOString() };
          console.log(`[Proxy] Bozza aggiornata con successo (ID: ${draft.id})`);
        } else {
          draft.createdAt = new Date().toISOString();
          drafts.push(draft);
          console.log(`[Proxy] Nuova bozza creata con ID fornito (ID: ${draft.id})`);
        }
      } else {
        // Nuova bozza
        draft.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        draft.createdAt = new Date().toISOString();
        drafts.push(draft);
        console.log(`[Proxy] Nuova bozza creata (ID: ${draft.id})`);
      }

      const success = writeDrafts(drafts);
      if (!success) throw new Error('Impossibile scrivere su file');

      // Sincronizza uscite con l'inventario
      syncDocumentExits(draft.id, draft.articles);

      sendJSON(res, 200, { success: true, draft });
    } catch (err) {
      console.error('[Proxy Error] Failed to save draft:', err);
      sendJSON(res, 500, { error: 'Impossibile salvare la bozza.' });
    }
    return;
  }

  // ROUTE: DELETE /api/drafts
  if (pathname === '/api/drafts' && req.method === 'DELETE') {
    try {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        return sendJSON(res, 400, { error: 'ID bozza mancante.' });
      }

      let drafts = readDrafts();
      const initialLength = drafts.length;
      drafts = drafts.filter(d => String(d.id) !== String(id));

      if (drafts.length === initialLength) {
        return sendJSON(res, 404, { error: 'Bozza non trovata.' });
      }

      const success = writeDrafts(drafts);
      if (!success) throw new Error('Impossibile scrivere su file');

      // Rimuove uscite sottratte dall'inventario
      syncDocumentExits(id, null, true);

      console.log(`[Proxy] Bozza eliminata (ID: ${id})`);
      sendJSON(res, 200, { success: true });
    } catch (err) {
      console.error('[Proxy Error] Failed to delete draft:', err);
      sendJSON(res, 500, { error: 'Impossibile eliminare la bozza.' });
    }
    return;
  }

  // ROUTE: GET /api/warehouses (Proxy lookup)
  if (pathname === '/api/warehouses' && req.method === 'GET') {
    try {
      const data = await requestGiobby('/storages', 'GET', null, {});
      sendJSON(res, 200, data.storages || []);
    } catch (err) {
      console.warn('[Proxy Warning] Storages lookup failed, using static fallback:', err.message || err);
      const fallback = [
        { id: "CATALOGO", description: "CATALOGO" },
        { id: "CCIW", description: "CV ITALWOOD NUOVO" },
        { id: "IW", description: "DECKING CV IW" },
        { id: "MB", description: "MAGAZZINO BASE PR" },
        { id: "MBB", description: "MAGAZZINO BOLOGNA" },
        { id: "MGR", description: "MAGAZZINO RICCIONE" },
        { id: "MP", description: "MAGAZZINO PROVA" },
        { id: "MPR", description: "MAGAZZINO PARQUET ROMAGNA" },
        { id: "PR 26", description: "MAGAZZINO PR 2026" },
        { id: "SANTINI", description: "MAGAZZINO ITALWOOD" }
      ];
      sendJSON(res, 200, fallback);
    }
    return;
  }

  // ROUTE: GET /api/products/status (Get sync status)
  if (pathname === '/api/products/status' && req.method === 'GET') {
    try {
      const cache = readProductsCache();
      sendJSON(res, 200, {
        lastSync: cache.lastSync,
        count: cache.products ? cache.products.length : 0
      });
    } catch (err) {
      console.error('[Server Error] API status fallito:', err);
      sendJSON(res, 500, { error: 'Impossibile leggere lo stato dei prodotti.' });
    }
    return;
  }

  // ROUTE: GET /api/products/sync/progress (Get sync progress)
  if (pathname === '/api/products/sync/progress' && req.method === 'GET') {
    return sendJSON(res, 200, syncProgress);
  }

  // ROUTE: POST /api/products/sync (Synchronize catalog)
  if (pathname === '/api/products/sync' && req.method === 'POST') {
    if (syncProgress.status === 'running') {
      return sendJSON(res, 200, { success: true, status: 'already_running' });
    }

    syncProgress.status = 'running';
    syncProgress.current = 0;
    syncProgress.error = null;

    try {
      const cache = readProductsCache();
      if (cache && cache.products && cache.products.length > 0) {
        syncProgress.estimatedTotal = cache.products.length;
      } else {
        syncProgress.estimatedTotal = 2500;
      }
    } catch (e) {
      syncProgress.estimatedTotal = 2500;
    }

    // Run the synchronization process in background
    runSyncInBackground();

    // Respond immediately
    return sendJSON(res, 200, { success: true, status: 'started' });
  }

  // ROUTE: POST /api/products/sync-single (Synchronize a single product by code or barcode)
  if (pathname === '/api/products/sync-single' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const code = (payload.code || '').trim();
        const checkOnly = !!payload.checkOnly;
        if (!code) {
          return sendJSON(res, 400, { error: 'Codice prodotto richiesto.' });
        }

        console.log(`[Sync Single] Inizio sincronizzazione singola per codice: "${code}"...`);
        await authenticateGiobby();

        // 1. Cerca il prodotto su Giobby
        let giobbyProduct = null;
        
        // Prova prima la chiamata diretta per ID (visto che su Giobby il codice prodotto corrisponde all'ID)
        try {
          const directData = await requestGiobby(`/products/${encodeURIComponent(code)}`, 'GET', null, {});
          if (directData && directData.product) {
            giobbyProduct = directData.product;
          }
        } catch (e) {
          console.log(`[Sync Single] Ricerca diretta /products/${code} fallita o non trovata:`, e.message);
        }

        // Se non trovato direttamente, prova a cercarlo nella lista (es: se inseriscono il barcode)
        if (!giobbyProduct) {
          const searchData = await requestGiobby('/products', 'GET', null, { limit: 50, salesEnabled: true });
          const products = searchData?.products || [];
          const codeUpper = code.toUpperCase();
          giobbyProduct = products.find(p => 
            String(p.id).toUpperCase() === codeUpper || 
            String(p.barcode || '').toUpperCase() === codeUpper
          );
        }

        if (!giobbyProduct) {
          return sendJSON(res, 404, { error: `Nessun prodotto trovato su Giobby con codice o barcode uguale a "${code}".` });
        }

        const pId = giobbyProduct.id;
        console.log(`[Sync Single] Prodotto trovato su Giobby: "${giobbyProduct.description}" (ID: ${pId})`);

        // 2. Recupera giacenze specifiche per questo prodotto
        let stockLookup = {};
        try {
          const stockData = await requestGiobby('/stocks/avaibility', 'GET', null, { idMaterial: pId });
          const stocksList = Array.isArray(stockData) ? stockData : (stockData?.stocks || stockData?.stocksAvailability || stockData?.availability || stockData?.data || []);
          stocksList.forEach(item => {
            const storageId = item.idStorage;
            const qty = parseFloat(item.quantity ?? 0);
            if (storageId !== undefined) {
              stockLookup[storageId] = qty;
            }
          });
        } catch (e) {
          console.error('[Sync Single Warning] Impossibile recuperare stock:', e.message);
        }

        // 3. Recupera i prezzi dai listini (se possibile recuperare intera riga o fallback su prezzo base)
        const defaultWh = giobbyProduct.defaultStorage || 'MB';
        
        // Inizializza magazzini
        const stocks = {
          "MB": stockLookup["MB"] ?? 0,
          "CCIW": stockLookup["CCIW"] ?? 0,
          "PR 26": stockLookup["PR 26"] ?? 0,
          "CATALOGO": stockLookup["CATALOGO"] ?? 0,
          "IW": stockLookup["IW"] ?? 0,
          "MBB": stockLookup["MBB"] ?? 0,
          "MGR": stockLookup["MGR"] ?? 0,
          "MP": stockLookup["MP"] ?? 0,
          "MPR": stockLookup["MPR"] ?? 0,
          "SANTINI": stockLookup["SANTINI"] ?? 0
        };

        const localObsoleteList = readObsoleteList();
        const isLocalObsolete = localObsoleteList.includes(pId);

        // Prezzo base da Giobby
        const basePrice = parseFloat(giobbyProduct.salesPrice ?? 0);
        
        // Calcolo prezzi derivati usando basePrice come base per i listini
        const pricePrivati = basePrice * 1.35;
        const pricePosatori = basePrice * 1.15;
        const priceBologna = basePrice;

        const processedProduct = {
          id: pId,
          barcode: giobbyProduct.barcode || '',
          description: giobbyProduct.description || giobbyProduct.description_IT || '',
          idMaterialGroup: giobbyProduct.idMaterialGroup,
          materialGroupDesc: giobbyProduct.materialGroupDesc,
          defaultStorage: defaultWh,
          stocks: stocks,
          idVat: giobbyProduct.idVat || '22',
          localObsolete: isLocalObsolete,
          boxQty: giobbyProduct.boxQty || 0,
          um: giobbyProduct.um || '',
          prices: {
            acquisto: parseFloat(basePrice.toFixed(4)),
            privati: parseFloat(pricePrivati.toFixed(4)),
            posatori: parseFloat(pricePosatori.toFixed(4)),
            bologna: parseFloat(priceBologna.toFixed(4))
          }
        };

        if (checkOnly) {
          console.log(`[Sync Single] Solo verifica magazzino per "${pId}". Magazzino: "${defaultWh}".`);
          return sendJSON(res, 200, { success: true, product: processedProduct, checkOnly: true });
        }

        // 4. Aggiorna la cache locale
        const cache = readProductsCache();
        const existingProducts = cache.products || [];
        
        // Rimuove eventuali versioni precedenti dello stesso prodotto
        const filteredProducts = existingProducts.filter(p => p.id !== pId);
        filteredProducts.unshift(processedProduct); // Lo inseriamo all'inizio
        
        cache.products = filteredProducts;
        cache.lastSync = new Date().toISOString();
        
        fs.writeFileSync(PRODUCTS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
        
        console.log(`[Sync Single] Sincronizzazione completata per "${pId}".`);
        return sendJSON(res, 200, { success: true, product: processedProduct });
      } catch (err) {
        console.error('[Sync Single Error] Failed:', err);
        return sendJSON(res, 500, { error: err.message || 'Errore sincronizzazione singolo prodotto.' });
      }
    });
    return;
  }

  // ROUTE: GET /api/products (Local cached search)
  if (pathname === '/api/products' && req.method === 'GET') {
    try {
      const query = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim();
      const idCategory = parsedUrl.searchParams.get('idCategory') || '';
      
      const cache = readProductsCache();
      let products = cache.products || [];

      // Filter out obsolete/deleted products from inventory
      products = filterActiveProducts(products);

      // Filter by category if specified
      if (idCategory) {
        const catIds = String(idCategory).split(',').map(id => id.trim());
        products = products.filter(p => {
          const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
          return catIds.includes(String(gId));
        });
      }

      // Filter by text search query (unordered word search matches ID/Code, barcode or description)
      if (query) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
        products = products.filter(p => {
          const searchTarget = `${String(p.id)} ${p.barcode ? String(p.barcode) : ''} ${String(p.description)}`.toLowerCase();
          return queryWords.every(word => searchTarget.includes(word));
        });
      }

      // Limit results to prevent sending massive JSON to client (e.g. max 100)
      const limit = parseInt(parsedUrl.searchParams.get('limit')) || 100;
      products = products.slice(0, limit);

      // Resolve dynamic Giobby product URL base if possible
      if (!cachedApiUrl) {
        try {
          await authenticateGiobby();
        } catch (e) {
          console.warn('[Server Warning] Impossibile autenticare Giobby per risolvere cachedApiUrl:', e.message);
        }
      }
      const baseApiUrl = cachedApiUrl || 'https://app.giobby.com/GiobbyApi00553/v1';
      const frontendRoot = baseApiUrl.replace('/GiobbyApi', '/Giobby').replace(/\/v1\/?$/, '');
      const productsWithUrls = products.map(p => ({
        ...p,
        giobbyUrl: `${frontendRoot}/company/Material.xhtml?id=${encodeURIComponent(p.id)}`
      }));

      // Return array of products directly to keep backward compatibility
      sendJSON(res, 200, productsWithUrls);
    } catch (err) {
      console.error('[Server Error] Products lookup failed:', err);
      sendJSON(res, 500, { error: 'Errore durante la ricerca dei prodotti nella cache.' });
    }
    return;
  }

  // ROUTE: POST /api/products (Aggiunta nuovo prodotto nella sessione attiva)
  if (pathname === '/api/products' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      const { sku, desc, loc, cat, qty, salesPrice } = JSON.parse(rawBody);

      if (!sku || !desc) {
        return sendJSON(res, 400, { error: 'Codice e Descrizione sono obbligatori.' });
      }

      const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        return sendJSON(res, 400, { error: 'Nessuna sessione attiva configurata in Inventario.' });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return sendJSON(res, 400, { error: 'File sessione attiva non trovato.' });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const isDuplicate = sessionData.products.some(p => String(p.CodiceArticolo).toLowerCase() === sku.toLowerCase());
      if (isDuplicate) {
        return sendJSON(res, 400, { error: 'Questo Codice Articolo è già presente nell\'inventario.' });
      }

      const newProd = {
        CodiceArticolo: sku,
        CodiceSecondario: "",
        Descrizione: desc,
        Categoria: cat || "Generale",
        Ubicazione: loc || "MB",
        GiacenzaTeorica: parseFloat(qty) || 0,
        _giobbyId: null,
        ScortaMinima: 0,
        Barcode: "",
        SalesPrice: parseFloat(salesPrice) || 0,
        PurchasePrice: parseFloat(salesPrice) || 0,
        UM: "PZ",
        StockEnabled: true
      };

      sessionData.products.push(newProd);
      if (qty > 0) {
        sessionData.counts[sku] = parseFloat(qty);
      }

      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      console.log(`[Fogli blu] Creato nuovo prodotto "${sku}" in sessione attiva "${sessionName}".`);
      sendJSON(res, 200, { success: true, product: newProd });
    } catch (err) {
      console.error('[Server Error] Creazione prodotto fallita:', err);
      sendJSON(res, 500, { error: 'Errore durante la creazione del prodotto.' });
    }
    return;
  }

  // ROUTE: DELETE /api/products (Eliminazione prodotto dalla sessione attiva)
  if (pathname === '/api/products' && req.method === 'DELETE') {
    try {
      const sku = parsedUrl.searchParams.get('id');
      if (!sku) {
        return sendJSON(res, 400, { error: 'ID/SKU prodotto mancante.' });
      }

      const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        return sendJSON(res, 400, { error: 'Nessuna sessione attiva configurata in Inventario.' });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return sendJSON(res, 400, { error: 'File sessione attiva non trovato.' });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const initialLength = sessionData.products.length;
      sessionData.products = sessionData.products.filter(p => String(p.CodiceArticolo).toLowerCase() !== sku.toLowerCase());

      if (sessionData.products.length === initialLength) {
        return sendJSON(res, 404, { error: 'Prodotto non trovato nell\'inventario.' });
      }

      if (sessionData.counts) {
        delete sessionData.counts[sku];
        Object.keys(sessionData.counts).forEach(k => {
          if (k.toLowerCase() === sku.toLowerCase()) delete sessionData.counts[k];
        });
      }

      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      console.log(`[Fogli blu] Eliminato prodotto "${sku}" in sessione attiva "${sessionName}".`);
      sendJSON(res, 200, { success: true });
    } catch (err) {
      console.error('[Server Error] Eliminazione prodotto fallita:', err);
      sendJSON(res, 500, { error: 'Errore durante l\'eliminazione del prodotto.' });
    }
    return;
  }

  // ROUTE: GET /api/products/reorder (Ottieni elenco prodotti in esaurimento o da ordinare)
  if (pathname === '/api/products/reorder' && req.method === 'GET') {
    try {
      const cache = readProductsCache();
      let products = cache.products || [];
      products = filterActiveProducts(products);
      const reorderList = [];

      products.forEach(p => {
        const minStock = p.minStock || 0;
        const whCode = p.defaultStorage || 'MB';
        const currentQty = p.stocks ? (p.stocks[whCode] || 0) : 0;
        const isManual = !!p.ordina;

        // Inserisci se sotto scorta OPPURE se contrassegnato manualmente
        if ((minStock > 0 && currentQty < minStock) || isManual) {
          const deficit = isManual ? Math.max(0, minStock - currentQty) || 1 : minStock - currentQty;
          reorderList.push({
            id: p.id,
            barcode: p.barcode || '',
            description: p.description,
            category: p.materialGroupDesc || 'Generale',
            storage: whCode,
            currentQty: currentQty,
            minStock: minStock,
            deficit: deficit,
            isManual: isManual
          });
        }
      });

      const excelMode = parsedUrl.searchParams.get('excel') === 'true';
      if (excelMode) {
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=lista_riordino_${new Date().toISOString().slice(0, 10)}.csv`
        });
        res.write('\uFEFF');
        res.write('Codice Articolo;Codice a Barre;Descrizione;Categoria;Magazzino;Giacenza Attuale;Scorta Minima;Deficit (Quantità da ordinare);Tipo Riordino\n');
        reorderList.forEach(item => {
          const tipo = item.isManual ? 'Manuale' : 'Sotto Scorta';
          res.write(`"${item.id}";"${item.barcode}";"${item.description}";"${item.category}";"${item.storage}";${item.currentQty};${item.minStock};${item.deficit};"${tipo}"\n`);
        });
        res.end();
      } else {
        sendJSON(res, 200, reorderList);
      }
    } catch (err) {
      console.error('[Server Error] Reorder lookup failed:', err);
      sendJSON(res, 500, { error: 'Errore durante il recupero dei prodotti in esaurimento.' });
    }
    return;
  }

  // ROUTE: POST /api/products/reorder-manual (Cambia stato flag manuale Ordina)
  if (pathname === '/api/products/reorder-manual' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      const { sku, ordina } = JSON.parse(rawBody);

      if (!sku) {
        return sendJSON(res, 400, { error: 'SKU prodotto obbligatorio.' });
      }

      const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        return sendJSON(res, 400, { error: 'Nessuna sessione attiva configurata in Inventario.' });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return sendJSON(res, 400, { error: 'File sessione attiva non trovato.' });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const prod = sessionData.products.find(p => String(p.CodiceArticolo).toLowerCase() === String(sku).toLowerCase());
      if (!prod) {
        return sendJSON(res, 404, { error: 'Prodotto non trovato nell\'inventario attivo.' });
      }

      prod.Ordina = !!ordina;
      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      console.log(`[Fogli blu] Flag Ordina per "${sku}" impostato a: ${prod.Ordina}.`);
      sendJSON(res, 200, { success: true, sku, ordina: prod.Ordina });
    } catch (err) {
      console.error('[Server Error] Modifica flag Ordina fallita:', err);
      sendJSON(res, 500, { error: 'Errore durante la modifica del flag riordino.' });
    }
    return;
  }

  // ROUTE: POST /api/products/obsolete (Toggle local obsolete flag)
  if (pathname === '/api/products/obsolete' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      const { id, obsolete } = JSON.parse(rawBody);

      if (!id) {
        return sendJSON(res, 400, { error: 'ID prodotto obbligatorio.' });
      }

      // 1. Update local obsolete list file
      const obsoleteList = readObsoleteList();
      const obsoleteSet = new Set(obsoleteList);
      if (obsolete) {
        obsoleteSet.add(id);
      } else {
        obsoleteSet.delete(id);
      }
      const updatedList = Array.from(obsoleteSet);
      writeObsoleteList(updatedList);

      // 2. Aggiorna lo stato Obsoleto all'interno della sessione attiva di Inventario (se presente)
      const activeSessionTxtPath = path.join(__dirname, '..', 'Inventario', 'active_session.txt');
      if (fs.existsSync(activeSessionTxtPath)) {
        const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
        if (sessionName) {
          const sessionFilePath = path.join(__dirname, '..', 'Inventario', `session_${sessionName}.json`);
          if (fs.existsSync(sessionFilePath)) {
            const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
            const prod = sessionData.products.find(p => String(p.CodiceArticolo).toLowerCase() === String(id).toLowerCase());
            if (prod) {
              prod.Obsoleto = !!obsolete;
              fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
              console.log(`[Server] Flag Obsoleto sincronizzato in sessione Inventario per ${id}.`);
            }
          }
        }
      }

      // 2.b. Update memory cache and prodotti_cache.json
      const cache = readProductsCache();
      if (cache.products) {
        const prod = cache.products.find(p => String(p.id) === String(id));
        if (prod) {
          prod.localObsolete = !!obsolete;
          fs.writeFileSync(PRODUCTS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
        }
      }

      console.log(`[Server] Prodotto ${id} segnato come obsoleto locale: ${obsolete}`);
      sendJSON(res, 200, { success: true, id, localObsolete: !!obsolete });
    } catch (err) {
      console.error('[Server Error] Impossibile aggiornare obsoleto locale:', err);
      sendJSON(res, 500, { error: 'Errore interno nell\'aggiornamento dello stato obsoleto.' });
    }
    return;
  }

  // ROUTE: POST /api/goodsissue (Proxy create DDT)
  if (pathname === '/api/goodsissue' && req.method === 'POST') {
    try {
      const isSimulation = parsedUrl.searchParams.get('simulation') === 'true';
      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody);

      // Extract custom properties for local logging
      const customerName = body._customerName || 'Cliente';
      delete body._customerName; // Clean up before sending to Giobby

      const data = await requestGiobby('/sales/goodsissue', 'POST', body, { simulation: isSimulation });

      if (!isSimulation) {
        // Giobby returns { responseCode: 200, errorCode: 0, idDocument: 4702 } on success
        let docNumber = 'Generato';
        let docId = data.idDocument ? String(data.idDocument) : String(Date.now());
        
        if (data.idDocument) {
          try {
            console.log(`[Server] Querying created DDT details for ID: ${data.idDocument}...`);
            const details = await requestGiobby(`/sales/goodsissue`, 'GET', null, { id: data.idDocument });
            if (details && details.documentsHeaders && details.documentsHeaders.length > 0) {
              const header = details.documentsHeaders[0];
              docNumber = header.docNumber || 'Generato';
              console.log(`[Server] Created DDT found: N. ${docNumber}`);
              // Attach fields so client popup displays it
              data.docNumber = docNumber;
              data.id = docId;
              if (!data.document) data.document = {};
              data.document.docNumber = docNumber;
              data.document.docDescription = header.docDescription || '';
            }
          } catch (e) {
            console.error('[Server Error] Failed to retrieve created DDT details:', e.message);
          }
        }
        const baseApiUrl = cachedApiUrl || 'https://app.giobby.com/GiobbyApi00553/v1';
        const frontendRoot = baseApiUrl.replace('/GiobbyApi', '/Giobby').replace(/\/v1\/?$/, '');
        data.giobbyFrontendUrl = `${frontendRoot}/company/GoodsReceiptIssue.xhtml?iddocumenttype=1&id=${encodeURIComponent(docId)}&ftrID=g_issue_v`;
        
        logCreatedDDT(body, data, customerName);
        
        // Sincronizza uscite con l'inventario
        syncDocumentExits(docId, body.rows || body.articles || body.items);
      }

      sendJSON(res, 200, data);
    } catch (err) {
      console.error('[Proxy Error] Goods issue creation failed:', err);
      sendJSON(res, err.status || 500, {
        error: err.message || 'Errore invio DDT.',
        details: err.data
      });
    }
    return;
  }

  // ROUTE: GET /api/ddt-history
  if (pathname === '/api/ddt-history' && req.method === 'GET') {
    try {
      const history = readHistory();
      sendJSON(res, 200, history);
    } catch (err) {
      console.error('[Server Error] Impossibile recuperare lo storico:', err);
      sendJSON(res, 500, { error: 'Errore interno nel recupero dello storico.' });
    }
    return;
  }

  // ROUTE: DELETE /api/ddt-history
  if (pathname === '/api/ddt-history' && req.method === 'DELETE') {
    try {
      const id = parsedUrl.searchParams.get('id');
      if (id) {
        // Delete single entry
        let history = readHistory();
        const initialLength = history.length;
        history = history.filter(h => String(h.id) !== String(id));
        if (history.length === initialLength) {
          return sendJSON(res, 404, { error: 'Elemento non trovato nello storico.' });
        }
        writeHistory(history);
        console.log(`[Server] Elemento storico eliminato: ID ${id}`);
        sendJSON(res, 200, { success: true });
      } else {
        // Clear all history
        writeHistory([]);
        console.log('[Server] Storico DDT interamente svuotato.');
        sendJSON(res, 200, { success: true });
      }
    } catch (err) {
      console.error('[Server Error] Impossibile cancellare lo storico:', err);
      sendJSON(res, 500, { error: 'Errore interno nella cancellazione dello storico.' });
    }
    return;
  }

  // DEFAULT: Static files server
  serveStaticFile(res, pathname);
});

server.listen(PORT, () => {
  // Trova gli IP locali della rete per facilitare la connessione dal telefono
  const interfaces = os.networkInterfaces();
  const localIps = [];
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIps.push(iface.address);
      }
    }
  }

  console.log(`================================================================`);
  console.log(`🚀 Server DDT Vocale (NATIVO ZERO-DIPENDENZE) avviato!`);
  console.log(`🌐 URL Locale PC: http://localhost:${PORT}`);
  localIps.forEach(ip => {
    console.log(`📱 URL per Telefono: http://${ip}:${PORT}`);
  });
  console.log(`📋 Puntamento Giobby CID: ${GIOBBY_CID}`);
  console.log(`================================================================`);

  // Apri automaticamente il browser all'avvio
  const url = `http://localhost:${PORT}`;
  const startCmd = process.platform === 'darwin' ? `open "${url}"` : 
                   process.platform === 'win32' ? `explorer "${url}"` : 
                   `xdg-open "${url}"`;
  exec(startCmd, (err) => {
    if (err) console.error('[Server] Impossibile aprire il browser automaticamente:', err.message);
  });
});
