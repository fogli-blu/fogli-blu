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

  const getPricelistRows = async (id) => {
    const res = await fetch(`${cachedApiUrl}/pricelists/${id}`, { headers });
    const data = await res.json();
    return data.pricelist?.rows || [];
  };

  console.log('Fetching rows for Listino 10 ("PARQUETTISTI IMPRESE")...');
  const rows10 = await getPricelistRows(10);
  console.log(`Listino 10 rows: ${rows10.length}`);

  console.log('Fetching rows for Listino 22 ("PARQUET BOLOGNA SRL")...');
  const rows22 = await getPricelistRows(22);
  console.log(`Listino 22 rows: ${rows22.length}`);

  console.log('Fetching rows for Listino 28 ("Prova Giobby")...');
  const rows28 = await getPricelistRows(28);
  console.log(`Listino 28 rows: ${rows28.length}`);

  // Create mappings
  const map10 = new Map(rows10.map(r => [r.id, r]));
  const map22 = new Map(rows22.map(r => [r.id, r]));
  const map28 = new Map(rows28.map(r => [r.id, r]));

  // Find some products that appear in multiple lists
  const commonIn10And28 = [];
  for (const [id, r10] of map10) {
    if (map28.has(id)) {
      commonIn10And28.push({
        id,
        desc: r10.description,
        price10: r10.salesPrice,
        price28: map28.get(id).salesPrice,
        price22: map22.has(id) ? map22.get(id).salesPrice : 'N/A'
      });
    }
  }

  console.log(`\nFound ${commonIn10And28.length} products common to Listino 10 and Listino 28.`);
  console.log('Sample comparison (up to 15 items):');
  commonIn10And28.slice(0, 15).forEach((item) => {
    console.log(`- Product ID: "${item.id}" ("${item.desc}"):`);
    console.log(`    Listino 10 (PARQUETTISTI IMPRESE): ${item.price10}`);
    console.log(`    Listino 28 (Prova Giobby): ${item.price28}`);
    console.log(`    Listino 22 (PARQUET BOLOGNA SRL): ${item.price22}`);
  });
}

main().catch(console.error);
