# DEEP BNB

**Deep liquidity for the agent economy.**

DEEP BNB is the economic coordination layer for AI agents with Agent ID
(.ai identity) on BNB Chain. It gives verified agents shared deep liquidity,
on-chain reputation through staking, fair launchpad access, and a settlement
token for agent-to-agent services.

Built for the **Agent ID Hackathon** (Binance Wallet + BNB Chain).
Submission deadline: 9 December 2026.

- **Website:** https://muse.ai/s/deep-bnb-zu6fxl2eu7ixn/50uBC6EmNtwBrdKAGM1sIqJe88YKlA30XsoVQVzKy-8
- **X:** https://x.com/coremsn9099 (@coremsn9099)
- **Founder:** Rafeal

## Live contracts (BNB Chain, chainId 56)

| Contract | Address | BscScan |
|---|---|---|
| DEEP token (ERC-20, "DEEP BNB" / DEEP) | `0x8faa6ca42a3b56297e1c96144352327bbbf75fc6` | [BscScan](https://bscscan.com/address/0x8faa6ca42a3b56297e1c96144352327bbbf75fc6) |
| DeepMint (Agent ID mint) | `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC` | [BscScan](https://bscscan.com/address/0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC) |

Both contracts are source-verified on BscScan ("Source Code Verified" +
"Exact Match" badge) and on Sourcify (exact match, creation + runtime).
Compiler: solc v0.8.38+commit.1835d247, optimizer 200 runs, EVM version
shanghai, OpenZeppelin 5.6.1.

- **Token:** DEEP — 18 decimals, fixed supply 1,000,000,000, no mint after
  deploy, no owner.
- **DeepMint:** funded with 100,000,000 DEEP. Minting is live.

## What is DEEP BNB?

Agent activity today is fragmented: every launchpad and mint is isolated, with
no shared liquidity, no on-chain reputation, and no way for verified agents to
pool capital or share upside. DEEP BNB fixes this with four pillars:

1. **Verified-only deep liquidity pools** — only agents holding a verified
   .ai Agent ID can provide liquidity in curated pools.
2. **Reputation staking** — stake DEEP to build on-chain agent reputation
   bound to your .ai handle; reputation unlocks allocations, lower fees, and
   governance weight.
3. **Launchpad access** — verified agents get fair, bot-resistant allocations
   in new agent-token launches.
4. **Agent payments** — DEEP is the settlement token for agent-to-agent
   services (compute, data, tasks).

### Agent ID integration (on-chain, real)

Both contracts verify Agent ID directly against the SPACE ID registry
(`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`):

- **DEEP token** — `hasAgentId(address)` resolves `handleOf` +
  `ownerOf(keccak256(handle))`; `claimAirdrop()` pays **1,000 DEEP per
  Agent ID**, one claim per Agent ID, drawn from a 300,000,000 DEEP pool
  held by the contract itself.
- **DeepMint** — Agent ID-gated mint, quotas tracked per Agent ID tokenId:
  - **Paid mint:** $1 in BNB (Chainlink BNB/USD feed) → **10,000 DEEP**,
    max 10 paid mints per Agent ID. Overpayment is refunded in full; the
    exact price is forwarded to the project wallet in the same transaction.
  - **Free mint:** **5,000 DEEP once per Agent ID**.
  - **Total cap:** 10,000 mints (paid + free combined).
  - No owner, no withdraw — BNB goes straight to the project wallet and
    DEEP can only leave via mints.

## Build & test

Requires Node.js 18+.

```bash
cd contracts
npm install

# Compile both contracts (solc 0.8.38, optimizer 200 runs)
npm run compile
npm run compile:mint

# Gas measurements
npm run gas
npm run gas:mint

# Tests — BSC mainnet fork against the live SPACE ID registry
# and Chainlink BNB/USD feed (38/38 mint tests pass), plus a
# local 48-case cap/edge-case suite
npm run test:fork
npm run test:fork:mint
npm run test:cap
```

See [`contracts/README.md`](contracts/) for the full deploy guide, gas
estimates, and BscScan/Sourcify verification steps. Both contracts were
deployed via the deterministic CREATE2 proxy
`0x4e59b44847b379578588920cA78FbF26c0B4956C` (the Binance Agentic Wallet
cannot send contract-creation transactions); deploy-prep scripts live in
`contracts/deploy-prep-mint.mjs`.

## Repository layout

```
deep-bnb/
├── README.md              — this file
├── overview.md            — full project overview + hackathon submission answers (Q1–Q18)
├── assets/
│   └── logo.jpg           — project logo (navy dolphin)
├── contracts/
│   ├── DeepBNB.sol        — ERC-20 token with on-chain Agent ID verification
│   ├── DeepMint.sol       — Agent ID-gated mint ($1 → 10,000 DEEP; free 5,000)
│   ├── DeepMintTest.sol   — test-only harness for the cap suite
│   ├── mocks/Mocks.sol    — MockDEEP / MockFeed / MockRegistry for local tests
│   ├── compile.js / compile-mint.js
│   ├── measure-gas.js / measure-gas-mint.js
│   ├── test-fork.js / test-fork-mint.js / test-cap-local.js
│   ├── rpc-forwarder.js   — local RPC forwarder for fork tests
│   ├── deploy-prep-mint.mjs / deploy-prep-mint.json
│   ├── verify-sourcify.mjs / verify-mint-sourcify.mjs
│   └── README.md          — deploy guide, gas estimates, verification guide
└── video/
    └── storyboard.md      — 60-second demo video storyboard + narration script
```

The website is a hosted web artifact (product access link) and is not in
this repo; its content mirrors `overview.md`.

## Status

- [x] Project overview + submission answers
- [x] DEEP token deployed + verified (BscScan + Sourcify exact match)
- [x] DeepMint deployed + verified (BscScan + Sourcify exact match), funded with 100,000,000 DEEP — minting live
- [x] First on-chain Agent ID airdrop claim (1,000 DEEP)
- [x] Website (product access link) with live Agent ID checker + Mint section
- [x] Demo video storyboard + script
- [ ] Demo video production

## Tokenomics

Fixed supply: **1,000,000,000 DEEP**.

| Allocation | Share | Amount |
|---|---|---|
| Community rewards & Agent ID airdrop | 30% | 300,000,000 |
| Liquidity (locked) | 20% | 200,000,000 |
| Ecosystem grants | 20% | 200,000,000 |
| Team (2-year vesting, 6-month cliff) | 15% | 150,000,000 |
| Treasury / DAO | 10% | 100,000,000 |
| Hackathon & marketing | 5% | 50,000,000 |

## Contact

- **Team:** DEEP BNB
- **Email:** akunyutub7517@gmail.com
- **Telegram:** @kosuronothing
- **X:** @coremsn9099

## License

MIT — see the contract source headers.
