# DEEP BNB (DEEP) — Smart Contract

ERC-20 token for the DEEP BNB project on **BNB Chain (chainId 56)**, with an
on-chain **Agent ID airdrop**.

| Item | Value |
| --- | --- |
| Token name | DEEP BNB |
| Symbol | DEEP |
| Decimals | 18 |
| Total supply (fixed) | 1,000,000,000 DEEP (`1e9 * 10**18`) |
| Airdrop pool | 300,000,000 DEEP (30%), minted to the contract itself |
| Deployer allocation | 700,000,000 DEEP (70%), minted to the deployer |
| Claim per Agent ID | 1,000 DEEP |
| Agent ID registry | SPACE ID `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (immutable constant) |

## How the Agent ID airdrop works

- **Verification (`hasAgentId`)**: the contract reads the caller's handle from
  the SPACE ID registry (`handleOf`), derives the Agent ID tokenId as
  `uint256(keccak256(bytes(handle)))`, and checks that the registry reports
  the caller as `ownerOf` that tokenId. All three conditions must hold.
  The function never reverts: it returns `false` if the registry is not
  deployed on the chain, the account has no handle, the token does not exist,
  or a registry call fails.
- **Claim (`claimAirdrop`)**: verified Agent ID holders claim 1,000 DEEP.
  One claim per **Agent ID tokenId** (not per wallet) — tracked in
  `claimedByAgentId`. If an Agent ID is transferred, the new owner cannot
  claim again. Follows checks-effects-interactions: the claim is marked
  **before** the transfer. Emits `AirdropClaimed(claimer, agentId, amount)`.
- **Views**: `claimable(account)` returns 1,000 DEEP if the account holds an
  unclaimed Agent ID, else 0. `remainingAirdrop()` returns the contract's
  DEEP balance (the unclaimed pool).
- **No minting after deploy.** No owner, no pause, no blacklist.
- **Design decision — no rescue/withdraw:** there is deliberately NO function
  that can move tokens out of the airdrop pool except `claimAirdrop()`.
  Unclaimed airdrop tokens stay in the contract forever; nobody — not even
  the deployer — can withdraw them. This guarantees the 30% allocation can
  only ever reach Agent ID holders.

The remaining 70% (deployer allocation) covers the planned distribution,
executed off-chain / manually after deployment: 20% liquidity (locked), 20%
ecosystem grants, 15% team vesting, 10% treasury, 5% hackathon / marketing.

## Toolchain (exact versions used)

| Tool | Version |
| --- | --- |
| solc (solc-js, local npm package) | **0.8.38+commit.1835d247** (`solc` npm package 0.8.38) |
| OpenZeppelin Contracts | **5.6.1** (`@openzeppelin/contracts`) |
| Compiler settings | optimizer **enabled, 200 runs** · EVM version **shanghai** |
| Node.js | 24.22.1 |

> EVM version note: `shanghai` is pinned deliberately (solc 0.8.38 defaults to
> `prague`). BSC has supported Shanghai since the Kepler hardfork (Jan 2024)
> and Cancun since Haber (Jun 2024), so a Shanghai target is fully
> BSC-compatible and the most conservative choice.

### Install (local, no global install needed)

```bash
cd contracts
npm install            # installs @openzeppelin/contracts + solc from package.json
```

Or from scratch: `npm init -y && npm install --save @openzeppelin/contracts solc`
(for the gas/fork test scripts also: `npm install --save-dev ganache ethers`).

### Compile

```bash
npm run compile        # node compile.js — writes DeepBNB.abi.json + bytecode files
```

Compilation verified 2026-11-18: **success, 0 errors, 0 warnings.**
Creation bytecode 4,612 bytes; deployed bytecode 3,644 bytes.

### Tests (all local — no real chain, no real keys)

```bash
npm run gas            # deploys on an in-memory Ganache chain, prints gas + sanity checks
npm run test:fork      # deploys on a local fork of BSC mainnet, exercises the
                       # real Agent ID registry (needs rpc-forwarder.js running:
                       # node rpc-forwarder.js 8546 — Ganache ignores proxy env vars)
```

Fork test result (2026-11-18, against live BSC registry state): `handleOf`
returns `"viss"` for the test holder, `ownerOf(keccak256("viss"))` matches,
`hasAgentId` true, claim of 1,000 DEEP succeeds, double-claim and non-holder
claim both revert as expected.

## Gas estimates (measured, not guessed)

Measured with `measure-gas.js` (local Ganache, chainId 56, Shanghai) and
`test-fork.js` (local BSC mainnet fork). `eth_estimateGas` matched actual
`gasUsed` exactly for the deployment.

| Operation | Gas |
| --- | --- |
| Deploy `DeepBNB` | **972,315** |
| `claimAirdrop()` (first claim) | **87,959** |
| `transfer()` (sample, to a fresh address) | 51,353 |

**Deployment cost in BNB** (BSC gas price varies — check the live price before
deploying; formula: `972,315 × gasPrice`):

| Gas price | Deploy cost |
| --- | --- |
| 1 gwei | ≈ 0.000972 BNB |
| 3 gwei | ≈ 0.002917 BNB |
| 5 gwei | ≈ 0.004862 BNB |

## Deploy (Remix, step by step)

1. Open [remix.ethereum.org](https://remix.ethereum.org) → create
   `DeepBNB.sol`, paste the contents of this repo's `DeepBNB.sol`.
2. **Compiler** (left sidebar, Solidity Compiler):
   - Compiler version: **0.8.38+commit.1835d247** (select the exact version).
   - Check **Enable optimization**, runs: **200**.
   - EVM Version: **shanghai**.
   - Language: Solidity. Click **Compile DeepBNB.sol**. Expect 0 errors.
   - The `@openzeppelin/...` import resolves automatically in Remix (it
     fetches the package from npm). If it does not, import the file from
     GitHub instead or use the Hardhat route below.
3. **Deploy**: open "Deploy & Run Transactions". Environment: **Injected
   Provider — MetaMask**. Connect MetaMask on **BNB Smart Chain Mainnet**
   (chainId 56). Make sure the deployer wallet holds enough BNB for gas
   (see table above; keep a small margin).
4. Select contract **DeepBNB**, click **Deploy**, confirm in MetaMask.
   The constructor takes **no arguments**.
5. **Verify the deployment** (read-only calls on the deployed contract):
   `totalSupply()` = 1,000,000,000 DEEP; `balanceOf(<contract>)` =
   300,000,000 DEEP; `balanceOf(<deployer>)` = 700,000,000 DEEP;
   `remainingAirdrop()` = 300,000,000 DEEP.
6. **Save the contract address + transaction hash** — you need both for
   verification and for the hackathon submission.

### Alternative: Hardhat script (short)

```bash
npm init -y && npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init # choose "Create a JavaScript project", accept defaults
cp DeepBNB.sol contracts/
# hardhat.config.js: solidity { version "0.8.38", settings { optimizer { enabled true, runs 200 }, evmVersion "shanghai" } },
# networks.bsc = { url: "https://bsc-dataseed.binance.org", chainId: 56, accounts: ["<DEPLOYER_PRIVATE_KEY>"] }
npx hardhat run --network bsc scripts/deploy.js
```

`scripts/deploy.js`:

```js
const hre = require("hardhat");
async function main() {
  const DeepBNB = await hre.ethers.getContractFactory("DeepBNB");
  const deep = await DeepBNB.deploy();
  await deep.waitForDeployment();
  console.log("DeepBNB deployed to:", await deep.getAddress());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

> **Never commit a private key.** Use an environment variable
> (`process.env.DEPLOYER_KEY`) or Hardhat's encrypted keystore. The deployer
> key is not needed for anything in this repo — compilation and tests use no
> keys at all.

### Alternative: Foundry script (short)

```bash
forge init # or: forge install OpenZeppelin/openzeppelin-contracts@v5.6.1
cp DeepBNB.sol src/DeepBNB.sol
# foundry.toml: solc = "0.8.38", optimizer = true, optimizer_runs = 200, evm_version = "shanghai"
forge build
forge create --rpc-url https://bsc-dataseed.binance.org --private-key $DEPLOYER_KEY src/DeepBNB.sol:DeepBNB
```

## Verify on BscScan (do this right after deploying)

Source verification is required for the hackathon submission and lets anyone
audit the contract. Use **exactly** the settings below — any mismatch fails
verification:

| Field | Value |
| --- | --- |
| Contract address | the deployed address from the deploy step |
| Compiler type | Solidity (Single file) *or* Solidity (Standard-JSON-Input) |
| Compiler version | **v0.8.38+commit.1835d247** (exact) |
| Open Source License Type | MIT |
| Optimization | **Yes, 200 runs** |
| EVM Version | **shanghai** |
| Constructor arguments | **none** (leave empty — the constructor takes no args) |

Recommended path: **Standard-JSON-Input** with the exact standard JSON used
to compile (see `compile.js` — same `language`, `settings`, and source
contents), or flatten with `npx hardhat flatten` and verify as a single file.
After verification, confirm on BscScan that the "Read Contract" tab shows
`TOTAL_SUPPLY` = 1000000000000000000000000000 and `AIRDROP_POOL` =
300000000000000000000000000.

## DeepMint — Agent ID mint contract (built, pending deployment)

`DeepMint.sol` is the mint contract for DEEP: Agent ID holders mint DEEP
directly from a funded pool — paid ($1 in BNB) or free — without touching
the token contract (immutable). **Status: built, compiled, fork-tested;
NOT deployed. Deployment needs Rafeal's explicit go-ahead.**

| Item | Value |
| --- | --- |
| Paid mint | $1 in BNB (Chainlink BNB/USD) → **10,000 DEEP**, max **10 per Agent ID** |
| Free mint | **5,000 DEEP**, once per Agent ID (separate from the token's 1,000 DEEP airdrop) |
| Total cap | **10,000 mints** (paid + free combined) |
| Price feed | Chainlink BNB/USD `0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE` (8 decimals) |
| Price formula | `priceWei = (1e8 × 1e18) / feedAnswer` — at $588.81 ≈ **0.00169834 BNB** per paid mint |
| BNB recipient | Project wallet `0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81` (constructor arg, immutable) |
| Funding needed | **100,000,000 DEEP** transferred to the contract after deploy (max outflow) |
| Predicted CREATE2 address | `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC` (salt `keccak256("DEEP-MINT-v1")`) |

### Rules

- **Agent ID only.** Both `mintPaid()` and `mintFree()` verify the caller
  on-chain against the SPACE ID registry (same `hasAgentId` pattern as
  DeepBNB). Quotas are tracked per **Agent ID tokenId**, not per wallet —
  if an Agent ID is transferred, its quota moves with it.
- **Paid mint:** `msg.value` must be ≥ `priceWei()` ($1 at the live feed).
  Exactly `priceWei` is forwarded to the recipient **inside the same
  transaction**; any excess is refunded to the caller. The contract never
  holds BNB — there is **no withdraw/owner function** (no Ownable), and no
  receive/fallback, so BNB sent directly reverts instead of getting stuck.
- **Free mint:** one 5,000 DEEP claim per Agent ID, no BNB needed. It does
  not read the price feed, so it works even when the feed is stale.
- **Cap:** a single `totalMints` counter (paid + free). At 10,000, both
  mint functions revert.
- **Price protection:** `priceWei()` reverts if the feed has no code, the
  answer is ≤ 0, `updatedAt` is zero/future, or the answer is older than
  1 hour (`MAX_FEED_AGE = 3600`).
- **Safety:** checks-effects-interactions (counters updated before any
  transfer) + OpenZeppelin `ReentrancyGuard` on both mint functions; every
  external call (DEEP transfer, BNB forward, refund) is checked and reverts
  on failure. Events `PaidMint` / `FreeMint` are emitted per mint.

### Tokenomics math

- Worst-case outflow: 10,000 paid mints × 10,000 DEEP = **100,000,000 DEEP**
  — that is why the contract is funded with 100M DEEP. (If every mint were
  free, outflow would be only 50M; the 100M funding covers the maximum.)
- Worst-case BNB revenue: 10,000 × $1 = **$10,000**, all forwarded to the
  project wallet as mints happen.
- Per Agent ID maximum: 10 paid × 10,000 + 1 free × 5,000 = **105,000 DEEP**
  (+ 1,000 DEEP from the separate token airdrop = 106,000 DEEP total).
- At $588.81/BNB, $1 = 1,698,338,085,967,162 wei ≈ 0.00169834 BNB per paid
  mint. Integer division rounds down < 1 wei in the minter's favour.

### Compile & test

```bash
npm run compile:mint   # node compile-mint.js — writes DeepMint.abi.json + bytecode files
npm run gas:mint       # local Ganache deploy gas + sanity checks
npm run test:cap       # local Ganache unit test of cap/limit/feed logic (mock contracts)
npm run test:fork:mint # BSC mainnet fork test (needs rpc-forwarder.js running on 8546)
npm run deploy-prep:mint  # read-only: CREATE2 prediction + factory-call simulation
```

Compilation verified 2026-11-18: **success, 0 errors, 0 warnings.**
Creation bytecode 5,425 bytes; deployed bytecode 5,160 bytes.

Cap unit test (`test-cap-local.js`, mocks in `mocks/Mocks.sol`, test-only
`DeepMintTest.sol` with injectable addresses): **48 passed, 0 failed** —
price math, free/paid flows, 11th paid mint revert, quota following the
Agent ID across a transfer, cap reached (mixed free+paid), stale/zero/
negative feed reverts.

Fork test (`test-fork-mint.js`, 2026-11-18, against live BSC state):
**38/38 passed** — paid mint (exact + 2× overpay with full refund), free
mint + double-claim revert, 10 paid mints then 11th revert, non-Agent-ID
revert on both mints, stale price revert after `evm_increaseTime(3601)`
(free mint still works), final state `totalMints` = 11.

### Gas (measured)

| Operation | Gas |
| --- | --- |
| Deploy `DeepMint` (local + fork, identical) | **1,194,110** |
| `mintPaid()` (first, fork) | **126,577** |
| `mintFree()` (first, fork) | **82,890** |
| Deploy via CREATE2 factory (est., `eth_estimateGas`) | **1,218,145** |

Deploy cost at 0.05 gwei ≈ **0.000061 BNB** (check the live gas price
before deploying; formula: `1,218,145 × gasPrice`).

### Deploy (same path as DeepBNB — Binance wallet cannot send contract-creation txs)

1. Run `npm run deploy-prep:mint` to re-verify the prediction fresh:
   salt `keccak256("DEEP-MINT-v1")`, predicted address
   `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC`, factory calldata in
   `deploy-prep-mint.json`. Confirm the predicted address is still empty
   and the factory `eth_call` simulation still succeeds.
2. Deploy via the deterministic CREATE2 proxy
   `0x4e59b44847b379578588920cA78FbF26c0B4956C` (a `baw contract-call` to
   the proxy with calldata = salt + initCode, where initCode is the
   creation bytecode + the ABI-encoded `recipient` constructor argument).
   Preview first (simCode `000000000`, no risks), execute exactly once.
3. Verify on-chain: code at the predicted address; `recipient()` =
   `0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81`; `remainingMints()` =
   10,000; `deepBalance()` = 0 (before funding).
4. **Fund the contract:** transfer **100,000,000 DEEP** from the project
   wallet to the DeepMint address (a plain ERC-20 `transfer` — no special
   funding function). Verify `deepBalance()` = 100,000,000 DEEP. Minting
   reverts with "DEEP depleted" until the contract is funded.
5. **Verify on BscScan** with the same settings as DeepBNB (v0.8.38+
   commit.1835d247, optimizer 200 runs, shanghai, Standard-JSON-Input),
   plus the constructor argument: `recipient` =
   `0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81` (ABI-encoded, 32 bytes).
   Sourcify verification uses the same standard JSON (see
   `verify-sourcify.mjs` for the DeepBNB pattern).

## Files

| File | Purpose |
| --- | --- |
| `DeepBNB.sol` | The token contract (the only file needed to deploy) |
| `DeepMint.sol` | The Agent ID mint contract (paid $1 → 10,000 DEEP, free 5,000 DEEP, cap 10,000) — built, pending deployment |
| `DeepMintTest.sol` | TEST ONLY — DeepMint logic with injectable addresses + configurable cap (for `test-cap-local.js`) |
| `mocks/Mocks.sol` | TEST ONLY — MockRegistry, MockFeed, MockDEEP for local unit tests |
| `compile.js` | Compiles with solc-js (resolves `@openzeppelin` imports), writes ABI + bytecode |
| `compile-mint.js` | Compiles DeepMint.sol (same settings), writes DeepMint ABI + bytecode |
| `measure-gas.js` | Local Ganache deploy: exact deploy gas + sanity checks |
| `measure-gas-mint.js` | Local Ganache deploy of DeepMint: exact deploy gas + sanity checks |
| `test-fork.js` | BSC mainnet fork test of the Agent ID claim flow (local only) |
| `test-fork-mint.js` | BSC mainnet fork test of DeepMint (38 checks, local only) |
| `test-cap-local.js` | Local Ganache unit test of DeepMint cap/limit/feed logic (48 checks) |
| `deploy-prep-mint.mjs` | Read-only CREATE2 deploy prep for DeepMint (prediction + factory simulation) |
| `deploy-prep-mint.json` | Deploy-prep output: salt, predicted address, calldata, gas estimate |
| `test-fork-mint.log` | Log of the last fork-test run (38/38) |
| `rpc-forwarder.js` | Local JSON-RPC forwarder so Ganache's fork client works behind a proxy |
| `DeepBNB.abi.json`, `DeepBNB.bytecode.txt`, `DeepBNB.deployed-bytecode.txt` | Build outputs from `compile.js` |
| `DeepMint.abi.json`, `DeepMint.bytecode.txt`, `DeepMint.deployed-bytecode.txt` | Build outputs from `compile-mint.js` |
| `package.json`, `package-lock.json` | Pinned dependencies (`@openzeppelin/contracts` 5.6.1, `solc` 0.8.38) |
