const fs = require('fs');
const path = require('path');

const srcFile = 'src/DocScanner.tsx';
let content = fs.readFileSync(srcFile, 'utf8');

// Find and replace the entire prompt
const promptStart = content.indexOf('const prompt = `');
const promptEnd = content.indexOf('`;\n\n      const body') || content.indexOf('`;\r\n\r\n      const body');

if (promptStart === -1) {
  console.log('prompt not found');
  process.exit(1);
}

// Find end of prompt backtick
let i = promptStart + 16;
while (i < content.length) {
  if (content[i] === '`' && content[i-1] !== '\\') {
    break;
  }
  i++;
}

const newPrompt = `const prompt = \`You are extracting dog/pet information from a vaccination card or pet document. Return ONLY valid JSON, no markdown, no explanation.

Read the document top-to-bottom, left-to-right.

Return this exact JSON structure (null for missing fields, [] for missing arrays):
{
  "name": "Dog name from PET'S NAME field only. If blank, return null. Never guess.",
  "breed": "breed name",
  "dob": "Date of Birth from DOB field only - NOT a vaccine date. Format DD-MM-YYYY.",
  "gender": "Male or Female from SEX field",
  "microchip": "microchip number",
  "colour": "coat colour from COLOUR field",
  "weight": "weight in kg",
  "ownerName": "owner name from OWNED BY field",
  "ownerPhone": "owner phone",
  "ownerEmail": "owner email",
  "ownerAddress": "owner address",
  "vaccines": [{"name": "vaccine product name", "date": "DD-MM-YYYY", "nextDate": "DD-MM-YYYY or null"}],
  "worming": [{"name": "product name", "date": "DD-MM-YYYY", "nextDate": "DD-MM-YYYY or null"}],
  "registrationNumber": "registration number if present",
  "notes": "any other relevant notes"
}

CRITICAL rules:
- 2-digit years: 25=2025, 26=2026. Format ALL dates as DD-MM-YYYY.
- DOB is at the top of the card - never use a treatment date as DOB
- For each TREATMENT row: DATE = date field, NEXT TREATMENT DUE = nextDate field
- Only include vaccine entry if DATE was actually written in (not blank)
- Do NOT invent dates for blank rows
- Read rows top-to-bottom: 1ST TREATMENT then 2ND TREATMENT then 3RD TREATMENT
- Vaccine name = product sticker on that row
- NEXT TREATMENT DUE is always after the treatment date\``;

content = content.substring(0, promptStart) + newPrompt + content.substring(i + 1);

// Also fix model
content = content.replace(/model: "claude-sonnet-4-20250514"/, 'model: "claude-opus-4-5"');
content = content.replace(/max_tokens: \d+/, 'max_tokens: 1500');

fs.writeFileSync(srcFile, content);
console.log('Done. Model:', content.match(/model: ".*"/)[0]);
