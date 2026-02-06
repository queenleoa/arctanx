// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC20.sol";
import "../interfaces/ITokenMessengerV2.sol";

/// @title PerpsDEX - Cross-Chain Perpetual Futures DEX (Arc Testnet)
/// @notice POC orderbook-style perps with cross-chain margin rehypothecation
/// @dev Deployed on Arc Testnet. Margin is bridged to Arbitrum Sepolia via CCTP
///      and deposited into Aave V3 for yield (rehypothecation).
///
/// ARCHITECTURE:
///   User deposits USDC margin on Arc → CCTP bridge to Arbitrum →
///   MarginVault deposits into Aave → yield accrues on idle margin.
///   On close: MarginVault withdraws from Aave → CCTP bridge back →
///   PerpsDEX settles PnL and returns funds to user.
///

contract PerpsDEX {
    // ═══════════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    uint32 public constant ARBITRUM_SEPOLIA_DOMAIN = 3;
    uint32 public constant FINALITY_STANDARD = 2000;
    uint32 public constant FINALITY_FAST = 1000;
    uint256 public constant PRICE_PRECISION = 1e8;        // 8 decimal price
    uint256 public constant FUNDING_RATE_PRECISION = 1e6; // basis point precision
    uint256 public constant MAX_LEVERAGE = 20;

    // ═══════════════════════════════════════════════════════════════════
    //                           TYPES
    // ═══════════════════════════════════════════════════════════════════

    struct Position {
        address trader;
        bytes32 pair;             // e.g., keccak256("EURUSD"), keccak256("USDEUR")
        bool isLong;
        uint256 margin;           // USDC margin in Arc-native decimals (18)
        uint256 size;             // notional = margin * leverage (18 decimals)
        uint256 entryPrice;       // 8 decimal precision
        uint64 openTimestamp;
        bool isOpen;
        bool pendingSettlement;   // waiting for funds to return from Arbitrum
        int256 realizedPnl;       // set when position is closed
        uint256 fundingOwed;      // accumulated funding fee
    }

    enum OrderSide { Long, Short }

    struct Order {
        address trader;
        bytes32 pair;
        OrderSide side;
        uint256 price;            // limit price (8 decimals)
        uint256 margin;           // margin amount (18 decimals)
        uint8 leverage;
        bool isActive;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                           STATE
    // ═══════════════════════════════════════════════════════════════════

    address public owner;
    IERC20 public usdc;                          // Arc Testnet USDC
    ITokenMessengerV2 public tokenMessenger;      // CCTP TokenMessengerV2 on Arc
    address public marginVault;                   // MarginVault on Arbitrum Sepolia
    bytes32 public marginVaultBytes32;            // marginVault as bytes32 for CCTP

    // Oracle simulation: pair hash → price (8 decimals)
    mapping(bytes32 => uint256) public prices;

    // Positions
    mapping(uint256 => Position) public positions;
    uint256 public nextPositionId;

    // Simple orderbook: orderId → Order
    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;

    // Funding rate: hourly rate in FUNDING_RATE_PRECISION units
    // e.g., 100 = 0.01% per hour
    uint256 public fundingRatePerHour = 100; // 0.01% default

    // Total margin bridged out (for accounting)
    uint256 public totalMarginBridged;

    // CCTP transfer config
    uint256 public maxCctpFee = 0;           // max fee for CCTP (0 = no fee for testnet)
    uint32 public minFinality = FINALITY_STANDARD; // default to standard

    // ═══════════════════════════════════════════════════════════════════
    //                           EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bytes32 pair,
        bool isLong,
        uint256 margin,
        uint256 size,
        uint256 entryPrice
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 exitPrice,
        int256 pnl,
        uint256 fundingPaid
    );

    event PositionSettled(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amountReturned
    );

    event MarginBridgedOut(
        uint256 indexed positionId,
        uint256 amount,
        uint64 cctpNonce
    );

    event WithdrawalRequested(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amount
    );

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed trader,
        bytes32 pair,
        OrderSide side,
        uint256 price,
        uint256 margin,
        uint8 leverage
    );

    event OrderCancelled(uint256 indexed orderId);
    event OrderFilled(uint256 indexed orderId, uint256 indexed positionId);
    event PriceUpdated(bytes32 indexed pair, uint256 price);

    // ═══════════════════════════════════════════════════════════════════
    //                         MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════

    /// @param _usdc USDC token address on Arc Testnet
    /// @param _tokenMessenger CCTP TokenMessengerV2 on Arc Testnet
    /// @param _marginVault MarginVault address on Arbitrum Sepolia
    constructor(
        address _usdc,
        address _tokenMessenger,
        address _marginVault
    ) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        marginVault = _marginVault;
        marginVaultBytes32 = _addressToBytes32(_marginVault);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                    ORACLE (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Set price for a trading pair (simulated oracle)
    /// @param pair Pair identifier hash (use pairHash helper)
    /// @param price Price in 8 decimal precision
    function setPrice(bytes32 pair, uint256 price) external onlyOwner {
        require(price > 0, "price must be > 0");
        prices[pair] = price;
        emit PriceUpdated(pair, price);
    }

    /// @notice Helper to compute pair hash from string
    function pairHash(string calldata pairName) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(pairName));
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ORDERBOOK FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Place a limit order. Margin is held in the contract until fill.
    /// @dev User must approve USDC to this contract first.
    function placeOrder(
        bytes32 pair,
        OrderSide side,
        uint256 price,
        uint256 margin,
        uint8 leverage
    ) external returns (uint256 orderId) {
        require(price > 0, "invalid price");
        require(margin > 0, "invalid margin");
        require(leverage >= 1 && leverage <= MAX_LEVERAGE, "invalid leverage");
        require(prices[pair] > 0, "pair not listed");

        // Transfer margin from user to contract (held until fill or cancel)
        require(usdc.transferFrom(msg.sender, address(this), margin), "transfer failed");

        orderId = nextOrderId++;
        orders[orderId] = Order({
            trader: msg.sender,
            pair: pair,
            side: side,
            price: price,
            margin: margin,
            leverage: leverage,
            isActive: true
        });

        emit OrderPlaced(orderId, msg.sender, pair, side, price, margin, leverage);
    }

    /// @notice Cancel an active order and refund margin
    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.isActive, "order not active");
        require(order.trader == msg.sender, "not your order");

        order.isActive = false;
        require(usdc.transfer(msg.sender, order.margin), "refund failed");

        emit OrderCancelled(orderId);
    }

    /// @notice Fill an order at current market price (owner/matcher only for POC)
    /// @dev In production, this would be a matching engine. For POC, owner fills
    ///      orders when the market price crosses the limit price.
    function fillOrder(uint256 orderId) external onlyOwner returns (uint256 positionId) {
        Order storage order = orders[orderId];
        require(order.isActive, "order not active");

        uint256 currentPrice = prices[order.pair];
        require(currentPrice > 0, "no price");

        // Check price condition
        if (order.side == OrderSide.Long) {
            require(currentPrice <= order.price, "price above limit");
        } else {
            require(currentPrice >= order.price, "price below limit");
        }

        order.isActive = false;

        // Open position with the margin already held in contract
        positionId = _openPositionInternal(
            order.trader,
            order.pair,
            order.side == OrderSide.Long,
            order.margin,
            order.leverage,
            currentPrice
        );

        emit OrderFilled(orderId, positionId);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                   MARKET ORDER (INSTANT FILL)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Open a position at market price (instant execution)
    /// @dev User must approve USDC to this contract first.
    function openPosition(
        bytes32 pair,
        bool isLong,
        uint256 margin,
        uint8 leverage
    ) external returns (uint256 positionId) {
        require(margin > 0, "invalid margin");
        require(leverage >= 1 && leverage <= MAX_LEVERAGE, "invalid leverage");

        uint256 currentPrice = prices[pair];
        require(currentPrice > 0, "pair not listed");

        // Transfer margin from user
        require(usdc.transferFrom(msg.sender, address(this), margin), "transfer failed");

        positionId = _openPositionInternal(
            msg.sender,
            pair,
            isLong,
            margin,
            leverage,
            currentPrice
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      CLOSE POSITION
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Close an open position. Calculates PnL and requests margin withdrawal
    ///         from Arbitrum via the off-chain relayer.
    function closePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "not open");
        require(pos.trader == msg.sender, "not your position");
        require(!pos.pendingSettlement, "already closing");

        uint256 exitPrice = prices[pos.pair];
        require(exitPrice > 0, "no price");

        // Calculate PnL
        int256 pnl = _calculatePnl(pos.size, pos.entryPrice, exitPrice, pos.isLong);

        // Calculate funding fee
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1; // minimum 1 hour
        uint256 fundingFee = (pos.margin * fundingRatePerHour * hoursOpen) / FUNDING_RATE_PRECISION;

        // Update position state
        pos.isOpen = false;
        pos.pendingSettlement = true;
        pos.realizedPnl = pnl;
        pos.fundingOwed = fundingFee;

        // Calculate how much to request back from Arbitrum
        // returnAmount = margin + pnl - funding (clamped to 0)
        int256 netReturn = int256(pos.margin) + pnl - int256(fundingFee);
        uint256 requestAmount = netReturn > 0 ? uint256(netReturn) : 0;

        emit PositionClosed(positionId, msg.sender, exitPrice, pnl, fundingFee);

        // Signal off-chain relayer to withdraw from Aave and bridge back
        emit WithdrawalRequested(positionId, msg.sender, requestAmount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                    SETTLEMENT (RELAYER)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Settle a closed position after funds return from Arbitrum via CCTP.
    /// @dev Called by owner/relayer after receiveMessage mints USDC to this contract.
    /// @param positionId The position to settle
    function settleWithdrawal(uint256 positionId) external onlyOwner {
        Position storage pos = positions[positionId];
        require(pos.pendingSettlement, "not pending");

        int256 netReturn = int256(pos.margin) + pos.realizedPnl - int256(pos.fundingOwed);
        uint256 payout = netReturn > 0 ? uint256(netReturn) : 0;

        pos.pendingSettlement = false;

        if (payout > 0) {
            // Check we have enough USDC (from bridged-back funds)
            uint256 balance = usdc.balanceOf(address(this));
            require(balance >= payout, "insufficient funds for settlement");
            require(usdc.transfer(pos.trader, payout), "payout failed");
        }

        totalMarginBridged -= pos.margin; // accounting

        emit PositionSettled(positionId, pos.trader, payout);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Get unrealized PnL for an open position
    function getUnrealizedPnl(uint256 positionId) external view returns (int256) {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "not open");
        uint256 currentPrice = prices[pos.pair];
        require(currentPrice > 0, "no price");
        return _calculatePnl(pos.size, pos.entryPrice, currentPrice, pos.isLong);
    }

    /// @notice Get accumulated funding fee for a position
    function getAccumulatedFunding(uint256 positionId) external view returns (uint256) {
        Position storage pos = positions[positionId];
        if (!pos.isOpen) return pos.fundingOwed;
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1;
        return (pos.margin * fundingRatePerHour * hoursOpen) / FUNDING_RATE_PRECISION;
    }

    /// @notice Get effective margin (margin + unrealized PnL - funding)
    function getEffectiveMargin(uint256 positionId) external view returns (int256) {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "not open");
        uint256 currentPrice = prices[pos.pair];
        int256 pnl = _calculatePnl(pos.size, pos.entryPrice, currentPrice, pos.isLong);
        uint256 hoursOpen = (block.timestamp - pos.openTimestamp) / 1 hours;
        if (hoursOpen == 0) hoursOpen = 1;
        uint256 fundingFee = (pos.margin * fundingRatePerHour * hoursOpen) / FUNDING_RATE_PRECISION;
        return int256(pos.margin) + pnl - int256(fundingFee);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function setFundingRate(uint256 _rate) external onlyOwner {
        fundingRatePerHour = _rate;
    }

    function setMaxCctpFee(uint256 _fee) external onlyOwner {
        maxCctpFee = _fee;
    }

    function setMinFinality(uint32 _finality) external onlyOwner {
        minFinality = _finality;
    }

    function setMarginVault(address _vault) external onlyOwner {
        marginVault = _vault;
        marginVaultBytes32 = _addressToBytes32(_vault);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    /// @notice Emergency: withdraw stuck tokens
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function _openPositionInternal(
        address trader,
        bytes32 pair,
        bool isLong,
        uint256 margin,
        uint8 leverage,
        uint256 entryPrice
    ) internal returns (uint256 positionId) {
        uint256 size = margin * leverage;

        positionId = nextPositionId++;
        positions[positionId] = Position({
            trader: trader,
            pair: pair,
            isLong: isLong,
            margin: margin,
            size: size,
            entryPrice: entryPrice,
            openTimestamp: uint64(block.timestamp),
            isOpen: true,
            pendingSettlement: false,
            realizedPnl: 0,
            fundingOwed: 0
        });

        // ── Bridge margin to Arbitrum Sepolia via CCTP ──
        // Approve TokenMessenger to spend USDC
        usdc.approve(address(tokenMessenger), margin);

        // Burn USDC on Arc, will be minted to MarginVault on Arbitrum
        uint64 nonce = tokenMessenger.depositForBurn(
            margin,
            ARBITRUM_SEPOLIA_DOMAIN,
            marginVaultBytes32,       // mint to MarginVault on Arbitrum
            address(usdc),            // burn token (USDC on Arc)
            bytes32(0),               // anyone can call receiveMessage
            maxCctpFee,
            minFinality
        );

        totalMarginBridged += margin;

        emit PositionOpened(positionId, trader, pair, isLong, margin, size, entryPrice);
        emit MarginBridgedOut(positionId, margin, nonce);
    }

    /// @notice Calculate PnL for a position
    /// @dev Long:  PnL = size * (exit - entry) / entry
    ///      Short: PnL = size * (entry - exit) / entry
    function _calculatePnl(
        uint256 size,
        uint256 entryPrice,
        uint256 exitPrice,
        bool isLong
    ) internal pure returns (int256) {
        if (isLong) {
            if (exitPrice >= entryPrice) {
                return int256((size * (exitPrice - entryPrice)) / entryPrice);
            } else {
                return -int256((size * (entryPrice - exitPrice)) / entryPrice);
            }
        } else {
            if (entryPrice >= exitPrice) {
                return int256((size * (entryPrice - exitPrice)) / entryPrice);
            } else {
                return -int256((size * (exitPrice - entryPrice)) / entryPrice);
            }
        }
    }

    /// @notice Convert address to bytes32 (right-padded with zeros)
    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}
