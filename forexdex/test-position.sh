#!/bin/bash
set -e

echo "🧪 Testing Position Opening"
echo "==========================="
echo ""

# Load environment
source .env

PERPS_DEX="0x44715A5E894485BDc949ADB325a2Bb309686e3bb"
ARC_USDC="0x3600000000000000000000000000000000000000"
YOUR_ADDRESS=$(cast wallet address $PRIVATE_KEY)

echo "Your address: $YOUR_ADDRESS"
echo ""

# Check balance
echo "1️⃣ Checking USDC balance..."
BALANCE=$(cast call $ARC_USDC "balanceOf(address)" $YOUR_ADDRESS --rpc-url $ARC_TESTNET_RPC)
echo "   Balance: $BALANCE"

if [ "$BALANCE" == "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "   ❌ No USDC! Get testnet USDC first."
    exit 1
fi
echo ""

# Check allowance
echo "2️⃣ Checking current allowance..."
ALLOWANCE=$(cast call $ARC_USDC "allowance(address,address)" $YOUR_ADDRESS $PERPS_DEX --rpc-url $ARC_TESTNET_RPC)
echo "   Allowance: $ALLOWANCE"
echo ""

# Approve if needed (just 1 USDC)
if [ "$ALLOWANCE" == "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "3️⃣ Approving 1 USDC..."
    cast send $ARC_USDC \
        "approve(address,uint256)" \
        $PERPS_DEX \
        1000000000000000000 \
        --rpc-url $ARC_TESTNET_RPC \
        --private-key $PRIVATE_KEY \
        --legacy
    echo ""
    sleep 3
else
    echo "3️⃣ Already approved ✅"
    echo ""
fi

# Open position (1 USDC margin)
echo "4️⃣ Opening position..."
echo "   Margin: 1 USDC"
echo "   Leverage: 5x"
echo "   EUR/USD: 1.05"
echo "   Direction: LONG"
echo ""

TX=$(cast send $PERPS_DEX \
    "openPosition(address,uint256,uint256,uint256,bool)" \
    $ARC_USDC \
    1000000000000000000 \
    5 \
    1050000000000000000 \
    true \
    --rpc-url $ARC_TESTNET_RPC \
    --private-key $PRIVATE_KEY \
    --legacy \
    --json | jq -r '.transactionHash')

echo "   ✅ Transaction: $TX"
echo ""
echo "👀 Watch the relayer terminal!"
echo "   It will process this in ~30 seconds"
