// relayer.js
import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

// ─── Config ─────────────────────────────────────────────────────────────
const ARC_RPC = process.env.ARC_TESTNET_RPC;
const ARB_RPC = process.env.ARB_SEPOLIA_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const PERPS_DEX_ADDRESS = process.env.PERPS_DEX_ADDRESS;
const MARGIN_VAULT_ADDRESS = process.env.MARGIN_VAULT_ADDRESS;

const MESSAGE_TRANSMITTER_ARC = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';
const MESSAGE_TRANSMITTER_ARB = '0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872';

const ATTESTATION_API = 'https://iris-api-sandbox.circle.com/v1/attestations';

// ─── Providers & Wallet ─────────────────────────────────────────────────
const arcProvider = new ethers.JsonRpcProvider(ARC_RPC);
const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
const arcWallet = new ethers.Wallet(PRIVATE_KEY, arcProvider);
const arbWallet = new ethers.Wallet(PRIVATE_KEY, arbProvider);

// ─── ABIs ───────────────────────────────────────────────────────────────
const PERPS_DEX_ABI = [
  'event PositionOpened(uint256 indexed positionId, address indexed trader, address marginToken, uint256 margin, uint256 leverage, uint256 entryPrice, bool isLong, uint64 cctpNonce)',
  'function settlePosition(uint256 positionId, uint256 returnedAmount) external'
];

const MARGIN_VAULT_ABI = [
  'event MarginReturned(uint256 indexed positionId, uint64 cctpNonce, uint256 amount)',
  'function recordDeposit(uint256 positionId, uint256 amount) external'
];

const MESSAGE_TRANSMITTER_ABI = [
  'event MessageSent(bytes message)',
  'function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)'
];

const perpsDex = new ethers.Contract(PERPS_DEX_ADDRESS, PERPS_DEX_ABI, arcWallet);
const marginVault = new ethers.Contract(MARGIN_VAULT_ADDRESS, MARGIN_VAULT_ABI, arbWallet);
const arcTransmitter = new ethers.Contract(MESSAGE_TRANSMITTER_ARC, MESSAGE_TRANSMITTER_ABI, arcProvider);
const arbTransmitter = new ethers.Contract(MESSAGE_TRANSMITTER_ARB, MESSAGE_TRANSMITTER_ABI, arbWallet);

// ─── State ──────────────────────────────────────────────────────────────
let lastProcessedBlockArc = 0;
let lastProcessedBlockArb = 0;

// ─── Helper: Get Attestation ────────────────────────────────────────────
async function getAttestation(messageHash) {
  const url = `${ATTESTATION_API}/${messageHash}`;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await axios.get(url);
      if (res.data.status === 'complete') {
        return res.data.attestation;
      }
    } catch (err) {
      console.log(`Attestation attempt ${i + 1}/30 failed, retrying...`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Attestation timeout');
}

// ─── Arc → Arb: Position Opened ─────────────────────────────────────────
async function handlePositionOpened(positionId, trader, marginToken, margin, leverage, entryPrice, isLong, cctpNonce, blockNumber) {
  console.log(`\n[Arc→Arb] Position ${positionId} opened by ${trader}`);
  console.log(`  Margin: ${ethers.formatUnits(margin, 6)} (6 decimals)`);
  console.log(`  CCTP Nonce: ${cctpNonce}`);

  // Wait for Arc finality
  console.log('  Waiting 6s for Arc finality...');
  await new Promise(r => setTimeout(r, 6000));

  // Get MessageSent event
  const messageSentFilter = arcTransmitter.filters.MessageSent();
  const events = await arcTransmitter.queryFilter(messageSentFilter, blockNumber, blockNumber);
  
  if (events.length === 0) {
    console.error('  ❌ No MessageSent event found');
    return;
  }

  const messageBytes = events[0].args.message;
  const messageHash = ethers.keccak256(messageBytes);
  console.log(`  Message hash: ${messageHash}`);

  // Fetch attestation
  console.log('  Fetching attestation...');
  const attestation = await getAttestation(messageHash);
  console.log('  ✅ Attestation received');

  // Relay message to Arb Sepolia
  console.log('  Relaying to Arbitrum Sepolia...');
  const tx1 = await arbTransmitter.receiveMessage(messageBytes, attestation);
  await tx1.wait();
  console.log(`  ✅ Message relayed: ${tx1.hash}`);

  // Record deposit in MarginVault
  console.log('  Recording deposit...');
  const tx2 = await marginVault.recordDeposit(positionId, margin);
  await tx2.wait();
  console.log(`  ✅ Deposit recorded: ${tx2.hash}`);
}

// ─── Arb → Arc: Margin Returned ────────────────────────────────────────
async function handleMarginReturned(positionId, cctpNonce, amount, blockNumber) {
  console.log(`\n[Arb→Arc] Margin returned for position ${positionId}`);
  console.log(`  Amount: ${ethers.formatUnits(amount, 6)} (6 decimals)`);
  console.log(`  CCTP Nonce: ${cctpNonce}`);

  // Wait for Arb finality
  console.log('  Waiting 5s for Arb finality...');
  await new Promise(r => setTimeout(r, 5000));

  // Get MessageSent event
  const messageSentFilter = {
    address: MESSAGE_TRANSMITTER_ARB,
    topics: [ethers.id('MessageSent(bytes)')]
  };
  const logs = await arbProvider.getLogs({
    ...messageSentFilter,
    fromBlock: blockNumber,
    toBlock: blockNumber
  });

  if (logs.length === 0) {
    console.error('  ❌ No MessageSent event found');
    return;
  }

  const iface = new ethers.Interface(MESSAGE_TRANSMITTER_ABI);
  const parsed = iface.parseLog(logs[0]);
  const messageBytes = parsed.args.message;
  const messageHash = ethers.keccak256(messageBytes);
  console.log(`  Message hash: ${messageHash}`);

  // Fetch attestation
  console.log('  Fetching attestation...');
  const attestation = await getAttestation(messageHash);
  console.log('  ✅ Attestation received');

  // Relay message to Arc
  console.log('  Relaying to Arc...');
  const tx1 = await new ethers.Contract(MESSAGE_TRANSMITTER_ARC, MESSAGE_TRANSMITTER_ABI, arcWallet)
    .receiveMessage(messageBytes, attestation);
  await tx1.wait();
  console.log(`  ✅ Message relayed: ${tx1.hash}`);

  // Settle position
  console.log('  Settling position...');
  const tx2 = await perpsDex.settlePosition(positionId, amount);
  await tx2.wait();
  console.log(`  ✅ Position settled: ${tx2.hash}`);
}

// ─── Polling Loop ───────────────────────────────────────────────────────
async function pollArcEvents() {
  try {
    const currentBlock = await arcProvider.getBlockNumber();
    const fromBlock = lastProcessedBlockArc + 1;
    
    if (fromBlock > currentBlock) return;

    console.log(`[Arc Poll] Checking blocks ${fromBlock}-${currentBlock}`);

    const events = await perpsDex.queryFilter(
      perpsDex.filters.PositionOpened(),
      fromBlock,
      currentBlock
    );

    for (const event of events) {
      await handlePositionOpened(
        event.args.positionId,
        event.args.trader,
        event.args.marginToken,
        event.args.margin,
        event.args.leverage,
        event.args.entryPrice,
        event.args.isLong,
        event.args.cctpNonce,
        event.blockNumber
      );
    }

    lastProcessedBlockArc = currentBlock;
  } catch (err) {
    console.error('[Arc Poll Error]', err.message);
  }
}

async function pollArbEvents() {
  try {
    const currentBlock = await arbProvider.getBlockNumber();
    const fromBlock = lastProcessedBlockArb + 1;
    
    if (fromBlock > currentBlock) return;

    console.log(`[Arb Poll] Checking blocks ${fromBlock}-${currentBlock}`);

    const events = await marginVault.queryFilter(
      marginVault.filters.MarginReturned(),
      fromBlock,
      currentBlock
    );

    for (const event of events) {
      await handleMarginReturned(
        event.args.positionId,
        event.args.cctpNonce,
        event.args.amount,
        event.blockNumber
      );
    }

    lastProcessedBlockArb = currentBlock;
  } catch (err) {
    console.error('[Arb Poll Error]', err.message);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 CCTP Relayer Starting...');
  console.log(`Arc PerpsDEX: ${PERPS_DEX_ADDRESS}`);
  console.log(`Arb MarginVault: ${MARGIN_VAULT_ADDRESS}`);

  // Initialize starting blocks
  lastProcessedBlockArc = await arcProvider.getBlockNumber();
  lastProcessedBlockArb = await arbProvider.getBlockNumber();
  console.log(`Starting from Arc block: ${lastProcessedBlockArc}`);
  console.log(`Starting from Arb block: ${lastProcessedBlockArb}`);

  // Poll every 10 seconds
  setInterval(pollArcEvents, 10000);
  setInterval(pollArbEvents, 10000);
  
  console.log('\n✅ Relayer active, polling every 10s...\n');
}

main().catch(console.error);