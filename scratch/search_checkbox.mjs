import fs from 'fs';

const cssPath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/public/style.css';
const content = fs.readFileSync(cssPath, 'utf8');
const lines = content.split('\n');

console.log('Searching for custom-checkbox...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('custom-checkbox') || line.toLowerCase().includes('checkmark')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
