# Cross-Chain Perps DEX with Margin Rehypothecation

**Institutional-grade stablecoin FX perpetuals with cross-chain margin yield optimization via Circle CCTP + Aave V3.**

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER (Circle Wallets)                         │
│                Arc Testnet | Base Sepolia | Solana Devnet               │
│              Unified balance via Circle Gateway + Programmable Wallets  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ deposit USDC margin
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARC TESTNET  (Domain 26)                             │
│                                                                         │
│  ┌──────────────────────────────────────────────┐                       │
│  │              PerpsDEX.sol                     │                       │
│  │                                               │                       │
│  │  • Orderbook: placeOrder / fillOrder          │                       │
│  │  • Market orders: openPosition                │                       │
│  │  • Close: closePosition → settleWithdrawal    │                       │
│  │  • Oracle: setPrice (owner-simulated)         │                       │
│  │  • PnL: size × (exit−entry)/entry             │                       │
│  │  • Funding: margin × rate × hours             │                       │
│  │                                               │                       │
│  │  On open: burns USDC via CCTP ──────────────────┐                    │
│  │  On settle: receives USDC from CCTP ◄───────────┼──┐                │
│  └──────────────────────────────────────────────┘  │  │                 │
│                                                     │  │                 │
│  USDC: 0x3600...0000 (18 decimals)                  │  │                 │
│  TokenMessengerV2: 0x8FE6B999...2542DAA             │  │                 │
│  MessageTransmitterV2: 0xE737e5cE...1CE275          │  │                 │
└─────────────────────────────────────────────────────┼──┼─────────────────┘
                                                      │  │
                         Circle CCTP V2               │  │
                    (burn → attest → mint)            │  │
                                                      │  │
┌─────────────────────────────────────────────────────┼──┼─────────────────┐
│                 ARBITRUM SEPOLIA  (Domain 3)         │  │                 │
│                                                      │  │                 │
│  ┌──────────────────────────────────────────────┐   │  │                 │
│  │            MarginVault.sol                    │   │  │                 │
│  │                                               │   │  │                 │
│  │  Receives USDC from CCTP ◄────────────────────┘  │                   │
│  │                │                              │      │                │
│  │                ▼                              │      │                │
│  │  depositToAave() → Aave V3 Pool              │      │                │
│  │          (USDC → aUSDC, yield accrues)        │      │                │
│  │                                               │      │                │
│  │  withdrawAndBridgeToDex() ────────────────────┼──────┘                │
│  │     Aave withdraw → CCTP burn to Arc          │                       │
│  │                                               │                       │
│  │  getAaveBalance() / getYieldEarned()          │                       │
│  └──────────────────────────────────────────────┘                        │
│                                                                          │
│  USDC: 0x75faf114...4fa4e (6 decimals)                                  │
│  Aave V3 Pool: 0x6Ae43d32...738951                                      │
│  TokenMessengerV2: 0x8FE6B999...2542DAA                                 │
└──────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────┐
                    │   Off-chain Relayer    │
                    │                       │
                    │ • Poll Circle API     │
                    │ • Call receiveMessage  │
                    │ • Call depositToAave   │
                    │ • Call settleWithdraw  │
                    └───────────────────────┘
```

## Trading Pairs

| Pair    | Index | Long Token | Short Token | Margin |
|---------|-------|------------|-------------|--------|
| EURUSD  | EUR   | EURC/USDC  | USDC/EURC   | USDC   |
| USDEUR  | USD   | USDC/EURC  | EURC/USDC   | USDC   |

## Margin Rehypothecation Flow

The key innovation: idle margin generates yield while backing perp positions.

### Deposit (Open Position)
```
1. User approves USDC → PerpsDEX on Arc
2. User calls PerpsDEX.openPosition()
3. PerpsDEX records position with virtual margin
4. PerpsDEX calls CCTP depositForBurn() → burns USDC on Arc
5. [off-chain] Relayer polls Circle attestation API
6. [off-chain] Relayer calls receiveMessage() on Arbitrum → USDC minted to MarginVault
7. [off-chain] Relayer calls MarginVault.depositToAave() → USDC → aUSDC (yield starts)
```

### Withdrawal (Close Position)
```
1. User calls PerpsDEX.closePosition()
2. PerpsDEX calculates PnL + funding, emits WithdrawalRequested
3. [off-chain] Relayer calls MarginVault.withdrawAndBridgeToDex() on Arbitrum
4. MarginVault withdraws from Aave → burns USDC on Arbitrum via CCTP
5. [off-chain] Relayer polls Circle attestation API
6. [off-chain] Relayer calls receiveMessage() on Arc → USDC minted to PerpsDEX
7. [off-chain] Relayer calls PerpsDEX.settleWithdrawal() → trader gets payout
```

## Deployment Guide

### Prerequisites
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install forge-std
cd perps-dex
forge install foundry-rs/forge-std --no-commit

# Copy env file and fill in values
cp .env.example .env
```

### Step 1: Deploy MarginVault on Arbitrum Sepolia
```bash
source .env

# Deploy (PerpsDEX address unknown yet, will update later)
forge script script/DeployMarginVault.s.sol:DeployMarginVault \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast

# Save the output MarginVault address
export MARGIN_VAULT_ADDRESS=0x...
```

### Step 2: Deploy PerpsDEX on Arc Testnet
```bash
forge script script/DeployPerpsDEX.s.sol:DeployPerpsDEX \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast

# Save the output PerpsDEX address
export PERPS_DEX_ADDRESS=0x...
```

### Step 3: Link the Contracts
```bash
# Update MarginVault with PerpsDEX address
cast send $MARGIN_VAULT_ADDRESS \
  "setPerpsDex(address)" $PERPS_DEX_ADDRESS \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Step 4: Run the Relayer
```bash
cd relayer
npm install ethers@6
npx ts-node relayer.ts
```

## Testing Trades via CLI

```bash
# 1. Get pair hash for EURUSD
PAIR=$(cast call $PERPS_DEX_ADDRESS "pairHash(string)" "EURUSD" --rpc-url $ARC_TESTNET_RPC_URL)

# 2. Approve USDC to PerpsDEX (100 USDC with 18 decimals on Arc)
AMOUNT=100000000000000000000  # 100e18
cast send 0x3600000000000000000000000000000000000000 \
  "approve(address,uint256)" $PERPS_DEX_ADDRESS $AMOUNT \
  --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY

# 3. Open a 5x long EURUSD position with 100 USDC margin
cast send $PERPS_DEX_ADDRESS \
  "openPosition(bytes32,bool,uint256,uint8)" $PAIR true $AMOUNT 5 \
  --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY

# 4. Check unrealized PnL
cast call $PERPS_DEX_ADDRESS \
  "getUnrealizedPnl(uint256)" 0 \
  --rpc-url $ARC_TESTNET_RPC_URL

# 5. Close position
cast send $PERPS_DEX_ADDRESS \
  "closePosition(uint256)" 0 \
  --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY
```

## Contract Addresses Reference

### Arc Testnet (Domain 26)
| Contract | Address |
|----------|---------|
| USDC (18 dec) | `0x3600000000000000000000000000000000000000` |
| EURC (6 dec)  | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |

### Arbitrum Sepolia (Domain 3)
| Contract | Address |
|----------|---------|
| USDC (6 dec) | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| aUSDC | `0x625E7708f30cA75bfd92586e17077590C60eb4cD` |
| TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |

### Base Sepolia (Domain 6)
| Contract | Address |
|----------|---------|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| EURC | `0x808456652fdb597867f38412077A9182bf77359F` |

## Known Issues & POC Limitations

1. **Decimal conversion (Arc 18 → Arb 6):** CCTP should handle this at the
   TokenMinter level. Verify on testnet. If not, the relayer needs to adjust
   amounts before calling Aave.

2. **Aave USDC compatibility:** Aave V3 on Arbitrum Sepolia may use USDC.e
   (bridged USDC) instead of native CCTP-minted USDC at `0x75faf1...`.
   If so, you'll need to either:
   - Swap USDC → USDC.e before depositing to Aave
   - Find an Aave pool that accepts native USDC
   - Mock the Aave interaction for the demo

3. **No liquidation engine** — this is intentional for the POC. Positions can
   go negative and the system relies on the owner to manage risk.

4. **Oracle is owner-set** — in production, use Stork or Chainlink for
   real-time EUR/USD pricing.

5. **Single relayer** — no redundancy. For production, use multiple relayers
   with a keeper network.

6. **EURC margin not supported for rehypothecation** — only USDC margin is
   bridged to Aave since EURC is not on Arbitrum Sepolia. In production,
   you'd swap EURC → USDC or use a chain with EURC Aave pools.

## Next Steps (Post-POC)

- [ ] Stork oracle integration for real-time EUR/USD pricing
- [ ] Liquidation engine with keeper incentives
- [ ] Multi-collateral (EURC + USDC) margin with cross-margin mode
- [ ] Protocol fee collection and distribution
- [ ] Matching engine for limit orders (on-chain or hybrid)
- [ ] Gas-optimized settlement batching
- [ ] Multi-chain vault expansion (Base, Optimism, etc.)
- [ ] Circle Programmable Wallets SDK integration for frontend
