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

  const paths = [
    '/swagger.json',
    '/swagger.yaml',
    '/swagger',
    '/swagger-ui.html',
    '/api-docs',
    '/api-doc',
    '/openapi.json',
    '/openapi.yaml',
    '/openapi',
    '/docs',
    '/doc',
    '/v1/swagger.json',
    '/v1/openapi.json',
    '/GiobbyApi00553/v1/swagger.json',
    '/GiobbyApi00553/swagger.json'
  ];

  // Try on both apiUrl (with token) and app.giobby.com
  for (const p of paths) {
    // 1. Try on apiUrl (which has the version etc., e.g. https://app.giobby.com/GiobbyApi00553/v1)
    try {
      const res = await fetch(`${apiUrl}${p}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Giobby-Realm': GIOBBY_REALM
        }
      });
      console.log(`apiUrl${p}: Status ${res.status}`);
      if (res.status === 200) {
        const text = await res.text();
        console.log(`  Found on apiUrl! snippet: ${text.substring(0, 500)}`);
      }
    } catch (err) {
      console.log(`apiUrl${p} failed: ${err.message}`);
    }

    // 2. Try on app.giobby.com base URL
    try {
      const res = await fetch(`https://app.giobby.com${p}`);
      console.log(`app.giobby.com${p}: Status ${res.status}`);
      if (res.status === 200) {
        const text = await res.text();
        console.log(`  Found on app.giobby.com! snippet: ${text.substring(0, 500)}`);
      }
    } catch (err) {
      console.log(`app.giobby.com${p} failed: ${err.message}`);
    }
  }
}

test().catch(err => console.error(err));
