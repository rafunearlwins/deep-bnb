// Verify DeepBNB on Sourcify (API v2) using the full standard-JSON input.
// Usage: node verify-sourcify.mjs
// Writes verify-stdjson.json next to this file for reuse (e.g. BscScan standard-JSON verification).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = '0x8faa6ca42a3b56297e1c96144352327bbbf75fc6';
const CREATION_TX = '0x2c389c4a208c99dac140c8e2aa2105feb485d85bb7b152f934bf57c639133448';

// Recursively resolve imports starting from DeepBNB.sol (track each file's dir for relative imports)
const sources = {};
const queue = [{ spec: 'DeepBNB.sol', dir: ROOT }];
const seen = new Set();
while (queue.length) {
  const { spec, dir } = queue.shift();
  if (seen.has(spec)) continue;
  seen.add(spec);
  let full;
  if (spec === 'DeepBNB.sol') full = path.join(ROOT, 'DeepBNB.sol');
  else if (spec.startsWith('@')) full = path.join(ROOT, 'node_modules', spec);
  else full = path.join(dir, spec);
  const content = fs.readFileSync(full, 'utf8');
  sources[spec] = { content };
  const fileDir = path.dirname(full);
  for (const m of content.matchAll(/import\s+(?:\{[^}]*\}\s+from\s+)?["']([^"']+)["']/g)) {
    const imp = m[1];
    if (imp.startsWith('@')) queue.push({ spec: imp, dir: ROOT });
    else {
      const resolved = path.normalize(path.join(fileDir, imp));
      const rel = path.relative(path.join(ROOT, 'node_modules'), resolved);
      const key = rel.startsWith('..') ? path.relative(ROOT, resolved) : rel;
      queue.push({ spec: key, dir: fileDir });
    }
  }
}
console.log('sources inlined:', Object.keys(sources));

const stdJson = {
  language: 'Solidity',
  sources,
  settings: {
    evmVersion: 'shanghai',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
  },
};
fs.writeFileSync(path.join(ROOT, 'verify-stdjson.json'), JSON.stringify(stdJson, null, 2));

const body = {
  stdJsonInput: stdJson,
  compilerVersion: '0.8.38+commit.1835d247',
  contractIdentifier: 'DeepBNB.sol:DeepBNB',
  creationTransactionHash: CREATION_TX,
};
const r = await fetch(`https://sourcify.dev/server/v2/verify/56/${CONTRACT}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('HTTP', r.status);
console.log((await r.text()).slice(0, 2000));
