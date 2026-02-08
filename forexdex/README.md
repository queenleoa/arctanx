Deployment
----------

### Prerequisites

bash

```
forge install OpenZeppelin/openzeppelin-contracts 
```

### Step 1: Deploy MarginVault on Arb Sepolia

bash

```
# Use a placeholder PerpsDEX address first (we'll update it)
PERPS_DEX_ADDRESS=0x0000000000000000000000000000000000000001\
forge script script/Deploy.s.sol:DeployMarginVault\
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc\
  --private-key $PRIVATE_KEY\
  --broadcast
```

### Step 2: Deploy PerpsDEX on Arc Testnet

bash

```
MARGIN_VAULT_ADDRESS=<from step 1>\
forge script script/Deploy.s.sol:DeployPerpsDEX\
  --rpc-url $ARC_TESTNET_RPC\
  --private-key $PRIVATE_KEY\
  --broadcast
```

### Step 3: Link contracts

bash

```
MARGIN_VAULT_ADDRESS=<from step 1>\
PERPS_DEX_ADDRESS=<from step 2>\
forge script script/Deploy.s.sol:LinkContracts\
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc\
  --private-key $PRIVATE_KEY\
  --broadcast
```