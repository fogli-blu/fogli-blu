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

  // 1. Fetch all pricelists
  console.log('Fetching all pricelists...');
  const res = await fetch(`${cachedApiUrl}/pricelists`, { headers });
  const data = await res.json();
  console.log('Pricelists list:', JSON.stringify(data, null, 2));

  // Let's also check if we can fetch specific pricelists that might be referenced
  const testIds = [8, 10, 11, 22, 24, 26, 27, 28];
  for (const id of testIds) {
    console.log(`\nFetching pricelist details for ID ${id}...`);
    try {
      const pRes = await fetch(`${cachedApiUrl}/pricelists/${id}`, { headers });
      const pData = await pRes.json();
      if (pData.errorCode !== undefined && pData.errorCode !== 0) {
        console.log(`ID ${id} Error: Code ${pData.errorCode} - ${pData.userMessage}`);
      } else {
        const rowsCount = pData.pricelist && pData.pricelist.rows ? pData.pricelist.rows.length : 0;
        console.log(`ID ${id} Success: Name="${pData.pricelist?.description}", Type=${pData.pricelist?.type}, BasePricelist=${pData.pricelist?.basePricelistId || pData.pricelist?.idPricelistBase}, RowsCount=${rowsCount}`);
        if (pData.pricelist) {
          console.log(`Metadata:`, {
            id: pData.pricelist.id,
            description: pData.pricelist.description,
            type: pData.pricelist.type,
            idPricelistBase: pData.pricelist.idPricelistBase,
            discount: pData.pricelist.discount,
            markup: pData.pricelist.markup,
            percentage: pData.pricelist.percentage
          });
        }
      }
    } catch (err) {
      console.log(`ID ${id} Fetch Error:`, err.message);
    }
  }
}

main().catch(console.error);
