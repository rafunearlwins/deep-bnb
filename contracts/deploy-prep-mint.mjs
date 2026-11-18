// Deploy-prep DeepMint — TIDAK deploy, hanya menyiapkan + memverifikasi.
// Menghitung alamat CREATE2 deterministik untuk DeepMint lewat factory proxy
// 0x4e59b44847b379578588920cA78FbF26c0B4956C (pola yang sama dengan deploy
// DeepBNB yang sukses), lalu memverifikasi semuanya READ-ONLY di mainnet:
//   - alamat prediksi masih kosong (eth_getCode == 0x)
//   - simulasi eth_call factory call dari HOLDER mengembalikan alamat prediksi
//   - eth_estimateGas + eth_gasPrice -> estimasi biaya deploy
// Hasil disimpan ke deploy-prep-mint.json. TIDAK ada transaksi on-chain,
// TIDAK pakai private key.
// Usage: node deploy-prep-mint.mjs   (RPC_URL env opsional, default BSC dataseed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak_256 } from '/home/hatch/workspace/tools/bawcli/lib/node_modules/@binance/agentic-wallet/node_modules/@noble/hashes/sha3.js';
import { ethers } from 'ethers';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RPC_URL = process.env.RPC_URL || 'https://bsc-dataseed.binance.org';
const FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
const RECIPIENT = '0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81'; // wallet project Rafeal
const SALT_LABEL = 'DEEP-MINT-v1';

const hex = (bytes) => '0x' + Buffer.from(bytes).toString('hex');
const keccakHex = (data) => hex(keccak_256(typeof data === 'string' ? Buffer.from(data, 'hex') : data));

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method} -> ${j.error.code}: ${j.error.message}`);
  return j.result;
}

const creationBytecode = fs.readFileSync(path.join(ROOT, 'DeepMint.bytecode.txt'), 'utf8').trim();
if (!/^0x[0-9a-fA-F]+$/.test(creationBytecode)) throw new Error('DeepMint.bytecode.txt bukan hex valid');

// 1) salt = keccak256("DEEP-MINT-v1")
const salt = keccakHex(new TextEncoder().encode(SALT_LABEL));
// Cross-check keccak noble vs ethers (pengaman terhadap salah import/hash).
const saltEthers = ethers.keccak256(ethers.toUtf8Bytes(SALT_LABEL));
if (salt.toLowerCase() !== saltEthers.toLowerCase()) throw new Error('keccak noble != ethers — BERHENTI');
console.log('salt = keccak256("DEEP-MINT-v1"):', salt);

// 2) initCode = creation bytecode + arg constructor (recipient, ABI-encoded 32 byte)
const recipientArg = RECIPIENT.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const initCode = creationBytecode + recipientArg;
console.log('initCode:', initCode.length / 2 - 1, 'byte (creation', (creationBytecode.length - 2) / 2, '+ arg 32)');

// 3) Alamat CREATE2: keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
const initCodeHash = keccakHex(Buffer.from(initCode.slice(2), 'hex'));
const preimage = Buffer.concat([
  Buffer.from('ff', 'hex'),
  Buffer.from(FACTORY.slice(2), 'hex'),
  Buffer.from(salt.slice(2), 'hex'),
  Buffer.from(initCodeHash.slice(2), 'hex'),
]);
const predicted = '0x' + Buffer.from(keccak_256(preimage)).toString('hex').slice(24);
const predictedChecksum = ethers.getAddress(predicted);
// Cross-check dengan ethers.getCreate2Address.
const predictedEthers = ethers.getCreate2Address(FACTORY, salt, initCodeHash);
if (predictedChecksum !== predictedEthers) throw new Error('CREATE2 noble != ethers — BERHENTI');
console.log('alamat CREATE2 diprediksi:', predictedChecksum);

// 4) Factory calldata = salt (32 byte) + initCode (tanpa selector — proxy baca
//    salt dari 32 byte pertama calldata, sisanya initCode).
const factoryCalldata = '0x' + salt.slice(2) + initCode.slice(2);

// 5) Verifikasi alamat prediksi masih kosong di mainnet.
const code = await rpc('eth_getCode', [predictedChecksum, 'latest']);
const codeEmpty = code === '0x';
console.log('eth_getCode(alamat prediksi):', code, codeEmpty ? '(KOSONG — aman deploy)' : '(!!! SUDAH ADA KODE !!!)');

// 6) Simulasikan eth_call factory call dari HOLDER di mainnet.
//    Proxy mengembalikan alamat kontrak yang di-deploy sebagai 32-byte word.
const callResult = await rpc('eth_call', [{ from: RECIPIENT, to: FACTORY, data: factoryCalldata }, 'latest']);
const returnedAddress = ethers.getAddress('0x' + callResult.slice(-40));
const callMatches = returnedAddress === predictedChecksum;
console.log('eth_call factory mengembalikan:', returnedAddress, callMatches ? '(COCOK dengan prediksi)' : '(!!! TIDAK COCOK !!!)');

// 7) Estimasi gas + harga gas saat ini -> biaya deploy.
const gasEstimateHex = await rpc('eth_estimateGas', [{ from: RECIPIENT, to: FACTORY, data: factoryCalldata }]);
const gasEstimate = BigInt(gasEstimateHex);
const gasPriceHex = await rpc('eth_gasPrice', []);
const gasPrice = BigInt(gasPriceHex);
const costWei = gasEstimate * gasPrice;
const costBnb = ethers.formatEther(costWei);
console.log('eth_estimateGas factory call:', gasEstimate.toString(), 'gas');
console.log('eth_gasPrice:', gasPrice.toString(), 'wei =', ethers.formatUnits(gasPrice, 'gwei'), 'gwei');
console.log('estimasi biaya deploy:', costWei.toString(), 'wei =', costBnb, 'BNB');

const out = {
  contract: 'DeepMint',
  chainId: 56,
  factory: FACTORY,
  recipient: RECIPIENT,
  saltLabel: SALT_LABEL,
  salt,
  initCodeHash,
  predictedAddress: predictedChecksum,
  initCode,
  factoryCalldata,
  checks: {
    codeEmpty,
    ethCallReturnedAddress: returnedAddress,
    ethCallMatchesPrediction: callMatches,
    keccakCrossCheckEthers: true,
    create2CrossCheckEthers: true,
  },
  gasEstimate: gasEstimate.toString(),
  gasPriceWei: gasPrice.toString(),
  gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
  estimatedCostWei: costWei.toString(),
  estimatedCostBnb: costBnb,
  rpcUrl: RPC_URL,
  generatedAt: new Date().toISOString(),
};
const outPath = path.join(ROOT, 'deploy-prep-mint.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('tersimpan:', outPath);

if (!codeEmpty || !callMatches) {
  console.error('DEPLOY-PREP MINT: VERIFIKASI GAGAL');
  process.exit(1);
}
console.log('DEPLOY-PREP MINT DONE');
