// Compile DeepMint.sol (+ test-only DeepMintTest.sol and mocks) with solc-js,
// resolving @openzeppelin imports from node_modules.
// Same settings as compile.js: solc 0.8.38, optimizer 200 runs, evmVersion shanghai.
// Usage: node compile-mint.js
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = __dirname;

function findImports(importPath) {
  // Resolve @openzeppelin/... from local node_modules; relative imports from the repo root.
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

const sources = {
  "DeepMint.sol": { content: fs.readFileSync(path.join(ROOT, "DeepMint.sol"), "utf8") },
  "DeepMintTest.sol": { content: fs.readFileSync(path.join(ROOT, "DeepMintTest.sol"), "utf8") },
  "mocks/Mocks.sol": { content: fs.readFileSync(path.join(ROOT, "mocks", "Mocks.sol"), "utf8") },
};

const input = {
  language: "Solidity",
  sources,
  settings: {
    // Same as compile.js: "shanghai" (PUSH0, no Cancun-only opcodes).
    // BSC supports Shanghai since Kepler (Jan 2024); pinning avoids surprises
    // from solc's default (prague in 0.8.38).
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
console.log("solc version:", solc.version());
console.log(`Errors: ${errors.length}, warnings: ${warnings.length}`);

function writeArtifacts(source, contractName) {
  const contract = output.contracts[source][contractName];
  const bytecode = contract.evm.bytecode.object;
  const deployed = contract.evm.deployedBytecode.object;
  fs.writeFileSync(path.join(ROOT, `${contractName}.abi.json`), JSON.stringify(contract.abi, null, 2));
  fs.writeFileSync(path.join(ROOT, `${contractName}.bytecode.txt`), "0x" + bytecode);
  fs.writeFileSync(path.join(ROOT, `${contractName}.deployed-bytecode.txt`), "0x" + deployed);
  console.log(`Compiled OK: ${contractName}`);
  console.log(`  Creation bytecode bytes: ${bytecode.length / 2}`);
  console.log(`  Deployed bytecode bytes: ${deployed.length / 2}`);

  // Deployment gas estimate (EIP-2028 calldata cost): 21000 base + 4/16 gas
  // per zero/non-zero byte + 200 gas per deployed byte (code deposit, EIP-2).
  let dataCost = 0;
  for (let i = 0; i < bytecode.length; i += 2) {
    dataCost += bytecode.slice(i, i + 2) === "00" ? 4 : 16;
  }
  const depositCost = (deployed.length / 2) * 200;
  console.log(`  Calldata gas (creation code): ${dataCost}`);
  console.log(`  Code-deposit gas (200/byte): ${depositCost}`);
  console.log(`  Deterministic floor (21000 + calldata + deposit): ${21000 + dataCost + depositCost}`);
  return { bytecode, deployed };
}

writeArtifacts("DeepMint.sol", "DeepMint");
writeArtifacts("DeepMintTest.sol", "DeepMintTest");
writeArtifacts("mocks/Mocks.sol", "MockRegistry");
writeArtifacts("mocks/Mocks.sol", "MockFeed");
writeArtifacts("mocks/Mocks.sol", "MockDEEP");
console.log("NOTE: DeepMintTest + mocks are TEST ONLY — never deploy to mainnet.");
