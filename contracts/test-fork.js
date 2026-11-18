// Functional test of the Agent ID airdrop against a LOCAL FORK of BSC mainnet.
// No real transactions: everything runs on an in-memory Ganache fork. The fork
// gives us the REAL SPACE ID registry state, and the Agent ID holder account is
// unlocked locally (Ganache `unlockedAccounts`) so we can send test txs from it.
// Usage: node test-fork.js
const fs = require("fs");
const path = require("path");
const Ganache = require("ganache");
const { ethers } = require("ethers");

// Rafeal's Binance Agentic Wallet — holder of Agent ID "viss.ai" (per MEMORY.md).
const HOLDER = "0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81";
// A fresh address with no Agent ID (Ganache default account #1 is used instead).
const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const REGISTRY_ABI = [
  "function handleOf(address account) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

(async () => {
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "DeepBNB.abi.json"), "utf8"));
  const bytecode = fs.readFileSync(path.join(__dirname, "DeepBNB.bytecode.txt"), "utf8").trim();
  const provider = new ethers.BrowserProvider(
    Ganache.provider({
      // Fork via the local forwarder (see rpc-forwarder.js): Ganache ignores
      // proxy env vars, so it talks plain HTTP to localhost and the
      // forwarder relays to the real BSC RPC through the egress proxy.
      fork: { url: process.env.FORK_RPC_URL || "http://127.0.0.1:8546" },
      chain: { chainId: 56, hardfork: "shanghai" },
      wallet: { unlockedAccounts: [HOLDER] },
      logging: { quiet: true },
    })
  );

  const deployer = await provider.getSigner(0);
  const holder = await provider.getSigner(HOLDER);
  const stranger = await provider.getSigner(1);
  const strangerAddr = await stranger.getAddress();

  // Deploy DeepBNB on the fork (local only).
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const deep = await factory.deploy(HOLDER);
  await deep.deploymentTransaction().wait();
  console.log("DeepBNB deployed on fork:", await deep.getAddress());

  // 1) Registry state (real BSC data)
  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, provider);
  const handle = await registry.handleOf(HOLDER);
  console.log("handleOf(holder):", JSON.stringify(handle));
  const agentId = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(handle)));
  console.log("agentId = keccak256(handle):", agentId.toString());
  console.log("ownerOf(agentId):", await registry.ownerOf(agentId));
  console.log("ownerOf == holder:", (await registry.ownerOf(agentId)).toLowerCase() === HOLDER.toLowerCase());

  // 2) hasAgentId / claimable
  console.log("hasAgentId(holder):", await deep.hasAgentId(HOLDER));
  console.log("hasAgentId(stranger):", await deep.hasAgentId(strangerAddr));
  console.log("claimable(holder):", ethers.formatEther(await deep.claimable(HOLDER)), "DEEP");
  console.log("claimable(stranger):", ethers.formatEther(await deep.claimable(strangerAddr)), "DEEP");
  console.log("remainingAirdrop() before:", ethers.formatEther(await deep.remainingAirdrop()), "DEEP");

  // 3) Claim from the holder (real tx on the local fork)
  const balBefore = await deep.balanceOf(HOLDER);
  const tx = await deep.connect(holder).claimAirdrop();
  const receipt = await tx.wait();
  console.log("claimAirdrop tx gasUsed:", receipt.gasUsed.toString());
  const balAfter = await deep.balanceOf(HOLDER);
  console.log("holder DEEP before/after:", ethers.formatEther(balBefore), "->", ethers.formatEther(balAfter));
  console.log("claimedByAgentId(agentId):", await deep.claimedByAgentId(agentId));
  console.log("claimable(holder) after:", ethers.formatEther(await deep.claimable(HOLDER)), "DEEP");
  console.log("remainingAirdrop() after:", ethers.formatEther(await deep.remainingAirdrop()), "DEEP");

  // 4) Double claim must revert
  try {
    await deep.connect(holder).claimAirdrop();
    console.log("DOUBLE CLAIM: !!! UNEXPECTED SUCCESS !!!");
  } catch (e) {
    console.log("double claim reverted as expected:", /already claimed/.test(e.message) ? "DEEP: already claimed" : e.message.slice(0, 120));
  }

  // 5) Non-holder claim must revert
  try {
    await deep.connect(stranger).claimAirdrop();
    console.log("STRANGER CLAIM: !!! UNEXPECTED SUCCESS !!!");
  } catch (e) {
    console.log("stranger claim reverted as expected:", /no Agent ID/.test(e.message) ? "DEEP: no Agent ID" : e.message.slice(0, 120));
  }

  console.log("FORK TEST DONE");
  process.exit(0);
})().catch((e) => {
  console.error("FORK TEST FAILED:", e.message ? e.message.slice(0, 500) : e);
  process.exit(1);
});
