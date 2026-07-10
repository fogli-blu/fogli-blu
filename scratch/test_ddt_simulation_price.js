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

  // 1. Let's find a product that has a price in Listino 10
  // e.g. "COLMONADECONK450KG05ADE" (which we saw has price 4.06 in Listino 10, and 6.50 in Listino 28)
  const idMaterial = "COLMONADECONK450KG05ADE";
  
  // 2. We will simulate creating a DDT for customer "1" (or we can search for a customer or try with none)
  // Let's see if we can specify a pricelist on the header or row.
  const testCases = [
    { name: "No pricelist specified", payload: { idCustomer: "1", rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1 }] } },
    { name: "Header idPricelist=26", payload: { idCustomer: "1", idPricelist: 26, rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1 }] } },
    { name: "Header pricelistId=26", payload: { idCustomer: "1", pricelistId: 26, rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1 }] } },
    { name: "Header pricelist=26", payload: { idCustomer: "1", pricelist: 26, rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1 }] } },
    { name: "Row idPricelist=26", payload: { idCustomer: "1", rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1, idPricelist: 26 }] } },
    { name: "Row pricelistId=26", payload: { idCustomer: "1", rows: [{ idPos: 1, idMaterial, quantity: 1, description: "TEST ROW", idVat: "22", idPosType: 1, pricelistId: 26 }] } }
  ];

  for (const tc of testCases) {
    console.log(`\n--- Test Case: ${tc.name} ---`);
    const fullPayload = {
      idDocumentType: 1,
      idDocumentTypeExt: 0,
      idOrderType: 1,
      docDate: new Date().toISOString().slice(0, 10),
      idNumerator: 1,
      idBu: "U1",
      deliveryData: {
        reason: "Vendita",
        idReasonType: -1,
        idGoodsAppearence: 1,
        idDeliveryChargeTo: 2,
        idDeliveredBy: 2
      },
      ...tc.payload
    };

    try {
      const res = await fetch(`${cachedApiUrl}/sales/goodsissue?simulation=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify(fullPayload)
      });
      const data = await res.json();
      console.log(`Response status: ${res.status}`);
      console.log(`Full Response:`, JSON.stringify(data, null, 2));
    } catch (err) {
      console.log(`Request error:`, err.message);
    }
  }
}

main().catch(console.error);
