import fs from 'fs';
import path from 'path';

// Let's copy Giobby auth credentials from server.js
const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

async function test() {
  console.log('Authenticating...');
  const tokenUrl = `https://auth.giobby.com/auth/realms/${GIOBBY_REALM}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('cid', GIOBBY_CID);
  params.append('username', GIOBBY_USERNAME);
  params.append('password', GIOBBY_PASSWORD);
  params.append('grant_type', 'password');
  params.append('client_id', GIOBBY_CLIENT_ID);

  const tokenRes = await globalThis.fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log('Token obtained.');

  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await globalThis.fetch(endpointUrl);
  const endpointData = await endpointRes.json();
  const apiUrl = endpointData.GiobbyApiURL;
  console.log('API URL:', apiUrl);

  const url = `${apiUrl}/products?limit=10&salesEnabled=true`;
  const res = await globalThis.fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Giobby-Realm': GIOBBY_REALM,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  console.log('Keys in products response:', Object.keys(data));
  if (data.products) {
    console.log('Products array length:', data.products.length);
  }
  console.log('Full response (except products list if long):', { ...data, products: undefined });
}

test().catch(console.error);
