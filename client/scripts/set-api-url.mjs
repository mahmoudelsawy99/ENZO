import { readFileSync, writeFileSync } from 'node:fs';

const url = process.env.API_PUBLIC_URL?.trim() ?? '';
if (!url) {
  process.exit(0);
}
if (!/^https:\/\/[^/\s]+\/api$/.test(url)) {
  console.error('API_PUBLIC_URL must look like https://host/api');
  process.exit(1);
}

const file = new URL('../src/environments/environment.production.ts', import.meta.url);
const source = readFileSync(file, 'utf8').replace("apiUrl: '/api'", `apiUrl: '${url}'`);
if (!source.includes(url)) {
  console.error('The production API address was not updated.');
  process.exit(1);
}
writeFileSync(file, source);
console.log('Production API address updated.');
