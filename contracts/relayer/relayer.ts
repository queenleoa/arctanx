/**
 * relayer-simplified.ts — Cross-Chain Margin Rehypothecation Relayer
 *
 * SIMPLIFIED POC VERSION
 * 
 * Handles two flows:
 * 1. DEPOSIT: Arc → Arbitrum → Aave
 * 2. WITHDRAWAL: Aave → Arbitrum → Arc
 *
 * Usage:
 *   npm install
 *   Set environment variables in .env
 *   npm start
 */

import { ethers } from "ethers";

// ════════════════════════════════════════════════════════════════════
//                        CONFIGURATION
// ════════════════════════════════════════════════════════════════════

const CONFIG = {
  // RPC URLs
  ARC_RPC: process.env.ARC_TESTNET_RPC_URL || "https://arc-testnet.drpc.org",
  ARB_RPC: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",

  // Contract addresses
  PERPS_DEX: process.env.PERPS_DEX_ADDRESS || "",
  MARGIN_VAULT: process.env.MARGIN_VAULT_ADDRESS || "",

  // CCTP contracts
  ARC_MESSAGE_TRANSMITTER: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  ARB_MESSAGE_TRANSMITTER: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",

  // Circle attestation API
  ATTESTATION_API: "https://iris-api-sandbox.circle.com/v2/attestations",
  ATTESTATION_POLL_MS: 5000,
  ATTESTATION_MAX_WAIT_MS: 600000, // 10 minutes

  // Relayer key
  PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY || "",
};

// ════════════════════════════════════════════════════════════════════
//                          ABIs (minimal)
// ════════════════════════════════════════════════════════════════════

const MESSAGE_TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
];

const PERPS_DEX_ABI = [
  "event MarginBridged(uint256 indexed positionId, address token, uint256 amount, uint64 cctpNonce)",
  "event WithdrawalRequested(uint256 indexed positionId, address indexed trader, address token, uint256 amount, uint64 cctpNonce)",
  "function settleWithdrawal(uint256 positionId) external",
];

const MARGIN_VAULT_ABI = [
  "function depositToAave(uint256 positionId, address token, uint256 amount) external",
  "function withdrawAndBridgeForPosition(uint256 positionId, uint256 amount) external",
  "function withdrawAndBridge(address token, uint256 amount) external",
  "function getAaveUsdcBalance() view returns (uint256)",
  "function getAaveEurcBalance() view returns (uint256)",
  "function getPositionYield(uint256 positionId) view returns (uint256)",
];

const MESSAGE_SENT_TOPIC = ethers.id("MessageSent(bytes)");

// ════════════════════════════════════════════════════════════════════
//                    ATTESTATION HELPERS
// ════════════════════════════════════════════════════════════════════

// Type for Circle attestation API response
interface AttestationResponse {
  attestation?: string;
  message?: string;
  status?: string;
}

function extractMessageFromReceipt(
  receipt: ethers.TransactionReceipt,
  messageTransmitterAddress: string
): string | null {
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === messageTransmitterAddress.toLowerCase() &&
      log.topics[0] === MESSAGE_SENT_TOPIC
    ) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["bytes"], log.data);
      return decoded[0] as string;
    }
  }
  return null;
}

function getMessageHash(messageBytes: string): string {
  return ethers.keccak256(messageBytes);
}

async function waitForAttestation(messageHash: string): Promise<{
  attestation: string;
  message: string;
}> {
  console.log(`  ⏳ Polling for attestation: ${messageHash.slice(0, 10)}...`);

  const startTime = Date.now();
  while (Date.now() - startTime < CONFIG.ATTESTATION_MAX_WAIT_MS) {
    try {
      const response = await fetch(`${CONFIG.ATTESTATION_API}/${messageHash}`);
      if (response.ok) {
        const data = await response.json() as AttestationResponse;
        if (data.attestation && data.attestation !== "PENDING") {
          console.log(`  ✅ Attestation received!`);
          return { attestation: data.attestation, message: data.message || messageHash };
        }
      }
    } catch (err) {
      // Retry on network errors
    }

    await new Promise((r) => setTimeout(r, CONFIG.ATTESTATION_POLL_MS));
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) {
      console.log(`  ⏳ Still waiting... (${elapsed}s)`);
    }
  }

  throw new Error("Attestation timeout");
}

// ════════════════════════════════════════════════════════════════════
//            DEPOSIT FLOW: Arc → Arbitrum → Aave
// ════════════════════════════════════════════════════════════════════

async function handleDeposit(positionId: number, burnTxHash: string) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  DEPOSIT FLOW: Arc → Arbitrum → Aave");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`Position #${positionId}`);

  // Step 1: Get burn tx on Arc
  console.log(`\n[1] Fetching burn tx on Arc...`);
  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const receipt = await arcProvider.getTransactionReceipt(burnTxHash);
  if (!receipt) throw new Error("Tx not found");

  // Step 2: Extract message
  console.log(`[2] Extracting CCTP message...`);
  const messageBytes = extractMessageFromReceipt(receipt, CONFIG.ARC_MESSAGE_TRANSMITTER);
  if (!messageBytes) throw new Error("No MessageSent event");

  // Step 3: Wait for attestation
  console.log(`[3] Waiting for Circle attestation...`);
  const messageHash = getMessageHash(messageBytes);
  const { attestation } = await waitForAttestation(messageHash);

  // Step 4: Mint on Arbitrum
  console.log(`[4] Minting tokens on Arbitrum...`);
  const arbProvider = new ethers.JsonRpcProvider(CONFIG.ARB_RPC);
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider);
  const messageTransmitter = new ethers.Contract(
    CONFIG.ARB_MESSAGE_TRANSMITTER,
    MESSAGE_TRANSMITTER_ABI,
    wallet
  );

  const mintTx = await messageTransmitter.receiveMessage(messageBytes, attestation);
  const mintReceipt = await mintTx.wait();
  console.log(`  ✅ Minted: ${mintReceipt?.hash}`);

  // Step 5: Deposit to Aave
  console.log(`[5] Depositing to Aave for position ${positionId}...`);
  const marginVault = new ethers.Contract(
    CONFIG.MARGIN_VAULT,
    MARGIN_VAULT_ABI,
    wallet
  );

  // For POC: assume USDC. In production, parse token from event
  const USDC_ARBITRUM = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
  const usdcContract = new ethers.Contract(
    USDC_ARBITRUM,
    ["function balanceOf(address) view returns (uint256)"],
    arbProvider
  );
  
  // Get the amount that was just minted to the vault
  const vaultBalance = await usdcContract.balanceOf(CONFIG.MARGIN_VAULT);
  console.log(`  Vault USDC balance: ${ethers.formatUnits(vaultBalance, 6)}`);

  const depositTx = await marginVault.depositToAave(
    positionId,
    USDC_ARBITRUM,
    vaultBalance // Deposit the full balance
  );
  const depositReceipt = await depositTx.wait();
  console.log(`  ✅ Deposited: ${depositReceipt?.hash}`);

  // Show balances
  const usdcBalance = await marginVault.getAaveUsdcBalance();
  const eurcBalance = await marginVault.getAaveEurcBalance();
  const positionYield = await marginVault.getPositionYield(positionId);
  
  console.log(`\n📊 Aave Balances:`);
  console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
  console.log(`   EURC: ${ethers.formatUnits(eurcBalance, 6)}`);
  console.log(`   Position #${positionId} yield: ${ethers.formatUnits(positionYield, 6)} USDC`);

  console.log(`\n✅ DEPOSIT FLOW COMPLETE\n`);
}

// ════════════════════════════════════════════════════════════════════
//         WITHDRAWAL FLOW: Aave → Arbitrum → Arc
// ════════════════════════════════════════════════════════════════════

async function handleWithdrawal(
  positionId: number,
  token: string,
  amount: bigint
) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  WITHDRAWAL FLOW: Aave → Arbitrum → Arc");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`Position #${positionId}`);
  console.log(`Amount: ${ethers.formatUnits(amount, 6)} tokens`);

  // Initialize providers and contracts first
  const arbProvider = new ethers.JsonRpcProvider(CONFIG.ARB_RPC);
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider);
  const marginVault = new ethers.Contract(
    CONFIG.MARGIN_VAULT,
    MARGIN_VAULT_ABI,
    wallet
  );

  // Step 1: Check position yield before withdrawal
  console.log(`\n[1] Checking position yield...`);
  const positionYield = await marginVault.getPositionYield(positionId);
  console.log(`  Position #${positionId} earned: ${ethers.formatUnits(positionYield, 6)} USDC yield`);
  
  // Step 2: Withdraw from Aave and bridge
  console.log(`\n[2] Withdrawing from Aave and bridging to Arc...`);

  // Use position-tracked withdrawal (includes yield automatically)
  const withdrawTx = await marginVault.withdrawAndBridgeForPosition(positionId, amount);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  ✅ Bridged: ${withdrawReceipt?.hash}`);
  console.log(`  Amount includes ${ethers.formatUnits(positionYield, 6)} USDC yield`);

  // Step 3: Wait for attestation
  console.log(`\n[3] Waiting for Circle attestation...`);
  const messageBytes = extractMessageFromReceipt(
    withdrawReceipt!,
    CONFIG.ARB_MESSAGE_TRANSMITTER
  );
  if (!messageBytes) throw new Error("No MessageSent event");

  const messageHash = getMessageHash(messageBytes);
  const { attestation } = await waitForAttestation(messageHash);

  // Step 4: Mint on Arc
  console.log(`[4] Minting tokens on Arc...`);
  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const arcWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arcProvider);
  const arcMessageTransmitter = new ethers.Contract(
    CONFIG.ARC_MESSAGE_TRANSMITTER,
    MESSAGE_TRANSMITTER_ABI,
    arcWallet
  );

  const mintTx = await arcMessageTransmitter.receiveMessage(messageBytes, attestation);
  const mintReceipt = await mintTx.wait();
  console.log(`  ✅ Minted: ${mintReceipt?.hash}`);

  // Step 5: Settle position
  console.log(`[5] Settling position on PerpsDEX...`);
  const perpsDex = new ethers.Contract(
    CONFIG.PERPS_DEX,
    PERPS_DEX_ABI,
    arcWallet
  );

  const settleTx = await perpsDex.settleWithdrawal(positionId);
  const settleReceipt = await settleTx.wait();
  console.log(`  ✅ Settled: ${settleReceipt?.hash}`);

  console.log(`\n✅ WITHDRAWAL FLOW COMPLETE\n`);
}

// ════════════════════════════════════════════════════════════════════
//                    DAEMON MODE (AUTO)
// ════════════════════════════════════════════════════════════════════

async function startRelayer() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Cross-Chain Margin Rehypothecation Relayer");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Configuration:");
  console.log(`  Arc RPC:        ${CONFIG.ARC_RPC}`);
  console.log(`  Arbitrum RPC:   ${CONFIG.ARB_RPC}`);
  console.log(`  PerpsDEX:       ${CONFIG.PERPS_DEX}`);
  console.log(`  MarginVault:    ${CONFIG.MARGIN_VAULT}`);
  console.log("");

  const arcProvider = new ethers.JsonRpcProvider(CONFIG.ARC_RPC);
  const perpsDex = new ethers.Contract(CONFIG.PERPS_DEX, PERPS_DEX_ABI, arcProvider);

  // Listen for deposits
  console.log("🔊 Listening for MarginBridged events...");
  perpsDex.on("MarginBridged", async (positionId: bigint, token: string, amount: bigint, cctpNonce: bigint, event: ethers.EventLog) => {
    console.log(`\n🔔 New deposit: Position #${positionId}`);
    try {
      const tx = await event.getTransaction();
      await handleDeposit(Number(positionId), tx.hash);
    } catch (err) {
      console.error(`❌ Deposit error:`, err);
    }
  });

  // Listen for withdrawals
  console.log("🔊 Listening for WithdrawalRequested events...");
  perpsDex.on(
    "WithdrawalRequested",
    async (positionId: bigint, trader: string, token: string, amount: bigint, cctpNonce: bigint) => {
      console.log(`\n🔔 Withdrawal requested: Position #${positionId}`);
      
      // Convert 18-decimal Arc amount to 6-decimal Arbitrum amount
      const arbAmount = amount / BigInt(1e12);
      
      try {
        await handleWithdrawal(Number(positionId), token, arbAmount);
      } catch (err) {
        console.error(`❌ Withdrawal error:`, err);
      }
    }
  );

  console.log("\n✅ Relayer running. Press Ctrl+C to stop.\n");
}

// ════════════════════════════════════════════════════════════════════
//                           MAIN
// ════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args[0] === "deposit" && args[1] && args[2]) {
  // Manual: npm start deposit <positionId> <burnTxHash>
  handleDeposit(Number(args[1]), args[2]).catch(console.error);
} else if (args[0] === "withdraw" && args[1] && args[2] && args[3]) {
  // Manual: npm start withdraw <positionId> <token> <amount>
  handleWithdrawal(Number(args[1]), args[2], BigInt(args[3])).catch(console.error);
} else if (args[0] === "daemon" || args.length === 0) {
  // Auto: npm start
  startRelayer().catch(console.error);
} else {
  console.log("Usage:");
  console.log("  npm start                                    # Start daemon mode");
  console.log("  npm start deposit <posId> <txHash>          # Manual deposit");
  console.log("  npm start withdraw <posId> <token> <amount> # Manual withdrawal");
}