const fs = require('fs');

let content = fs.readFileSync('src/DocScanner.tsx', 'utf8');

// Replace direct API call with Vercel proxy
const oldFetch = `const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });`;

const newFetch = `const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });`;

if (content.includes('api.anthropic.com')) {
  // Find the fetch block and replace
  const start = content.indexOf('const response = await fetch("https://api.anthropic.com');
  const end = content.indexOf('body: JSON.stringify(body),\n      });', start) + 'body: JSON.stringify(body),\n      });'.length;
  if (start > -1 && end > start) {
    content = content.substring(0, start) + newFetch + content.substring(end);
    console.log('Fetch replaced OK');
  } else {
    console.log('Could not find fetch block, trying simple replace');
    content = content.replace('"https://api.anthropic.com/v1/messages"', '"/api/scan"');
  }
} else {
  console.log('Already using proxy');
}

fs.writeFileSync('src/DocScanner.tsx', content);
console.log('Done');
