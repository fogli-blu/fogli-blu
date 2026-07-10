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

  const url = `${apiUrl}/stocks/avaibility?idProduct=${encodeURIComponent("COLBICULTP9132KCHKG010MAP")}`;
  console.log(`Querying: ${url}`);
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Giobby-Realm': GIOBBY_REALM,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await res.json();
  console.log('Stocks:', JSON.stringify(data.stocks || data, null, 2));
}

test().catch(err => console.error(err));
