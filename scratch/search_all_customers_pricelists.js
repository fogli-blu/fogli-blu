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

  let page = 1;
  let limit = 200;
  let hasMore = true;
  let matchedCustomers = [];

  console.log('Searching all customers for assigned pricelists...');
  
  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    const res = await fetch(`${cachedApiUrl}/customers?limit=${limit}&offset=${(page - 1) * limit}`, { headers });
    const data = await res.json();
    const customers = data.customers || [];
    
    if (customers.length === 0) {
      hasMore = false;
    } else {
      // For each customer, let's fetch their full detail since the list endpoint might not return priceListID
      console.log(`Fetched ${customers.length} customer summaries. Querying details...`);
      for (const c of customers) {
        try {
          const detailRes = await fetch(`${cachedApiUrl}/customers/${c.id}`, { headers });
          const detailData = await detailRes.json();
          const cust = detailData.customer || detailData;
          if (cust.priceListID) {
            console.log(`MATCH! Customer ID: ${cust.id}, Name: ${cust.contact?.name || cust.businessName}, priceListID: ${cust.priceListID}, priceListType: ${cust.priceListType}`);
            matchedCustomers.push({
              id: cust.id,
              name: cust.contact?.name || cust.businessName,
              priceListID: cust.priceListID
            });
          }
        } catch (err) {
          // Ignore fetch errors
        }
      }
      
      if (customers.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log(`\nFound ${matchedCustomers.length} customers with assigned pricelists:`);
  console.log(JSON.stringify(matchedCustomers, null, 2));
}

main().catch(console.error);
