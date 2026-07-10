import fs from 'fs';
import path from 'path';

const cachePath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/prodotti_cache.json';
if (!fs.existsSync(cachePath)) {
  console.error('Cache file does not exist');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const products = cache.products || [];

console.log(`Cache contains ${products.length} products.`);

const testIds = ["PRCOLSTICKFAT", "PRCOLTOVTP2C", "COLBICULTP9132K"];
testIds.forEach(id => {
  const p = products.find(prod => prod.id === id);
  if (p) {
    console.log(`\nProduct "${id}":`);
    console.log(`  Description: ${p.description}`);
    console.log(`  DefaultStorage: ${p.defaultStorage}`);
    console.log(`  Stocks:`, JSON.stringify(p.stocks, null, 2));
  } else {
    console.log(`\nProduct "${id}" NOT found in cache.`);
  }
});
