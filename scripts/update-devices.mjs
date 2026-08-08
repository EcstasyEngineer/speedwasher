#!/usr/bin/env node
/**
 * Fetches BLE device config from buttplug (buttplugio/buttplug).
 * Usage: node scripts/update-devices.mjs
 *
 * Rewrites js/haptic/device-config.json with the current device filter and
 * service UUID lists. Only needs re-running when new devices ship.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_URL = 'https://raw.githubusercontent.com/buttplugio/buttplug/master/crates/buttplug_server_device_config/build-config/buttplug-device-config-v4.json';
const OUTPUT_FILE = path.join(__dirname, '..', 'js', 'haptic', 'device-config.json');

const json = await new Promise((resolve, reject) => {
  https.get(CONFIG_URL, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
    res.on('error', reject);
  }).on('error', reject);
});

const config = JSON.parse(json);
const names = new Set();
const services = new Set();

// Extract device names and service UUIDs from each protocol
for (const protocol of Object.values(config.protocols)) {
  for (const comm of protocol.communication || []) {
    // Extract BLE device names
    for (const name of comm.btle?.names || []) {
      if (name.endsWith('*')) {
        names.add(JSON.stringify({ namePrefix: name.slice(0, -1) }));
      } else {
        names.add(JSON.stringify({ name }));
      }
    }
    // Extract service UUIDs (keys of the services object)
    for (const uuid of Object.keys(comm.btle?.services || {})) {
      services.add(uuid.toLowerCase());
    }
  }
}

// Add Coyote (DG-Lab e-stim) - not in buttplug due to liability
// V3
names.add(JSON.stringify({ namePrefix: 'D-LAB ESTIM' }));
names.add(JSON.stringify({ namePrefix: 'DG-LAB' }));
names.add(JSON.stringify({ namePrefix: '47L' }));
names.add(JSON.stringify({ namePrefix: 'Coyote' }));
services.add('0000180c-0000-1000-8000-00805f9b34fb');  // V3 Control
// V2 (two service variants - B has writable chars)
services.add('955a180a-0fe2-f5aa-a094-84b8d4f3e8ad');  // V2 Service A (read-only)
services.add('955a180b-0fe2-f5aa-a094-84b8d4f3e8ad');  // V2 Service B (writable)

const filters = [...names].sort().map(n => JSON.parse(n));
const serviceList = [...services].sort();

fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
  _source: 'https://github.com/buttplugio/buttplug',
  _license: 'BSD-3-Clause (Nonpolynomial Labs LLC)',
  _version: `${config.version.major}.${config.version.minor}`,
  _updated: new Date().toISOString(),
  filters,
  services: serviceList
}, null, 2) + '\n');

console.log(`Wrote ${filters.length} filters, ${serviceList.length} services (v${config.version.major}.${config.version.minor}) to ${OUTPUT_FILE}`);
