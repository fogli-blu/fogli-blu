import fs from 'fs';
import path from 'path';
import readline from 'readline';

async function main() {
  const logPath = 'C:\\Users\\Magazzino\\.gemini\\antigravity\\brain\\4f6fa01f-883e-4104-9e5e-bd42af9fd8a5\\.system_generated\\logs\\transcript.jsonl';
  
  if (!fs.existsSync(logPath)) {
    console.log(`Log file not found at: ${logPath}`);
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching logs for price-related findings...');
  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    try {
      const obj = JSON.parse(line);
      const content = obj.content || '';
      const toolCalls = JSON.stringify(obj.tool_calls || {});
      
      // Let's check if the content contains any of the target keywords
      const keywords = ['scheme 11', 'posatori parquet romagna', 'parquet bologna', 'listino 27', 'listino 24', 'listino 26', 'privati', '1.35', '1.15', 'markup'];
      const hasKeyword = keywords.some(k => content.toLowerCase().includes(k) || toolCalls.toLowerCase().includes(k));
      
      if (hasKeyword) {
        console.log(`\n[Line ${lineCount}] Type: ${obj.type}, Source: ${obj.source}`);
        // Log a snippet of the content
        if (content) {
          console.log(`Content Snippet:\n${content.substring(0, 1000)}...\n`);
        }
        if (obj.tool_calls) {
          console.log(`Tool Calls Snippet:\n${JSON.stringify(obj.tool_calls).substring(0, 500)}...\n`);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}

main().catch(console.error);
