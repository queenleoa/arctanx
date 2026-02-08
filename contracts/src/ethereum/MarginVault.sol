// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAavePool} from "../interfaces/IAavePool.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title MarginVault - Deposits and withdraws USDC from Aave V3 lending pool
/// @notice POC for cross-chain margin rehypothecation on Eth Sepolia
/// @dev Deployed on Eth Sepolia, interacts with Aave V3 Pool
contract MarginVault {
    // ═══════════════════════════════════════════════════════════
    //                        STATE
    // ═══════════════════════════════════════════════════════════

    IAavePool public immutable aavePool;
    IERC20 public immutable usdc;
    IERC20 public immutable aUsdc;
    address public owner;

    /// @notice Tracks how much each user has deposited (rehypothecated) into Aave
    mapping(address => uint256) public deposits;

    /// @notice Total USDC deposited into Aave through this vault
    uint256 public totalDeposited;

    // ═══════════════════════════════════════════════════════════
    //                        EVENTS
    // ═══════════════════════════════════════════════════════════

    event Deposited(address indexed user, uint256 amount, uint256 aTokenBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 actualWithdrawn);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ═══════════════════════════════════════════════════════════
    //                       MODIFIERS
    // ═══════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "MarginVault: not owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════
    //                      CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    /// @param _aavePool Aave V3 Pool address on Eth Sepolia
    /// @param _usdc USDC token address (Aave testnet USDC)
    /// @param _aUsdc aUSDC token address on Eth Sepolia
    constructor(address _aavePool, address _usdc, address _aUsdc) {
        aavePool = IAavePool(_aavePool);
        usdc = IERC20(_usdc);
        aUsdc = IERC20(_aUsdc);
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════
    //                   CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /// @notice Deposit USDC into Aave lending pool (rehypothecation)
    /// @dev Caller must have approved this contract to spend their USDC first
    /// @param amount Amount of USDC to deposit (6 decimals)
    function depositToAave(uint256 amount) external {
        require(amount > 0, "MarginVault: zero amount");

        // Transfer USDC from caller to this contract
        usdc.transferFrom(msg.sender, address(this), amount);

        // Approve Aave Pool to spend USDC
        usdc.approve(address(aavePool), amount);

        // Supply USDC to Aave — aTokens are minted to THIS contract
        aavePool.supply(address(usdc), amount, address(this), 0);

        // Track deposit
        deposits[msg.sender] += amount;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount, aUsdc.balanceOf(address(this)));
    }

    /// @notice Withdraw USDC from Aave lending pool
    /// @dev Sends withdrawn USDC to the specified recipient
    /// @param amount Amount of USDC to withdraw (6 decimals). Use type(uint256).max for all.
    /// @param to Address to receive the withdrawn USDC
    function withdrawFromAave(uint256 amount, address to) external onlyOwner {
        require(to != address(0), "MarginVault: zero address");

        // Withdraw from Aave — USDC sent directly to `to`
        uint256 actualWithdrawn = aavePool.withdraw(address(usdc), amount, to);

        // Update accounting (cap at totalDeposited to handle yield edge cases)
        if (actualWithdrawn >= totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= actualWithdrawn;
        }

        emit Withdrawn(msg.sender, amount, actualWithdrawn);
    }

    /// @notice Withdraw USDC from Aave back to a specific user
    /// @param user The user whose margin is being returned
    /// @param amount Amount to withdraw
    function withdrawForUser(address user, uint256 amount) external onlyOwner {
        require(deposits[user] >= amount, "MarginVault: insufficient deposit");

        deposits[user] -= amount;
        totalDeposited -= amount;

        uint256 actualWithdrawn = aavePool.withdraw(address(usdc), amount, user);

        emit Withdrawn(user, amount, actualWithdrawn);
    }

    // ═══════════════════════════════════════════════════════════
    //                     VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /// @notice Get the current aUSDC balance (includes accrued yield)
    function getATokenBalance() external view returns (uint256) {
        return aUsdc.balanceOf(address(this));
    }

    /// @notice Get the vault's USDC balance (not deposited into Aave)
    function getUsdcBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Get Aave account data for this vault
    function getAaveAccountData()
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return aavePool.getUserAccountData(address(this));
    }

    // ═══════════════════════════════════════════════════════════
    //                       ADMIN
    // ═══════════════════════════════════════════════════════════

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MarginVault: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Emergency: rescue any ERC20 tokens stuck in this contract
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }
}
