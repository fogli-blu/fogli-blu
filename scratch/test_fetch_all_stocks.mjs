import http from 'http';
import fs from 'fs';
import path from 'path';

const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

async function test() {
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

  console.log(`API URL: ${apiUrl}`);

  let allStocks = [];
  let offset = 0;
  const limit = 500; // Let's try 500 per page to make it faster
  let hasMore = true;
  let page = 1;
  const startTime = Date.now();

  while (hasMore) {
    const url = `${apiUrl}/stocks/avaibility?limit=${limit}&offset=${offset}`;
    console.log(`Fetching availability page ${page} (offset: ${offset}, limit: ${limit})...`);
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Giobby-Realm': GIOBBY_REALM,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`Error fetching page ${page}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const rawItems = Array.isArray(data) ? data : (data.stocks || data.stocksAvailability || data.availability || data.data || []);
    console.log(`  Page ${page} returned ${rawItems.length} records.`);
    
    if (rawItems.length === 0) {
      hasMore = false;
    } else {
      allStocks = allStocks.concat(rawItems);
      if (rawItems.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        page++;
      }
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`\nFetched ${allStocks.length} total stock records in ${duration} seconds.`);

  // Build a sample map and verify specific products
  const stockMap = {};
  allStocks.forEach(item => {
    const matId = item.idMaterial;
    const storageId = item.idStorage || 'MB'; // fallback to MB or ignore if empty?
    const qty = parseFloat(item.quantity ?? 0);
    
    if (!stockMap[matId]) {
      stockMap[matId] = {};
    }
    stockMap[matId][storageId] = qty;
  });

  const testProducts = ["PRCOLSTICKFAT", "PRCOLTOVTP2C", "COLBICULTP9132K"];
  console.log('\nVerification of specific products:');
  testProducts.forEach(id => {
    console.log(`Product "${id}" stocks:`, stockMap[id] || 'NO STOCK RECORD FOUND');
  });
}

test().catch(err => console.error(err));
