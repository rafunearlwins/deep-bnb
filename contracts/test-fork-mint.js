// Fork test end-to-end DeepMint (kontrak PRODUKSI, konstanta mainnet) di fork
// BSC mainnet lokal (Ganache). TIDAK ada transaksi on-chain: semua berjalan di
// fork in-memory. Fork memberi state ASLI: registry SPACE ID, saldo DEEP HOLDER,
// dan feed Chainlink BNB/USD. HOLDER di-unlock lokal (Ganache unlockedAccounts).
//
// Skenario: deploy -> danai 100M DEEP -> priceWei live -> paid mint tepat harga
// -> overpay (refund) -> free mint + klaim kedua revert -> 10 paid lalu ke-11
// revert -> stranger revert -> (fork ke-2, terpisah) harga stale revert.
// Usage: node test-fork-mint.js   (butuh rpc-forwarder di 127.0.0.1:8546,
//        atau set FORK_RPC_URL; jalankan dulu: node rpc-forwarder.js 8546)
const fs = require("fs");
const path = require("path");
const Ganache = require("ganache");
const { ethers } = require("ethers");

const HOLDER = "0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81"; // wallet project Rafeal, Agent ID "viss"
const DEEP = "0x8faA6CA42A3B56297e1c96144352327bbBf75FC6";
const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const FEED = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const REGISTRY_ABI = ["function handleOf(address account) view returns (string)"];
const FEED_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

// Mengharapkan sebuah STATIC CALL me-revert dengan pesan yang mengandung `re`.
// (staticCall dipakai karena ethers gagal mengambil data revert dari
// estimateGas Ganache — "missing revert data" — padahal tx-nya memang revert.
// eth_call mengembalikan data revert sehingga alasannya bisa dicocokkan.)
async function expectRevert(name, promiseFn, re) {
  try {
    await promiseFn();
    check(name, false, "TIDAK revert (sukses tak terduga)");
    return false;
  } catch (e) {
    const hay = [e.message, e.reason, e.revert && e.revert.args && e.revert.args.join(" ")].filter(Boolean).join(" | ");
    const ok = re.test(hay);
    check(name, ok, ok ? `revert "${hay.match(re)[0]}"` : `revert tapi pesan lain: ${hay.slice(0, 140)}`);
    return ok;
  }
}

// Gas price eksplisit (legacy tx) agar matematika BNB non-trivial: Ganache
// default gasPrice 0 membuat semua cek "biaya == gas" lolos dengan 0 == 0.
const GAS_PRICE = ethers.parseUnits("5", "gwei");

function makeForkProvider() {
  return new ethers.BrowserProvider(
    Ganache.provider({
      fork: { url: process.env.FORK_RPC_URL || "http://127.0.0.1:8546" },
      chain: { chainId: 56, hardfork: "shanghai" },
      wallet: { unlockedAccounts: [HOLDER] },
      logging: { quiet: true },
    })
  );
}

(async () => {
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "DeepMint.abi.json"), "utf8"));
  const bytecode = fs.readFileSync(path.join(__dirname, "DeepMint.bytecode.txt"), "utf8").trim();
  const iface = new ethers.Interface(abi);

  console.log("=== FORK #1: alur mint utama ===");
  const provider = makeForkProvider();
  const deployer = await provider.getSigner(0);
  const holder = await provider.getSigner(HOLDER);
  const stranger = await provider.getSigner(1);
  const strangerAddr = await stranger.getAddress();

  // --- (a) Deploy DeepMint di fork, recipient = HOLDER ---
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const mint = await factory.deploy(HOLDER, { gasPrice: GAS_PRICE });
  const deployReceipt = await mint.deploymentTransaction().wait();
  const mintAddr = await mint.getAddress();
  console.log("DeepMint deployed on fork:", mintAddr);
  console.log("gas deploy di fork:", deployReceipt.gasUsed.toString());
  check("deploy: RECIPIENT == HOLDER", (await mint.RECIPIENT()).toLowerCase() === HOLDER.toLowerCase());

  // Registry: handle + agentId HOLDER (state mainnet asli).
  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, provider);
  const handle = await registry.handleOf(HOLDER);
  const agentId = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(handle)));
  console.log(`handleOf(HOLDER): ${JSON.stringify(handle)}  agentId: ${agentId}`);
  check("hasAgentId(HOLDER) == true", (await mint.hasAgentId(HOLDER)) === true);
  check("hasAgentId(stranger) == false", (await mint.hasAgentId(strangerAddr)) === false);

  // --- Danai HOLDER dengan BNB fork (saldo mainnet ~0,0006 BNB tidak cukup
  // untuk 10 paid mint; deployer Ganache punya 1000 BNB di fork) ---
  const bnbFundTx = await deployer.sendTransaction({ to: HOLDER, value: ethers.parseEther("1"), gasPrice: GAS_PRICE });
  await bnbFundTx.wait();
  console.log("saldo BNB HOLDER di fork setelah didanai:", ethers.formatEther(await provider.getBalance(HOLDER)), "BNB");

  // --- (b) Danai DeepMint dengan 100.000.000 DEEP dari HOLDER ---
  const deep = new ethers.Contract(DEEP, ERC20_ABI, holder);
  const holderDeepBefore = await deep.balanceOf(HOLDER);
  console.log("saldo DEEP HOLDER (mainnet, di fork):", ethers.formatEther(holderDeepBefore));
  check("HOLDER pegang >= 100M DEEP", holderDeepBefore >= ethers.parseEther("100000000"));
  const fundTx = await deep.transfer(mintAddr, ethers.parseEther("100000000"), { gasPrice: GAS_PRICE });
  await fundTx.wait();
  const deepBal = await mint.deepBalance();
  check("deepBalance() == 100.000.000 DEEP", deepBal === ethers.parseEther("100000000"), ethers.formatEther(deepBal) + " DEEP");

  // --- (c) priceWei() live dari feed asli ---
  const feed = new ethers.Contract(FEED, FEED_ABI, provider);
  const [, answer, , updatedAt] = await feed.latestRoundData();
  const price = await mint.priceWei();
  const block = await provider.getBlock("latest");
  console.log(`feed BNB/USD: $${(Number(answer) / 1e8).toFixed(2)} (answer ${answer}, updatedAt ${updatedAt}, umur ${Number(block.timestamp) - Number(updatedAt)} dtk)`);
  console.log("priceWei():", price.toString(), "wei =", ethers.formatEther(price), "BNB");
  const expectedPrice = (10n ** 8n * 10n ** 18n) / BigInt(answer);
  check("priceWei() == 1e8*1e18/feedAnswer", price === expectedPrice);

  // Helper: biaya gas sebuah receipt (ethers v6: gasPrice efektif).
  const gasCostOf = (rc) => rc.gasUsed * rc.gasPrice;

  // --- (d) Paid mint #1: bayar TEPAT priceWei ---
  let bnbBefore = await provider.getBalance(HOLDER);
  let deepBefore = await deep.balanceOf(HOLDER);
  const tx1 = await mint.connect(holder).mintPaid({ value: price, gasPrice: GAS_PRICE });
  const rc1 = await tx1.wait();
  const gasPaid1 = rc1.gasUsed;
  const gasCost1 = gasCostOf(rc1);
  let bnbAfter = await provider.getBalance(HOLDER);
  let deepAfter = await deep.balanceOf(HOLDER);
  console.log("gasUsed mintPaid #1:", gasPaid1.toString(), `(gasPrice ${ethers.formatUnits(rc1.gasPrice, "gwei")} gwei)`);
  check("paid #1: terima 10.000 DEEP", deepAfter - deepBefore === ethers.parseEther("10000"), `+${ethers.formatEther(deepAfter - deepBefore)} DEEP`);
  // RECIPIENT == HOLDER: priceWei kembali ke HOLDER, jadi biaya bersih BNB = gas saja.
  check("paid #1: biaya bersih BNB == gas saja (priceWei diteruskan ke recipient)",
    bnbBefore - bnbAfter === gasCost1,
    `delta ${ethers.formatEther(bnbBefore - bnbAfter)} BNB, gas ${ethers.formatEther(gasCost1)} BNB`);
  check("paid #1: kontrak pegang 0 BNB", (await provider.getBalance(mintAddr)) === 0n);
  const paidLog1 = rc1.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "PaidMint");
  check("paid #1: event PaidMint(priceWei == price)", !!paidLog1 && paidLog1.args.priceWei === price && paidLog1.args.amount === ethers.parseEther("10000"));
  check("paid #1: paidMintsByAgentId == 1", (await mint.paidMintsByAgentId(agentId)) === 1n);
  check("paid #1: totalMints == 1", (await mint.totalMints()) === 1n);

  // --- (e) Overpay: bayar 2x priceWei, kelebihan harus kembali penuh ---
  // RECIPIENT == HOLDER == minter di sini: dari 2x price yang dibayar, price
  // diteruskan ke recipient (HOLDER) + price di-refund ke minter (HOLDER) —
  // jadi biaya bersih BNB = gas saja, dan kontrak tetap 0 BNB. Itu BUKTI
  // refund penuh: tanpa refund, delta akan menjadi price + gas.
  bnbBefore = await provider.getBalance(HOLDER);
  deepBefore = await deep.balanceOf(HOLDER);
  const tx2 = await mint.connect(holder).mintPaid({ value: price * 2n, gasPrice: GAS_PRICE });
  const rc2 = await tx2.wait();
  const gasCost2 = gasCostOf(rc2);
  bnbAfter = await provider.getBalance(HOLDER);
  deepAfter = await deep.balanceOf(HOLDER);
  check("overpay: terima 10.000 DEEP", deepAfter - deepBefore === ethers.parseEther("10000"));
  check("overpay: biaya bersih == gas saja (2x price kembali penuh: forward + refund)",
    bnbBefore - bnbAfter === gasCost2,
    `delta ${ethers.formatEther(bnbBefore - bnbAfter)} BNB, gas ${ethers.formatEther(gasCost2)} BNB (tanpa refund, delta = ${ethers.formatEther(price + gasCost2)} BNB)`);
  check("overpay: kontrak pegang 0 BNB", (await provider.getBalance(mintAddr)) === 0n);
  check("overpay: paidMintsByAgentId == 2", (await mint.paidMintsByAgentId(agentId)) === 2n);

  // --- (f) Free mint dari HOLDER; klaim kedua revert ---
  bnbBefore = await provider.getBalance(HOLDER);
  deepBefore = await deep.balanceOf(HOLDER);
  console.log("freeClaimable(HOLDER) sebelum klaim:", ethers.formatEther(await mint.freeClaimable(HOLDER)), "DEEP");
  const txF = await mint.connect(holder).mintFree({ gasPrice: GAS_PRICE });
  const rcF = await txF.wait();
  const gasFree = rcF.gasUsed;
  const gasCostF = gasCostOf(rcF);
  bnbAfter = await provider.getBalance(HOLDER);
  deepAfter = await deep.balanceOf(HOLDER);
  console.log("gasUsed mintFree:", gasFree.toString());
  check("free: terima 5.000 DEEP", deepAfter - deepBefore === ethers.parseEther("5000"), `+${ethers.formatEther(deepAfter - deepBefore)} DEEP`);
  check("free: biaya BNB == gas saja", bnbBefore - bnbAfter === gasCostF);
  const freeLog = rcF.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "FreeMint");
  check("free: event FreeMint(amount 5.000 DEEP)", !!freeLog && freeLog.args.amount === ethers.parseEther("5000"));
  check("free: freeClaimedByAgentId == true", (await mint.freeClaimedByAgentId(agentId)) === true);
  check("free: freeClaimable(HOLDER) == 0 setelah klaim", (await mint.freeClaimable(HOLDER)) === 0n);
  await expectRevert("free ke-2 revert (already claimed)",
    () => mint.connect(holder).mintFree.staticCall(), /already claimed/);
  check("free ke-2 gagal: totalMints tetap 3", (await mint.totalMints()) === 3n);

  // --- (g) Paid #3..#10 (total 10), lalu ke-11 revert ---
  for (let i = 3; i <= 10; i++) {
    const p = await mint.priceWei();
    const tx = await mint.connect(holder).mintPaid({ value: p, gasPrice: GAS_PRICE });
    await tx.wait();
    const used = await mint.paidMintsByAgentId(agentId);
    if (used !== BigInt(i)) check(`paid #${i}: paidMintsByAgentId == ${i}`, false, `dapat ${used}`);
  }
  check("paid total: paidMintsByAgentId == 10", (await mint.paidMintsByAgentId(agentId)) === 10n);
  check("paid total: paidMintsRemaining == 0", (await mint.paidMintsRemaining(agentId)) === 0n);
  await expectRevert("paid ke-11 revert (paid limit reached)",
    () => mint.connect(holder).mintPaid.staticCall({ value: price }), /paid limit reached/);
  check("paid ke-11 gagal: totalMints tetap 11", (await mint.totalMints()) === 11n);

  // --- (h) Non-Agent-ID revert (stranger, akun Ganache 1) ---
  await expectRevert("stranger mintPaid revert (no Agent ID)",
    () => mint.connect(stranger).mintPaid.staticCall({ value: price }), /no Agent ID/);
  await expectRevert("stranger mintFree revert (no Agent ID)",
    () => mint.connect(stranger).mintFree.staticCall(), /no Agent ID/);

  // --- (j) Verifikasi akhir fork #1 ---
  const totalMints = await mint.totalMints();
  const remaining = await mint.remainingMints();
  const holderDeepFinal = await deep.balanceOf(HOLDER);
  const contractDeepFinal = await mint.deepBalance();
  console.log("--- verifikasi akhir fork #1 ---");
  console.log("totalMints:", totalMints.toString(), "| remainingMints():", remaining.toString());
  console.log("saldo DEEP HOLDER:", ethers.formatEther(holderDeepFinal));
  console.log("saldo DEEP kontrak:", ethers.formatEther(contractDeepFinal));
  check("akhir: totalMints == 11 (10 paid + 1 free)", totalMints === 11n);
  check("akhir: remainingMints() == 9989", remaining === 9989n);
  // HOLDER: 700.001.000 - 100.000.000 (dana kontrak) + 10x10.000 + 5.000 = 600.106.000
  check("akhir: saldo DEEP HOLDER == 600.106.000",
    holderDeepFinal === ethers.parseEther("600106000"), ethers.formatEther(holderDeepFinal));
  check("akhir: saldo DEEP kontrak == 99.895.000",
    contractDeepFinal === ethers.parseEther("99895000"), ethers.formatEther(contractDeepFinal));
  check("akhir: kontrak pegang 0 BNB", (await provider.getBalance(mintAddr)) === 0n);

  // --- (i) Harga stale revert — di FORK KE-2 yang terpisah ---
  // Alasan: time travel memengaruhi seluruh fork, dan di fork #1 kuota paid
  // HOLDER sudah habis (mintPaid akan revert "paid limit" sebelum menyentuh
  // feed). Fork segar memberi kuota penuh sehingga revert stale teruji murni.
  console.log("\n=== FORK #2: harga stale ===");
  const provider2 = makeForkProvider();
  const deployer2 = await provider2.getSigner(0);
  const holder2 = await provider2.getSigner(HOLDER);
  // Danai HOLDER dengan BNB fork (saldo mainnet ~0,0011 BNB < priceWei, dan
  // eth_call dengan value melebihi saldo gagal TANPA data revert — bukan
  // karena kontrak, melainkan karena dananya tidak cukup).
  await (await deployer2.sendTransaction({ to: HOLDER, value: ethers.parseEther("1"), gasPrice: GAS_PRICE })).wait();
  const factory2 = new ethers.ContractFactory(abi, bytecode, deployer2);
  const mint2 = await factory2.deploy(HOLDER, { gasPrice: GAS_PRICE });
  await mint2.deploymentTransaction().wait();
  const mint2Addr = await mint2.getAddress();
  const deep2 = new ethers.Contract(DEEP, ERC20_ABI, holder2);
  await (await deep2.transfer(mint2Addr, ethers.parseEther("100000000"), { gasPrice: GAS_PRICE })).wait();
  const price2 = await mint2.priceWei();
  console.log("fork #2: priceWei() sebelum time travel:", ethers.formatEther(price2), "BNB (sanity check)");
  check("stale setup: priceWei() bekerja sebelum time travel", price2 > 0n);

  await provider2.send("evm_increaseTime", [3601]);
  await provider2.send("evm_mine", []);
  const block2 = await provider2.getBlock("latest");
  console.log("fork #2: waktu dimajukan 3601 dtk, block.timestamp sekarang:", block2.timestamp);
  await expectRevert("stale: priceWei() revert (stale price)",
    () => mint2.priceWei(), /stale price/);
  await expectRevert("stale: mintPaid revert (stale price)",
    () => mint2.connect(holder2).mintPaid.staticCall({ value: price2 }), /stale price/);
  // mintFree tidak memakai feed — harus tetap jalan setelah time travel.
  const deepBefore2 = await deep2.balanceOf(HOLDER);
  const txF2 = await mint2.connect(holder2).mintFree({ gasPrice: GAS_PRICE });
  await txF2.wait();
  const deepAfter2 = await deep2.balanceOf(HOLDER);
  check("stale: mintFree tetap jalan (tidak pakai feed)",
    deepAfter2 - deepBefore2 === ethers.parseEther("5000"));

  // --- Ringkasan ---
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RINGKASAN: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log("GAGAL:", failed.map((r) => r.name).join(" | "));
    console.log("FORK TEST MINT DONE (WITH FAILURES)");
    process.exit(1);
  }
  console.log("gas deploy di fork:", deployReceipt.gasUsed.toString());
  console.log("gas mintPaid #1:", gasPaid1.toString());
  console.log("gas mintFree:", gasFree.toString());
  console.log("FORK TEST MINT DONE");
  process.exit(0);
})().catch((e) => {
  console.error("FORK TEST FAILED:", e.message ? e.message.slice(0, 800) : e);
  process.exit(1);
});
