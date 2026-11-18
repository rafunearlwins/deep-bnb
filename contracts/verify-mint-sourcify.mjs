// Verify DeepMint on Sourcify (API v2) using the full standard-JSON input.
// Usage: node verify-mint-sourcify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = '0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC';
const CREATION_TX = '0xd3935f32df5ad9e9033e280e3c8b5b86fc2ccfe0333ad0dc388e5ef28a287c00';

// Recursively resolve imports starting from DeepMint.sol (track each file's dir for relative imports)
const sources = {};
const queue = [{ spec: 'DeepMint.sol', dir: ROOT }];
const seen = new Set();
while (queue.length) {
  const { spec, dir } = queue.shift();
  if (seen.has(spec)) continue;
  seen.add(spec);
  let full;
  if (spec === 'DeepMint.sol') full = path.join(ROOT, 'DeepMint.sol');
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
fs.writeFileSync(path.join(ROOT, 'verify-mint-stdjson.json'), JSON.stringify(stdJson, null, 2));

const body = {
  stdJsonInput: stdJson,
  compilerVersion: '0.8.38+commit.1835d247',
  contractIdentifier: 'DeepMint.sol:DeepMint',
  creationTransactionHash: CREATION_TX,
};
const r = await fetch(`https://sourcify.dev/server/v2/verify/56/${CONTRACT}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('HTTP', r.status);
console.log((await r.text()).slice(0, 2000));
