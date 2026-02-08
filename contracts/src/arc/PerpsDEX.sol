// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC20.sol";
import "../interfaces/ITokenMessengerV2.sol";
import "../interfaces/IStorkOracle.sol";

/// @title PerpsDEX - Simplified Forex Perpetual Futures (Arc Testnet)
/// @notice POC with cross-chain margin rehypothecation to Aave on Arbitrum
/// @dev Margin deposited → bridged to Arbitrum → deposited to Aave → earning yield
///      On close: withdrawn from Aave → bridged back → returned to trader
///
/// SIMPLIFIED FOR POC:
///   - Market orders only 
///   - EUR/USD pair only via Stork Oracle
///   - Simple hourly funding fee
///   - No liquidations, no protocol fees
///   - Focus: demonstrate cross-chain margin rehypothecation

contract PerpsDEX {
    // ════════════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ════════════════════════════════════════════════════════════════════

    uint32 public constant ARBITRUM_SEPOLIA_DOMAIN = 3;
    uint32 public constant FINALITY_STANDARD = 2000;
    
    // Price precision: Stork uses 18 decimals, we convert to 6 for internal use
    uint256 public constant PRICE_DECIMALS = 6;
    uint256 public constant STORK_DECIMALS = 18;
    
    // Funding rate: 1% per hour = 10000 basis points
    uint256 public constant FUNDING_RATE_PER_HOUR = 100; // 1% = 10000/1000000
    uint256 public constant FUNDING_PRECISION = 1e6;
    
    uint256 public constant MAX_LEVERAGE = 20;
    uint256 public constant MIN_LEVERAGE = 1;

    // ════════════════════════════════════════════════════════════════════
    //                           TYPES
    // ════════════════════════════════════════════════════════════════════

    struct Position {
        address trader;
        bool isLong;              // true = long EUR (buy EUR/USD), false = short EUR
        address marginToken;      // USDC or EURC address
        uint256 margin;           // in token's native decimals (18 for Arc USDC/EURC)
        uint256 size;             // notional = margin * leverage (same decimals as margin)
        uint8 leverage;
        uint256 entryPrice;       // EUR/USD price (6 decimals)
        uint64 openTimestamp;
        bool isOpen;
        bool pendingSettlement;   // waiting for funds from Arbitrum
    }

    // ════════════════════════════════════════════════════════════════════
    //                           STATE
    // ════════════════════════════════════════════════════════════════════

    address public owner;
    
    // Token addresses on Arc Testnet
    IERC20 public immutable usdc;
    IERC20 public immutable eurc;
    
    // CCTP on Arc Testnet
    ITokenMessengerV2 public immutable tokenMessenger;
    
    // Stork Oracle for EUR/USD price
    IStorkOracle public storkOracle;
    bytes32 public constant EURUSD_FEED_ID = bytes32("EURUSD"); // Stork feed ID
    
    // MarginVault on Arbitrum Sepolia
    address public marginVault;
    bytes32 public marginVaultBytes32;
    
    // Positions
    mapping(uint256 => Position) public positions;
    uint256 public nextPositionId;

    // ════════════════════════════════════════════════════════════════════
    //                           EVENTS
    // ════════════════════════════════════════════════════════════════════

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bool isLong,
        address marginToken,
        uint256 margin,
        uint256 size,
        uint8 leverage,
        uint256 entryPrice
    );

    event MarginBridged(
        uint256 indexed positionId,
        uint256 amount,
        uint64 cctpNonce
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 exitPrice,
        int256 pnl,
        uint256 fundingPaid
    );

    event WithdrawalRequested(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amount,
        uint64 cctpNonce
    );

    event PositionSettled(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amountReturned
    );

    // ════════════════════════════════════════════════════════════════════
    //                         MODIFIERS
    // ════════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ════════════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR
    // ════════════════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _eurc,
        address _tokenMessenger,
        address _storkOracle,
        address _marginVault
    ) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        storkOracle = IStorkOracle(_storkOracle);
        marginVault = _marginVault;
        marginVaultBytes32 = _addressToBytes32(_marginVault);
    }

    // ════════════════════════════════════════════════════════════════════
    //                    OPEN POSITION (MARKET ORDER)
    // ════════════════════════════════════════════════════════════════════

    /// @notice Open a new position at current market price
    /// @param isLong true = long EUR (buy EUR/USD), false = short EUR
    /// @param marginToken USDC or EURC address
    /// @param margin Amount of margin in token's native decimals (18 for Arc)
    /// @param leverage Leverage multiplier (1-20x)
    function openPosition(
        bool isLong,
        address marginToken,
        uint256 margin,
        uint8 leverage
    ) external returns (uint256 positionId) {
        require(
            marginToken == address(usdc) || marginToken == address(eurc),
            "invalid margin token"
        );
        require(margin > 0, "zero margin");
        require(
            leverage >= MIN_LEVERAGE && leverage <= MAX_LEVERAGE,
            "invalid leverage"
        );

        // Get current EUR/USD price from Stork
        uint256 currentPrice = _getStorkPrice();
        require(currentPrice > 0, "invalid price");

        // Transfer margin from trader
        IERC20(marginToken).transferFrom(msg.sender, address(this), margin);

        // Calculate position size (notional value)
        uint256 size = margin * leverage;

        // Create position
        positionId = nextPositionId++;
        positions[positionId] = Position({
            trader: msg.sender,
            isLong: isLong,
            marginToken: marginToken,
            margin: margin,
            size: size,
            leverage: leverage,
            entryPrice: currentPrice,
            openTimestamp: uint64(block.timestamp),
            isOpen: true,
            pendingSettlement: false
        });

        emit PositionOpened(
            positionId,
            msg.sender,
            isLong,
            marginToken,
            margin,
            size,
            leverage,
            currentPrice
        );

        // Bridge margin to Arbitrum MarginVault via CCTP
        _bridgeMarginToArbitrum(positionId, marginToken, margin);
    }

    // ════════════════════════════════════════════════════════════════════
    //                         CLOSE POSITION
    // ════════════════════════════════════════════════════════════════════

    /// @notice Close an open position, calculate PnL, request margin withdrawal
    function closePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "position not open");
        require(pos.trader == msg.sender, "not your position");
        require(!pos.pendingSettlement, "already closing");

        // Get current price
        uint256 exitPrice = _getStorkPrice();
        require(exitPrice > 0, "invalid price");

        // Calculate PnL
        int256 pnl = _calculatePnl(pos);

        // Calculate funding fee (simple hourly rate)
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1; // minimum 1 hour
        uint256 fundingFee = (pos.margin * FUNDING_RATE_PER_HOUR * hoursOpen) / FUNDING_PRECISION;

        // Update position
        pos.isOpen = false;
        pos.pendingSettlement = true;

        // Calculate net return amount: margin + pnl - funding (clamped to 0)
        int256 netReturn = int256(pos.margin) + pnl - int256(fundingFee);
        uint256 returnAmount = netReturn > 0 ? uint256(netReturn) : 0;

        emit PositionClosed(positionId, msg.sender, exitPrice, pnl, fundingFee);

        // If there's anything to return, request withdrawal from Arbitrum
        if (returnAmount > 0) {
            // Convert 18-decimal Arc amount to 6-decimal Arbitrum amount for CCTP
            uint256 arbAmount = returnAmount / 1e12; // 18 → 6 decimals
            
            emit WithdrawalRequested(positionId, msg.sender, arbAmount, 0);
            // Note: cctpNonce will be set when relayer actually bridges back
        } else {
            // No funds to return, settle immediately
            pos.pendingSettlement = false;
            emit PositionSettled(positionId, msg.sender, 0);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //                   SETTLEMENT (AFTER BRIDGE BACK)
    // ════════════════════════════════════════════════════════════════════

    /// @notice Settle position after funds return from Arbitrum via CCTP
    /// @dev Called by owner/relayer after receiveMessage mints tokens to this contract
    function settleWithdrawal(uint256 positionId) external onlyOwner {
        Position storage pos = positions[positionId];
        require(pos.pendingSettlement, "not pending settlement");

        // Calculate what should be returned
        uint256 exitPrice = _getStorkPrice();
        int256 pnl = _calculatePnl(pos);
        
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1;
        uint256 fundingFee = (pos.margin * FUNDING_RATE_PER_HOUR * hoursOpen) / FUNDING_PRECISION;
        
        int256 netReturn = int256(pos.margin) + pnl - int256(fundingFee);
        uint256 payout = netReturn > 0 ? uint256(netReturn) : 0;

        pos.pendingSettlement = false;

        if (payout > 0) {
            // Transfer returned margin + pnl to trader
            IERC20(pos.marginToken).transfer(pos.trader, payout);
        }

        emit PositionSettled(positionId, pos.trader, payout);
    }

    // ════════════════════════════════════════════════════════════════════
    //                      VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

    /// @notice Get current EUR/USD price from Stork
    function getCurrentPrice() external view returns (uint256) {
        return _getStorkPrice();
    }

    /// @notice Get unrealized PnL for an open position
    function getUnrealizedPnl(uint256 positionId) external view returns (int256) {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "position not open");
        return _calculatePnl(pos);
    }

    /// @notice Get accumulated funding fee for a position
    function getAccumulatedFunding(uint256 positionId) external view returns (uint256) {
        Position storage pos = positions[positionId];
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1;
        return (pos.margin * FUNDING_RATE_PER_HOUR * hoursOpen) / FUNDING_PRECISION;
    }

    /// @notice Get position details
    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    // ════════════════════════════════════════════════════════════════════
    //                     ADMIN FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

    function setStorkOracle(address _oracle) external onlyOwner {
        storkOracle = IStorkOracle(_oracle);
    }

    function setMarginVault(address _vault) external onlyOwner {
        marginVault = _vault;
        marginVaultBytes32 = _addressToBytes32(_vault);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    // ════════════════════════════════════════════════════════════════════
    //                    INTERNAL FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

    /// @notice Bridge margin to Arbitrum MarginVault via CCTP
    function _bridgeMarginToArbitrum(
        uint256 positionId,
        address token,
        uint256 amount
    ) internal {
        // Approve TokenMessenger
        IERC20(token).approve(address(tokenMessenger), amount);

        // Burn tokens on Arc, will be minted to MarginVault on Arbitrum
        uint64 nonce = tokenMessenger.depositForBurn(
            amount,
            ARBITRUM_SEPOLIA_DOMAIN,
            marginVaultBytes32,
            token,
            bytes32(0), // anyone can call receiveMessage
            0,          // no fee for testnet
            FINALITY_STANDARD
        );

        emit MarginBridged(positionId, amount, nonce);
    }

    /// @notice Get EUR/USD price from Stork Oracle
    /// @dev Converts Stork's 18-decimal price to our 6-decimal internal format
    function _getStorkPrice() internal view returns (uint256) {
        (
            bytes32 id,
            int192 value,
            uint64 timestamp,
            , // qualifiers
              // encodedAsset
        ) = storkOracle.getTemporalNumericValueV1(EURUSD_FEED_ID);

        require(id == EURUSD_FEED_ID, "invalid feed");
        require(value > 0, "invalid price");
        require(block.timestamp - timestamp < 1 hours, "stale price");

        // Convert 18 decimals → 6 decimals
        return uint256(uint192(value)) / 1e12;
    }

    /// @notice Calculate PnL for a position based on current price
    /// @dev Long:  PnL = size * (currentPrice - entryPrice) / entryPrice
    ///      Short: PnL = size * (entryPrice - currentPrice) / entryPrice
    function _calculatePnl(Position storage pos) internal view returns (int256) {
        uint256 currentPrice = _getStorkPrice();
        
        if (pos.isLong) {
            // Long EUR: profit if EUR/USD rises
            if (currentPrice >= pos.entryPrice) {
                return int256((pos.size * (currentPrice - pos.entryPrice)) / pos.entryPrice);
            } else {
                return -int256((pos.size * (pos.entryPrice - currentPrice)) / pos.entryPrice);
            }
        } else {
            // Short EUR: profit if EUR/USD falls
            if (pos.entryPrice >= currentPrice) {
                return int256((pos.size * (pos.entryPrice - currentPrice)) / pos.entryPrice);
            } else {
                return -int256((pos.size * (currentPrice - pos.entryPrice)) / pos.entryPrice);
            }
        }
    }

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}
