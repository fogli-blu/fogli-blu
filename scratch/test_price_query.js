

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
  
  // 1. Fetch products until we find some with salesPrice > 0 in the default view
  console.log('Fetching first 100 products to find priced items...');
  const res = await fetch(`${cachedApiUrl}/products?limit=100`, { headers });
  const data = await res.json();
  const pricedProducts = (data.products || []).filter(p => p.salesPrice > 0);
  
  console.log(`Found ${pricedProducts.length} products with salesPrice > 0.`);
  if (pricedProducts.length === 0) {
    console.log('No priced products found. Listing first 3 products:');
    (data.products || []).slice(0, 3).forEach(p => {
      console.log(`- Product ID: ${p.id}, salesPrice: ${p.salesPrice}`);
    });
    return;
  }
  
  const sample = pricedProducts[0];
  console.log(`Sample Product with price: ID="${sample.id}", desc="${sample.description}", base salesPrice=${sample.salesPrice}`);
  
  // 2. Query this product with different pricelist parameters to see if salesPrice changes
  const listini = [
    { id: 10, name: 'PARQUETTISTI IMPRESE' },
    { id: 20, name: 'LISTINO PRIVATI' },
    { id: 22, name: 'PARQUET BOLOGNA SRL' },
    { id: 24, name: 'PARQUET BOLOGNA' },
    { id: 26, name: 'PRIVATI' },
    { id: 27, name: 'POSATORI PARQUET ROMAGNA + PARQUET BOLOGNA' }
  ];
  
  for (const listino of listini) {
    // We try querying with idPricelist, pricelistId, and pricelist
    const testParams = [
      `idPricelist=${listino.id}`,
      `pricelistId=${listino.id}`,
      `pricelist=${listino.id}`
    ];
    
    console.log(`\nTesting for Listino ${listino.id} (${listino.name}):`);
    for (const tp of testParams) {
      const url = `${cachedApiUrl}/products?limit=10&code=${encodeURIComponent(sample.id)}&${tp}`;
      const resTest = await fetch(url, { headers });
      const dataTest = await resTest.json();
      const p = dataTest.products ? dataTest.products.find(x => x.id === sample.id) : null;
      if (p) {
        console.log(`  - Param ${tp} -> salesPrice: ${p.salesPrice}, salesPriceIncludeVat: ${p.salesPriceIncludeVat}`);
      } else {
        console.log(`  - Param ${tp} -> Product not found in search`);
      }
    }
  }
}

main().catch(console.error);
