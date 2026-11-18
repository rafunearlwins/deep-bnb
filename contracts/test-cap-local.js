// Unit test of DeepMint's cap / quota / price logic on a local empty Ganache chain.
// Uses DeepMintTest.sol (test-only copy of DeepMint with injectable addresses +
// configurable MAX_MINTS) + mock registry / Chainlink feed / DEEP token, because
// the production DeepMint hardcodes mainnet addresses that do not exist here.
// Fully offline — no real chain, no real key. Usage: node test-cap-local.js
//
// The fork test (another agent) re-verifies the PRODUCTION DeepMint.sol against
// the real BSC registry, feed, and token.
const fs = require("fs");
const path = require("path");
const Ganache = require("ganache");
const { ethers } = require("ethers");

const FEED_ANSWER = 58889000000n; // $588.89, 8 decimals (Chainlink BNB/USD)
const EXPECTED_PRICE = (10n ** 26n) / FEED_ANSWER; // (1e8 * 1e18) / answer

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}
// Revert check for state-changing calls: ethers v6 rejects the send at the
// estimateGas stage, and Ganache's estimateGas error often does NOT carry the
// revert reason string. So: (1) the real tx must reject, and (2) a staticCall
// of the same call (eth_call, which returns the revert reason) must reject
// with the expected reason. For view calls, txFn == staticFn is fine.
async function expectRevert(name, txFn, staticFn, reason) {
  let txReverted = false;
  try {
    await txFn();
  } catch {
    txReverted = true;
  }
  let reasonOk = true;
  if (staticFn) {
    reasonOk = false;
    try {
      await staticFn();
    } catch (e) {
      reasonOk = new RegExp(reason).test(e.message);
    }
  }
  check(
    name,
    txReverted && reasonOk,
    !txReverted ? "UNEXPECTED SUCCESS (expected revert)" : reasonOk ? `reverted: ${reason}` : "tx reverted but reason not confirmed"
  );
}

function load(name) {
  return {
    abi: JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.abi.json`), "utf8")),
    bytecode: fs.readFileSync(path.join(__dirname, `${name}.bytecode.txt`), "utf8").trim(),
  };
}

(async () => {
  const provider = new ethers.BrowserProvider(
    Ganache.provider({ chain: { chainId: 56, hardfork: "shanghai" }, logging: { quiet: true } })
  );
  const deployer = await provider.getSigner(0);
  const recipient = await provider.getSigner(9); // local stand-in for the project wallet
  const recipientAddr = await recipient.getAddress();
  const signers = [];
  for (let i = 1; i <= 8; i++) signers.push(await provider.getSigner(i));

  // --- Deploy mocks -------------------------------------------------------
  const mockDeep = load("MockDEEP");
  const mockRegistry = load("MockRegistry");
  const mockFeed = load("MockFeed");
  const deepMintTest = load("DeepMintTest");

  const deep = await new ethers.ContractFactory(mockDeep.abi, mockDeep.bytecode, deployer).deploy(
    ethers.parseEther("200000000")
  );
  await deep.deploymentTransaction().wait();
  const registry = await new ethers.ContractFactory(mockRegistry.abi, mockRegistry.bytecode, deployer).deploy();
  await registry.deploymentTransaction().wait();
  const now = (await provider.getBlock("latest")).timestamp;
  const feed = await new ethers.ContractFactory(mockFeed.abi, mockFeed.bytecode, deployer).deploy(
    FEED_ANSWER,
    now
  );
  await feed.deploymentTransaction().wait();
  const deepAddr = await deep.getAddress();
  const registryAddr = await registry.getAddress();
  const feedAddr = await feed.getAddress();
  console.log("Mocks deployed: DEEP", await deep.getAddress(), "| registry", await registry.getAddress(), "| feed", await feed.getAddress());

  // Register Agent IDs: signer1="test", signer2="alice", signer3="bob", signer4="carol",
  // signer5="dave", signer6="erin", signer7="frank". signer8 has NO Agent ID.
  const handles = ["test", "alice", "bob", "carol", "dave", "erin", "frank"];
  for (let i = 0; i < handles.length; i++) {
    await (await registry.setAgentId(handles[i], await signers[i].getAddress())).wait();
  }
  const agentId = (h) => ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(h)));

  // --- Deploy two DeepMintTest instances ----------------------------------
  // A: production cap (10,000) — quota / price / refund tests.
  // B: tiny cap (3) — cap test without 10,000 transactions.
  const factory = new ethers.ContractFactory(deepMintTest.abi, deepMintTest.bytecode, deployer);
  const mintA = await factory.deploy(await deep.getAddress(), await registry.getAddress(), await feed.getAddress(), recipientAddr, 10000);
  await mintA.deploymentTransaction().wait();
  const mintB = await factory.deploy(await deep.getAddress(), await registry.getAddress(), await feed.getAddress(), recipientAddr, 3);
  await mintB.deploymentTransaction().wait();
  // Fund both with DEEP (plain ERC-20 transfers, like the real funding step).
  await (await deep.transfer(await mintA.getAddress(), ethers.parseEther("200000"))).wait();
  await (await deep.transfer(await mintB.getAddress(), ethers.parseEther("30000"))).wait();
  console.log("DeepMintTest A (cap 10000):", await mintA.getAddress());
  console.log("DeepMintTest B (cap 3):", await mintB.getAddress());

  // --- 1) Price math ------------------------------------------------------
  console.log("\n[1] Price math");
  const price = await mintA.priceWei();
  check("priceWei() == (1e8 * 1e18) / 58889000000", price === EXPECTED_PRICE, `${price.toString()} wei (~${ethers.formatEther(price)} BNB)`);

  // --- 2) Free mint -------------------------------------------------------
  console.log("\n[2] Free mint (instance A)");
  const s1 = signers[0]; // "test"
  check("hasAgentId(test holder)", await mintA.hasAgentId(await s1.getAddress()));
  check("hasAgentId(no-ID signer)", !(await mintA.hasAgentId(await signers[7].getAddress())));
  check("freeClaimable before == 5000 DEEP", (await mintA.freeClaimable(await s1.getAddress())) === ethers.parseEther("5000"));
  const txFree = await mintA.connect(s1).mintFree();
  const rcFree = await txFree.wait();
  check("mintFree gas", rcFree.gasUsed > 0n, `${rcFree.gasUsed.toString()} gas`);
  check("free mint pays 5000 DEEP", (await deep.balanceOf(await s1.getAddress())) === ethers.parseEther("5000"));
  check("freeClaimedByAgentId set", await mintA.freeClaimedByAgentId(agentId("test")));
  check("freeClaimable after == 0", (await mintA.freeClaimable(await s1.getAddress())) === 0n);
  check("totalMints == 1", (await mintA.totalMints()) === 1n);
  await expectRevert("2nd free mint same Agent ID reverts", () => mintA.connect(s1).mintFree(), () => mintA.connect(s1).mintFree.staticCall(), "already claimed");
  await expectRevert("free mint without Agent ID reverts", () => mintA.connect(signers[7]).mintFree(), () => mintA.connect(signers[7]).mintFree.staticCall(), "no Agent ID");

  // --- 3) Paid mint: exact price, refund, forwarding ----------------------
  console.log("\n[3] Paid mint (instance A)");
  const s2 = signers[1]; // "alice"
  const alice = await s2.getAddress();
  check("paidMintsRemaining before == 10", (await mintA.paidMintsRemaining(agentId("alice"))) === 10n);
  await expectRevert("paid mint with insufficient BNB reverts", () => mintA.connect(s2).mintPaid({ value: price - 1n }), () => mintA.connect(s2).mintPaid.staticCall({ value: price - 1n }), "insufficient BNB");

  // Exact-price mint: recipient must gain exactly `price`, contract keeps 0 BNB.
  const recipBefore = await provider.getBalance(recipientAddr);
  const txPaid = await mintA.connect(s2).mintPaid({ value: price });
  const rcPaid = await txPaid.wait();
  const recipAfter = await provider.getBalance(recipientAddr);
  check("mintPaid gas", rcPaid.gasUsed > 0n, `${rcPaid.gasUsed.toString()} gas`);
  check("paid mint pays 10000 DEEP", (await deep.balanceOf(alice)) === ethers.parseEther("10000"));
  check("recipient receives exactly priceWei", recipAfter - recipBefore === price, `${ethers.formatEther(recipAfter - recipBefore)} BNB`);
  check("contract holds 0 BNB after exact mint", (await provider.getBalance(await mintA.getAddress())) === 0n);
  check("paidMintsByAgentId == 1", (await mintA.paidMintsByAgentId(agentId("alice"))) === 1n);
  check("paidMintsRemaining == 9", (await mintA.paidMintsRemaining(agentId("alice"))) === 9n);
  check("totalMints == 2", (await mintA.totalMints()) === 2n);
  // Event check
  const paidLog = rcPaid.logs.map((l) => { try { return mintA.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "PaidMint");
  check("PaidMint event emitted", !!paidLog && paidLog.args.minter === alice && paidLog.args.agentId === agentId("alice") && paidLog.args.amount === ethers.parseEther("10000") && paidLog.args.priceWei === price);

  // Overpayment mint (2x price): minter's net BNB cost must be exactly price + gas.
  const balBefore = await provider.getBalance(alice);
  const recipBefore2 = await provider.getBalance(recipientAddr);
  const txOver = await mintA.connect(s2).mintPaid({ value: price * 2n });
  const rcOver = await txOver.wait();
  const balAfter = await provider.getBalance(alice);
  const gasCost = rcOver.gasUsed * rcOver.gasPrice;
  check("overpayment refunded (net cost == price + gas)", balBefore - balAfter === price + gasCost, `overpaid ${ethers.formatEther(price * 2n)}, net cost ${ethers.formatEther(balBefore - balAfter)} BNB`);
  check("recipient still receives exactly priceWei", (await provider.getBalance(recipientAddr)) - recipBefore2 === price);
  check("contract holds 0 BNB after overpaid mint", (await provider.getBalance(await mintA.getAddress())) === 0n);

  // --- 4) Paid limit: 10 per Agent ID -------------------------------------
  console.log("\n[4] Paid limit 10 per Agent ID (instance A)");
  for (let i = 0; i < 8; i++) {
    await (await mintA.connect(s2).mintPaid({ value: price })).wait();
  }
  check("10 paid mints used", (await mintA.paidMintsByAgentId(agentId("alice"))) === 10n);
  check("paidMintsRemaining == 0", (await mintA.paidMintsRemaining(agentId("alice"))) === 0n);
  check("alice DEEP balance == 100000", (await deep.balanceOf(alice)) === ethers.parseEther("100000"));
  await expectRevert("11th paid mint reverts", () => mintA.connect(s2).mintPaid({ value: price }), () => mintA.connect(s2).mintPaid.staticCall({ value: price }), "paid limit reached");
  // Another Agent ID is unaffected by alice's exhausted quota.
  const s3 = signers[2]; // "bob"
  await (await mintA.connect(s3).mintPaid({ value: price })).wait();
  check("other Agent ID can still mint paid", (await mintA.paidMintsByAgentId(agentId("bob"))) === 1n);

  // --- 5) Quota follows the Agent ID, not the wallet -----------------------
  console.log("\n[5] Quota is per Agent ID (transfer test)");
  // Move Agent ID "test" from signer1 to signer8 (no-ID wallet).
  await (await registry.setAgentId("test", await signers[7].getAddress())).wait();
  check("new owner hasAgentId", await mintA.hasAgentId(await signers[7].getAddress()));
  await expectRevert("new owner of 'test' cannot re-claim free", () => mintA.connect(signers[7]).mintFree(), () => mintA.connect(signers[7]).mintFree.staticCall(), "already claimed");

  // --- 6) Cap: instance B (maxMints = 3) ----------------------------------
  console.log("\n[6] Total cap (instance B, maxMints = 3)");
  check("remainingMints() before == 3", (await mintB.remainingMints()) === 3n);
  await (await mintB.connect(signers[3]).mintFree()).wait(); // carol free
  await (await mintB.connect(signers[4]).mintPaid({ value: price })).wait(); // dave paid
  await (await mintB.connect(signers[5]).mintFree()).wait(); // erin free
  check("totalMints == 3 (cap reached)", (await mintB.totalMints()) === 3n);
  check("remainingMints() == 0", (await mintB.remainingMints()) === 0n);
  check("freeClaimable == 0 at cap", (await mintB.freeClaimable(await signers[6].getAddress())) === 0n);
  await expectRevert("mintFree at cap reverts", () => mintB.connect(signers[6]).mintFree(), () => mintB.connect(signers[6]).mintFree.staticCall(), "cap reached");
  await expectRevert("mintPaid at cap reverts", () => mintB.connect(signers[6]).mintPaid({ value: price }), () => mintB.connect(signers[6]).mintPaid.staticCall({ value: price }), "cap reached");

  // --- 7) Feed protection: stale + non-positive ----------------------------
  console.log("\n[7] Feed protection (instance A)");
  const blockNow = (await provider.getBlock("latest")).timestamp;
  await (await feed.setUpdatedAt(blockNow - 3601)).wait(); // 1h + 1s old
  await expectRevert("priceWei() reverts on stale feed", () => mintA.priceWei(), () => mintA.priceWei(), "stale price");
  await expectRevert("mintPaid reverts on stale feed", () => mintA.connect(s3).mintPaid({ value: price }), () => mintA.connect(s3).mintPaid.staticCall({ value: price }), "stale price");
  await (await feed.setUpdatedAt(blockNow)).wait(); // restore fresh
  check("priceWei() works again after restore", (await mintA.priceWei()) === EXPECTED_PRICE);
  await (await feed.setAnswer(0)).wait();
  await expectRevert("priceWei() reverts on zero answer", () => mintA.priceWei(), () => mintA.priceWei(), "bad price");
  await expectRevert("mintPaid reverts on zero answer", () => mintA.connect(s3).mintPaid({ value: price }), () => mintA.connect(s3).mintPaid.staticCall({ value: price }), "bad price");
  await (await feed.setAnswer(-100)).wait();
  await expectRevert("priceWei() reverts on negative answer", () => mintA.priceWei(), () => mintA.priceWei(), "bad price");
  await (await feed.setAnswer(FEED_ANSWER)).wait(); // restore
  check("priceWei() works again after answer restore", (await mintA.priceWei()) === EXPECTED_PRICE);

  // --- 8) Views + no-receive guard ----------------------------------------
  console.log("\n[8] Views + misc");
  check("deepBalance() tracks inventory", (await mintA.deepBalance()) === ethers.parseEther("200000") - ethers.parseEther("115000"), `${ethers.formatEther(await mintA.deepBalance())} DEEP left`);
  check("remainingMints() on A == 10000 - 12", (await mintA.remainingMints()) === 9988n);
  await expectRevert("direct BNB send reverts (no receive/fallback)", async () => signers[0].sendTransaction({ to: await mintA.getAddress(), value: 1n }), null, "");
  await expectRevert("zero-recipient deploy reverts", () => factory.deploy(deepAddr, registryAddr, feedAddr, ethers.ZeroAddress, 10000), null, "");

  // --- Summary ------------------------------------------------------------
  console.log(`\nCAP TEST DONE: ${passed} passed, ${failed} failed`);
  await provider.destroy();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("CAP TEST FAILED:", e.message ? e.message.slice(0, 500) : e);
  process.exit(1);
});
