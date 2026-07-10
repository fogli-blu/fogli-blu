import fs from 'fs';

const cssPath = 'c:/Users/Magazzino/Il mio Drive/drive/Antigravity/Fogli blu/public/style.css';
const content = fs.readFileSync(cssPath, 'utf8');
const lines = content.split('\n');

console.log('Searching for catbrowser layout in style.css...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('catbrowser-overlay') || 
      line.toLowerCase().includes('catbrowser-sheet') || 
      line.toLowerCase().includes('catbrowser-workspace')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
