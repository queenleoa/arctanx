// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC20.sol";
import "../interfaces/ITokenMessengerV2.sol";
import "../interfaces/IAaveV3Pool.sol";

/// @title MarginVault - Cross-Chain Margin Rehypothecation Vault (Arbitrum Sepolia)
/// @notice Receives USDC bridged from Arc Testnet via CCTP, deposits into Aave V3
///         for yield. On withdrawal, pulls from Aave and bridges back via CCTP.
///
/// FLOW:
///   1. CCTP receiveMessage() mints USDC directly to this contract
///   2. Relayer calls depositToAave() to supply USDC to Aave V3
///   3. Yield accrues via aUSDC balance growth
///   4. On position close, relayer calls withdrawAndBridge()
///   5. Vault withdraws from Aave and bridges USDC back to Arc via CCTP
///
/// DEPLOYED ON: Arbitrum Sepolia (domain 3)
/// USDC: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (6 decimals)
///
/// NOTE: Verify that Aave V3 on Arbitrum Sepolia accepts this USDC contract.
///       Some Aave testnet deployments may use USDC.e (bridged USDC) instead.
///       If so, you'll need a separate swap step or use the correct token.

contract MarginVault {
    // ═══════════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    uint32 public constant ARC_TESTNET_DOMAIN = 26;
    uint32 public constant FINALITY_STANDARD = 2000;

    // ═══════════════════════════════════════════════════════════════════
    //                           STATE
    // ═══════════════════════════════════════════════════════════════════

    address public owner;
    address public relayer;                       // authorized relayer for operations

    IERC20 public usdc;                           // USDC on Arbitrum Sepolia
    IERC20 public aUsdc;                          // aUSDC (Aave interest-bearing token)
    IAaveV3Pool public aavePool;                  // Aave V3 Pool
    ITokenMessengerV2 public tokenMessenger;      // CCTP TokenMessengerV2 on Arbitrum

    address public perpsDex;                      // PerpsDEX contract on Arc Testnet
    bytes32 public perpsDexBytes32;               // PerpsDEX as bytes32 for CCTP

    // Accounting
    uint256 public totalDeposited;                // total USDC deposited to Aave
    uint256 public totalWithdrawn;                // total USDC withdrawn from Aave

    // ═══════════════════════════════════════════════════════════════════
    //                           EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event DepositedToAave(uint256 amount, uint256 totalInAave);
    event WithdrawnFromAave(uint256 amount);
    event BridgedBackToArc(uint256 amount, bytes32 recipient, uint64 cctpNonce);
    event WithdrawAndBridgeExecuted(
        uint256 amount,
        bytes32 recipient,
        uint64 cctpNonce
    );
    event EmergencyWithdrawal(address token, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════
    //                         MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == relayer, "not authorized");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════

    /// @param _usdc USDC address on Arbitrum Sepolia
    /// @param _aUsdc aUSDC address on Arbitrum Sepolia (Aave interest-bearing)
    /// @param _aavePool Aave V3 Pool address on Arbitrum Sepolia
    /// @param _tokenMessenger CCTP TokenMessengerV2 on Arbitrum Sepolia
    /// @param _perpsDex PerpsDEX contract address on Arc Testnet
    constructor(
        address _usdc,
        address _aUsdc,
        address _aavePool,
        address _tokenMessenger,
        address _perpsDex
    ) {
        owner = msg.sender;
        relayer = msg.sender; // default relayer is owner

        usdc = IERC20(_usdc);
        aUsdc = IERC20(_aUsdc);
        aavePool = IAaveV3Pool(_aavePool);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        perpsDex = _perpsDex;
        perpsDexBytes32 = _addressToBytes32(_perpsDex);

        // Pre-approve Aave Pool to spend USDC (max approval for convenience)
        usdc.approve(_aavePool, type(uint256).max);
        // Pre-approve CCTP TokenMessenger to spend USDC
        usdc.approve(_tokenMessenger, type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                    DEPOSIT TO AAVE
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Deposit USDC held by this contract into Aave V3 lending pool
    /// @dev Called by relayer after CCTP receiveMessage mints USDC to this vault.
    ///      Can deposit all available USDC or a specific amount.
    /// @param amount Amount to deposit (0 = deposit all available USDC balance)
    function depositToAave(uint256 amount) external onlyAuthorized {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "no USDC to deposit");

        uint256 depositAmount = amount == 0 ? balance : amount;
        require(depositAmount <= balance, "insufficient balance");

        // Supply USDC to Aave V3
        aavePool.supply(
            address(usdc),
            depositAmount,
            address(this),  // aTokens accrue to this vault
            0               // no referral
        );

        totalDeposited += depositAmount;

        emit DepositedToAave(depositAmount, getAaveBalance());
    }

    // ═══════════════════════════════════════════════════════════════════
    //              WITHDRAW FROM AAVE + BRIDGE BACK TO ARC
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Withdraw USDC from Aave and bridge back to Arc Testnet via CCTP
    /// @dev Called by relayer when a position is closed on Arc.
    ///      The PerpsDEX emits WithdrawalRequested, relayer picks it up
    ///      and calls this function.
    /// @param amount Amount of USDC to withdraw and bridge (in Arbitrum 6-decimal units)
    /// @param recipient Address on Arc Testnet to receive the USDC (as bytes32)
    function withdrawAndBridge(
        uint256 amount,
        bytes32 recipient
    ) external onlyAuthorized {
        require(amount > 0, "zero amount");

        // Step 1: Withdraw from Aave
        uint256 withdrawn = aavePool.withdraw(
            address(usdc),
            amount,
            address(this)  // withdraw to this vault first
        );

        totalWithdrawn += withdrawn;
        emit WithdrawnFromAave(withdrawn);

        // Step 2: Bridge back to Arc via CCTP
        uint64 nonce = tokenMessenger.depositForBurn(
            withdrawn,
            ARC_TESTNET_DOMAIN,       // destination: Arc Testnet
            recipient,                 // mint recipient on Arc
            address(usdc),             // burn token on Arbitrum
            bytes32(0),                // anyone can call receiveMessage
            0,                         // max fee (0 for testnet)
            FINALITY_STANDARD
        );

        emit BridgedBackToArc(withdrawn, recipient, nonce);
        emit WithdrawAndBridgeExecuted(withdrawn, recipient, nonce);
    }

    /// @notice Convenience: withdraw and bridge back to the PerpsDEX contract
    /// @param amount Amount to withdraw and bridge
    function withdrawAndBridgeToDex(uint256 amount) external onlyAuthorized {
        require(amount > 0, "zero amount");

        uint256 withdrawn = aavePool.withdraw(
            address(usdc),
            amount,
            address(this)
        );

        totalWithdrawn += withdrawn;
        emit WithdrawnFromAave(withdrawn);

        uint64 nonce = tokenMessenger.depositForBurn(
            withdrawn,
            ARC_TESTNET_DOMAIN,
            perpsDexBytes32,           // mint to PerpsDEX on Arc
            address(usdc),
            bytes32(0),
            0,
            FINALITY_STANDARD
        );

        emit BridgedBackToArc(withdrawn, perpsDexBytes32, nonce);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Get total USDC deposited in Aave (includes accrued interest)
    function getAaveBalance() public view returns (uint256) {
        return aUsdc.balanceOf(address(this));
    }

    /// @notice Get idle USDC sitting in vault (not yet deposited to Aave)
    function getIdleBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Get total yield earned from Aave
    function getYieldEarned() external view returns (uint256) {
        uint256 aaveBalance = getAaveBalance();
        uint256 netDeposited = totalDeposited > totalWithdrawn
            ? totalDeposited - totalWithdrawn
            : 0;
        return aaveBalance > netDeposited ? aaveBalance - netDeposited : 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function setPerpsDex(address _perpsDex) external onlyOwner {
        perpsDex = _perpsDex;
        perpsDexBytes32 = _addressToBytes32(_perpsDex);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    /// @notice Emergency: withdraw all from Aave and send to owner
    function emergencyWithdrawAave() external onlyOwner {
        uint256 aaveBalance = getAaveBalance();
        if (aaveBalance > 0) {
            aavePool.withdraw(address(usdc), type(uint256).max, owner);
        }
        uint256 usdcBalance = usdc.balanceOf(address(this));
        if (usdcBalance > 0) {
            usdc.transfer(owner, usdcBalance);
        }
        emit EmergencyWithdrawal(address(usdc), aaveBalance + usdcBalance);
    }

    /// @notice Emergency: withdraw any ERC20 stuck in the contract
    function emergencyWithdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
        emit EmergencyWithdrawal(token, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}
