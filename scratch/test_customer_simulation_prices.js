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

  const idMaterial = "COLMONADECONK450KG05ADE"; // Base price is 6.50 (Listino 28), Listino 10 is 4.06.
  
  // Customers we found:
  // 1144: priceListID 10
  // 1030: priceListID 11
  const testCustomers = [
    { id: "1144", label: "Customer 1144 (priceListID 10 - Listino Privati)" },
    { id: "1030", label: "Customer 1030 (priceListID 11 - Posatori Parquet Romagna)" }
  ];

  for (const tc of testCustomers) {
    console.log(`\n--- Test Customer: ${tc.label} ---`);
    const fullPayload = {
      idDocumentType: 1,
      idDocumentTypeExt: 0,
      idOrderType: 1,
      idCustomer: tc.id,
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
      rows: [
        {
          idPos: 1,
          idMaterial: idMaterial,
          quantity: 1,
          description: "TEST ROW",
          idVat: "22",
          idPosType: 1
        }
      ]
    };

    try {
      const res = await fetch(`${cachedApiUrl}/sales/goodsissue?simulation=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify(fullPayload)
      });
      const data = await res.json();
      console.log(`Response status: ${res.status}`);
      if (data.errorCode !== 0) {
        console.log(`Error: ${data.errorCode} - ${data.userMessage || data.developerMessage}`);
      } else {
        const rows = data.document?.rows || data.rows || [];
        rows.forEach(r => {
          console.log(`  - Mat: "${r.idMaterial}", qty: ${r.quantity}`);
          console.log(`    price (computed): ${r.price}`);
          console.log(`    salesPrice (computed): ${r.salesPrice}`);
          console.log(`    salesPriceIncludeVat (computed): ${r.salesPriceIncludeVat}`);
        });
      }
    } catch (err) {
      console.log(`Request error:`, err.message);
    }
  }
}

main().catch(console.error);
