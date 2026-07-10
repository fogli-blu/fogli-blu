

const GIOBBY_REALM = "api-server";
const GIOBBY_CID = "parquetromagna";
const GIOBBY_USERNAME = "FULVIO";
const GIOBBY_PASSWORD = "FF@maga56.";
const GIOBBY_CLIENT_ID = "ZX720PTM-parquetromagna";

let cachedToken = null;
let cachedApiUrl = null;

async function authenticateGiobby() {
  console.log('Autenticazione...');
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

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Auth Failed: ${tokenRes.status} - ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token;

  const endpointUrl = `https://app.giobby.com/GiobbyApiLogin/v1/endpoint?cid=${GIOBBY_CID}`;
  const endpointRes = await fetch(endpointUrl);
  const endpointData = await endpointRes.json();
  cachedApiUrl = endpointData.GiobbyApiURL;
  console.log('Authenticated. API URL:', cachedApiUrl);
}

async function request(endpoint, method = 'GET', queryParams = {}) {
  let url = `${cachedApiUrl}${endpoint}`;
  const qKeys = Object.keys(queryParams);
  if (qKeys.length > 0) {
    url += '?' + qKeys.map(k => `${k}=${encodeURIComponent(queryParams[k])}`).join('&');
  }
  const headers = {
    'Authorization': `Bearer ${cachedToken}`,
    'X-Giobby-Realm': GIOBBY_REALM,
    'Content-Type': 'application/json'
  };
  console.log(`Calling: ${method} ${endpoint}...`);
  try {
    const res = await fetch(url, { method, headers });
    const text = await res.text();
    console.log(`Response for ${endpoint}: Status ${res.status}`);
    try {
      const json = JSON.parse(text);
      if (json.errorCode !== undefined) {
        console.log(`ErrorCode: ${json.errorCode}, userMessage: ${json.userMessage}`);
      } else {
        console.log('DataKeys:', Object.keys(json));
        if (json.pricelists || json.priceLists || json.pricelist || json.priceList) {
          console.log('FOUND PRICE LIST KEY!');
        }
        // print a sample of the data
        console.log(JSON.stringify(json).slice(0, 500));
      }
    } catch(e) {
      console.log('Non-JSON response:', text.slice(0, 200));
    }
  } catch(e) {
    console.log('Error:', e.message);
  }
}

async function main() {
  await authenticateGiobby();
  
  const headers = {
    'Authorization': `Bearer ${cachedToken}`,
    'X-Giobby-Realm': GIOBBY_REALM,
    'Content-Type': 'application/json'
  };
  
  console.log('Fetching /pricelists/28...');
  let res = await fetch(`${cachedApiUrl}/pricelists/28`, { headers });
  let text = await res.text();
  try {
    const json = JSON.parse(text);
    const rows = json.pricelist ? json.pricelist.rows : [];
    console.log(`Pricelist 28: rows=${rows.length}`);
    if (rows && rows.length > 0) {
      console.log('First 10 rows:');
      rows.slice(0, 10).forEach((r, idx) => {
        console.log(`- [${idx}] ID: "${r.id}", Price: ${r.salesPrice}, PriceIncVat: ${r.salesPriceIncludeVat}, desc: "${r.description}"`);
      });
    }
  } catch(e) {
    console.log('Failed to parse:', text.slice(0, 200));
  }
}

main().catch(console.error);
