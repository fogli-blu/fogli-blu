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

  const testParams = [
    { showStock: 'true' },
    { showStocks: 'true' },
    { includeStock: 'true' },
    { includeStocks: 'true' },
    { stock: 'true' },
    { stocks: 'true' },
    { giacenza: 'true' },
    { giacenze: 'true' },
    { showStorageLocations: 'true' },
    { includeStorageLocations: 'true' },
    { showStorage: 'true' },
    { includeStorage: 'true' },
    { withStock: 'true' },
    { withStocks: 'true' },
    { showQty: 'true' },
    { showQuantity: 'true' },
    { storageLocations: 'true' }
  ];

  const productId = "PRCOLSTICKFAT";

  // Test single product detail
  for (const p of testParams) {
    const query = new URLSearchParams(p).toString();
    try {
      const res = await fetch(`${apiUrl}/products/${encodeURIComponent(productId)}?${query}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Giobby-Realm': GIOBBY_REALM,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      const product = data.product || data;
      const hasStock = product.storageLocations && product.storageLocations.length > 0;
      console.log(`GET /products/${productId}?${query} -> storageLocations length: ${product.storageLocations?.length}, has other keys: ${Object.keys(product).filter(k => k.toLowerCase().includes('stock') || k.toLowerCase().includes('qty') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('giacenza'))}`);
      if (hasStock) {
        console.log(`  SUCCESS! storageLocations:`, JSON.stringify(product.storageLocations, null, 2));
      }
    } catch (err) {
      console.log(`Failed for ${query}: ${err.message}`);
    }
  }

  // Test list products
  console.log("\nTesting GET /products list with params...");
  for (const p of testParams) {
    const query = new URLSearchParams({ limit: 5, salesEnabled: true, ...p }).toString();
    try {
      const res = await fetch(`${apiUrl}/products?${query}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Giobby-Realm': GIOBBY_REALM,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      const products = data.products || [];
      const withStock = products.filter(prod => prod.storageLocations && prod.storageLocations.length > 0);
      console.log(`GET /products?${query} -> Found ${products.length} products, products with stock: ${withStock.length}`);
    } catch (err) {
      console.log(`Failed for list ${query}: ${err.message}`);
    }
  }
}

test().catch(err => console.error(err));
