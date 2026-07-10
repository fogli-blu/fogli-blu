import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cachePath = path.join(__dirname, '../prodotti_cache.json');

async function main() {
  if (!fs.existsSync(cachePath)) {
    console.error(`Cache file not found at: ${cachePath}`);
    return;
  }

  const raw = fs.readFileSync(cachePath, 'utf8');
  const cache = JSON.parse(raw);
  const products = cache.products || [];

  console.log(`Total products in cache: ${products.length}`);
  
  // Find products where at least one price is not null
  const priced = products.filter(p => p.prices && (p.prices.privati !== null || p.prices.posatori !== null || p.prices.bologna !== null));
  console.log(`Products with at least one calculated price: ${priced.length}`);

  console.log('\nSample products with prices (up to 10):');
  priced.slice(0, 10).forEach(p => {
    console.log(`- Product: "${p.id}" ("${p.description}")`);
    console.log(`  Prices:`, p.prices);
  });
}

main().catch(console.error);
