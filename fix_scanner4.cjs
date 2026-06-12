const fs = require('fs');
let content = fs.readFileSync('src/DocScanner.tsx', 'utf8');

// Fix: After parsing, clear name field always (user must type manually)
// Also validate dates
const oldFilter = `      // Filter out null values
      Object.keys(parsed).forEach(k => {
        const key = k as keyof ExtractedData;
        if (parsed[key] === null || parsed[key] === undefined) delete parsed[key];
        if (Array.isArray(parsed[key]) && (parsed[key] as any[]).length === 0) delete parsed[key];
      });`;

const newFilter = `      // Always clear name - user must verify and type manually
      delete parsed.name;

      // Filter out null values
      Object.keys(parsed).forEach(k => {
        const key = k as keyof ExtractedData;
        if (parsed[key] === null || parsed[key] === undefined) delete parsed[key];
        if (Array.isArray(parsed[key]) && (parsed[key] as any[]).length === 0) delete parsed[key];
      });

      // Validate vaccine dates
      const toISO = (d) => {
        if (!d) return '';
        const p = d.split('-');
        if (p.length !== 3) return '';
        if (p[0].length === 4) return d;
        return p[2] + '-' + p[1] + '-' + p[0];
      };
      if (parsed.vaccines) {
        parsed.vaccines = parsed.vaccines.filter((v) => {
          if (!v.date) return false;
          const parts = v.date.split('-');
          const month = parseInt(parts[1]);
          if (month < 1 || month > 12) return false; // invalid month
          return true;
        }).map((v) => {
          // Clear nextDate if it's before or same as date
          if (v.nextDate && v.date && toISO(v.nextDate) <= toISO(v.date)) {
            v.nextDate = null;
          }
          return v;
        });
      }`;

if (content.includes('// Filter out null values')) {
  content = content.replace(oldFilter, newFilter);
  console.log('Fix applied: OK');
} else {
  console.log('ERROR: Target not found');
}

fs.writeFileSync('src/DocScanner.tsx', content);
console.log('Done');
