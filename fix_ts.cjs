const fs = require('fs');
let content = fs.readFileSync('src/DocScanner.tsx', 'utf8');

content = content.replace(
  'const toISO = (d) => {',
  'const toISO = (d: string): string => {'
);

content = content.replace(
  'v.nextDate = null;',
  'v.nextDate = undefined;'
);

fs.writeFileSync('src/DocScanner.tsx', content);
console.log('Done');
