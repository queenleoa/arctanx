// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC20.sol";
import "../interfaces/ITokenMessengerV2.sol";
import "../interfaces/IAaveV3Pool.sol";

/// @title MarginVault - Simplified Cross-Chain Margin Vault (ETHSepolia)
/// @notice Receives margin (USDC) via CCTP, deposits to Aave, returns on withdrawal
/// @dev POC for cross-chain margin rehypothecation:
///      1. CCTP mints tokens to this vault
///      2. Relayer calls depositToAave()
///      3. Yield accrues via aToken balance
///      4. On close, relayer calls withdrawAndBridge()
///      5. CCTP bridges back to Arc
///
/// SIMPLIFIED:
///   - Supports only USDC 
///   - No complex accounting, just deposit/withdraw
///   - Focus on demonstrating the cross-chain flow

contract MarginVault {
    // ════════════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ════════════════════════════════════════════════════════════════════

    uint32 public constant ARC_TESTNET_DOMAIN = 26;
    uint32 public constant FINALITY_STANDARD = 2000;

    // ════════════════════════════════════════════════════════════════════
    //                           STATE
    // ════════════════════════════════════════════════════════════════════

    address public owner;
    address public relayer;

    // Tokens on Eth Sepolia (6 decimals)
    IERC20 public immutable usdc;
    
    // Aave aTokens (6 decimals, 1:1 with underlying)
    IERC20 public immutable aUsdc;
    
    // Aave V3 Pool
    IAaveV3Pool public immutable aavePool;
    
    // CCTP on Arbitrum
    ITokenMessengerV2 public immutable tokenMessenger;
    
    // PerpsDEX on Arc Testnet
    address public perpsDex;
    bytes32 public perpsDexBytes32;

    // ════════════════════════════════════════════════════════════════════
    //                      POSITION ACCOUNTING
    // ════════════════════════════════════════════════════════════════════
    
    // Track deposits per position for fair yield distribution
    struct PositionDeposit {
        address token;           // USDC or EURC
        uint256 initialAmount;   // Amount deposited (6 decimals)
        uint256 aTokenSnapshot;  // aToken balance at deposit time
        uint64 depositTime;      // When this was deposited
        bool withdrawn;          // Has this been withdrawn?
    }
    
    mapping(uint256 => PositionDeposit) public positionDeposits;
    
    // Track total deposits per token for proportional yield calculation
    uint256 public totalUsdcDeposited;

    // ════════════════════════════════════════════════════════════════════
    //                           EVENTS
    // ════════════════════════════════════════════════════════════════════

    event ReceivedFromArc(uint256 indexed positionId, address token, uint256 amount);
    event DepositedToAave(uint256 indexed positionId, address token, uint256 amount);
    event WithdrawnFromAave(uint256 indexed positionId, address token, uint256 amount, uint256 yield);
    event BridgedBackToArc(uint256 indexed positionId, address token, uint256 amount, uint64 nonce);

    // ════════════════════════════════════════════════════════════════════
    //                         MODIFIERS
    // ════════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == relayer, "not authorized");
        _;
    }

    // ════════════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR
    // ════════════════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _aUsdc,
        address _aavePool,
        address _tokenMessenger,
        address _perpsDex
    ) {
        owner = msg.sender;
        relayer = msg.sender;

        usdc = IERC20(_usdc);
        aUsdc = IERC20(_aUsdc);
        aavePool = IAaveV3Pool(_aavePool);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        
        perpsDex = _perpsDex;
        perpsDexBytes32 = _addressToBytes32(_perpsDex);

        // Pre-approve Aave Pool and TokenMessenger for max convenience
        usdc.approve(_aavePool, type(uint256).max);
        usdc.approve(_tokenMessenger, type(uint256).max);
    }

    // ════════════════════════════════════════════════════════════════════
    //                    DEPOSIT TO AAVE
    // ════════════════════════════════════════════════════════════════════

    /// @notice Deposit margin for a specific position to Aave
    /// @dev Called by relayer after CCTP mints tokens to this vault
    /// @param positionId The position ID from PerpsDEX
    /// @param token USDC or EURC address
    /// @param amount Amount to deposit (6 decimals on ETH Sepolia)
    function depositToAave(uint256 positionId, address token, uint256 amount) external onlyAuthorized {
        require(amount > 0, "zero amount");
        require(
            token == address(usdc),
            "invalid token"
        );
        require(!positionDeposits[positionId].withdrawn, "position already deposited");
        
        // Get current aToken balance before deposit
        uint256 aTokenBalanceBefore = _getATokenBalance(token);
        
        // Deposit to Aave
        aavePool.supply(
            token,
            amount,
            address(this), // aTokens to this vault
            0              // no referral
        );
        
        // Record position deposit for fair yield distribution
        positionDeposits[positionId] = PositionDeposit({
            token: token,
            initialAmount: amount,
            aTokenSnapshot: aTokenBalanceBefore + amount, // Total aTokens after this deposit
            depositTime: uint64(block.timestamp),
            withdrawn: false
        });
        
        // Track totals
            totalUsdcDeposited += amount;
       

        emit ReceivedFromArc(positionId, token, amount);
        emit DepositedToAave(positionId, token, amount);
    }

    /// @notice Deposit all idle tokens to Aave (backward compatibility)
    /// @dev This should not be used with position tracking enabled
    function depositAllToAave() external onlyAuthorized {
        _depositToAave(address(usdc), usdc.balanceOf(address(this)));
    }

    /// @notice Internal: deposit token to Aave V3 (without position tracking)
    function _depositToAave(address token, uint256 amount) internal {
        if (amount == 0) return;
        
        require(
            token == address(usdc),
            "invalid token"
        );

        aavePool.supply(
            token,
            amount,
            address(this), // aTokens to this vault
            0              // no referral
        );
    }

    // ════════════════════════════════════════════════════════════════════
    //              WITHDRAW FROM AAVE + BRIDGE BACK
    // ════════════════════════════════════════════════════════════════════

    /// @notice Withdraw from Aave and bridge back to Arc for a specific position
    /// @dev Calculates position's share of yield before withdrawal
    /// @param positionId The position ID from PerpsDEX
    /// @param amount Amount requested to withdraw (6 decimals, includes principal + PnL)
    function withdrawAndBridgeForPosition(
        uint256 positionId,
        uint256 amount
    ) external onlyAuthorized {
        require(amount > 0, "zero amount");
        
        PositionDeposit storage deposit = positionDeposits[positionId];
        require(!deposit.withdrawn, "already withdrawn");
        require(deposit.initialAmount > 0, "position not found");
        
        address token = deposit.token;
        
        // Calculate this position's share of accrued yield
        uint256 currentATokenBalance = _getATokenBalance(token);
        uint256 totalDeposited = totalUsdcDeposited;
        
        // Position's proportional share of total yield
        // yield = (currentATokenBalance - totalDeposited) * (initialAmount / totalDeposited)
        uint256 totalYield = currentATokenBalance > totalDeposited 
            ? currentATokenBalance - totalDeposited 
            : 0;
        
        uint256 positionYield = totalDeposited > 0
            ? (totalYield * deposit.initialAmount) / totalDeposited
            : 0;
        
        // Total amount to withdraw: requested amount + position's yield share
        uint256 totalWithdrawal = amount + positionYield;
        
        // Withdraw from Aave
        uint256 withdrawn = aavePool.withdraw(
            token,
            totalWithdrawal,
            address(this) // withdraw to this vault
        );
        
        // Mark as withdrawn
        deposit.withdrawn = true;
        
        // Update totals
            totalUsdcDeposited -= deposit.initialAmount;
        
        emit WithdrawnFromAave(positionId, token, withdrawn, positionYield);

        // Bridge back to Arc via CCTP
        uint64 nonce = tokenMessenger.depositForBurn(
            withdrawn,
            ARC_TESTNET_DOMAIN,
            perpsDexBytes32, // mint to PerpsDEX on Arc
            token,
            bytes32(0),      // anyone can call receiveMessage
            0,               // no fee for testnet
            FINALITY_STANDARD
        );

        emit BridgedBackToArc(positionId, token, withdrawn, nonce);
    }

    /// @notice Withdraw from Aave and bridge back (backward compatibility, no position tracking)
    /// @param token USDC address
    /// @param amount Amount to withdraw (6 decimals on Arbitrum)
    function withdrawAndBridge(address token, uint256 amount) external onlyAuthorized {
        require(amount > 0, "zero amount");
        require(
            token == address(usdc),
            "invalid token"
        );

        // Step 1: Withdraw from Aave
        uint256 withdrawn = aavePool.withdraw(
            token,
            amount,
            address(this) // withdraw to this vault first
        );

        // Step 2: Bridge back to Arc via CCTP
        uint64 nonce = tokenMessenger.depositForBurn(
            withdrawn,
            ARC_TESTNET_DOMAIN,
            perpsDexBytes32, // mint to PerpsDEX on Arc
            token,
            bytes32(0),      // anyone can call receiveMessage
            0,               // no fee for testnet
            FINALITY_STANDARD
        );
    }

    // ════════════════════════════════════════════════════════════════════
    //                     VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

    /// @notice Get USDC balance in Aave (includes yield)
    function getAaveUsdcBalance() external view returns (uint256) {
        return aUsdc.balanceOf(address(this));
    }

    /// @notice Get idle token balance (not deposited to Aave yet)
    function getIdleBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    /// @notice Get position deposit details
    function getPositionDeposit(uint256 positionId) external view returns (PositionDeposit memory) {
        return positionDeposits[positionId];
    }
    
    /// @notice Calculate accrued yield for a specific position
    /// @dev Returns the yield earned since deposit based on proportional share
    function getPositionYield(uint256 positionId) external view returns (uint256) {
        PositionDeposit storage deposit = positionDeposits[positionId];
        if (deposit.withdrawn || deposit.initialAmount == 0) return 0;
        
        address token = deposit.token;
        uint256 currentATokenBalance = _getATokenBalance(token);
        uint256 totalDeposited = totalUsdcDeposited;
        
        if (totalDeposited == 0) return 0;
        
        // Total yield across all positions for this token
        uint256 totalYield = currentATokenBalance > totalDeposited 
            ? currentATokenBalance - totalDeposited 
            : 0;
        
        // This position's proportional share
        return (totalYield * deposit.initialAmount) / totalDeposited;
    }
    
    /// @notice Internal helper to get aToken balance for a token
    function _getATokenBalance(address token) internal view returns (uint256) {
        if (token == address(usdc)) {
            return aUsdc.balanceOf(address(this));
        }
        return 0;
    }

    // ════════════════════════════════════════════════════════════════════
    //                      ADMIN FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

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
    function emergencyWithdrawAll() external onlyOwner {
        // Withdraw USDC
        uint256 aUsdcBal = aUsdc.balanceOf(address(this));
        if (aUsdcBal > 0) {
            aavePool.withdraw(address(usdc), type(uint256).max, owner);
        }
        
        // Send any idle balances
        uint256 usdcBal = usdc.balanceOf(address(this));
        if (usdcBal > 0) usdc.transfer(owner, usdcBal);
    }

    /// @notice Emergency: withdraw any token
    function emergencyWithdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    // ════════════════════════════════════════════════════════════════════
    //                      INTERNAL
    // ════════════════════════════════════════════════════════════════════

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}
