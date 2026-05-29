import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
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
    'Access-Control-Allow-Origin': '*'
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
      console.log('[Proxy] Richiesta categorie da GET /productsgroups...');
      const data = await requestGiobby('/productsgroups', 'GET', null, {});
      const groups = (data.productsGroups || []).map(g => ({
        id: g.id,
        description: g.description || g.description_IT || String(g.id)
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

        const groups = Array.from(groupMap.values());
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
      const data = await requestGiobby('/warehouses', 'GET', null, {});
      sendJSON(res, 200, data.warehouses || []);
    } catch (err) {
      console.warn('[Proxy Warning] Warehouses lookup failed, using static fallback:', err.message || err);
      const fallback = [
        { id: "MB", description: "Magazzino Bedizzole (MB)" },
        { id: "CCIW", description: "Magazzino CCIW" },
        { id: "PR 26", description: "Magazzino PR 26" },
        { id: "CATALOGO", description: "Magazzino Catalogo" }
      ];
      sendJSON(res, 200, fallback);
    }
    return;
  }

  // ROUTE: GET /api/products (Proxy lookup)
  if (pathname === '/api/products' && req.method === 'GET') {
    try {
      const query = parsedUrl.searchParams.get('q') || '';
      const idCategory = parsedUrl.searchParams.get('idCategory') || '';
      
      // Se filtriamo per categoria, aumentiamo il limite a 1000 per assicurarci di trovare i prodotti,
      // dato che Giobby non filtra lato server tramite i parametri di query del gruppo.
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
        console.log(`[Proxy] Prodotti filtrati per categoria ${idCategory}: ${products.length} trovati su ${data.products ? data.products.length : 0}`);
      }

      sendJSON(res, 200, products);
    } catch (err) {
      console.error('[Proxy Error] Products lookup failed:', err);
      sendJSON(res, err.status || 500, { error: err.message || 'Errore ricerca prodotti.' });
    }
    return;
  }

  // ROUTE: POST /api/goodsissue (Proxy create DDT)
  if (pathname === '/api/goodsissue' && req.method === 'POST') {
    try {
      const isSimulation = parsedUrl.searchParams.get('simulation') === 'true';
      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody);

      const data = await requestGiobby('/sales/goodsissue', 'POST', body, { simulation: isSimulation });
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
});
