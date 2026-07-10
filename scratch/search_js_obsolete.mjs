import fs from 'fs';

const jsPath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/public/app.js';
const content = fs.readFileSync(jsPath, 'utf8');
const lines = content.split('\n');

console.log('Searching app.js for hide-obsolete-chk...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('hide-obsolete-chk')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
