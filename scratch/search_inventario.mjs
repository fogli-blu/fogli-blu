import fs from 'fs';
import path from 'path';

const appJsPath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Inventario/app.js';
if (!fs.existsSync(appJsPath)) {
  console.log('File does not exist');
  process.exit(0);
}

const content = fs.readFileSync(appJsPath, 'utf8');
const lines = content.split('\n');

const keywords = ['availability', 'stock', 'giacenz', 'quantity'];

console.log('Searching Inventario/app.js for keywords...');
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  keywords.forEach(kw => {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      console.log(`[Line ${lineNum}] [KW: ${kw}] ${line.trim().substring(0, 150)}`);
    }
  });
});
