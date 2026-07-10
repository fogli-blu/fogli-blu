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
      const query = url.searchParams.get('q') || '';
      const idCategory = url.searchParams.get('idCategory') || '';
      
      const limit = idCategory ? 1000 : 50;
      const params = { limit, salesEnabled: true };
      if (query) params.description = query;

      const data = await requestGiobby('/products', 'GET', null, params);
      let products = data.products || [];

      if (idCategory) {
        products = products.filter(p => {
          const gId = p.idMaterialGroup ?? p.idProductsGroup ?? p.idProductGroup ?? p.idGroup ?? p.groupId;
          return String(gId) === String(idCategory);
        });
      }

      return new Response(JSON.stringify(products), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. ROUTE: GET /api/categories → carica o estrae i gruppi di prodotti
    if (pathname === '/api/categories' && req.method === 'GET') {
      try {
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
      return new Response(JSON.stringify({
        lastSync: null,
        count: 0
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
      return new Response(JSON.stringify({ success: true, id, localObsolete: !!obsolete }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 9. ROUTE: POST /api/products/sync (Synchronize catalog - serverless fallback returning products array)
    if (pathname === '/api/products/sync' && req.method === 'POST') {
      console.log('[Netlify Sync] Avvio sincronizzazione prodotti da Giobby...');
      // 1. Authenticate Giobby to make sure we have access token
      await authenticateGiobby();
      
      // 2. Read local giacenze_prodotti.json to merge stock quantities if available
      let giacenze = {};
      try {
        const urlPath = new URL('../../giacenze_prodotti.json', import.meta.url);
        if (fs.existsSync(urlPath)) {
          const rawGiacenze = fs.readFileSync(urlPath, 'utf8');
          giacenze = JSON.parse(rawGiacenze || '{}');
        } else {
          const cwdPath = path.join(process.cwd(), 'giacenze_prodotti.json');
          if (fs.existsSync(cwdPath)) {
            const rawGiacenze = fs.readFileSync(cwdPath, 'utf8');
            giacenze = JSON.parse(rawGiacenze || '{}');
          }
        }
      } catch (err) {
        console.warn('[Netlify Sync] Fallback local stock file lookup failed:', err);
      }

      // 2.b Read local obsolete list to carry flags over synchronization
      const localObsoleteList = readObsoleteList();
      const localObsoleteSet = new Set(localObsoleteList);

      // 2.b.2 Fetch base pricelists from Giobby
      console.log('[Netlify Sync] Download listini base da Giobby...');
      let listino10Rows = [];
      let listino22Rows = [];
      let listino28Rows = [];

      try {
        console.log('[Netlify Sync] Download Listino 10 ("PARQUETTISTI IMPRESE")...');
        const listino10Data = await requestGiobby('/pricelists/10', 'GET', null, {});
        listino10Rows = listino10Data.pricelist?.rows || [];
        console.log(`[Netlify Sync] Ricevute ${listino10Rows.length} righe per Listino 10.`);
      } catch (err) {
        console.error('[Netlify Sync Warning] Impossibile scaricare Listino 10:', err.message || err);
      }

      try {
        console.log('[Netlify Sync] Download Listino 22 ("PARQUET BOLOGNA SRL")...');
        const listino22Data = await requestGiobby('/pricelists/22', 'GET', null, {});
        listino22Rows = listino22Data.pricelist?.rows || [];
        console.log(`[Netlify Sync] Ricevute ${listino22Rows.length} righe per Listino 22.`);
      } catch (err) {
        console.error('[Netlify Sync Warning] Impossibile scaricare Listino 22:', err.message || err);
      }

      try {
        console.log('[Netlify Sync] Download Listino 28 ("Prova Giobby")...');
        const listino28Data = await requestGiobby('/pricelists/28', 'GET', null, {});
        listino28Rows = listino28Data.pricelist?.rows || [];
        console.log(`[Netlify Sync] Ricevute ${listino28Rows.length} righe per Listino 28.`);
      } catch (err) {
        console.error('[Netlify Sync Warning] Impossibile scaricare Listino 28:', err.message || err);
      }

      // Build pricelist maps: idMaterial -> salesPrice
      const priceMap10 = {};
      listino10Rows.forEach(r => { if (r.id) priceMap10[r.id] = parseFloat(r.salesPrice ?? 0); });

      const priceMap22 = {};
      listino22Rows.forEach(r => { if (r.id) priceMap22[r.id] = parseFloat(r.salesPrice ?? 0); });

      const priceMap28 = {};
      listino28Rows.forEach(r => { if (r.id) priceMap28[r.id] = parseFloat(r.salesPrice ?? 0); });

      // 2.b Fetch all stocks availability from Giobby
      console.log('[Netlify Sync] Download disponibilità magazzini da Giobby...');
      let stockPage = 1;
      let stockLimit = 500;
      let allStocks = [];
      let stockHasMore = true;
      let stockOffset = 0;

      while (stockHasMore) {
        console.log(`[Netlify Sync] Download disponibilità magazzini pagina ${stockPage}...`);
        const stockParams = { limit: stockLimit, offset: stockOffset };
        const stockData = await requestGiobby('/stocks/avaibility', 'GET', null, stockParams);
        const stocksList = Array.isArray(stockData) ? stockData : (stockData.stocks || stockData.stocksAvailability || stockData.availability || stockData.data || []);
        console.log(`[Netlify Sync] Ricevute ${stocksList.length} righe di disponibilità per la pagina ${stockPage}.`);
        
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

      let page = 1;
      let limit = 200;
      let allProducts = [];
      let hasMore = true;

      while (hasMore) {
        console.log(`[Netlify Sync] Download pagina ${page}...`);
        const params = { limit, offset: (page - 1) * limit, salesEnabled: true };
        const data = await requestGiobby('/products', 'GET', null, params);
        const products = data.products || [];
        
        console.log(`[Netlify Sync] Ricevuti ${products.length} prodotti per la pagina ${page}.`);
        if (products.length === 0) {
          hasMore = false;
        } else {
          allProducts = allProducts.concat(products);
          page++;
          if (products.length < limit) {
            hasMore = false;
          }
        }
      }

      console.log(`[Netlify Sync] Totale prodotti scaricati: ${allProducts.length}. Elaborazione giacenze...`);

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

        // Calcolo prezzi derivati
        const p10 = priceMap10[p.id] !== undefined ? priceMap10[p.id] : null;
        const p22 = priceMap22[p.id] !== undefined ? priceMap22[p.id] : null;
        const p28 = priceMap28[p.id] !== undefined ? priceMap28[p.id] : null;

        // 1. Privati: Listino 10 * 1.35, fallback Listino 28 * 1.35
        let pricePrivati = null;
        if (p10 !== null) {
          pricePrivati = p10 * 1.35;
        } else if (p28 !== null) {
          pricePrivati = p28 * 1.35;
        }

        // 2. Posatori: Listino 10 * 1.15, fallback Listino 22 * 1.15, fallback Listino 28 * 1.15
        let pricePosatori = null;
        if (p10 !== null) {
          pricePosatori = p10 * 1.15;
        } else if (p22 !== null) {
          pricePosatori = p22 * 1.15;
        } else if (p28 !== null) {
          pricePosatori = p28 * 1.15;
        }

        // 3. Bologna: Listino 22, fallback Listino 28
        let priceBologna = null;
        if (p22 !== null) {
          priceBologna = p22;
        } else if (p28 !== null) {
          priceBologna = p28;
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
          localObsolete: localObsoleteSet.has(p.id),
          boxQty: p.boxQty || 0,
          um: p.um || '',
          prices: {
            privati: pricePrivati !== null ? parseFloat(pricePrivati.toFixed(4)) : null,
            posatori: pricePosatori !== null ? parseFloat(pricePosatori.toFixed(4)) : null,
            bologna: priceBologna !== null ? parseFloat(priceBologna.toFixed(4)) : null
          }
        };
      });

      console.log(`[Netlify Sync] Sincronizzazione completata! Invio di ${processedProducts.length} prodotti.`);
      return new Response(JSON.stringify({
        success: true,
        count: processedProducts.length,
        lastSync: new Date().toISOString(),
        products: processedProducts
      }), {
        status: 200,
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
