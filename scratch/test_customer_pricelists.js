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

  console.log('Fetching customers...');
  const res = await fetch(`${cachedApiUrl}/customers?limit=100`, { headers });
  const data = await res.json();
  const customers = data.customers || [];
  
  console.log(`Found ${customers.length} customers.`);
  
  const pricelistCounts = {};
  const sampleCustomersByPricelist = {};

  customers.forEach(c => {
    const plId = c.idPricelist || c.pricelistId || c.pricelist || 'none';
    pricelistCounts[plId] = (pricelistCounts[plId] || 0) + 1;
    if (!sampleCustomersByPricelist[plId]) {
      sampleCustomersByPricelist[plId] = [];
    }
    if (sampleCustomersByPricelist[plId].length < 3) {
      sampleCustomersByPricelist[plId].push({
        id: c.id,
        name: c.businessName || c.name,
        idPricelist: c.idPricelist
      });
    }
  });

  console.log('\nPricelist distribution among first 100 customers:');
  console.log(pricelistCounts);

  console.log('\nSample customers per pricelist:');
  console.log(JSON.stringify(sampleCustomersByPricelist, null, 2));
}

main().catch(console.error);
