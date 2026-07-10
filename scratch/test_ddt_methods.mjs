import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple manual .env parser
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '../.env');
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
    console.warn('Cannot load .env:', err.message);
  }
}
loadEnv();

const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

async function run() {
  console.log('Authenticating Giobby...');
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
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  
  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await fetch(endpointUrl);
  const endpointData = await endpointRes.json();
  const apiUrl = endpointData.GiobbyApiURL;
  console.log(`API base URL: ${apiUrl}`);

  // Test GET on /sales/goodsissue to see if we can read DDTs
  console.log('Testing GET on /sales/goodsissue...');
  const getRes = await fetch(`${apiUrl}/sales/goodsissue?limit=2`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Giobby-Realm': GIOBBY_REALM,
      'Content-Type': 'application/json'
    }
  });

  console.log(`GET /sales/goodsissue status: ${getRes.status}`);
  const getJson = await getRes.json();
  console.log('GET response keys:', Object.keys(getJson));
  
  if (getJson.goodsIssues && getJson.goodsIssues.length > 0) {
    const ddt = getJson.goodsIssues[0];
    console.log(`Found a DDT! ID: ${ddt.id}, docNumber: ${ddt.docNumber}`);
    
    // Now let's try a GET for a single DDT
    console.log(`Testing GET on /sales/goodsissue/${ddt.id}...`);
    const singleRes = await fetch(`${apiUrl}/sales/goodsissue/${ddt.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Giobby-Realm': GIOBBY_REALM
      }
    });
    console.log(`GET /sales/goodsissue/${ddt.id} status: ${singleRes.status}`);
    
    // Try sending an OPTIONS request on /sales/goodsissue/id to see supported HTTP methods
    console.log(`Testing OPTIONS on /sales/goodsissue/${ddt.id}...`);
    const optionsRes = await fetch(`${apiUrl}/sales/goodsissue/${ddt.id}`, {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Giobby-Realm': GIOBBY_REALM
      }
    });
    console.log(`OPTIONS status: ${optionsRes.status}`);
    console.log(`OPTIONS allow header: ${optionsRes.headers.get('allow') || optionsRes.headers.get('Access-Control-Allow-Methods') || 'none'}`);
  } else {
    console.log('No DDTs found on Giobby to test with.');
  }
}

run().catch(err => console.error(err));
