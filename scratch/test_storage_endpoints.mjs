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

  const endpoints = [
    '/storages/MB',
    '/storages/MB/stocks',
    '/storages/MB/stock',
    '/storages/MB/products',
    '/storages/MB/materials',
    '/storages/MB/inventories',
    '/storages/MB/inventory',
    '/products/PRCOLSTICKFAT/stocks',
    '/products/PRCOLSTICKFAT/stock',
    '/products/PRCOLSTICKFAT/storageLocations',
    '/products/PRCOLSTICKFAT/storages'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${apiUrl}${ep}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Giobby-Realm': GIOBBY_REALM,
          'Content-Type': 'application/json'
        }
      });
      console.log(`Endpoint ${ep}: Status ${res.status}`);
      if (res.status === 200) {
        const text = await res.text();
        console.log(`  Response snippet: ${text.substring(0, 300)}`);
      }
    } catch (err) {
      console.log(`Endpoint ${ep} failed: ${err.message}`);
    }
  }
}

test().catch(err => console.error(err));
