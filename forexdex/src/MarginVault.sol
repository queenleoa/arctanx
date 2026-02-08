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

/// @title MarginVault - Cross-Chain Margin Vault for Rehypothecation
/// @notice Deployed on Arbitrum Sepolia (CCTP domain 3).
///         Receives margin from PerpsDEX on Arc testnet (domain 26) via CCTP.
///         Holds margin, can deploy to yield protocols, and returns margin on close.
/// @dev USDC on Arb Sepolia = 6 decimals. CCTP TokenMinter handles decimal
///      scaling between Arc (18 dec) and Arb Sepolia (6 dec) automatically.
contract MarginVault is Ownable {
    using SafeERC20 for IERC20;

    // ─── Arbitrum Sepolia Constants ──────────────────────────────────────
    address public constant ARB_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d; // 6 dec
    // EURC on Arb Sepolia — fill in when available, or use USDC-only for POC
    // address public constant ARB_EURC = 0x...;

    // CCTP V2 contracts (same addresses across all EVM chains via CREATE2)
    address public constant TOKEN_MESSENGER     = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address public constant MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    uint32  public constant ARB_SEPOLIA_DOMAIN  = 3;
    uint32  public constant ARC_DOMAIN          = 26;

    // ─── Types ───────────────────────────────────────────────────────────
    struct MarginDeposit {
        address token;           // token on Arb Sepolia (USDC)
        uint256 amount;          // amount received (6 decimals on Arb Sepolia)
        uint256 depositTime;
        bool    withdrawn;
        bool    deployedToYield; // flag for future yield integration
    }

    // ─── State ───────────────────────────────────────────────────────────
    bytes32 public perpsDexRecipient;         // PerpsDEX address on Arc as bytes32

    mapping(uint256 => MarginDeposit) public deposits;  // positionId => deposit
    mapping(address => uint256) public totalMarginHeld;

    // ─── Events ──────────────────────────────────────────────────────────
    event MarginReceived(uint256 indexed positionId, address token, uint256 amount);
    event MarginReturned(uint256 indexed positionId, address token, uint256 amount, uint64 cctpNonce);
    event MarginDeployedToYield(uint256 indexed positionId, address protocol, uint256 amount);
    event MarginWithdrawnFromYield(uint256 indexed positionId, address protocol, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────
    /// @param _perpsDex PerpsDEX contract address on Arc testnet
    constructor(address _perpsDex) Ownable(msg.sender) {
        perpsDexRecipient = _toBytes32(_perpsDex);
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    function setPerpsDex(address _perpsDex) external onlyOwner {
        perpsDexRecipient = _toBytes32(_perpsDex);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RECORD DEPOSIT — called by relayer after CCTP mint completes
    // ═════════════════════════════════════════════════════════════════════
    /// @notice Records margin that arrived via CCTP from Arc.
    /// @dev The relayer monitors CCTP MessageReceived events and calls this
    ///      after confirming tokens were minted to this vault.
    /// @param positionId Position ID from PerpsDEX on Arc
    /// @param token USDC (or EURC) address on Arb Sepolia
    /// @param amount Amount minted to this vault (Arb Sepolia decimals)
    function recordDeposit(
        uint256 positionId,
        address token,
        uint256 amount
    ) external onlyOwner {
        require(deposits[positionId].amount == 0, "Already deposited");
        require(amount > 0, "Zero amount");

        deposits[positionId] = MarginDeposit({
            token: token,
            amount: amount,
            depositTime: block.timestamp,
            withdrawn: false,
            deployedToYield: false
        });

        totalMarginHeld[token] += amount;

        emit MarginReceived(positionId, token, amount);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RETURN MARGIN — CCTP V2 burn back to PerpsDEX on Arc
    // ═════════════════════════════════════════════════════════════════════
    /// @notice Burns margin via CCTP to send back to PerpsDEX on Arc.
    ///         Called by relayer when a position close is initiated.
    /// @param positionId Position to return margin for
    function returnMargin(uint256 positionId) external onlyOwner returns (uint64 cctpNonce) {
        MarginDeposit storage deposit = deposits[positionId];
        require(deposit.amount > 0, "No deposit");
        require(!deposit.withdrawn, "Already withdrawn");

        // If deployed to yield, withdraw first (stub for now)
        if (deposit.deployedToYield) {
            _withdrawFromYield(positionId);
        }

        deposit.withdrawn = true;
        totalMarginHeld[deposit.token] -= deposit.amount;

        // Approve CCTP and burn → mints on Arc to PerpsDEX
        IERC20(deposit.token).approve(TOKEN_MESSENGER, deposit.amount);

        // CCTP V2: destinationCaller=0 (anyone can relay), maxBurnFee=max
        cctpNonce = ITokenMessenger(TOKEN_MESSENGER).depositForBurn(
            deposit.amount,
            ARC_DOMAIN,
            perpsDexRecipient,
            deposit.token,
            bytes32(0),             // destinationCaller: no restriction
            type(uint256).max       // maxBurnFee: accept any fee
        );

        emit MarginReturned(positionId, deposit.token, deposit.amount, cctpNonce);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  YIELD DEPLOYMENT (stubs — plug in Uniswap/Aave later)
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Deploy margin to a yield protocol on Arb Sepolia
    /// @dev Stub: In production, approve + deposit to Uniswap LP, Aave, etc.
    function deployToYield(
        uint256 positionId,
        address yieldProtocol
    ) external onlyOwner {
        MarginDeposit storage deposit = deposits[positionId];
        require(deposit.amount > 0, "No deposit");
        require(!deposit.withdrawn, "Already withdrawn");
        require(!deposit.deployedToYield, "Already deployed");

        deposit.deployedToYield = true;

        // TODO: IERC20(deposit.token).approve(yieldProtocol, deposit.amount);
        // TODO: IYieldProtocol(yieldProtocol).deposit(deposit.amount);

        emit MarginDeployedToYield(positionId, yieldProtocol, deposit.amount);
    }

    /// @dev Internal: withdraw from yield before returning margin
    function _withdrawFromYield(uint256 positionId) internal {
        MarginDeposit storage deposit = deposits[positionId];
        deposit.deployedToYield = false;

        // TODO: IYieldProtocol(...).withdraw(deposit.amount);

        emit MarginWithdrawnFromYield(positionId, address(0), deposit.amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────
    function getDeposit(uint256 positionId) external view returns (MarginDeposit memory) {
        return deposits[positionId];
    }

    /// @notice Stub: return yield earned for a position
    function getYieldEarned(uint256 /* positionId */) external pure returns (uint256) {
        return 0; // TODO: query yield protocol
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    function _toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function recoverToken(address token, uint256 amt) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amt);
    }
}
