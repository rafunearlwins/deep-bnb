// Compile DeepBNB.sol with solc-js, resolving @openzeppelin imports from node_modules.
// Usage: node compile.js
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = __dirname;
const ENTRY = path.join(ROOT, "DeepBNB.sol");

function findImports(importPath) {
  // Resolve @openzeppelin/... from local node_modules; relative imports from the importing file's dir.
  let full;
  if (importPath.startsWith("@")) {
    full = path.join(ROOT, "node_modules", importPath);
  } else {
    full = path.join(ROOT, importPath);
  }
  try {
    return { contents: fs.readFileSync(full, "utf8") };
  } catch (e) {
    return { error: `Import not found: ${importPath}` };
  }
}

const input = {
  language: "Solidity",
  sources: { "DeepBNB.sol": { content: fs.readFileSync(ENTRY, "utf8") } },
  settings: {
    // Explicit EVM version: "shanghai" (PUSH0, no Cancun-only opcodes such as
    // MCOPY). BSC has supported Shanghai since the Kepler hardfork (Jan 2024)
    // and Cancun since Haber (Jun 2024), so a Shanghai target is fully
    // BSC-compatible and the most conservative choice. solc 0.8.38 defaults
    // to "prague"; pinning avoids surprises from future defaults.
    evmVersion: "shanghai",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

const errors = (output.errors || []).filter((e) => e.severity === "error");
const warnings = (output.errors || []).filter((e) => e.severity === "warning");
for (const w of warnings) console.log("WARNING:", w.formattedMessage);
if (errors.length) {
  for (const e of errors) console.error("ERROR:", e.formattedMessage);
  process.exit(1);
}

const contract = output.contracts["DeepBNB.sol"]["DeepBNB"];
const bytecode = contract.evm.bytecode.object;
const deployed = contract.evm.deployedBytecode.object;

fs.writeFileSync(path.join(ROOT, "DeepBNB.abi.json"), JSON.stringify(contract.abi, null, 2));
fs.writeFileSync(path.join(ROOT, "DeepBNB.bytecode.txt"), "0x" + bytecode);
fs.writeFileSync(path.join(ROOT, "DeepBNB.deployed-bytecode.txt"), "0x" + deployed);

console.log("solc version:", solc.version());
console.log("Compiled OK: DeepBNB");
console.log("Creation bytecode bytes:", bytecode.length / 2);
console.log("Deployed bytecode bytes:", deployed.length / 2);

// Deployment gas estimate (EIP-2028 calldata cost): 21000 base + 4/16 gas per zero/non-zero byte
// + 200 gas per deployed byte (code deposit, EIP-2). This is the deterministic part of the cost;
// the constructor's own execution (storage writes) adds a small, fixed amount on top.
let dataCost = 0;
for (let i = 0; i < bytecode.length; i += 2) {
  dataCost += bytecode.slice(i, i + 2) === "00" ? 4 : 16;
}
const depositCost = (deployed.length / 2) * 200;
console.log("Calldata gas (creation code):", dataCost);
console.log("Code-deposit gas (200/byte):", depositCost);
console.log("Deterministic floor (21000 + calldata + deposit):", 21000 + dataCost + depositCost);
console.log("NOTE: add constructor execution (~45k-60k gas for the initial _mint storage writes)");
