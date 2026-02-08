The Opportunity
---------------

While crypto perpetuals have achieved clear product--market fit with over **$1 trillion in monthly trading volume**, forex and stablecoin perpetuals remain surprisingly underdeveloped --- despite representing a **$9.6 trillion daily FX market** opportunity.

Using DeFi for forex derivatives offers compelling advantages over traditional infrastructure:

-   **Global liquidity access** instead of fragmented regional markets
-   **24/7 operations** without market-hours constraints
-   **Trust-minimised infrastructure** reducing counterparty risk
-   **Elimination of multiple intermediaries** (prime brokers, clearing houses, custodians)
-   **Automatic reconciliation** via on-chain settlement
-   **No minimum account size** requirements typical of prime brokerage
-   **Efficient settlement** with near-instant finality
-   **Transparent position tracking** auditable by all parties
-   **Native protocol composability** enabling novel capital structures

Despite these benefits, adoption has lagged due to regulatory, technical, and market-structure constraints. These challenges are now becoming solvable through emerging infrastructure: **Circle's institutional-grade technology stack**, the **fast finality of the Arc blockchain**, and the **StableFX forex conversion engine**.

* * * * *

What arctan(x) Demonstrates
---------------------------

This proof-of-concept demonstrates solutions to several key problems that have historically hindered institutional adoption of on-chain forex derivatives.

### ✅ Unified Multichain Balance

Chain abstraction is critical for institutional-grade infrastructure. arctan(x) uses **Circle Wallets** and **Circle Gateway** to create a chain-agnostic interface that addresses fragmented liquidity across chains. The demo shows a unified wallet balance for USDC and EURC across **Arc testnet**, **Base Sepolia**, **Avalanche Fuji**, and **Solana Devnet**.

### ✅ Cross-Chain Collateral Rehypothecation

In traditional finance, forex futures margins are typically not rehypothecated by clearing houses. DeFi coordination unlocks an opportunity to create a more capital-efficient system for institutions. This POC demonstrates how margin can be **rehypothecated cross-chain** from the Arc testnet contract into a lending pool on **Aave on Arbitrum** via **CCTP/Bridge Kit**, earning interest while positions remain open. The originating smart contract tracks margin using **virtual accounting**.

### ✅ Institutional-Grade FX Conversion via StableFX

**StableFX** provides institutional-grade forex conversion through RFQ-based pricing and escrowed atomic settlement. This is particularly valuable for multi-currency collateral management, settlement conversions, batching operations, and minimizing gas costs through end-of-day settlement. The most important utility of StableFX is demonstrated when trading directly with institutional counterparties or executing large hedging orders. This project uses Arc as a **chain-abstracted liquidity and coordination hub** to enable institutional FX trading, net settlement, and global stablecoin payouts via StableFX.

* * * * *

Architecture
------------

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           arctan(x) Frontend                            │
│                     Next.js Trading Terminal + Clerk Auth                │
├──────────┬───────────────┬──────────────────┬────────────────────────────┤
│          │               │                  │                            │
│  Circle  │  Circle       │  Stork Oracle    │  StableFX                  │
│  Wallets │  Gateway      │  EUR/USD Feed    │  RFQ Engine                │
│          │  (Unified     │                  │  (Spot FX)                 │
│  4 chains│   Balance)    │                  │                            │
├──────────┴───────────────┴──────────────────┴────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐        CCTP / Bridge Kit        ┌────────────┐ │
│  │   PerpsDEX          │ ──────────────────────────────► │ MarginVault│ │
│  │   (Arc Testnet)     │   Cross-chain margin transfer   │ (Arbitrum  │ │
│  │                     │ ◄────────────────────────────── │  Sepolia)  │ │
│  │  - Order execution  │     Return on position close    │            │ │
│  │  - Virtual margin   │                                 │  - Aave V3 │ │
│  │  - Funding rates    │                                 │    yield   │ │
│  │  - PnL settlement   │                                 │  - Deposit │ │
│  └─────────────────────┘                                 │    mgmt    │ │
│                                                          └────────────┘ │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    Supported Networks                                ││
│  │  🌐 Arc Testnet  -  🔺 Avalanche Fuji  -  🔵 Base Sepolia  -  ◎ Solana Devnet ││
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

* * * * *

How It Works
------------

### Wallet Infrastructure & Chain Abstraction

Upon sign-up, the system programmatically creates **Developer-Controlled Circle Wallets** for the user across four testnets: Arc, Avalanche Fuji, Base Sepolia, and Solana Devnet. EVM wallets share a single address via `refId`, while Solana uses a separate address.

**Circle Gateway** aggregates the user's USDC from all chains into a single unified balance, abstracting the underlying blockchain complexity and fragmentation --- which is especially important for trading forex where liquidity fragmentation is a core problem.

### Price Data & Trading Execution

The trading terminal pulls live **EUR/USD index prices** from the **Stork data feed API**. This feed powers the real-time chart and provides the execution price for all perpetual contract trades.

The **PerpsDEX smart contract** is deployed on Arc testnet and uses a simplified protocol-filled order book model. Position size is calculated on-chain as:

```
Position Size = Deposited Margin × Selected Leverage
```

### Cross-Chain Margin Rehypothecation

This is the key innovation for capital efficiency:

```
1\. User deposits margin (USDC) → held in PerpsDEX contract on Arc
                    │
                    ▼ (if rehypothecation selected)
2. Funds bridged via Circle CCTP / Bridge Kit → MarginVault on Arbitrum
                    │
                    ▼
3. MarginVault supplies USDC → Aave V3 lending pool (yield generation)
                    │
4. Virtual accounting on Arc tracks margin obligation
   (physical asset is on Arbitrum earning yield)
                    │
                    ▼ (on position close)
5. Funds exit Aave → return via CCTP → settle back on Arc → pay trader
```

A **CCTP V2 relayer** monitors events on both chains and coordinates the cross-chain message passing, attestation fetching, and settlement flow.

### Forex Spot Conversion (StableFX)

For currency swaps (e.g., EURC ↔ USDC), the system integrates with **StableFX**:

1.  Frontend requests a quote via the StableFX API, which taps into the **Talos RFQ system**
2.  User signs a **Permit2 authorization** via Circle's developer-controlled wallet
3.  StableFX executes an **atomic settlement** using its escrow engine

* * * * *

Tech Stack
----------

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Frontend** | Next.js, TypeScript, Tailwind CSS | Trading terminal UI |
| **Auth** | Clerk | User onboarding (prototype) |
| **Wallets** | Circle Developer-Controlled Wallets | Multi-chain wallet creation & tx signing |
| **Balance Aggregation** | Circle Gateway | Unified cross-chain USDC balance |
| **Trading Contract** | PerpsDEX (Solidity, Foundry) | Perpetual futures execution on Arc |
| **Margin Vault** | MarginVault (Solidity, Foundry) | Cross-chain margin custody & Aave integration |
| **Cross-Chain** | Circle CCTP V2 / Bridge Kit | Cross-chain USDC transfers |
| **Price Oracle** | Stork | Live EUR/USD price feed |
| **Spot FX** | StableFX (Talos RFQ) | Institutional-grade USDC ↔ EURC conversion |
| **Yield** | Aave V3 | Margin rehypothecation yield |
| **Relayer** | Node.js (ethers.js) | CCTP attestation & cross-chain coordination |
| **Charts** | Lightweight Charts (TradingView) | Real-time price visualization |

### Networks

| Network | CCTP Domain | Role |
| --- | --- | --- |
| Arc Testnet | 26 | Primary trading chain (PerpsDEX) |
| Arbitrum Sepolia | 3 | Margin vault & Aave yield |
| Avalanche Fuji | 1 | Gateway deposit source |
| Base Sepolia | 6 | Gateway deposit source |
| Solana Devnet | 5 | Gateway deposit source |

### Key Contract Addresses (Testnet)

| Contract | Network | Address |
| --- | --- | --- |
| Arc USDC | Arc Testnet | `0x3600000000000000000000000000000000000000` |
| Arc EURC | Arc Testnet | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Gateway Wallet | All EVM | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| CCTP TokenMessenger | All EVM | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitter | All EVM | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| Permit2 | Arc Testnet | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

* * * * *

Project Structure
-----------------

```
arctan-x/
├── frontend/                    # Next.js trading terminal
│   ├── app/
│   │   ├── api/
│   │   │   ├── create-wallet/       # Circle Wallet provisioning
│   │   │   ├── gateway-balance/     # Gateway unified balance queries
│   │   │   ├── gateway-deposit/     # Gateway USDC deposits
│   │   │   ├── margin/
│   │   │   │   ├── deposit/         # Cross-chain margin deposit (Bridge Kit)
│   │   │   │   └── withdraw/        # Cross-chain margin withdrawal
│   │   │   ├── request-faucet/      # Testnet faucet integration
│   │   │   ├── save-wallet-metadata/# Clerk metadata persistence
│   │   │   ├── stablefx/
│   │   │   │   ├── quote/           # StableFX RFQ quotes
│   │   │   │   ├── create-trade/    # Trade creation
│   │   │   │   ├── sign-trade/      # Permit2 signing & submission
│   │   │   │   ├── fund-trade/      # Trade funding
│   │   │   │   ├── get-trade/       # Trade status polling
│   │   │   │   ├── check-permit2-allowance/
│   │   │   │   └── grant-permit2-allowance/
│   │   │   └── stork/
│   │   │       ├── latest/          # Real-time EUR/USD price
│   │   │       └── recent/          # Historical price data
│   │   ├── components/
│   │   │   ├── LandingPage.tsx      # Marketing / intro page
│   │   │   ├── SignInPage.tsx       # Clerk authentication
│   │   │   ├── WalletDashboard.tsx  # Main dashboard controller
│   │   │   ├── MultiChainWalletInterface.tsx  # Wallet mgmt + Gateway
│   │   │   ├── TradingView.tsx      # Trading terminal (chart + orders)
│   │   │   └── StableFXSwap.tsx     # Spot FX conversion interface
│   │   ├── lib/
│   │   │   └── tokenAddresses.ts    # Token contract addresses
│   │   └── page.tsx                 # App entry point
│   └── public/
│
├── forexdex/                    # Smart contracts (Foundry)
│   ├── src/
│   │   ├── PerpsDEX.sol             # Perpetual futures DEX (Arc)
│   │   ├── MarginVault.sol          # CCTP margin vault (Arb Sepolia)
│   │   └── MarginVault_BK.sol       # Bridge Kit variant (Eth Sepolia + Aave)
│   ├── script/
│   │   └── Deploy.s.sol             # Deployment scripts
│   └── test-position.sh             # CLI test script
│
└── relayer/                     # CCTP V2 relayer (Node.js)
    └── relayer.js                   # Event monitoring & cross-chain relay
```

* * * * *

Getting Started
---------------

### Prerequisites

-   Node.js 18+
-   [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)
-   Circle API Key ([Agentverse](https://agentverse.ai) or [Circle Developer Console](https://console.circle.com))
-   Stork API Key
-   StableFX API Key
-   Clerk API Keys

### Environment Variables

Create `.env` files in `frontend/` and `forexdex/`:

bash

```
# Circle
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=

# StableFX (separate key from Circle)
STABLEFX_API_KEY=

# Stork Oracle
STORK_API_KEY=

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# RPC Endpoints
ARC_TESTNET_RPC=https://arc-testnet.drpc.org
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
ETH_SEPOLIA_RPC=https://rpc.sepolia.org

# Contract Addresses (after deployment)
PERPS_DEX_ADDRESS=
MARGIN_VAULT_ADDRESS=
MARGIN_VAULT_ETH_SEPOLIA=

# Relayer / Vault Owner
PRIVATE_KEY=
VAULT_OWNER_PRIVATE_KEY=
```

### Smart Contract Deployment

bash

```
cd forexdex
forge install OpenZeppelin/openzeppelin-contracts
```

**Step 1:** Deploy MarginVault on Arbitrum Sepolia:

bash

```
PERPS_DEX_ADDRESS=0x0000000000000000000000000000000000000001\
forge script script/Deploy.s.sol:DeployMarginVault\
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc\
  --private-key $PRIVATE_KEY\
  --broadcast
```

**Step 2:** Deploy PerpsDEX on Arc Testnet:

bash

```
MARGIN_VAULT_ADDRESS=<from step 1>\
forge script script/Deploy.s.sol:DeployPerpsDEX\
  --rpc-url $ARC_TESTNET_RPC\
  --private-key $PRIVATE_KEY\
  --broadcast
```

**Step 3:** Link contracts:

bash

```
MARGIN_VAULT_ADDRESS=<from step 1>\
PERPS_DEX_ADDRESS=<from step 2>\
forge script script/Deploy.s.sol:LinkContracts\
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc\
  --private-key $PRIVATE_KEY\
  --broadcast
```

### Frontend

bash

```
cd frontend
npm install
npm run dev
```

### Relayer

bash

```
cd relayer
npm install
node relayer.js
```

* * * * *

User Flow
---------

```
Landing Page → Sign In (Clerk) → Wallet Creation (4 chains)
       │
       ▼
  ┌─ Step 1: Fund ──────────────────────────────────────────┐
  │  Request testnet USDC/EURC via Circle faucet API        │
  │  or manual faucet links                                 │
  └─────────────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Step 2: Gateway ───────────────────────────────────────┐
  │  Deposit USDC from any EVM chain into Gateway           │
  │  → Approve + Deposit to Gateway Wallet contract         │
  │  → Unified balance updates after chain finality         │
  └─────────────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Step 3: Trade ─────────────────────────────────────────┐
  │  Launch Trading Interface                               │
  │  ├── Long/Short EUR/USD perpetuals (demo)               │
  │  │   ├── Select funding source (Arc Wallet or Gateway)  │
  │  │   ├── Choose rehypothecation protocol                │
  │  │   ├── Set leverage (1-100x)                          │
  │  │   └── Execute → margin bridged → position opened     │
  │  └── Spot Swap via StableFX                             │
  │      ├── USDC → EURC or EURC → USDC                    │
  │      ├── RFQ quote with live rate                       │
  │      └── Permit2 sign → atomic settlement               │
  └─────────────────────────────────────────────────────────┘
```

* * * * *

Known Limitations & Testnet Constraints
---------------------------------------

-   **Weekend price data**: The Stork feed mirrors traditional forex market hours --- the EUR/USD price chart will not update on weekends.
-   **Aave testnet incompatibility**: USDC on Ethereum Sepolia and the USDC token used for Aave's testnet reserve have different addresses and are incompatible. The CCTP cross-chain transfer can be verified on explorer, but the Aave deposit cannot complete on testnet.
-   **Bridge Kit vs CCTP**: Due to integration issues with CCTP directly on Arc, the project uses Circle's Bridge Kit for cross-chain transfers.
-   **Finality timing**: Circle Gateway manages different blockchain finality times automatically. Base Sepolia deposits can take 10--15 minutes to reflect; Arc and Avalanche are faster.
-   **Simplified trading mechanics**: The perpetual contract deliberately omits liquidation logic and dynamic funding rates for POC scope.
-   **Prototype auth**: Clerk is used for rapid prototyping. A production system would require regulated KYC and institutional credential management.
-   **Developer-Controlled Wallets**: Used for simplicity. The architecture is designed to upgrade to Circle Modular Wallets for institutional custody and multisig.

* * * * *

Future Directions
-----------------

-   **Production liquidation engine** with oracle-driven mark-to-market
-   **Dynamic funding rate** mechanism based on open interest imbalance
-   **Multi-collateral support** (EURC margin for EUR-denominated positions)
-   **Circle Modular Wallets** for institutional custody, multisig, and policy controls
-   **Additional trading pairs** (GBP/USD, USD/JPY, USD/CHF)
-   **Net settlement** via StableFX for batched institutional operations
-   **On-chain order book** with maker/taker fee structure
-   **Regulated KYC/AML** integration replacing Clerk prototype auth