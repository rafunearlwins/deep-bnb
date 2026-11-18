// Measure EXACT deployment gas by deploying DeepMint on a local in-memory Ganache chain.
// Fully offline — no real chain, no real key. Usage: node measure-gas-mint.js
//
// NOTE: mintPaid/mintFree gas CANNOT be measured on this empty chain — there
// is no SPACE ID registry, no Chainlink feed, and no DEEP token here, so
// every mint reverts (hasAgentId returns false / priceWei reverts with
// "DeepMint: no feed"). Mint gas is measured by the fork test (another agent)
// against real BSC state. This script measures DEPLOYMENT gas only.
const fs = require("fs");
const path = require("path");
const Ganache = require("ganache");
const { ethers } = require("ethers");

(async () => {
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "DeepMint.abi.json"), "utf8"));
  const bytecode = fs.readFileSync(path.join(__dirname, "DeepMint.bytecode.txt"), "utf8").trim();
  // hardfork "shanghai": matches the compile target (evmVersion shanghai).
  // Ganache 7.9.2 does not support "cancun" as a hardfork name.
  const provider = new ethers.BrowserProvider(Ganache.provider({ chain: { chainId: 56, hardfork: "shanghai" }, logging: { quiet: true } }));
  const signer = await provider.getSigner(0);
  const RECIPIENT = await signer.getAddress(); // local signer only — NOT the real project wallet
  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  // 1) eth_estimateGas (what a wallet would show). MUST set `from`: without it
  // Ganache simulates the deploy as the zero address and the constructor's
  // non-zero-recipient check reverts.
  const deployTx = await factory.getDeployTransaction(RECIPIENT);
  deployTx.from = RECIPIENT;
  const estimate = await provider.estimateGas(deployTx);
  console.log("eth_estimateGas (deploy):", estimate.toString(), "gas");

  // 2) Actual deployment + receipt gasUsed
  const contract = await factory.deploy(RECIPIENT);
  const receipt = await contract.deploymentTransaction().wait();
  console.log("Actual gasUsed (deploy):", receipt.gasUsed.toString(), "gas");
  console.log("Deployed (local Ganache only):", await contract.getAddress());

  // 3) Sanity checks on the deployed contract
  console.log("RECIPIENT:", await contract.RECIPIENT());
  console.log("DEEP:", await contract.DEEP());
  console.log("AGENT_ID_REGISTRY:", await contract.AGENT_ID_REGISTRY());
  console.log("PRICE_FEED:", await contract.PRICE_FEED());
  console.log("PAID_AMOUNT:", ethers.formatEther(await contract.PAID_AMOUNT()), "DEEP");
  console.log("FREE_AMOUNT:", ethers.formatEther(await contract.FREE_AMOUNT()), "DEEP");
  console.log("MAX_PAID_PER_AGENT:", (await contract.MAX_PAID_PER_AGENT()).toString());
  console.log("MAX_MINTS:", (await contract.MAX_MINTS()).toString());
  console.log("MAX_FEED_AGE:", (await contract.MAX_FEED_AGE()).toString(), "seconds");
  console.log("totalMints:", (await contract.totalMints()).toString());
  console.log("remainingMints():", (await contract.remainingMints()).toString());
  console.log("deepBalance() on empty chain:", (await contract.deepBalance()).toString(), "(no DEEP token deployed here)");
  console.log("hasAgentId(deployer) on empty chain (expect false):", await contract.hasAgentId(RECIPIENT));
  console.log("freeClaimable(deployer) on empty chain (expect 0):", (await contract.freeClaimable(RECIPIENT)).toString());
  try {
    await contract.priceWei();
    console.log("priceWei(): !!! UNEXPECTED SUCCESS on empty chain !!!");
  } catch (e) {
    console.log("priceWei() reverts on empty chain as expected:", /no feed/.test(e.message) ? "DeepMint: no feed" : e.message.slice(0, 120));
  }

  // 4) Constructor rejects the zero recipient
  try {
    const bad = await factory.deploy(ethers.ZeroAddress);
    await bad.deploymentTransaction().wait();
    console.log("ZERO RECIPIENT DEPLOY: !!! UNEXPECTED SUCCESS !!!");
  } catch (e) {
    console.log("zero-recipient deploy reverted as expected");
  }

  // 5) Direct BNB transfer must revert (no receive/fallback)
  try {
    const tx = await signer.sendTransaction({ to: await contract.getAddress(), value: 1n });
    await tx.wait();
    console.log("DIRECT BNB SEND: !!! UNEXPECTED SUCCESS !!!");
  } catch (e) {
    console.log("direct BNB send reverted as expected (no receive/fallback)");
  }

  await provider.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
