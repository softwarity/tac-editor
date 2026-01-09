#!/usr/bin/env node
/**
 * Split airports.csv into JSON files by ICAO prefix (first letter)
 * Output: referentiels/icao/A.json, B.json, etc.
 *
 * Usage: node scripts/split-airports.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../referentiels/airports.csv');
const OUTPUT_DIR = path.join(__dirname, '../referentiels/icao');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read and parse CSV
const csv = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = csv.trim().split('\n');
const header = lines[0].split(',');

console.log('Header:', header);
console.log('Total airports:', lines.length - 1);

// Group by first letter of ICAO code
const groups = {};

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const icao = cols[0].trim();

  if (!icao || icao.length < 4) continue;

  const prefix = icao[0].toUpperCase();

  if (!groups[prefix]) {
    groups[prefix] = [];
  }

  // Parse the airport data
  const airport = {
    icao: icao,
    name: cols[1] ? cols[1].trim() : '',
    lat: cols[2] ? parseFloat(cols[2]) : null,
    lon: cols[3] ? parseFloat(cols[3]) : null,
    elev: cols[4] ? parseInt(cols[4]) : null
  };

  // Only include if we have valid coordinates
  if (airport.lat !== null && airport.lon !== null && !isNaN(airport.lat) && !isNaN(airport.lon)) {
    groups[prefix].push(airport);
  }
}

// Write JSON files
let totalWritten = 0;
const stats = [];

for (const [prefix, airports] of Object.entries(groups)) {
  const outputPath = path.join(OUTPUT_DIR, `${prefix}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(airports, null, 0)); // Compact JSON

  const size = fs.statSync(outputPath).size;
  stats.push({ prefix, count: airports.length, size: Math.round(size / 1024) + 'KB' });
  totalWritten += airports.length;

  console.log(`${prefix}.json: ${airports.length} airports (${Math.round(size / 1024)}KB)`);
}

// Also create an index file with just prefixes and counts
const index = {};
for (const [prefix, airports] of Object.entries(groups)) {
  index[prefix] = airports.length;
}
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(index));

console.log('\n--- Summary ---');
console.log('Total airports written:', totalWritten);
console.log('Files created:', Object.keys(groups).length);
console.log('Index file: index.json');
