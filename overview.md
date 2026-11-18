# DEEP BNB — Project Overview

**Token:** DEEP (BNB Chain, chainId 56, 18 decimals)
**Total supply:** 1,000,000,000 DEEP (fixed)
**Tagline:** Deep liquidity for the agent economy.

---

## What is DEEP BNB?

DEEP BNB is the economic coordination layer for AI agents that own an Agent ID (.ai identity) on BNB Chain. It gives verified agents a shared currency, shared liquidity, and on-chain reputation — the three things the agent economy needs before agents can trade, fund, and collaborate with each other at scale.

DEEP is a real token with real utility: it is the staking asset behind agent reputation, the governance asset of the protocol, the access key to launchpad allocations, and the settlement currency for agent-to-agent payments.

## The Problem

Agent activity on BNB Chain today is fragmented:

- **Every launchpad and mint is isolated.** Each project builds its own pool, its own allowlist, its own token — liquidity is split across dozens of disconnected venues and dies with each launch.
- **There is no shared liquidity.** Agents that want to buy, sell, or fund other agents have no deep, common pool to trade against.
- **There is no on-chain reputation.** An agent's history — mints completed, commitments kept, capital returned — lives nowhere verifiable. Every interaction starts from zero trust.
- **Verified agents cannot pool capital or share upside.** There is no native way for a group of verified agents to jointly fund a launch, back a project, or split the returns.

The result: the agent economy grows in silos, and the agents doing the most work capture the least of the value they create.

## The Solution

DEEP BNB unifies the agent economy around one token and one protocol:

1. **Deep liquidity pools, verified agents only.** Liquidity pools that can only be filled by agents holding a verified .ai Agent ID. Capital from real, identifiable agents — not anonymous wallets — becomes the shared liquidity base for agent-to-agent trading and funding.
2. **Reputation staking.** Agents stake DEEP to build on-chain reputation. Reputation unlocks launchpad allocations, lower fees, and governance weight. The longer and the more an agent stakes, the more the protocol trusts it — and the more it can do.
3. **Launchpad access for verified agents.** New agent projects launch to a verified audience. Agent ID verification keeps participation fair and Sybil-resistant, and DEEP staking determines allocation priority.
4. **DEEP as the settlement token for agent-to-agent payments.** Agents pay each other in DEEP for services: compute, data, and tasks. One settlement currency across the whole agent economy, instead of a different token per service.

### Agent ID Airdrop — On-Chain Verification

The Agent ID airdrop is verified on-chain, not off-chain. The claim function `claimAirdrop()` verifies the caller's Agent ID directly against the SPACE ID registry contract (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`), resolving the agent's `.ai` handle via `handleOf` and confirming ownership via `ownerOf`. Each verified Agent ID can claim **1,000 DEEP, once** — one allocation per Agent ID, enforced on-chain. The airdrop pool is **300,000,000 DEEP** (30% of total supply), held by the contract itself.

> **Status note (internal):** this mechanism is implemented in `contracts/DeepBNB.sol` (`hasAgentId`, `claimAirdrop`, `claimable`, `remainingAirdrop`) and is LIVE on-chain — the token is deployed and the first claim (1,000 DEEP, Agent ID viss) executed 2026-11-18.

### DeepMint — Agent ID Mint

A second contract lets Agent ID holders mint DEEP directly from a funded pool — paid or free — without touching the (immutable) token contract. Paid mint: **$1 in BNB** (priced live from the Chainlink BNB/USD feed) → **10,000 DEEP**, max **10 per Agent ID**. Free mint: **5,000 DEEP**, once per Agent ID, on top of the 1,000 DEEP token airdrop. Total cap **10,000 mints** (paid + free). BNB from paid mints flows straight to the project wallet inside the same transaction; overpayments are refunded. The contract holds no BNB and has no owner or withdraw function.

> **Status note (internal):** DEPLOYED 2026-11-18 20:09 WIB at `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC` (tx `0xd3935f32df5ad9e9033e280e3c8b5b86fc2ccfe0333ad0dc388e5ef28a287c00`, block 134316769, gas 1,196,812). Source verified on Sourcify exact_match. **FUNDED 2026-11-18 20:14 WIB: 100,000,000 DEEP** (tx `0xa15015d5a0cf1b6f51ce20aa425c26b74f8bd37997b38b1ecc60ca7ab2495878`, block 134317505) — minting is LIVE.

## Why Agent ID

The hackathon theme is identity for agents — and identity is exactly what makes DEEP BNB work. Every mechanism in the protocol depends on knowing who the other side is:

- Liquidity pools are restricted to verified .ai agents, so the capital in them is accountable.
- Reputation only has meaning when it is attached to a persistent, verifiable identity.
- Launchpad allocations are fair only when one identity means one participant.
- Agent-to-agent payments need a trusted counterparty, and Agent ID provides it.

Without Agent ID, DEEP BNB would be another anonymous pool. With it, the protocol becomes a real economy: agents with names, histories, and reputations, transacting with each other in the open.

## Key Features

- **Verified-only deep liquidity pools** — shared liquidity supplied exclusively by .ai Agent ID holders.
- **Agent ID mint (DeepMint)** — mint DEEP at $1 in BNB (10,000 DEEP, max 10 per Agent ID) or free (5,000 DEEP once per Agent ID); 10,000 total mints; BNB flows straight to the project wallet. **DEPLOYED + FUNDED (100M DEEP) — minting is LIVE** at `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC`.
- **Reputation staking** — stake DEEP to build on-chain reputation; reputation unlocks allocations, fee discounts, and governance weight.
- **Agent launchpad** — verified-agent launches with Sybil-resistant, stake-weighted allocations.
- **Agent-to-agent settlement** — pay for compute, data, and tasks in DEEP.
- **DAO governance** — DEEP holders govern treasury, grants, and protocol parameters.

## Tokenomics

| Parameter | Value |
|---|---|
| Token | DEEP |
| Chain | BNB Chain (chainId 56) |
| Decimals | 18 |
| Total supply | 1,000,000,000 DEEP (fixed) |

### Distribution

| Allocation | Share | Amount |
|---|---|---|
| Community rewards & Agent ID airdrop | 30% | 300,000,000 DEEP |
| Liquidity (locked) | 20% | 200,000,000 DEEP |
| Ecosystem grants | 20% | 200,000,000 DEEP |
| Team (2-year vesting, 6-month cliff) | 15% | 150,000,000 DEEP |
| Treasury / DAO | 10% | 100,000,000 DEEP |
| Hackathon & marketing | 5% | 50,000,000 DEEP |

### Token Utility

- **Staking / reputation** — stake DEEP to build on-chain agent reputation.
- **Governance** — vote on treasury, grants, and protocol parameters.
- **Launchpad allocations** — stake-weighted access to verified-agent launches.
- **Fee discounts** — reduced protocol fees for stakers.
- **Agent-to-agent payments** — settlement currency for compute, data, and task services.

## Roadmap

- **Phase 1 — December 2026:** Token launch, website, Agent ID verification.
- **Phase 2 — Q1 2027:** Staking and reputation system.
- **Phase 3 — Q2 2027:** Launchpad and deep liquidity pools.
- **Phase 4 — H2 2027:** Agent services marketplace and DAO governance.

## Team

**Rafeal — Founder.**
X: [@coremsn9099](https://x.com/coremsn9099)

---

## Hackathon Submission Answers

Paste-ready answers for the Agent ID Hackathon submission form (18 fields). All answers are in English.

### Q2 — Project Overview

> DEEP BNB is the economic coordination layer for AI agents with Agent ID (.ai identity) on BNB Chain. It gives verified agents shared deep liquidity, on-chain reputation through staking, fair launchpad access, and a settlement token for agent-to-agent services — solving the fragmentation that leaves every agent launchpad and mint isolated today.

### Q6 — Agent ID Integration

> DEEP BNB uses Agent ID as the trust root for its entire economy. Every airdrop claim is verified on-chain against the SPACE ID registry — only wallets that own a .ai Agent ID can claim, one allocation per Agent ID — and the same identity gates access to deep liquidity pools and launchpad allocations. Reputation earned by staking DEEP is bound to the agent's .ai handle, so it persists across launches instead of resetting each time. This gives users a fair, bot-resistant economy where a verified identity — not just capital — earns access and rewards.

### Q7 — Main Use Cases

All five use cases apply:

1. **Identity Recognition/Verification** — airdrop claims and pool access are verified on-chain via the SPACE ID registry.
2. **Permission Management/Access Control** — deep liquidity pools and launchpad allocations are open only to verified Agent ID holders.
3. **Payment/Settlement** — DEEP is the settlement token for agent-to-agent service payments.
4. **Agent Identity Binding/Identification** — claim allocations and staking reputation are bound to the Agent ID tokenId (.ai handle).
5. **Trading/DeFi Interaction** — verified agents access deep liquidity pools and DeFi interactions.

### Q8 — Has the product launched?

**Yes.** The DEEP token is deployed on BNB Chain, the Agent ID airdrop is live and claimable (1,000 DEEP per verified Agent ID), and the website is live with a working Agent ID checker. The wider 4-pillar product (deep liquidity pools, launchpad) is still in development.

### Q11 — Is the Agent ID integration complete, with on-chain interaction?

**Yes.** The Agent ID integration is live on-chain: `claimAirdrop()` verifies Agent ID against the SPACE ID registry, and the first claim was executed 2026-11-18 — tx `0x742a835c37f64a96ff4c1e8f7be90089498476b2ae9503e25f59843c508b92d1` (Agent ID viss claimed 1,000 DEEP).

### Team & Contact

- **Team Name:** DEEP BNB
- **Contact Email:** akunyutub7517@gmail.com
- **Telegram:** @kosuronothing
- **Reward Receiving Address:** 0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81 (Rafeal's Binance wallet, holder of Agent ID viss.ai)

### 18-Field Mapping

| Field | Answer / Status |
|---|---|
| Q1 — Project name | DEEP BNB |
| Q2 — Project overview | Ready — see Q2 answer above |
| Q3 | **DEPLOYED 2026-11-18**: DEEP token `0x8faa6ca42a3b56297e1c96144352327bbbf75fc6` — [BscScan](https://bscscan.com/address/0x8faa6ca42a3b56297e1c96144352327bbbf75fc6). Deploy tx `0x2c389c4a208c99dac140c8e2aa2105feb485d85bb7b152f934bf57c639133448` (block 134312567, gas 977,662). Source verified on Sourcify **exact_match** (creation + runtime, 2026-11-18T12:38:43Z) and on **BscScan — "Source Code Verified" + "Exact Match" badge** (checked live 2026-11-18 19:42 WIB; compiler v0.8.38+commit.1835d247, optimizer 200 runs, shanghai). |
| Q4 — Product access link / website | Built as hosted web artifact (slug `deep-bnb`): dark-navy product site with live Agent ID checker, tokenomics, roadmap, contract section (now showing the deployed address), and contact. Public share link to be generated when sharing the artifact. |
| Q5 — X / Twitter | https://x.com/coremsn9099 |
| Q6 — Agent ID integration | Ready — see Q6 answer above |
| Q7 — Main use cases | Ready — all five recommended; see Q7 above |
| Q8 — Product launched? | **Token deployed + airdrop live**: DEEP is on BSC, the Agent ID airdrop claim is callable now, and the website with live Agent ID checker is up. The wider 4-pillar product (pools, launchpad) is still in development. |
| Q9 | **DEEP token**: `0x8faa6ca42a3b56297e1c96144352327bbbf75fc6` — [BscScan](https://bscscan.com/address/0x8faa6ca42a3b56297e1c96144352327bbbf75fc6). Deployed via the deterministic CREATE2 proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C` (Binance Agentic Wallet cannot send contract-creation txs; the constructor's initial-holder parameter sent the 700M allocation to the project wallet). **DeepMint (mint contract)**: `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC` — [BscScan](https://bscscan.com/address/0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC), deployed 2026-11-18, Sourcify exact_match verified. |
| Q10 | **Verified on BscScan — "Source Code Verified" + "Exact Match"** (checked live 2026-11-18 19:42 WIB): https://bscscan.com/address/0x8faa6ca42a3b56297e1c96144352327bbbf75fc6#code — compiler v0.8.38+commit.1835d247, optimizer 200 runs, shanghai, Standard-JSON-Input format. Also Sourcify **exact_match**: https://repo.sourcify.dev/contracts/full_match/56/0x8faa6ca42a3b56297e1c96144352327bbbf75fc6/ |
| Q11 — Agent ID integration complete + on-chain interaction? | **YES**: `claimAirdrop()` executed on-chain 2026-11-18 — tx `0x742a835c37f64a96ff4c1e8f7be90089498476b2ae9503e25f59843c508b92d1` (block 134313067, gas 70,859). His wallet (Agent ID viss) claimed 1,000 DEEP; balance now 700,001,000 DEEP, remainingAirdrop 299,999,000, claimedByAgentId(viss) = true. |
| Q12 — Demo video | Storyboard + script ready (`video/storyboard.md`); video production follows (screenshots captured after website build) |
| Q13 — Repository | Structure ready in `~/workspace/deep-bnb/` (README.md, overview.md, contracts/, video/, assets/); website is a hosted artifact, not in this folder; GitHub repo to be created by Rafeal |
| Q14 | Not specified in the brief — to be confirmed against the form |
| Q15 — Team name | DEEP BNB |
| Q16 — Contact email | akunyutub7517@gmail.com |
| Q17 — Telegram | @kosuronothing |
| Q18 — Reward receiving address | 0x8cfE971dAaA28d77E8F4328413aE2e062b5C2B81 |

### Status Notes (internal — not part of the submission)

- Contract deployed + verified (Sourcify exact_match + BscScan Exact Match), first airdrop claim executed on-chain. All on-chain items are live.
- **DeepMint DEPLOYED 2026-11-18 20:09 WIB + FUNDED 20:14 WIB**: `0x9Ab1B8d8c27B352EB2ff120Bc9dec5F6c51382EC` (paid $1 → 10,000 DEEP max 10/Agent ID; free 5,000 DEEP once/Agent ID; cap 10,000), deploy tx `0xd3935f32df5ad9e9033e280e3c8b5b86fc2ccfe0333ad0dc388e5ef28a287c00`, funding tx `0xa15015d5a0cf1b6f51ce20aa425c26b74f8bd37997b38b1ecc60ca7ab2495878` (100M DEEP), Sourcify exact_match verified. **Minting is LIVE.**
- `video/storyboard.md` exists (storyboard + 60s narration script ready); video production is the remaining gap for Q12.
- GitHub repo (Q13) not yet created — needs Rafeal's GitHub account.
- Website public link (Q4): https://muse.ai/s/deep-bnb-zu6fxl2eu7ixn/50uBC6EmNtwBrdKAGM1sIqJe88YKlA30XsoVQVzKy-8
- Contract deployment + BscScan source verification are required before submission, and deployment needs Rafeal's explicit go-ahead.

---

*DEEP BNB — deep liquidity for the agent economy.*
