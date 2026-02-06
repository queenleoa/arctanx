/**
 * relayer.ts — Off-chain Relayer for Cross-Chain Margin Rehypothecation
 *
 * This script handles the cross-chain coordination between PerpsDEX (Arc Testnet)
 * and MarginVault (Arbitrum Sepolia) via Circle's CCTP.
 *
 * FLOWS:
 *
 * 1. DEPOSIT FLOW (Arc → Arbitrum → Aave):
 *    a. PerpsDEX.openPosition() burns USDC on Arc via CCTP
 *    b. Relayer polls Circle attestation API for the burn message
 *    c. Relayer calls receiveMessage() on Arbitrum MessageTransmitter
 *    d. USDC is minted to MarginVault on Arbitrum
 *    e. Relayer calls MarginVault.depositToAave()
 *
 * 2. WITHDRAWAL FLOW (Arbitrum → Aave → Arc):
 *    a. PerpsDEX.closePosition() emits WithdrawalRequested event
 *    b. Relayer calls MarginVault.withdrawAndBridgeToDex() on Arbitrum
 *    c. USDC is burned on Arbitrum via CCTP
 *    d. Relayer polls Circle attestation API
 *    e. Relayer calls receiveMessage() on Arc MessageTransmitter
 *    f. USDC is minted to PerpsDEX on Arc
 *    g. Relayer calls PerpsDEX.settleWithdrawal()
 *
 * SETUP:
 *   npm install ethers@6
 *   Set environment variables (see .env.example)
 *   npx ts-node relayer.ts
 */

import { ethers } from "ethers";

// ════════════════════════════════════════════════════════════════════
//                        CONFIGURATION
// ════════════════════════════════════════════════════════════════════

const CONFIG = {
  // RPC endpoints
  ARC_RPC: process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arcology.network", // replace with actual
  ARB_RPC: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",

  // Circle Attestation API (testnet)
  ATTESTATION_API: "https://iris-api-sandbox.circle.com/v2/attestations",

  // Contract addresses (set after deployment)
  PERPS_DEX: process.env.PERPS_DEX_ADDRESS || "",
  MARGIN_VAULT: process.env.MARGIN_VAULT_ADDRESS || "",

  // CCTP contracts
  ARC_MESSAGE_TRANSMITTER: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  ARB_MESSAGE_TRANSMITTER: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",

  // Domain IDs
  ARC_DOMAIN: 26,
  ARB_DOMAIN: 3,

  // Relayer private key
  PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY || "",

  // Polling config
  ATTESTATION_POLL_INTERVAL_MS: 5000,
  ATTESTATION_MAX_RETRIES: 120, // 10 min max wait
};

// ════════════════════════════════════════════════════════════════════
//                          ABIs (minimal)
// ════════════════════════════════════════════════════════════════════

const MESSAGE_TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
];

const PERPS_DEX_ABI = [
  "event MarginBridgedOut(uint256 indexed positionId, uint256 amount, uint64 cctpNonce)",
  "event WithdrawalRequested(uint256 indexed positionId, address indexed trader, uint256 amount)",
  "event PositionSettled(uint256 indexed positionId, address indexed trader, uint256 amountReturned)",
  "event MessageSent(bytes message)",
  "function settleWithdrawal(uint256 positionId) external",
];

const MARGIN_VAULT_ABI = [
  "function depositToAave(uint256 amount) external",
  "function withdrawAndBridgeToDex(uint256 amount) external",
  "function withdrawAndBridge(uint256 amount, bytes32 recipient) external",
  "function getAaveBalance() view returns (uint256)",
  "function getIdleBalance() view returns (uint256)",
];

// MessageSent event from MessageTransmitterV2
const MESSAGE_SENT_TOPIC = ethers.id("MessageSent(bytes)");

// ════════════════════════════════════════════════════════════════════
//                    ATTESTATION HELPERS
// ════════════════════════════════════════════════════════════════════

/**
 * Extract the message bytes from a MessageSent event in a transaction receipt
 */
function extractMessageFromReceipt(
  receipt: ethers.TransactionReceipt,
  messageTransmitterAddress: string
): string | null {
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === messageTransmitterAddress.toLowerCase() &&
      log.topics[0] === MESSAGE_SENT_TOPIC
    ) {
      // The message is the first (and only) non-indexed parameter
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["bytes"],
        log.data
      );
      return decoded[0];
    }
  }
  return null;
}

/**
 * Compute the message hash for Circle attestation lookup.
 * Circle uses keccak256 of the raw message bytes.
 */
function getMessageHash(messageBytes: string): string {
  return ethers.keccak256(messageBytes);
}

/**
 * Poll Circle's attestation API until the attestation is available
 */
async function waitForAttestation(
  messageHash: string
): Promise<{ attestation: string; message: string }> {
  console.log(`  Polling attestation for hash: ${messageHash}`);

  for (let i = 0; i < CONFIG.ATTESTATION_MAX_RETRIES; i++) {
    try {
      const url = `${CONFIG.ATTESTATION_API}/${messageHash}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.attestation && data.attestation !== "PENDING") {
          console.log(`  ✓ Attestation received after ${i + 1} attempts`);
          return {
            attestation: data.attestation,
            message: data.message || messageHash,
          };
        }
      }
    } catch (err) {
      // Silently retry
    }

    await new Promise((r) => setTimeout(r, CONFIG.ATTESTATION_POLL_INTERVAL_MS));
    if (i % 12 === 0 && i > 0) {
      console.log(`  ... still waiting (${(i * CONFIG.ATTESTATION_POLL_INTERVAL_MS) / 1000}s)`);
    }
  }

  throw new Error(`Attestation timeout for ${messageHash}`);
}

// ════════════════════════════════════════════════════════════════════
//            DEPOSIT FLOW: Arc → Arbitrum → Aave
// ════════════════════════════════════════════════════════════════════

/**
 * Handle a new position opening:
 * 1. Get the CCTP burn tx on Arc
 * 2. Wait for attestation
 * 3. Call receiveMessage on Arbitrum
 * 4. Deposit to Aave
 */
async function handleDeposit(burnTxHash: string) {
  console.log("\n═══ DEPOSIT FLOW ═══");
  console.log(`Step 1: Fetching burn tx ${burnTxHash} on Arc...`);

  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const receipt = await arcProvider.getTransactionReceipt(burnTxHash);
  if (!receipt) throw new Error("Tx receipt not found on Arc");

  // Extract MessageSent event
  const messageBytes = extractMessageFromReceipt(
    receipt,
    CONFIG.ARC_MESSAGE_TRANSMITTER
  );
  if (!messageBytes) throw new Error("No MessageSent event found in tx");

  console.log(`Step 2: Message extracted. Waiting for Circle attestation...`);
  const messageHash = getMessageHash(messageBytes);
  const { attestation } = await waitForAttestation(messageHash);

  console.log(`Step 3: Calling receiveMessage on Arbitrum Sepolia...`);
  const arbProvider = new ethers.JsonRpcProvider(CONFIG.ARB_RPC);
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider);
  const messageTransmitter = new ethers.Contract(
    CONFIG.ARB_MESSAGE_TRANSMITTER,
    MESSAGE_TRANSMITTER_ABI,
    wallet
  );

  const receiveTx = await messageTransmitter.receiveMessage(
    messageBytes,
    attestation
  );
  const receiveReceipt = await receiveTx.wait();
  console.log(`  ✓ receiveMessage tx: ${receiveReceipt.hash}`);

  console.log(`Step 4: Depositing received USDC to Aave...`);
  const marginVault = new ethers.Contract(
    CONFIG.MARGIN_VAULT,
    MARGIN_VAULT_ABI,
    wallet
  );

  const depositTx = await marginVault.depositToAave(0); // 0 = deposit all
  const depositReceipt = await depositTx.wait();
  console.log(`  ✓ depositToAave tx: ${depositReceipt.hash}`);

  const aaveBalance = await marginVault.getAaveBalance();
  console.log(`  Total in Aave: ${ethers.formatUnits(aaveBalance, 6)} USDC`);
  console.log("═══ DEPOSIT FLOW COMPLETE ═══\n");
}

// ════════════════════════════════════════════════════════════════════
//         WITHDRAWAL FLOW: Aave → Arbitrum → Arc
// ════════════════════════════════════════════════════════════════════

/**
 * Handle a position close:
 * 1. Withdraw from Aave and bridge back to Arc via CCTP
 * 2. Wait for attestation
 * 3. Call receiveMessage on Arc
 * 4. Settle the position on PerpsDEX
 *
 * NOTE: The `amount` here is in Arbitrum USDC decimals (6).
 *       You need to convert from Arc 18-decimal to Arb 6-decimal.
 *       CCTP handles this conversion, so the WithdrawalRequested event
 *       amount (18 decimals) maps to a 6-decimal amount on Arbitrum.
 */
async function handleWithdrawal(positionId: number, amountArb6: bigint) {
  console.log("\n═══ WITHDRAWAL FLOW ═══");
  console.log(`Position ${positionId}: withdrawing ${ethers.formatUnits(amountArb6, 6)} USDC`);

  // Step 1: Withdraw from Aave and bridge on Arbitrum
  console.log(`Step 1: Withdrawing from Aave and bridging to Arc...`);
  const arbProvider = new ethers.JsonRpcProvider(CONFIG.ARB_RPC);
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider);
  const marginVault = new ethers.Contract(
    CONFIG.MARGIN_VAULT,
    MARGIN_VAULT_ABI,
    wallet
  );

  const withdrawTx = await marginVault.withdrawAndBridgeToDex(amountArb6);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  ✓ withdrawAndBridgeToDex tx: ${withdrawReceipt.hash}`);

  // Step 2: Extract message and wait for attestation
  console.log(`Step 2: Waiting for Circle attestation...`);
  const messageBytes = extractMessageFromReceipt(
    withdrawReceipt,
    CONFIG.ARB_MESSAGE_TRANSMITTER
  );
  if (!messageBytes) throw new Error("No MessageSent event in withdraw tx");

  const messageHash = getMessageHash(messageBytes);
  const { attestation } = await waitForAttestation(messageHash);

  // Step 3: Call receiveMessage on Arc
  console.log(`Step 3: Calling receiveMessage on Arc Testnet...`);
  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const arcWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arcProvider);
  const arcMessageTransmitter = new ethers.Contract(
    CONFIG.ARC_MESSAGE_TRANSMITTER,
    MESSAGE_TRANSMITTER_ABI,
    arcWallet
  );

  const receiveTx = await arcMessageTransmitter.receiveMessage(
    messageBytes,
    attestation
  );
  const receiveReceipt = await receiveTx.wait();
  console.log(`  ✓ receiveMessage tx: ${receiveReceipt.hash}`);

  // Step 4: Settle position on PerpsDEX
  console.log(`Step 4: Settling position ${positionId} on PerpsDEX...`);
  const perpsDex = new ethers.Contract(
    CONFIG.PERPS_DEX,
    PERPS_DEX_ABI,
    arcWallet
  );

  const settleTx = await perpsDex.settleWithdrawal(positionId);
  const settleReceipt = await settleTx.wait();
  console.log(`  ✓ settleWithdrawal tx: ${settleReceipt.hash}`);
  console.log("═══ WITHDRAWAL FLOW COMPLETE ═══\n");
}

// ════════════════════════════════════════════════════════════════════
//                    EVENT LISTENER (DAEMON MODE)
// ════════════════════════════════════════════════════════════════════

/**
 * Listen for events on both chains and automatically handle flows.
 * Run this as a daemon for automated cross-chain coordination.
 */
async function startRelayer() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  Cross-Chain Margin Rehypothecation Relayer  ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const perpsDex = new ethers.Contract(
    CONFIG.PERPS_DEX,
    PERPS_DEX_ABI,
    arcProvider
  );

  // Listen for new positions (deposit flow)
  console.log("Listening for MarginBridgedOut events on Arc...");
  perpsDex.on("MarginBridgedOut", async (positionId, amount, cctpNonce, event) => {
    console.log(`\n🔥 New position ${positionId} — margin bridged (nonce: ${cctpNonce})`);
    try {
      const tx = await event.getTransaction();
      await handleDeposit(tx.hash);
    } catch (err) {
      console.error(`Error handling deposit for position ${positionId}:`, err);
    }
  });

  // Listen for position closures (withdrawal flow)
  console.log("Listening for WithdrawalRequested events on Arc...");
  perpsDex.on("WithdrawalRequested", async (positionId, trader, amount) => {
    console.log(`\n📤 Withdrawal requested for position ${positionId} — ${ethers.formatUnits(amount, 18)} USDC`);

    // Convert 18-decimal Arc amount to 6-decimal Arbitrum amount
    // CCTP handles this, but for Aave withdrawal we need Arb-native units
    const amountArb6 = amount / BigInt(10 ** 12); // 18 → 6 decimals

    try {
      await handleWithdrawal(Number(positionId), amountArb6);
    } catch (err) {
      console.error(`Error handling withdrawal for position ${positionId}:`, err);
    }
  });

  console.log("\nRelayer running. Press Ctrl+C to stop.\n");
}

// ════════════════════════════════════════════════════════════════════
//                           MAIN
// ════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args[0] === "deposit" && args[1]) {
  // Manual: handle a specific deposit tx
  handleDeposit(args[1]).catch(console.error);
} else if (args[0] === "withdraw" && args[1] && args[2]) {
  // Manual: handle a specific withdrawal
  handleWithdrawal(Number(args[1]), BigInt(args[2])).catch(console.error);
} else if (args[0] === "daemon" || args.length === 0) {
  // Auto: listen for events and handle automatically
  startRelayer().catch(console.error);
} else {
  console.log(`
Usage:
  npx ts-node relayer.ts                          # Daemon mode (auto)
  npx ts-node relayer.ts deposit <burnTxHash>      # Manual deposit flow
  npx ts-node relayer.ts withdraw <posId> <amount>  # Manual withdrawal flow
  `);
}
