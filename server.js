import http from 'http';
import fs from 'fs';
import path from 'path';
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

  // ROUTE: GET /api/categories (Proxy lookup with multiple fallbacks)
  if (pathname === '/api/categories' && req.method === 'GET') {
    try {
      let categories = null;

      // Attempt 1: /productCategories
      try {
        const d = await requestGiobby('/productCategories', 'GET', null, {});
        const arr = d.productCategories || d.categories || d.items || null;
        if (Array.isArray(arr) && arr.length > 0) categories = arr;
      } catch (e1) {
        console.warn('[Proxy] /productCategories failed:', e1.message || e1);
      }

      // Attempt 2: /categories
      if (!categories) {
        try {
          const d = await requestGiobby('/categories', 'GET', null, {});
          const arr = d.categories || d.productCategories || d.items || null;
          if (Array.isArray(arr) && arr.length > 0) categories = arr;
        } catch (e2) {
          console.warn('[Proxy] /categories failed:', e2.message || e2);
        }
      }

      // Attempt 3: /itemCategories
      if (!categories) {
        try {
          const d = await requestGiobby('/itemCategories', 'GET', null, {});
          const arr = d.itemCategories || d.categories || d.items || null;
          if (Array.isArray(arr) && arr.length > 0) categories = arr;
        } catch (e3) {
          console.warn('[Proxy] /itemCategories failed:', e3.message || e3);
        }
      }

      // Fallback: extract unique categories from /products
      if (!categories) {
        console.log('[Proxy] Extracting categories from /products as fallback...');
        try {
          const d = await requestGiobby('/products', 'GET', null, { limit: 200, salesEnabled: true });
          const products = d.products || [];
          const catMap = new Map();
          products.forEach(p => {
            const catId = p.idProductCategory || p.idCategory || p.categoryId;
            const catDesc = p.productCategoryDescription || p.categoryDescription || p.category;
            if (catId && !catMap.has(String(catId))) {
              catMap.set(String(catId), { id: catId, description: catDesc || String(catId) });
            }
          });
          categories = Array.from(catMap.values());
        } catch (eFallback) {
          console.warn('[Proxy] Product fallback for categories failed:', eFallback.message || eFallback);
        }
      }

      sendJSON(res, 200, categories || []);
    } catch (err) {
      console.error('[Proxy Error] Categories lookup completely failed:', err);
      sendJSON(res, err.status || 500, { error: err.message || 'Errore ricerca categorie.' });
    }
    return;
  }


  // ROUTE: GET /api/warehouses (Proxy lookup)
  if (pathname === '/api/warehouses' && req.method === 'GET') {
    try {
      const data = await requestGiobby('/warehouses', 'GET', null, {});
      sendJSON(res, 200, data.warehouses || []);
    } catch (err) {
      console.error('[Proxy Error] Warehouses lookup failed:', err);
      sendJSON(res, err.status || 500, { error: err.message || 'Errore ricerca magazzini.' });
    }
    return;
  }

  // ROUTE: GET /api/products (Proxy lookup)
  if (pathname === '/api/products' && req.method === 'GET') {
    try {
      const query = parsedUrl.searchParams.get('q') || '';
      const idCategory = parsedUrl.searchParams.get('idCategory') || '';
      const params = { limit: 50, salesEnabled: true };
      if (query) params.description = query;
      if (idCategory) params.idProductCategory = idCategory;
      const data = await requestGiobby('/products', 'GET', null, params);
      sendJSON(res, 200, data.products || []);
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
  console.log(`================================================================`);
  console.log(`🚀 Server DDT Vocale (NATIVO ZERO-DIPENDENZE) avviato!`);
  console.log(`🌐 URL Locale: http://localhost:${PORT}`);
  console.log(`📋 Puntamento Giobby CID: ${GIOBBY_CID}`);
  console.log(`================================================================`);
});
