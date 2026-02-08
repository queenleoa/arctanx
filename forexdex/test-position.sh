#!/bin/bash
set -e

echo "🧪 Testing Position Opening on Arc Testnet"
echo "==========================================="
echo ""

# Load environment
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Create .env with:"
    echo "  ARC_TESTNET_RPC=https://testnet-rpc.arc.network"
    echo "  PRIVATE_KEY=0x..."
    echo "  PERPS_DEX_ADDRESS=0x..."
    exit 1
fi

source .env

# Contract addresses
PERPS_DEX="${PERPS_DEX_ADDRESS}"
ARC_USDC="0x3600000000000000000000000000000000000000"
YOUR_ADDRESS=$(cast wallet address $PRIVATE_KEY)

echo "📋 Configuration"
echo "----------------"
echo "Your address:  $YOUR_ADDRESS"
echo "PerpsDEX:      $PERPS_DEX"
echo "Arc USDC:      $ARC_USDC"
echo ""

# CRITICAL: Arc USDC uses 6 decimals for ERC-20 interface!
# Native balance shows 18 decimals, but approve/transferFrom use 6
AMOUNT_1_USDC="1000000"  # 1 USDC = 1,000,000 with 6 decimals

echo "1️⃣ Checking USDC balance..."
BALANCE=$(cast call $ARC_USDC "balanceOf(address)" $YOUR_ADDRESS --rpc-url $ARC_TESTNET_RPC)
BALANCE_DEC=$((16#${BALANCE:2}))
BALANCE_HUMAN=$(echo "scale=6; $BALANCE_DEC / 1000000" | bc)
echo "   Balance: $BALANCE_HUMAN USDC"

if [ "$BALANCE" == "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo ""
    echo "❌ No USDC! Get testnet USDC:"
    echo "   👉 https://faucet.circle.com"
    echo "   Select 'Arc Testnet' and request USDC"
    exit 1
fi
echo ""

echo "2️⃣ Checking current allowance..."
ALLOWANCE=$(cast call $ARC_USDC "allowance(address,address)" $YOUR_ADDRESS $PERPS_DEX --rpc-url $ARC_TESTNET_RPC)
echo "   Allowance: $ALLOWANCE"
echo ""

# Approve if needed
if [ "$ALLOWANCE" == "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "3️⃣ Approving 10 USDC (using 6 decimals)..."
    echo "   Amount: 10000000 (10 USDC with 6 decimals)"
    
    cast send $ARC_USDC \
        "approve(address,uint256)" \
        $PERPS_DEX \
        10000000 \
        --rpc-url $ARC_TESTNET_RPC \
        --private-key $PRIVATE_KEY \
        --legacy \
        --gas-limit 100000
    
    echo "   ✅ Approved"
    echo ""
    sleep 3
else
    echo "3️⃣ Already approved ✅"
    echo ""
fi

# Open position with correct 6 decimal amounts
echo "4️⃣ Opening position..."
echo "   Margin: 1 USDC (1000000 with 6 decimals)"
echo "   Leverage: 5x"
echo "   EUR/USD: 1.05"
echo "   Direction: LONG"
echo ""

TX=$(cast send $PERPS_DEX \
    "openPosition(address,uint256,uint256,uint256,bool)" \
    $ARC_USDC \
    $AMOUNT_1_USDC \
    5 \
    1050000000000000000 \
    true \
    --rpc-url $ARC_TESTNET_RPC \
    --private-key $PRIVATE_KEY \
    --legacy \
    --gas-limit 500000 \
    --json | jq -r '.transactionHash')

echo "✅ Transaction submitted!"
echo ""
echo "📍 Tx Hash: $TX"
echo "🔍 Explorer: https://testnet.arcscan.app/tx/$TX"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👀 Watch the relayer terminal!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The relayer will:"
echo "  1. Detect PositionOpened event (~10s)"
echo "  2. Wait for Arc finality (10s)"
echo "  3. Fetch CCTP attestation from Circle (30-60s)"
echo "  4. Relay message to Arbitrum Sepolia"
echo "  5. Record deposit in MarginVault"
echo ""
echo "Expected total time: 1-2 minutes"
echo ""