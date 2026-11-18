// Measure EXACT deployment gas by deploying DeepBNB on a local in-memory Ganache chain.
// Fully offline — no real chain, no real key. Usage: node measure-gas.js
const fs = require("fs");
const path = require("path");
const Ganache = require("ganache");
const { ethers } = require("ethers");

(async () => {
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "DeepBNB.abi.json"), "utf8"));
  const bytecode = fs.readFileSync(path.join(__dirname, "DeepBNB.bytecode.txt"), "utf8").trim();
  // hardfork "shanghai": matches the compile target (evmVersion shanghai).
  // Ganache 7.9.2 does not support "cancun" as a hardfork name.
  const provider = new ethers.BrowserProvider(Ganache.provider({ chain: { chainId: 56, hardfork: "shanghai" } }));
  const signer = await provider.getSigner(0);
  const HOLDER = await signer.getAddress();
  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  // 1) eth_estimateGas (what a wallet would show). MUST set `from`: without it
  // Ganache simulates the deploy as the zero address and _mint to address(0) reverts.
  const deployTx = await factory.getDeployTransaction(HOLDER);
  deployTx.from = await signer.getAddress();
  const estimate = await provider.estimateGas(deployTx);
  console.log("eth_estimateGas (deploy):", estimate.toString(), "gas");

  // 2) Actual deployment + receipt gasUsed
  const contract = await factory.deploy(HOLDER);
  const receipt = await contract.deploymentTransaction().wait();
  console.log("Actual gasUsed (deploy):", receipt.gasUsed.toString(), "gas");
  console.log("Deployed (local Ganache only):", await contract.getAddress());

  // 3) Sanity checks on the deployed contract
  console.log("name():", await contract.name());
  console.log("symbol():", await contract.symbol());
  console.log("decimals():", await contract.decimals());
  console.log("totalSupply():", (await contract.totalSupply()).toString());
  console.log("deployer balance:", (await contract.balanceOf(await signer.getAddress())).toString());
  console.log("contract balance (airdrop pool):", (await contract.balanceOf(await contract.getAddress())).toString());
  console.log("remainingAirdrop():", (await contract.remainingAirdrop()).toString());
  console.log("CLAIM_AMOUNT:", (await contract.CLAIM_AMOUNT()).toString());
  console.log("hasAgentId(deployer) on empty chain (expect false):", await contract.hasAgentId(await signer.getAddress()));

  // 4) A sample transfer cost (reference for users)
  const tx = await contract.transfer("0x000000000000000000000000000000000000dEaD", 1n);
  const tr = await tx.wait();
  console.log("Sample transfer gasUsed:", tr.gasUsed.toString(), "gas");
  await provider.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
