import {readFileSync, writeFileSync} from 'node:fs';
const [service, region] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,62}$/.test(service ?? '') || !/^[a-z]+-[a-z]+[0-9]$/.test(region ?? ''))
  throw Error('Supply a Cloud Run service name and supported region');
const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
config.hosting.rewrites.unshift({source: '/api/**', run: {serviceId: service, region, pinTag: true}});
writeFileSync('firebase.release.json', JSON.stringify(config, null, 2) + '\n');
console.log('Generated firebase.release.json for review');
