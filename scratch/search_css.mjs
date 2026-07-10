import fs from 'fs';

const cssPath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/public/style.css';
const content = fs.readFileSync(cssPath, 'utf8');
const lines = content.split('\n');

const keywords = ['prod-list', 'prod-item', 'prod-info', 'prod-name', 'prod-meta', 'prod-stocks-wrap'];

console.log('Searching CSS...');
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  keywords.forEach(kw => {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      console.log(`[Line ${lineNum}] ${line.trim()}`);
    }
  });
});
