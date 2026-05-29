import { parseField } from '../../nlp-parser.js';

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
        const data = await requestGiobby('/warehouses', 'GET', null, {});
        return new Response(JSON.stringify(data.warehouses || []), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.warn('[Netlify Warning] Warehouses lookup failed, using static fallback:', err.message || err);
        const fallback = [
          { id: "MB", description: "Magazzino Bedizzole (MB)" },
          { id: "CCIW", description: "Magazzino CCIW" },
          { id: "PR 26", description: "Magazzino PR 26" },
          { id: "CATALOGO", description: "Magazzino Catalogo" }
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
      return new Response(JSON.stringify(data), {
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
