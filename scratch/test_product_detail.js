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

  // First fetch products list to get a valid product ID
  const res = await fetch(`${cachedApiUrl}/products?limit=10`, { headers });
  const data = await res.json();
  const products = data.products || [];
  
  if (products.length === 0) {
    console.log('No products found.');
    return;
  }
  
  const sampleProduct = products[0];
  console.log(`Sample Product List Object:`, JSON.stringify(sampleProduct, null, 2));

  // Fetch product detail
  const detailEp = `/products/${encodeURIComponent(sampleProduct.id)}`;
  console.log(`\nFetching detail: GET ${detailEp}`);
  const dRes = await fetch(`${cachedApiUrl}${detailEp}`, { headers });
  const dData = await dRes.json();
  console.log(`Product Detail Response:`, JSON.stringify(dData, null, 2));
}

main().catch(console.error);
