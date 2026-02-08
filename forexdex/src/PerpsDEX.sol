// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice CCTP V2 TokenMessenger interface
/// @dev V2 adds destinationCaller and maxBurnFee params vs V1
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxBurnFee
    ) external returns (uint64 nonce);
}

/// @title PerpsDEX - POC Perpetual Futures DEX with Cross-Chain Margin Rehypothecation
/// @notice Deployed on Arc testnet (CCTP domain 26).
///         Margin sent via CCTP to MarginVault on Arbitrum Sepolia (domain 3).
/// @dev Arc USDC ERC-20 interface = 6 decimals, Arc EURC = 6 decimals.
///      CCTP TokenMinter handles decimal scaling automatically at burn/mint boundaries.
///      All position accounting uses ERC-20 decimals (6 decimals for both USDC and EURC).
contract PerpsDEX is Ownable {
    using SafeERC20 for IERC20;

    // ─── Arc Testnet Constants ───────────────────────────────────────────
    // Note: Arc native USDC balance has 18 decimal precision, but ERC-20 interface uses 6
    address public constant ARC_USDC  = 0x3600000000000000000000000000000000000000; // 6 dec (ERC-20)
    address public constant ARC_EURC  = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a; // 6 dec

    // CCTP V2 contracts (CREATE2 deployed at same address across all chains)
    address public constant TOKEN_MESSENGER      = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address public constant MESSAGE_TRANSMITTER  = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    uint32  public constant ARC_DOMAIN           = 26;
    uint32  public constant ARB_SEPOLIA_DOMAIN   = 3;

    // ─── Types ───────────────────────────────────────────────────────────
    enum Status { None, Open, PendingClose, Closed }

    struct Position {
        address trader;
        address marginToken;        // ARC_USDC or ARC_EURC
        uint256 margin;             // deposited margin (6 decimals for both USDC/EURC)
        uint256 virtualMargin;      // margin minus accrued funding
        uint256 leverage;           // 1-100x
        uint256 entryPrice;         // EUR/USD scaled 1e18
        uint256 exitPrice;          // set on initiateClose
        bool    isLong;
        uint256 openTimestamp;
        uint256 lastFundingUpdate;
        Status  status;
    }

    // ─── State ───────────────────────────────────────────────────────────
    bytes32 public marginVaultRecipient;      // MarginVault address on Arb Sepolia
    uint256 public fundingRatePerSecond;      // fee rate scaled 1e18
    uint256 public nextPositionId;

    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public traderPositions;
    mapping(address => bool) public supportedTokens;

    // ─── Events ──────────────────────────────────────────────────────────
    event PositionOpened(
        uint256 indexed positionId, address indexed trader,
        address marginToken, uint256 margin, uint256 leverage,
        uint256 entryPrice, bool isLong, uint64 cctpNonce
    );
    event PositionCloseInitiated(uint256 indexed positionId, uint256 exitPrice, int256 pnl);
    event PositionSettled(uint256 indexed positionId, address indexed trader, uint256 payout);
    event FundingDeducted(uint256 indexed positionId, uint256 fee, uint256 newVirtualMargin);

    // ─── Constructor ─────────────────────────────────────────────────────
    /// @param _marginVault MarginVault address on Arbitrum Sepolia
    /// @param _fundingRatePerSecond Fee per second scaled 1e18 (e.g. 27800000000 ≈ 0.01%/hr)
    constructor(
        address _marginVault,
        uint256 _fundingRatePerSecond
    ) Ownable(msg.sender) {
        marginVaultRecipient = _toBytes32(_marginVault);
        fundingRatePerSecond = _fundingRatePerSecond;

        supportedTokens[ARC_USDC] = true;
        supportedTokens[ARC_EURC] = true;
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    function setMarginVault(address _vault) external onlyOwner {
        marginVaultRecipient = _toBytes32(_vault);
    }

    function setFundingRate(uint256 _rate) external onlyOwner {
        fundingRatePerSecond = _rate;
    }

    function setSupportedToken(address token, bool ok) external onlyOwner {
        supportedTokens[token] = ok;
    }

    // ═════════════════════════════════════════════════════════════════════
    //  OPEN POSITION — transfers margin cross-chain via CCTP V2
    // ═════════════════════════════════════════════════════════════════════
    function openPosition(
        address marginToken,
        uint256 marginAmount,
        uint256 leverage,
        uint256 entryPrice,
        bool    isLong
    ) external returns (uint256 positionId) {
        require(supportedTokens[marginToken], "Unsupported token");
        require(marginAmount > 0, "Zero margin");
        require(leverage >= 1 && leverage <= 100, "Bad leverage");
        require(entryPrice > 0, "Bad price");

        // Pull margin from trader
        IERC20(marginToken).safeTransferFrom(msg.sender, address(this), marginAmount);

        // Approve CCTP (use forceApprove for Arc USDC compatibility)
        IERC20(marginToken).forceApprove(TOKEN_MESSENGER, marginAmount);
        
        // CCTP V2: depositForBurn with destinationCaller=0 (anyone can relay)
        //          and maxBurnFee=type(uint256).max (accept any fee, typically 0 on testnet)
        uint64 cctpNonce = ITokenMessenger(TOKEN_MESSENGER).depositForBurn(
            marginAmount,
            ARB_SEPOLIA_DOMAIN,
            marginVaultRecipient,
            marginToken,
            bytes32(0),             // destinationCaller: no restriction
            type(uint256).max       // maxBurnFee: accept any fee
        );

        // Record position
        positionId = nextPositionId++;
        positions[positionId] = Position({
            trader:            msg.sender,
            marginToken:       marginToken,
            margin:            marginAmount,
            virtualMargin:     marginAmount,
            leverage:          leverage,
            entryPrice:        entryPrice,
            exitPrice:         0,
            isLong:            isLong,
            openTimestamp:      block.timestamp,
            lastFundingUpdate: block.timestamp,
            status:            Status.Open
        });
        traderPositions[msg.sender].push(positionId);

        emit PositionOpened(
            positionId, msg.sender, marginToken,
            marginAmount, leverage, entryPrice, isLong, cctpNonce
        );
    }

    // ═════════════════════════════════════════════════════════════════════
    //  CLOSE — Step 1: Trader initiates, relayer picks up event
    // ═════════════════════════════════════════════════════════════════════
    function initiateClose(uint256 positionId, uint256 exitPrice) external {
        Position storage pos = positions[positionId];
        require(pos.trader == msg.sender, "Not your position");
        require(pos.status == Status.Open, "Not open");
        require(exitPrice > 0, "Bad price");

        _applyFunding(positionId);

        pos.status    = Status.PendingClose;
        pos.exitPrice = exitPrice;

        emit PositionCloseInitiated(positionId, exitPrice, _pnl(pos, exitPrice));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  SETTLE — Step 2: Relayer calls after margin CCTP'd back from vault
    // ═════════════════════════════════════════════════════════════════════
    function settlePosition(
        uint256 positionId,
        uint256 returnedAmount          // tokens actually received back (6 decimals)
    ) external onlyOwner {
        Position storage pos = positions[positionId];
        require(pos.status == Status.PendingClose, "Not pending");

        int256 pnl = _pnl(pos, pos.exitPrice);

        uint256 payout;
        if (pnl >= 0) {
            payout = pos.virtualMargin + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            payout = pos.virtualMargin > loss ? pos.virtualMargin - loss : 0;
        }
        if (payout > returnedAmount) payout = returnedAmount;

        pos.status = Status.Closed;

        if (payout > 0) {
            IERC20(pos.marginToken).safeTransfer(pos.trader, payout);
        }

        emit PositionSettled(positionId, pos.trader, payout);
    }

    // ─── Funding Fee ─────────────────────────────────────────────────────
    function applyFunding(uint256 positionId) external {
        require(positions[positionId].status == Status.Open, "Not open");
        _applyFunding(positionId);
    }

    function _applyFunding(uint256 positionId) internal {
        Position storage pos = positions[positionId];
        uint256 elapsed = block.timestamp - pos.lastFundingUpdate;
        if (elapsed == 0) return;

        uint256 fee = (pos.virtualMargin * fundingRatePerSecond * elapsed) / 1e18;
        if (fee > pos.virtualMargin) fee = pos.virtualMargin;

        pos.virtualMargin     -= fee;
        pos.lastFundingUpdate  = block.timestamp;

        emit FundingDeducted(positionId, fee, pos.virtualMargin);
    }

    // ─── PnL ─────────────────────────────────────────────────────────────
    function _pnl(Position memory pos, uint256 exit) internal pure returns (int256) {
        uint256 size = pos.margin * pos.leverage;
        if (pos.isLong) {
            return exit >= pos.entryPrice
                ?  int256((size * (exit - pos.entryPrice)) / pos.entryPrice)
                : -int256((size * (pos.entryPrice - exit)) / pos.entryPrice);
        } else {
            return exit <= pos.entryPrice
                ?  int256((size * (pos.entryPrice - exit)) / pos.entryPrice)
                : -int256((size * (exit - pos.entryPrice)) / pos.entryPrice);
        }
    }

    // ─── Views ───────────────────────────────────────────────────────────
    function getPosition(uint256 id) external view returns (Position memory) {
        return positions[id];
    }

    function getVirtualMargin(uint256 id) external view returns (uint256) {
        Position memory pos = positions[id];
        if (pos.status != Status.Open) return pos.virtualMargin;
        uint256 elapsed = block.timestamp - pos.lastFundingUpdate;
        uint256 fee = (pos.virtualMargin * fundingRatePerSecond * elapsed) / 1e18;
        return fee > pos.virtualMargin ? 0 : pos.virtualMargin - fee;
    }

    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return traderPositions[trader];
    }

    function tokenDecimals(address token) external pure returns (uint8) {
        if (token == ARC_USDC) return 6;
        if (token == ARC_EURC) return 6;
        return 0;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    function _toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function recoverToken(address token, uint256 amt) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amt);
    }
}
