// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Minimal Aave V3 Pool interface
interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// @title MarginVault - Yield-Earning Margin Vault (Bridge Kit Edition)
/// @notice Deployed on Ethereum Sepolia.
///         Receives USDC via Bridge Kit (CCTP under the hood, but handled off-chain).
///         Deposits margin to Aave V3 to earn yield.
///         Returns margin via Bridge Kit when positions close.
///
/// @dev With Bridge Kit handling all cross-chain transfers, this contract
///      ONLY needs to manage Aave deposits/withdrawals. Much simpler!
///
///      Architecture:
///        - Bridge Kit mints USDC directly to this vault's address
///        - Owner (your API) calls recordDeposit() after bridge confirms
///        - Owner calls deployToAave() to earn yield
///        - Owner calls withdrawFromAave() + transfers out before bridging back
contract MarginVault is Ownable {
    using SafeERC20 for IERC20;

    // ─── Ethereum Sepolia Constants ─────────────────────────────────────
    IERC20  public constant USDC  = IERC20(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238); // 6 dec
    IERC20  public constant aUSDC = IERC20(0x16dA4541aD1807f4443d92D26044C1147406EB80); // Aave aToken

    // Aave V3 Pool on Ethereum Sepolia
    IPool   public constant AAVE_POOL = IPool(0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951);

    // ─── Types ──────────────────────────────────────────────────────────
    struct MarginDeposit {
        uint256 amount;          // amount received (6 decimals)
        uint256 depositTime;
        bool    inAave;          // currently deployed to Aave
        bool    withdrawn;       // margin returned to trader
    }

    // ─── State ──────────────────────────────────────────────────────────
    mapping(uint256 => MarginDeposit) public deposits;  // positionId => deposit
    uint256 public totalMarginHeld;
    uint256 public totalInAave;

    // ─── Events ─────────────────────────────────────────────────────────
    event MarginReceived(uint256 indexed positionId, uint256 amount);
    event DeployedToAave(uint256 indexed positionId, uint256 amount);
    event WithdrawnFromAave(uint256 indexed positionId, uint256 amount, uint256 yield);
    event MarginReleased(uint256 indexed positionId, uint256 amount);

    constructor() Ownable(msg.sender) {}

    // ═════════════════════════════════════════════════════════════════════
    //  RECORD DEPOSIT — called by API after Bridge Kit mint confirms
    // ═════════════════════════════════════════════════════════════════════
    /// @notice Records margin that arrived via Bridge Kit from Arc.
    /// @dev Your API route calls this after kit.bridge() returns mintTxHash.
    ///      The USDC is already sitting in this contract's balance.
    function recordDeposit(uint256 positionId, uint256 amount) external onlyOwner {
        require(deposits[positionId].amount == 0, "Already deposited");
        require(amount > 0, "Zero amount");

        deposits[positionId] = MarginDeposit({
            amount: amount,
            depositTime: block.timestamp,
            inAave: false,
            withdrawn: false
        });

        totalMarginHeld += amount;
        emit MarginReceived(positionId, amount);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  AAVE YIELD — deposit and withdraw margin from Aave V3
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Deploy margin to Aave V3 to earn yield
    function deployToAave(uint256 positionId) external onlyOwner {
        MarginDeposit storage dep = deposits[positionId];
        require(dep.amount > 0, "No deposit");
        require(!dep.withdrawn, "Already withdrawn");
        require(!dep.inAave, "Already in Aave");

        dep.inAave = true;
        totalInAave += dep.amount;

        USDC.approve(address(AAVE_POOL), dep.amount);
        AAVE_POOL.supply(address(USDC), dep.amount, address(this), 0);

        emit DeployedToAave(positionId, dep.amount);
    }

    /// @notice Withdraw margin + yield from Aave V3
    /// @return withdrawn Actual amount withdrawn (principal + yield)
    function withdrawFromAave(uint256 positionId) external onlyOwner returns (uint256 withdrawn) {
        MarginDeposit storage dep = deposits[positionId];
        require(dep.inAave, "Not in Aave");

        uint256 balBefore = USDC.balanceOf(address(this));

        // type(uint256).max withdraws full balance including yield
        AAVE_POOL.withdraw(address(USDC), type(uint256).max, address(this));

        withdrawn = USDC.balanceOf(address(this)) - balBefore;
        uint256 yieldEarned = withdrawn > dep.amount ? withdrawn - dep.amount : 0;

        dep.inAave = false;
        totalInAave -= dep.amount;

        emit WithdrawnFromAave(positionId, withdrawn, yieldEarned);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RELEASE MARGIN — prepare for Bridge Kit to send back to Arc
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Mark margin as released and transfer USDC out of vault
    /// @dev Called by API before initiating Bridge Kit transfer back to Arc.
    ///      Sends USDC to the owner (your API's wallet) which Bridge Kit
    ///      will then bridge back to the trader on Arc.
    function releaseMargin(uint256 positionId, address recipient, uint256 amount) external onlyOwner {
        MarginDeposit storage dep = deposits[positionId];
        require(dep.amount > 0, "No deposit");
        require(!dep.withdrawn, "Already withdrawn");

        // If still in Aave, withdraw first
        if (dep.inAave) {
            this.withdrawFromAave(positionId);
        }

        dep.withdrawn = true;
        totalMarginHeld -= dep.amount;

        // Transfer to the wallet that Bridge Kit will bridge from
        USDC.safeTransfer(recipient, amount);

        emit MarginReleased(positionId, amount);
    }

    // ─── Views ──────────────────────────────────────────────────────────
    function getDeposit(uint256 positionId) external view returns (MarginDeposit memory) {
        return deposits[positionId];
    }

    /// @notice Check yield earned for a position (approximate, queries aToken balance)
    function getYieldEarned(uint256 positionId) external view returns (uint256) {
        MarginDeposit memory dep = deposits[positionId];
        if (!dep.inAave) return 0;

        // aToken balance grows over time with yield
        uint256 aTokenBal = aUSDC.balanceOf(address(this));
        if (aTokenBal <= totalInAave) return 0;

        // Approximate: proportional yield based on this position's share
        uint256 totalYield = aTokenBal - totalInAave;
        return (totalYield * dep.amount) / totalInAave;
    }

    // ─── Emergency ──────────────────────────────────────────────────────
    function recoverToken(address token, uint256 amt) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amt);
    }
}
