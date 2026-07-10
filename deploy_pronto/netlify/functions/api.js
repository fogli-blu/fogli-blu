import fs from 'fs';
import path from 'path';
import { parseField } from '../../nlp-parser.js';

// Local Obsolete Products List helper
function readObsoleteList() {
  try {
    const urlPath = new URL('../../obsoleti_locali.json', import.meta.url);
    if (fs.existsSync(urlPath)) {
      const data = fs.readFileSync(urlPath, 'utf8');
      return JSON.parse(data || '[]');
    } else {
      const cwdPath = path.join(process.cwd(), 'obsoleti_locali.json');
      if (fs.existsSync(cwdPath)) {
        const data = fs.readFileSync(cwdPath, 'utf8');
        return JSON.parse(data || '[]');
      }
    }
  } catch (err) {
    console.warn('[Netlify Function] Impossibile leggere obsoleti locali:', err.message);
  }
  return [];
}

// Local Products Cache helper
function readProductsFromSession() {
  try {
    let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
    if (!fs.existsSync(activeSessionTxtPath)) {
      activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
    }
    
    if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
      activeSessionTxtPath = activeSessionTxtPath.substring(1);
    }

    if (fs.existsSync(activeSessionTxtPath)) {
      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      if (sessionName) {
        let sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
        if (fs.existsSync(sessionFilePath)) {
          const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
          if (sessionData && Array.isArray(sessionData.products)) {
            const localObsoleteList = readObsoleteList();
            const mapped = sessionData.products.map(p => {
              const defaultWh = p._defaultStorage || 'MB';
              const stocks = {
                "MB": 0, "CCIW": 0, "PR 26": 0, "CATALOGO": 0, "IW": 0,
                "MBB": 0, "MGR": 0, "MP": 0, "MPR": 0, "SANTINI": 0
              };
              stocks[defaultWh] = p.GiacenzaTeorica || 0;
              
              const pSales = parseFloat(p.SalesPrice || p.Prezzo || p.prezzo || 0);
              const pPur = parseFloat(p.PurchasePrice || 0);
              
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
                  privati: pSales || pPur * 1.35 || 0,
                  posatori: pPur || pSales / 1.35 || 0,
                  bologna: pPur || pSales / 1.35 || 0
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
    console.warn('[Netlify Function] Impossibile leggere i prodotti dalla sessione Inventario:', err.message);
  }
  return null;
}

function readProductsCache() {
  const sessionProducts = readProductsFromSession();
  if (sessionProducts) return sessionProducts;

  try {
    const urlPath = new URL('../../prodotti_cache.json', import.meta.url);
    if (fs.existsSync(urlPath)) {
      const data = fs.readFileSync(urlPath, 'utf8');
      return JSON.parse(data || '{"products":[],"lastSync":null}');
    } else {
      const cwdPath = path.join(process.cwd(), 'prodotti_cache.json');
      if (fs.existsSync(cwdPath)) {
        const data = fs.readFileSync(cwdPath, 'utf8');
        return JSON.parse(data || '{"products":[],"lastSync":null}');
      }
    }
  } catch (err) {
    console.warn('[Netlify Function] Impossibile leggere prodotti_cache.json:', err.message);
  }
  return { products: [], lastSync: null };
}



// Giobby static credentials
const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

// Caching parameters (persists in warm container instances)
let cachedToken = null;
let cachedApiUrl = null;
let cachedDrafts = [];

// Giobby authentication helper
async function authenticateGiobby() {
  console.log('[Netlify Function] Autenticazione con Giobby OAuth...');
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
  console.log('[Netlify Function] Token Giobby acquisito.');

  // Fetch API endpoint base URL
  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await fetch(endpointUrl);
  if (!endpointRes.ok) {
    throw new Error(`Failed to retrieve API endpoint: ${endpointRes.status}`);
  }
  const endpointData = await endpointRes.json();
  cachedApiUrl = endpointData.GiobbyApiURL;
  console.log('[Netlify Function] API URL base caricata:', cachedApiUrl);
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

    console.log(`[Netlify Function] Chiamata: ${method} ${url}`);
    const res = await fetch(url, config);

    if (res.status === 401) {
      console.warn('[Netlify Function] Token scaduto (401). Rigenerazione...');
      await authenticateGiobby();
      headers['Authorization'] = `Bearer ${cachedToken}`;
      return await fetch(url, { ...config, headers });
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

export default async (req, context) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Giobby-Realm'
      }
    });
  }

  try {
    // 1. ROUTE: POST /api/parse
    if (pathname === '/api/parse' && req.method === 'POST') {
      const { field, text } = await req.json();
      if (!field || !text) {
        return new Response(JSON.stringify({ error: 'Campi field e text obbligatori.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`[Netlify NLP] Parsing field: "${field}", text: "${text}"`);
      const parsed = await parseField(field, text, process.env.GEMINI_API_KEY);
      return new Response(JSON.stringify({ result: parsed }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. ROUTE: GET /api/customers
    if (pathname === '/api/customers' && req.method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const params = { limit: 15 };
      if (query) {
        params.freeText = query;
      }
      const data = await requestGiobby('/customers', 'GET', null, params);
      return new Response(JSON.stringify(data.customers || []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DEBUG: GET /api/debug/product → mostra la struttura JSON del primo prodotto
    if (pathname === '/api/debug/product' && req.method === 'GET') {
      const data = await requestGiobby('/products', 'GET', null, { limit: 3, salesEnabled: true });
      const sample = (data.products || []).slice(0, 3);
      return new Response(JSON.stringify({ keys: sample.length > 0 ? Object.keys(sample[0]) : [], sample }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. ROUTE: GET /api/products
    if (pathname === '/api/products' && req.method === 'GET') {
      const query = (url.searchParams.get('q') || '').toLowerCase().trim();
      const idCategory = url.searchParams.get('idCategory') || '';
      
      const cache = readProductsCache();
      let products = cache.products || [];

      // Filter by category if specified
      if (idCategory) {
        const catIds = String(idCategory).split(',').map(id => id.trim());
        products = products.filter(p => {
          const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
          return catIds.includes(String(gId));
        });
      }

      // Filter by text search query
      if (query) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
        products = products.filter(p => {
          const searchTarget = `${String(p.id)} ${p.barcode ? String(p.barcode) : ''} ${String(p.description)}`.toLowerCase();
          return queryWords.every(word => searchTarget.includes(word));
        });
      }

      // Limit results
      const limit = parseInt(url.searchParams.get('limit')) || (idCategory ? 1000 : 50);
      products = products.slice(0, limit);

      // Resolve dynamic Giobby product URL base if possible
      if (!cachedApiUrl) {
        try {
          await authenticateGiobby();
        } catch (e) {
          console.warn('[Netlify Warning] Impossibile autenticare Giobby per risolvere cachedApiUrl:', e.message);
        }
      }
      const baseApiUrl = cachedApiUrl || 'https://app.giobby.com/GiobbyApi00553/v1';
      const frontendRoot = baseApiUrl.replace('/GiobbyApi', '/Giobby').replace(/\/v1\/?$/, '');
      const productsWithUrls = products.map(p => ({
        ...p,
        giobbyUrl: `${frontendRoot}/company/Material.xhtml?id=${encodeURIComponent(p.id)}`
      }));

      return new Response(JSON.stringify(productsWithUrls), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. ROUTE: GET /api/categories → carica o estrae i gruppi di prodotti
    if (pathname === '/api/categories' && req.method === 'GET') {
      try {
        // Prova prima a caricare dalla sessione attiva
        let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
        if (!fs.existsSync(activeSessionTxtPath)) {
          activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
        }
        if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
          activeSessionTxtPath = activeSessionTxtPath.substring(1);
        }

        if (fs.existsSync(activeSessionTxtPath)) {
          const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
          if (sessionName) {
            const sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
            if (fs.existsSync(sessionFilePath)) {
              const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
              if (sessionData && Array.isArray(sessionData.products)) {
                const cats = new Set();
                sessionData.products.forEach(p => {
                  if (p.Categoria) cats.add(p.Categoria.trim());
                });
                if (cats.size === 0) cats.add('Generale');
                const groups = Array.from(cats).map(cat => ({
                  id: cat,
                  description: cat
                }));
                return new Response(JSON.stringify(groups), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
          }
        }

        const data = await requestGiobby('/productsgroups', 'GET', null, {});
        const groups = (data.productsGroups || []).map(g => ({
          id: g.id,
          description: g.description || g.description_IT || String(g.id)
        }));
        return new Response(JSON.stringify(groups), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.warn('[Netlify Proxy Warning] GET /productsgroups failed, starting fallback extraction from products:', err.message || err);
        try {
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

          // Arricchisce le descrizioni mancanti con GET /productsgroups/{id}
          const enrichPromises = [];
          for (const [, g] of groupMap) {
            if (!g.description || g.description === String(g.id)) {
              enrichPromises.push(
                requestGiobby(`/productsgroups/${g.id}`, 'GET', null, {})
                  .then(d => {
                    const det = d.productsGroup || d.productGroup || d;
                    g.description = det.description || det.name || g.description;
                  })
                  .catch(() => {})
              );
            }
          }
          await Promise.all(enrichPromises);

          const groups = Array.from(groupMap.values());
          return new Response(JSON.stringify(groups), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (fallbackErr) {
          console.error('[Netlify Proxy Error] Categories extraction fallback failed:', fallbackErr);
          return new Response(JSON.stringify({ error: fallbackErr.message || 'Errore estrazione categorie.' }), {
            status: fallbackErr.status || 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // ROUTE: GET /api/drafts
    if (pathname === '/api/drafts' && req.method === 'GET') {
      return new Response(JSON.stringify(cachedDrafts), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ROUTE: POST /api/drafts
    if (pathname === '/api/drafts' && req.method === 'POST') {
      const draft = await req.json();
      if (!draft.data || !draft.articles || !Array.isArray(draft.articles)) {
        return new Response(JSON.stringify({ error: 'Dati bozza incompleti.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (draft.id) {
        const idx = cachedDrafts.findIndex(d => String(d.id) === String(draft.id));
        if (idx !== -1) {
          cachedDrafts[idx] = { ...cachedDrafts[idx], ...draft, updatedAt: new Date().toISOString() };
        } else {
          draft.createdAt = new Date().toISOString();
          cachedDrafts.push(draft);
        }
      } else {
        draft.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        draft.createdAt = new Date().toISOString();
        cachedDrafts.push(draft);
      }

      return new Response(JSON.stringify({ success: true, draft }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ROUTE: DELETE /api/drafts
    if (pathname === '/api/drafts' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID bozza mancante.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const initialLength = cachedDrafts.length;
      cachedDrafts = cachedDrafts.filter(d => String(d.id) !== String(id));

      if (cachedDrafts.length === initialLength) {
        return new Response(JSON.stringify({ error: 'Bozza non trovata.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. ROUTE: GET /api/warehouses
    if (pathname === '/api/warehouses' && req.method === 'GET') {
      try {
        const data = await requestGiobby('/storages', 'GET', null, {});
        return new Response(JSON.stringify(data.storages || []), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.warn('[Netlify Warning] Warehouses lookup failed, using static fallback:', err.message || err);
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
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 6. ROUTE: POST /api/goodsissue
    if (pathname === '/api/goodsissue' && req.method === 'POST') {
      const isSimulation = url.searchParams.get('simulation') === 'true';
      const body = await req.json();
      const data = await requestGiobby('/sales/goodsissue', 'POST', body, { simulation: isSimulation });
      
      if (!isSimulation) {
        let docNumber = 'Generato';
        let docId = data.idDocument ? String(data.idDocument) : String(Date.now());
        
        if (data.idDocument) {
          try {
            console.log(`[Netlify] Querying created DDT details for ID: ${data.idDocument}...`);
            const details = await requestGiobby(`/sales/goodsissue`, 'GET', null, { id: data.idDocument });
            if (details && details.documentsHeaders && details.documentsHeaders.length > 0) {
              const header = details.documentsHeaders[0];
              docNumber = header.docNumber || 'Generato';
              console.log(`[Netlify] Created DDT found: N. ${docNumber}`);
              data.docNumber = docNumber;
              data.id = docId;
              if (!data.document) data.document = {};
              data.document.docNumber = docNumber;
              data.document.docDescription = header.docDescription || '';
            }
          } catch (e) {
            console.error('[Netlify Error] Failed to retrieve created DDT details:', e.message);
          }
        }
        const baseApiUrl = cachedApiUrl || 'https://app.giobby.com/GiobbyApi00553/v1';
        const frontendRoot = baseApiUrl.replace('/GiobbyApi', '/Giobby').replace(/\/v1\/?$/, '');
        data.giobbyFrontendUrl = `${frontendRoot}/company/GoodsReceiptIssue.xhtml?iddocumenttype=1&id=${encodeURIComponent(docId)}&ftrID=g_issue_v`;
      }
      
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ROUTE: POST /api/products/sync-single (Synchronize a single product - serverless fallback)
    if (pathname === '/api/products/sync-single' && req.method === 'POST') {
      try {
        const payload = await req.json();
        const code = (payload.code || '').trim();
        const checkOnly = !!payload.checkOnly;
        
        if (!code) {
          return new Response(JSON.stringify({ error: 'Codice prodotto richiesto.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Netlify Sync Single] Inizio sincronizzazione singola per codice: "${code}"...`);
        await authenticateGiobby();

        // 1. Cerca il prodotto su Giobby
        let giobbyProduct = null;
        
        // Prova prima la chiamata diretta per ID
        try {
          const directData = await requestGiobby(`/products/${encodeURIComponent(code)}`, 'GET', null, {});
          if (directData && directData.product) {
            giobbyProduct = directData.product;
          }
        } catch (e) {
          console.log(`[Netlify Sync Single] Ricerca diretta /products/${code} fallita:`, e.message);
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
          return new Response(JSON.stringify({ error: `Nessun prodotto trovato su Giobby con codice o barcode uguale a "${code}".` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const pId = giobbyProduct.id;
        console.log(`[Netlify Sync Single] Prodotto trovato: "${giobbyProduct.description}" (ID: ${pId})`);

        // Check if product is in localObsolete list
        const localObsoleteList = readObsoleteList();
        const isLocalObsolete = localObsoleteList.includes(pId);

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
          console.error('[Netlify Sync Single Warning] Impossibile recuperare stock:', e.message);
        }

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

        const basePrice = parseFloat(giobbyProduct.salesPrice ?? 0);
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
            privati: parseFloat(pricePrivati.toFixed(4)),
            posatori: parseFloat(pricePosatori.toFixed(4)),
            bologna: parseFloat(priceBologna.toFixed(4))
          }
        };

        return new Response(JSON.stringify({ success: true, product: processedProduct, checkOnly }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('[Netlify Sync Single Error] Failed:', err);
        return new Response(JSON.stringify({ error: err.message || 'Errore sincronizzazione singolo prodotto.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 7. ROUTE: GET /api/products/status (Get sync status - serverless fallback)
    if (pathname === '/api/products/status' && req.method === 'GET') {
      const cache = readProductsCache();
      return new Response(JSON.stringify({
        lastSync: cache.lastSync,
        count: cache.products ? cache.products.length : 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 8. ROUTE: POST /api/products/obsolete (Toggle local obsolete flag - serverless fallback)
    if (pathname === '/api/products/obsolete' && req.method === 'POST') {
      const { id, obsolete } = await req.json();
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID prodotto obbligatorio.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Prova ad aggiornare la sessione attiva se presente
      try {
        let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
        if (!fs.existsSync(activeSessionTxtPath)) {
          activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
        }
        if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
          activeSessionTxtPath = activeSessionTxtPath.substring(1);
        }
        if (fs.existsSync(activeSessionTxtPath)) {
          const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
          if (sessionName) {
            const sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
            if (fs.existsSync(sessionFilePath)) {
              const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
              const prod = sessionData.products.find(p => String(p.CodiceArticolo).toLowerCase() === String(id).toLowerCase());
              if (prod) {
                prod.Obsoleto = !!obsolete;
                fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
                console.log(`[Netlify Function] Flag Obsoleto sincronizzato in sessione Inventario per ${id}.`);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Netlify Function] Impossibile aggiornare obsoleto in sessione:', err.message);
      }

      return new Response(JSON.stringify({ success: true, id, localObsolete: !!obsolete }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 8.b. ROUTE: POST /api/products (Aggiunta nuovo prodotto nella sessione attiva)
    if (pathname === '/api/products' && req.method === 'POST') {
      const { sku, desc, loc, cat, qty, salesPrice } = await req.json();

      if (!sku || !desc) {
        return new Response(JSON.stringify({ error: 'Codice e Descrizione sono obbligatori.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
      }
      if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
        activeSessionTxtPath = activeSessionTxtPath.substring(1);
      }

      if (!fs.existsSync(activeSessionTxtPath)) {
        return new Response(JSON.stringify({ error: 'Nessuna sessione attiva configurata in Inventario.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return new Response(JSON.stringify({ error: 'File sessione attiva non trovato.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const isDuplicate = sessionData.products.some(p => String(p.CodiceArticolo).toLowerCase() === sku.toLowerCase());
      if (isDuplicate) {
        return new Response(JSON.stringify({ error: 'Questo Codice Articolo è già presente nell\'inventario.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
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
      return new Response(JSON.stringify({ success: true, product: newProd }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 8.c. ROUTE: DELETE /api/products (Eliminazione prodotto dalla sessione attiva)
    if (pathname === '/api/products' && req.method === 'DELETE') {
      const sku = url.searchParams.get('id');
      if (!sku) {
        return new Response(JSON.stringify({ error: 'ID/SKU prodotto mancante.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
      }
      if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
        activeSessionTxtPath = activeSessionTxtPath.substring(1);
      }

      if (!fs.existsSync(activeSessionTxtPath)) {
        return new Response(JSON.stringify({ error: 'Nessuna sessione attiva configurata in Inventario.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return new Response(JSON.stringify({ error: 'File sessione attiva non trovato.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const initialLength = sessionData.products.length;
      sessionData.products = sessionData.products.filter(p => String(p.CodiceArticolo).toLowerCase() !== sku.toLowerCase());

      if (sessionData.products.length === initialLength) {
        return new Response(JSON.stringify({ error: 'Prodotto non trovato nell\'inventario.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (sessionData.counts) {
        delete sessionData.counts[sku];
        Object.keys(sessionData.counts).forEach(k => {
          if (k.toLowerCase() === sku.toLowerCase()) delete sessionData.counts[k];
        });
      }

      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 8.d. ROUTE: GET /api/products/reorder (Ottieni elenco prodotti in esaurimento o da ordinare)
    if (pathname === '/api/products/reorder' && req.method === 'GET') {
      const cache = readProductsCache();
      const products = cache.products || [];
      const reorderList = [];

      products.forEach(p => {
        const minStock = p.minStock || 0;
        const whCode = p.defaultStorage || 'MB';
        const currentQty = p.stocks ? (p.stocks[whCode] || 0) : 0;
        const isManual = !!p.ordina;

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

      const excelMode = url.searchParams.get('excel') === 'true';
      if (excelMode) {
        let csv = '\uFEFF';
        csv += 'Codice Articolo;Codice a Barre;Descrizione;Categoria;Magazzino;Giacenza Attuale;Scorta Minima;Deficit (Quantità da ordinare);Tipo Riordino\n';
        reorderList.forEach(item => {
          const tipo = item.isManual ? 'Manuale' : 'Sotto Scorta';
          csv += `"${item.id}";"${item.barcode}";"${item.description}";"${item.category}";"${item.storage}";${item.currentQty};${item.minStock};${item.deficit};"${tipo}"\n`;
        });
        
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename=lista_riordino_${new Date().toISOString().slice(0, 10)}.csv`
          }
        });
      } else {
        return new Response(JSON.stringify(reorderList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 8.e. ROUTE: POST /api/products/reorder-manual (Cambia stato flag manuale Ordina)
    if (pathname === '/api/products/reorder-manual' && req.method === 'POST') {
      const { sku, ordina } = await req.json();

      if (!sku) {
        return new Response(JSON.stringify({ error: 'SKU prodotto obbligatorio.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let activeSessionTxtPath = path.join(process.cwd(), '..', 'Inventario', 'active_session.txt');
      if (!fs.existsSync(activeSessionTxtPath)) {
        activeSessionTxtPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../Inventario/active_session.txt');
      }
      if (process.platform === 'win32' && activeSessionTxtPath.startsWith('\\')) {
        activeSessionTxtPath = activeSessionTxtPath.substring(1);
      }

      if (!fs.existsSync(activeSessionTxtPath)) {
        return new Response(JSON.stringify({ error: 'Nessuna sessione attiva configurata in Inventario.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionName = fs.readFileSync(activeSessionTxtPath, 'utf8').trim();
      const sessionFilePath = path.join(path.dirname(activeSessionTxtPath), `session_${sessionName}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        return new Response(JSON.stringify({ error: 'File sessione attiva non trovato.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      const prod = sessionData.products.find(p => String(p.CodiceArticolo).toLowerCase() === String(sku).toLowerCase());
      if (!prod) {
        return new Response(JSON.stringify({ error: 'Prodotto non trovato nell\'inventario attivo.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      prod.Ordina = !!ordina;
      fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      return new Response(JSON.stringify({ success: true, sku, ordina: prod.Ordina }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 9. ROUTE: POST /api/products/sync (Synchronize catalog - serverless fallback returning informative error)
    if (pathname === '/api/products/sync' && req.method === 'POST') {
      return new Response(JSON.stringify({
        error: "La sincronizzazione completa non è supportata online su Netlify per via del limite di tempo di 10 secondi delle funzioni serverless. Esegui la sincronizzazione localmente sul PC (usando 'avvia_locale.bat' o 'node server.js') e poi carica o pubblica la cartella aggiornata (che contiene il file 'prodotti_cache.json') su Netlify. Puoi comunque aggiornare i singoli articoli cliccando sull'icona 🔄 accanto ad essi."
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback
    return new Response('API Route not found', { status: 404 });


  } catch (err) {
    console.error('[Netlify Error] Process failed:', err);
    return new Response(JSON.stringify({
      error: err.message || 'Internal server error',
      details: err.data || err.details || null
    }), {
      status: err.status || 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: "/api/*"
};
