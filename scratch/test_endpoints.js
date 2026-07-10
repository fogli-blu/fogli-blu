import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

let cachedToken = null;
let cachedApiUrl = null;

async function authenticateGiobby() {
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
  cachedToken = tokenData.access_token;

  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await fetch(endpointUrl);
  const endpointData = await endpointRes.json();
  cachedApiUrl = endpointData.GiobbyApiURL;
}

async function main() {
  await authenticateGiobby();
  
  const headers = {
    'Authorization': `Bearer ${cachedToken}`,
    'X-Giobby-Realm': GIOBBY_REALM,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    '/pricelists/schemes',
    '/pricelists/scheme',
    '/pricelistschemes',
    '/pricelistscheme',
    '/schemes',
    '/scheme',
    '/pricelists/11',
    '/pricelists/11/rows',
    '/pricelists/27/rows',
    '/pricelists/27/scheme',
    '/pricelists/27/schemes'
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting: GET ${ep}`);
    try {
      const res = await fetch(`${cachedApiUrl}${ep}`, { headers });
      const text = await res.text();
      console.log(`Status ${res.status}`);
      if (res.status === 200) {
        console.log(`Response (first 500 chars):`, text.substring(0, 500));
      } else {
        console.log(`Error Response:`, text.substring(0, 200));
      }
    } catch (err) {
      console.log(`Fetch error:`, err.message);
    }
  }
}

main().catch(console.error);
