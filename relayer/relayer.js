// relayer.js - CCTP V2 compliant relayer for Arc ↔ Arbitrum Sepolia
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import axios from 'axios';

dotenv.config();

// ─── Config ─────────────────────────────────────────────────────────────
const ARC_RPC = process.env.ARC_TESTNET_RPC;
const ARB_RPC = process.env.ARB_SEPOLIA_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const PERPS_DEX_ADDRESS = process.env.PERPS_DEX_ADDRESS;
const MARGIN_VAULT_ADDRESS = process.env.MARGIN_VAULT_ADDRESS;

// CCTP V2 addresses (same on all chains via CREATE2)
const MESSAGE_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';

// Domain IDs
const ARC_DOMAIN = 26;
const ARB_SEPOLIA_DOMAIN = 3;

// CCTP V2 Attestation API
const ATTESTATION_API_BASE = 'https://iris-api-sandbox.circle.com';

// ─── Providers & Wallet ─────────────────────────────────────────────────
const arcProvider = new ethers.JsonRpcProvider(ARC_RPC);
const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
const arcWallet = new ethers.Wallet(PRIVATE_KEY, arcProvider);
const arbWallet = new ethers.Wallet(PRIVATE_KEY, arbProvider);

console.log(`\n🔑 Relayer Address: ${arcWallet.address}\n`);

// ─── ABIs ───────────────────────────────────────────────────────────────
const PERPS_DEX_ABI = [
  'event PositionOpened(uint256 indexed positionId, address indexed trader, address marginToken, uint256 margin, uint256 leverage, uint256 entryPrice, bool isLong, uint64 cctpNonce)',
  'event PositionCloseInitiated(uint256 indexed positionId, uint256 exitPrice, int256 pnl)',
  'function settlePosition(uint256 positionId, uint256 returnedAmount) external'
];

const MARGIN_VAULT_ABI = [
  'event MarginReturned(uint256 indexed positionId, address token, uint256 amount, uint64 cctpNonce)',
  'function recordDeposit(uint256 positionId, address token, uint256 amount) external',
  'function returnMargin(uint256 positionId) external returns (uint64)'
];

const MESSAGE_TRANSMITTER_ABI = [
  'event MessageSent(bytes message)',
  'function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)'
];

const perpsDex = new ethers.Contract(PERPS_DEX_ADDRESS, PERPS_DEX_ABI, arcWallet);
const marginVault = new ethers.Contract(MARGIN_VAULT_ADDRESS, MARGIN_VAULT_ABI, arbWallet);
const arcTransmitter = new ethers.Contract(MESSAGE_TRANSMITTER, MESSAGE_TRANSMITTER_ABI, arcProvider);
const arbTransmitter = new ethers.Contract(MESSAGE_TRANSMITTER, MESSAGE_TRANSMITTER_ABI, arbProvider);
const arcTransmitterWrite = new ethers.Contract(MESSAGE_TRANSMITTER, MESSAGE_TRANSMITTER_ABI, arcWallet);
const arbTransmitterWrite = new ethers.Contract(MESSAGE_TRANSMITTER, MESSAGE_TRANSMITTER_ABI, arbWallet);

// ─── State ──────────────────────────────────────────────────────────────
let lastProcessedBlockArc = 0;
let lastProcessedBlockArb = 0;

// Track positions to handle close flow
const positionCloseRequested = new Map(); // positionId -> { exitPrice, pnl }

// ─── Helper: Get Attestation (CCTP V2) ─────────────────────────────────
/**
 * Polls Circle's CCTP V2 attestation API until attestation is ready
 * @param {string} txHash - Transaction hash containing MessageSent event
 * @param {number} sourceDomain - CCTP source domain (26 for Arc, 3 for Arb Sepolia)
 * @returns {Promise<{message: string, attestation: string}>}
 */
async function getAttestation(txHash, sourceDomain) {
  const url = `${ATTESTATION_API_BASE}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  
  console.log(`  📡 Polling attestation API: /v2/messages/${sourceDomain}?transactionHash=${txHash.slice(0, 10)}...`);
  
  for (let i = 0; i < 60; i++) {
    try {
      const res = await axios.get(url);
      
      if (res.data && res.data.messages && res.data.messages.length > 0) {
        const messageData = res.data.messages[0];
        
        if (messageData.attestation && messageData.attestation !== '0x') {
          console.log(`  ✅ Attestation received after ${i + 1} attempts`);
          return {
            message: messageData.message,
            attestation: messageData.attestation
          };
        }
      }
      
      console.log(`  ⏳ Attempt ${i + 1}/60: Waiting for attestation...`);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.log(`  ⏳ Attempt ${i + 1}/60: Message not yet indexed...`);
      } else {
        console.log(`  ⚠️  Attempt ${i + 1}/60 failed: ${err.message}`);
      }
    }
    
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
  }
  
  throw new Error('❌ Attestation timeout after 5 minutes');
}

// ═════════════════════════════════════════════════════════════════════
//  Arc → Arb: Position Opened (Margin Transfer)
// ═════════════════════════════════════════════════════════════════════
async function handlePositionOpened(event) {
  const { positionId, trader, marginToken, margin, leverage, entryPrice, isLong, cctpNonce } = event.args;
  const txHash = event.transactionHash;
  const blockNumber = event.blockNumber;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 [Arc→Arb] Position #${positionId} Opened`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Trader: ${trader}`);
  console.log(`  Margin: ${ethers.formatUnits(margin, 6)} USDC (6 decimals)`);
  console.log(`  Leverage: ${leverage}x`);
  console.log(`  Direction: ${isLong ? 'LONG' : 'SHORT'}`);
  console.log(`  Entry Price: ${ethers.formatUnits(entryPrice, 18)}`);
  console.log(`  CCTP Nonce: ${cctpNonce}`);
  console.log(`  Tx: https://testnet.arcscan.app/tx/${txHash}`);
  
  try {
    // Wait for Arc finality
    console.log(`\n⏱️  Waiting 10s for Arc finality...`);
    await new Promise(r => setTimeout(r, 10000));
    
    // Fetch attestation from Circle
    console.log(`\n🔍 Fetching attestation from Circle...`);
    const { message, attestation } = await getAttestation(txHash, ARC_DOMAIN);
    
    // Relay message to Arbitrum Sepolia
    console.log(`\n📤 Relaying to Arbitrum Sepolia...`);
    const tx1 = await arbTransmitterWrite.receiveMessage(message, attestation);
    console.log(`  Tx submitted: ${tx1.hash}`);
    console.log(`  Explorer: https://sepolia.arbiscan.io/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log(`  ✅ Message relayed (${receipt1.status === 1 ? 'success' : 'failed'})`);
    
    // Record deposit in MarginVault
    console.log(`\n💾 Recording deposit in MarginVault...`);
    const tx2 = await marginVault.recordDeposit(positionId, marginToken, margin);
    console.log(`  Tx submitted: ${tx2.hash}`);
    
    const receipt2 = await tx2.wait();
    console.log(`  ✅ Deposit recorded (${receipt2.status === 1 ? 'success' : 'failed'})`);
    
    console.log(`\n✨ Position #${positionId} fully processed!\n`);
  } catch (err) {
    console.error(`\n❌ Error processing position #${positionId}:`, err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════
//  Arc: Position Close Initiated (Trigger Return)
// ═════════════════════════════════════════════════════════════════════
async function handlePositionCloseInitiated(event) {
  const { positionId, exitPrice, pnl } = event.args;
  const txHash = event.transactionHash;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📉 [Arc] Position #${positionId} Close Initiated`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Exit Price: ${ethers.formatUnits(exitPrice, 18)}`);
  console.log(`  PnL: ${ethers.formatUnits(pnl, 6)} USDC`);
  console.log(`  Tx: https://testnet.arcscan.app/tx/${txHash}`);
  
  // Store for later use in return flow
  positionCloseRequested.set(positionId.toString(), {
    exitPrice: exitPrice.toString(),
    pnl: pnl.toString()
  });
  
  try {
    // Call MarginVault.returnMargin() on Arbitrum to start CCTP return
    console.log(`\n💸 Calling returnMargin() on Arbitrum...`);
    const tx = await marginVault.returnMargin(positionId);
    console.log(`  Tx submitted: ${tx.hash}`);
    console.log(`  Explorer: https://sepolia.arbiscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`  ✅ returnMargin() executed (${receipt.status === 1 ? 'success' : 'failed'})`);
    
    // The MarginReturned event will be picked up by pollArbEvents
  } catch (err) {
    console.error(`\n❌ Error initiating margin return for position #${positionId}:`, err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════
//  Arb → Arc: Margin Returned (Complete Settlement)
// ═════════════════════════════════════════════════════════════════════
async function handleMarginReturned(event) {
  const { positionId, token, amount, cctpNonce } = event.args;
  const txHash = event.transactionHash;
  const blockNumber = event.blockNumber;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💰 [Arb→Arc] Margin Returned for Position #${positionId}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Amount: ${ethers.formatUnits(amount, 6)} USDC (6 decimals)`);
  console.log(`  CCTP Nonce: ${cctpNonce}`);
  console.log(`  Tx: https://sepolia.arbiscan.io/tx/${txHash}`);
  
  try {
    // Wait for Arb finality
    console.log(`\n⏱️  Waiting 10s for Arbitrum finality...`);
    await new Promise(r => setTimeout(r, 10000));
    
    // Fetch attestation from Circle
    console.log(`\n🔍 Fetching attestation from Circle...`);
    const { message, attestation } = await getAttestation(txHash, ARB_SEPOLIA_DOMAIN);
    
    // Relay message to Arc
    console.log(`\n📤 Relaying to Arc testnet...`);
    const tx1 = await arcTransmitterWrite.receiveMessage(message, attestation);
    console.log(`  Tx submitted: ${tx1.hash}`);
    console.log(`  Explorer: https://testnet.arcscan.app/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log(`  ✅ Message relayed (${receipt1.status === 1 ? 'success' : 'failed'})`);
    
    // Settle position on Arc
    console.log(`\n🏁 Settling position on PerpsDEX...`);
    const tx2 = await perpsDex.settlePosition(positionId, amount);
    console.log(`  Tx submitted: ${tx2.hash}`);
    
    const receipt2 = await tx2.wait();
    console.log(`  ✅ Position settled (${receipt2.status === 1 ? 'success' : 'failed'})`);
    
    console.log(`\n✨ Position #${positionId} fully closed!\n`);
    
    // Clean up tracking
    positionCloseRequested.delete(positionId.toString());
  } catch (err) {
    console.error(`\n❌ Error processing margin return for position #${positionId}:`, err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════
//  Polling Loops
// ═════════════════════════════════════════════════════════════════════
async function pollArcEvents() {
  try {
    const currentBlock = await arcProvider.getBlockNumber();
    let fromBlock = lastProcessedBlockArc + 1;
    
    if (fromBlock > currentBlock) return;
    
    // Process in chunks of 10 blocks (free tier RPC limit)
    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + 9, currentBlock); // 10 blocks max
      
      if (toBlock - fromBlock > 1) {
        console.log(`[Arc Poll] Checking blocks ${fromBlock}-${toBlock}`);
      }
      
      // Check for PositionOpened events
      const openedEvents = await perpsDex.queryFilter(
        perpsDex.filters.PositionOpened(),
        fromBlock,
        toBlock
      );
      
      for (const event of openedEvents) {
        await handlePositionOpened(event);
      }
      
      // Check for PositionCloseInitiated events
      const closeEvents = await perpsDex.queryFilter(
        perpsDex.filters.PositionCloseInitiated(),
        fromBlock,
        toBlock
      );
      
      for (const event of closeEvents) {
        await handlePositionCloseInitiated(event);
      }
      
      fromBlock = toBlock + 1;
    }
    
    lastProcessedBlockArc = currentBlock;
  } catch (err) {
    console.error('[Arc Poll Error]', err.message);
  }
}

async function pollArbEvents() {
  try {
    const currentBlock = await arbProvider.getBlockNumber();
    let fromBlock = lastProcessedBlockArb + 1;
    
    if (fromBlock > currentBlock) return;
    
    // Process in chunks of 10 blocks (free tier RPC limit)
    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + 9, currentBlock); // 10 blocks max
      
      if (toBlock - fromBlock > 1) {
        console.log(`[Arb Poll] Checking blocks ${fromBlock}-${toBlock}`);
      }
      
      // Check for MarginReturned events
      const events = await marginVault.queryFilter(
        marginVault.filters.MarginReturned(),
        fromBlock,
        toBlock
      );
      
      for (const event of events) {
        await handleMarginReturned(event);
      }
      
      fromBlock = toBlock + 1;
    }
    
    lastProcessedBlockArb = currentBlock;
  } catch (err) {
    console.error('[Arb Poll Error]', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════
//  Main
// ═════════════════════════════════════════════════════════════════════
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 CCTP V2 Relayer Starting');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📍 Arc PerpsDEX:      ${PERPS_DEX_ADDRESS}`);
  console.log(`📍 Arb MarginVault:   ${MARGIN_VAULT_ADDRESS}`);
  console.log(`📍 MessageTransmitter: ${MESSAGE_TRANSMITTER}`);
  console.log(`\n🌐 Arc Domain:        ${ARC_DOMAIN}`);
  console.log(`🌐 Arb Sepolia Domain: ${ARB_SEPOLIA_DOMAIN}`);
  
  // Initialize starting blocks
  lastProcessedBlockArc = await arcProvider.getBlockNumber();
  lastProcessedBlockArb = await arbProvider.getBlockNumber();
  
  console.log(`\n📦 Starting from Arc block:        ${lastProcessedBlockArc}`);
  console.log(`📦 Starting from Arb Sepolia block: ${lastProcessedBlockArb}`);
  
  // Poll every 10 seconds
  console.log(`\n✅ Relayer active, polling every 10s...\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  setInterval(pollArcEvents, 10000);
  setInterval(pollArbEvents, 10000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});