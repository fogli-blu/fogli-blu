// Mapping of Italian number words to integers
const numberWords = {
  'un': 1, 'uno': 1, 'una': 1, 'due': 2, 'tre': 3, 'quattro': 4, 'cinque': 5,
  'sei': 6, 'sette': 7, 'otto': 8, 'nove': 9, 'dieci': 10,
  'undici': 11, 'dodici': 12, 'tredici': 13, 'quattordici': 14, 'quindici': 15,
  'sedici': 16, 'diciassette': 17, 'diciotto': 18, 'diciannove': 19, 'venti': 20,
  'trenta': 30, 'quaranta': 40, 'cinquanta': 50, 'sessanta': 60, 'settanta': 70,
  'ottanta': 80, 'novanta': 90, 'cento': 100
};

// Mapping of Italian month names to 2-digit numbers
const monthNames = {
  'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04', 'maggio': '05',
  'giugno': '06', 'luglio': '07', 'agosto': '08', 'settembre': '09', 'ottobre': '10',
  'novembre': '11', 'dicembre': '12'
};

const BASE_DATE = new Date('2026-05-28'); // Current system date for relative calculations

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ----------------------------------------------------
// LOCAL PARSERS (fallback when Gemini API Key is absent)
// ----------------------------------------------------

export function parseClienteLocal(text) {
  let cleaned = text.trim();
  // Strip common prefix phrases
  cleaned = cleaned.replace(/^(metti\s+come\s+cliente\s+la\s+ditta|metti\s+come\s+cliente|metti\s+cliente|inserisci\s+la\s+ditta|inserisci\s+cliente|la\s+ditta|ditta|inserisci|metti|per)\s+/i, '');
  cleaned = cleaned.trim();
  
  // Format title case (handling acronyms like SRL, SPA, SNC, SRLS)
  return cleaned
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase();
      if (['SRL', 'SPA', 'SNC', 'SRLS', 'S.R.L.', 'S.P.A.', 'S.N.C.'].includes(upper)) {
        return upper;
      }
      if (word.toLowerCase() === 'e' || word.toLowerCase() === 'di' || word.toLowerCase() === 'con') {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function parseDataLocal(text) {
  let cleaned = text.toLowerCase().trim();
  // Strip prefix words
  cleaned = cleaned.replace(/^(metti\s+la\s+data\s+di|metti\s+la\s+data|inserisci\s+la\s+data\s+di|inserisci\s+la\s+data|metti\s+come\s+data|metti|inserisci)\s+/i, '');
  cleaned = cleaned.trim();

  if (cleaned === 'oggi') {
    return formatDate(BASE_DATE);
  }
  if (cleaned === 'domani') {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }
  if (cleaned === 'dopodomani') {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }
  if (cleaned === 'ieri') {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  }

  // Regex to extract day number and month word: e.g. "15 ottobre" or "il 15 ottobre"
  const dateRegex = /(?:il\s+)?(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?/i;
  const match = cleaned.match(dateRegex);
  if (match) {
    const day = String(match[1]).padStart(2, '0');
    const monthWord = match[2].toLowerCase();
    const month = monthNames[monthWord];
    const year = match[3] || '2026';
    return `${year}-${month}-${day}`;
  }

  // Fallback: if user dictates YYYY-MM-DD directly
  const standardRegex = /\d{4}-\d{2}-\d{2}/;
  const stdMatch = cleaned.match(standardRegex);
  if (stdMatch) return stdMatch[0];

  // Return today as default
  return formatDate(BASE_DATE);
}

export function parseCausaleLocal(text) {
  const cleaned = text.toLowerCase().trim();
  if (cleaned.includes('conto visione') || cleaned.includes('visione')) {
    return 'Conto Visione';
  }
  if (cleaned.includes('reso') || cleaned.includes('restituzione')) {
    return 'Reso';
  }
  if (cleaned.includes('vendita') || cleaned.includes('vendite')) {
    return 'Vendita';
  }
  // Capitalize first letter of each word as fallback
  return text.trim().replace(/\b\w/g, c => c.toUpperCase());
}

export function parseArticoloLocal(text) {
  let cleaned = text.trim();
  // Strip starter like "aggiungi" or "metti"
  cleaned = cleaned.replace(/^(aggiungi|inserisci|metti)\s+/i, '').trim();

  // Regex to capture starting word (which can be a number or number word) and the rest of the string
  const tokenRegex = /^(\d+|[a-zA-Z\u00C0-\u00FF]+)\s+(.*)$/;
  const match = cleaned.match(tokenRegex);

  if (match) {
    const firstWord = match[1].toLowerCase();
    const rest = match[2];
    
    // Check if first word is a number word
    if (numberWords[firstWord] !== undefined) {
      return {
        quantita: numberWords[firstWord],
        descrizione_prodotto: rest
      };
    }
    
    // Check if first word is digits
    if (/^\d+$/.test(firstWord)) {
      return {
        quantita: parseInt(firstWord, 10),
        descrizione_prodotto: rest
      };
    }
  }

  // Default fallback if no quantity parsed: quantity 1, full text as description
  return {
    quantita: 1,
    descrizione_prodotto: cleaned
  };
}

// ----------------------------------------------------
// GEMINI REST API INTEGRATION
// ----------------------------------------------------

export async function parseWithGemini(field, text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  let systemInstruction = '';
  let prompt = '';

  if (field === 'cliente') {
    systemInstruction = `Sei un assistente per la compilazione del campo "Cliente" sul gestionale Giobby. Riceverai un input vocale e dovrai estrarre solo il nome dell'azienda o della persona, formattando le maiuscole in modo corretto. Rimuovi parole inutili come "metti", "inserisci", "per". Non aggiungere altro testo, rispondi esclusivamente con il nome pulito.`;
    prompt = `Input: "${text}"\nOutput:`;
  } else if (field === 'data') {
    systemInstruction = `Sei un convertitore di date per il gestionale Giobby. Riceverai un'indicazione temporale vocale e dovrai convertirla ESCLUSIVAMENTE nel formato standard AAAA-MM-GG. Se l'utente dice "oggi", usa la data corrente (2026-05-28). Non aggiungere altro testo, rispondi esclusivamente con la data.`;
    prompt = `Input: "${text}"\nOutput:`;
  } else if (field === 'causale') {
    systemInstruction = `Sei un assistente per standardizzare la causale di trasporto per il gestionale Giobby. Riceverai una descrizione vocale e dovrai ricondurla a una delle causali ammesse: "Vendita", "Conto Visione" o "Reso". Rispondi solo con la causale standardizzata.`;
    prompt = `Input: "${text}"\nOutput:`;
  } else if (field === 'articolo') {
    systemInstruction = `Sei un estrattore di articoli di magazzino per Giobby. Il tuo compito è ricevere un input vocale, individuare la quantità e la descrizione del prodotto, e restituire un oggetto JSON pulito. Se la quantità non viene specificata, imposta di default 1.
FORMATO OUTPUT:
{"quantita": intero, "descrizione_prodotto": "stringa"}
Rispondi esclusivamente con l'oggetto JSON, senza markdown o commenti.`;
    prompt = `Input: "${text}"\nOutput:`;
  } else {
    throw new Error(`Unknown field type: ${field}`);
  }

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.1
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  if (field === 'articolo') {
    // Clean up potential markdown formatting in JSON response
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);
  }
  
  return responseText;
}

// Main routing function for parsing
export async function parseField(field, text, apiKey) {
  if (apiKey) {
    try {
      return await parseWithGemini(field, text, apiKey);
    } catch (e) {
      console.warn(`[NLP] Gemini parsing failed, falling back to local. Error: ${e.message}`);
    }
  }

  // Local fallbacks
  switch (field) {
    case 'cliente':
      return parseClienteLocal(text);
    case 'data':
      return parseDataLocal(text);
    case 'causale':
      return parseCausaleLocal(text);
    case 'articolo':
      return parseArticoloLocal(text);
    default:
      return text.trim();
  }
}
