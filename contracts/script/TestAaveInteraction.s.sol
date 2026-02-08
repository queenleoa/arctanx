// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MarginVault} from "../src/ethereum/MarginVault.sol";
import {IAavePool} from "../src/interfaces/IAavePool.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title TestAaveInteraction - Test deposit and withdraw on Aave via MarginVault
/// @dev 
///   Step 0: Get testnet USDC from Aave faucet (see README)
///   Step 1: Deploy MarginVault first with DeployMarginVault.s.sol
///   Step 2: Set MARGIN_VAULT env var to deployed address
///   Step 3: Run this script
///
/// Usage:
///   forge script script/TestAaveInteraction.s.sol:MintTestUSDC --rpc-url $ETH_SEPOLIA_RPC --broadcast
///   forge script script/TestAaveInteraction.s.sol:DepositToAave --rpc-url $ETH_SEPOLIA_RPC --broadcast
///   forge script script/TestAaveInteraction.s.sol:CheckBalances --rpc-url $ETH_SEPOLIA_RPC
///   forge script script/TestAaveInteraction.s.sol:WithdrawFromAave --rpc-url $ETH_SEPOLIA_RPC --broadcast

// ═══════════════════════════════════════════════════════════════
//  Aave Testnet USDC is a TestnetERC20 with public mint()
// ═══════════════════════════════════════════════════════════════

interface ITestnetERC20 is IERC20 {
    function mint(address account, uint256 amount) external;
    function mint(uint256 amount) external;
}

interface IFaucet {
    function mint(address token, address to, uint256 amount) external;
}

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

address constant AAVE_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
address constant AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;
address constant AAVE_FAUCET = 0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D;

// ═══════════════════════════════════════════════════════════════
//  Step 0: Mint test USDC via Aave's faucet
// ═══════════════════════════════════════════════════════════════

contract MintTestUSDC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        
        console.log("=== Minting test USDC ===");
        console.log("Deployer:", deployer);

        IERC20 usdc = IERC20(AAVE_USDC);
        console.log("USDC balance before:", usdc.balanceOf(deployer));

        vm.startBroadcast(pk);

        // Aave faucet lets you mint up to 10,000 tokens
        // USDC has 6 decimals, so 1000 USDC = 1000 * 1e6
        uint256 mintAmount = 1000 * 1e6; // 1000 USDC
        
        // Mint via Aave's faucet (direct mint is owner-only on TestnetERC20)
        IFaucet(AAVE_FAUCET).mint(AAVE_USDC, deployer, mintAmount);
        console.log("Minted via faucet");

        vm.stopBroadcast();

        console.log("USDC balance after:", usdc.balanceOf(deployer));
    }
}

// ═══════════════════════════════════════════════════════════════
//  Step 1: Deposit USDC into Aave via MarginVault
// ═══════════════════════════════════════════════════════════════

contract DepositToAave is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address vaultAddr = vm.envAddress("MARGIN_VAULT");

        MarginVault vault = MarginVault(vaultAddr);
        IERC20 usdc = IERC20(AAVE_USDC);
        IERC20 aUsdc = IERC20(AUSDC);

        uint256 depositAmount = 1 * 1e6; // 1 USDC

        console.log("=== Depositing to Aave via MarginVault ===");
        console.log("Vault:", vaultAddr);
        console.log("Depositor:", deployer);
        console.log("Deposit amount:", depositAmount);
        console.log("");
        console.log("--- Before ---");
        console.log("USDC balance (deployer):", usdc.balanceOf(deployer));
        console.log("aUSDC balance (vault):", aUsdc.balanceOf(vaultAddr));
        console.log("Vault totalDeposited:", vault.totalDeposited());

        vm.startBroadcast(pk);

        // Approve vault to spend USDC
        usdc.approve(vaultAddr, depositAmount);

        // Deposit into Aave via vault
        vault.depositToAave(depositAmount);

        vm.stopBroadcast();

        console.log("");
        console.log("--- After ---");
        console.log("USDC balance (deployer):", usdc.balanceOf(deployer));
        console.log("aUSDC balance (vault):", aUsdc.balanceOf(vaultAddr));
        console.log("Vault totalDeposited:", vault.totalDeposited());
        console.log("Vault deposits[deployer]:", vault.deposits(deployer));
    }
}

// ═══════════════════════════════════════════════════════════════
//  Step 2: Check balances and Aave account data
// ═══════════════════════════════════════════════════════════════

contract CheckBalances is Script {
    function run() external view {
        address vaultAddr = vm.envAddress("MARGIN_VAULT");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        MarginVault vault = MarginVault(vaultAddr);
        IERC20 usdc = IERC20(AAVE_USDC);
        IERC20 aUsdc = IERC20(AUSDC);
        IAavePool pool = IAavePool(AAVE_POOL);

        console.log("=== Balance Check ===");
        console.log("Vault:", vaultAddr);
        console.log("Deployer:", deployer);
        console.log("");

        // Token balances
        console.log("--- Token Balances ---");
        console.log("USDC (deployer):", usdc.balanceOf(deployer));
        console.log("USDC (vault):", usdc.balanceOf(vaultAddr));
        console.log("aUSDC (vault):", aUsdc.balanceOf(vaultAddr));
        console.log("");

        // Vault accounting
        console.log("--- Vault Accounting ---");
        console.log("totalDeposited:", vault.totalDeposited());
        console.log("deposits[deployer]:", vault.deposits(deployer));
        console.log("");

        // Aave account data for the vault
        console.log("--- Aave Account Data (vault) ---");
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        ) = pool.getUserAccountData(vaultAddr);

        console.log("totalCollateralBase:", totalCollateralBase);
        console.log("totalDebtBase:", totalDebtBase);
        console.log("availableBorrowsBase:", availableBorrowsBase);
        console.log("LTV:", ltv);
        console.log("liquidationThreshold:", currentLiquidationThreshold);
        console.log("healthFactor:", healthFactor);

        // List reserves
        console.log("");
        console.log("--- Aave Reserves ---");
        address[] memory reserves = pool.getReservesList();
        for (uint i = 0; i < reserves.length; i++) {
            console.log("Reserve", i, ":", reserves[i]);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  Step 3: Withdraw USDC from Aave
// ═══════════════════════════════════════════════════════════════

contract WithdrawFromAave is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address vaultAddr = vm.envAddress("MARGIN_VAULT");

        MarginVault vault = MarginVault(vaultAddr);
        IERC20 usdc = IERC20(AAVE_USDC);
        IERC20 aUsdc = IERC20(AUSDC);

        console.log("=== Withdrawing from Aave via MarginVault ===");
        console.log("Vault:", vaultAddr);
        console.log("");
        console.log("--- Before ---");
        console.log("USDC balance (deployer):", usdc.balanceOf(deployer));
        console.log("aUSDC balance (vault):", aUsdc.balanceOf(vaultAddr));
        console.log("Vault totalDeposited:", vault.totalDeposited());

        vm.startBroadcast(pk);

        // Withdraw ALL from Aave back to deployer
        // type(uint256).max tells Aave to withdraw the full aToken balance
        vault.withdrawFromAave(type(uint256).max, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("--- After ---");
        console.log("USDC balance (deployer):", usdc.balanceOf(deployer));
        console.log("aUSDC balance (vault):", aUsdc.balanceOf(vaultAddr));
        console.log("Vault totalDeposited:", vault.totalDeposited());
    }
}
