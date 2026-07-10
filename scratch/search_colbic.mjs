import fs from 'fs';

const cachePath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/prodotti_cache.json';
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const products = cache.products || [];

const found = products.filter(p => p.id.includes('COLBIC'));
console.log(`Found ${found.length} products:`);
found.forEach(p => {
  console.log(`- ID: ${p.id}, DefaultStorage: ${p.defaultStorage}`);
  console.log(`  Stocks:`, JSON.stringify(p.stocks, null, 2));
});
