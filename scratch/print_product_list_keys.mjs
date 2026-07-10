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

  console.log('Fetching a product from list...');
  const prodRes = await fetch(`${apiUrl}/products?limit=1&salesEnabled=true`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Giobby-Realm': GIOBBY_REALM,
      'Content-Type': 'application/json'
    }
  });

  const prodData = await prodRes.json();
  const products = prodData.products || [];
  if (products.length > 0) {
    console.log('Product keys and values:', JSON.stringify(products[0], null, 2));
  } else {
    console.log('No products found');
  }
}

test().catch(err => console.error(err));
