import 'dotenv/config';
import { ethers } from 'ethers';

const PROXY_FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';
const BSC_RPC = 'https://bsc-dataseed.binance.org';
const CHAIN_ID = 56;
const ZERO = '0x0000000000000000000000000000000000000000';

const FACTORY_ABI = [
  'function computeProxyAddress(address user) view returns (address)',
  'function createProxy(address paymentToken, uint256 payment, address paymentReceiver, tuple(uint8 v, bytes32 r, bytes32 s) sig)',
];

const pk = process.env.BNB_PRIVATE_KEY;
if (!pk) { console.error('ERROR: BNB_PRIVATE_KEY not set in .env'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(BSC_RPC);
const wallet = new ethers.Wallet(pk, provider);
console.log('Signer:', wallet.address);

const factory = new ethers.Contract(PROXY_FACTORY, FACTORY_ABI, wallet);

// Step 1: Check if proxy already exists
console.log('\n=== Probable Safe Proxy Deployment ===');
const proxyAddress = await factory.computeProxyAddress(wallet.address);
console.log('Deterministic proxy address:', proxyAddress);

const code = await provider.getCode(proxyAddress);
if (code !== '0x') {
  console.log('\nProxy already deployed! Nothing to do.');
  console.log(`BscScan: https://bscscan.com/address/${proxyAddress}`);
  process.exit(0);
}

console.log('Proxy not yet deployed. Creating...');

// Step 2: Check BNB balance
const balance = await provider.getBalance(wallet.address);
console.log(`Wallet balance: ${ethers.formatEther(balance)} BNB`);

if (balance < ethers.parseEther('0.0005')) {
  console.error('ERROR: Insufficient BNB for gas (~0.001 BNB needed)');
  process.exit(1);
}

// Step 3: Sign EIP-712 CreateProxy message
// IMPORTANT: Factory uses EIP712Domain WITHOUT "version" field:
// EIP712Domain(string name, uint256 chainId, address verifyingContract)
const domain = {
  name: 'Probable Contract Proxy Factory',
  chainId: CHAIN_ID,
  verifyingContract: PROXY_FACTORY,
};

const types = {
  CreateProxy: [
    { name: 'paymentToken', type: 'address' },
    { name: 'payment', type: 'uint256' },
    { name: 'paymentReceiver', type: 'address' },
  ],
};

const message = {
  paymentToken: ZERO,
  payment: 0n,
  paymentReceiver: ZERO,
};

console.log('Signing EIP-712 CreateProxy message...');
const signature = await wallet.signTypedData(domain, types, message);
console.log('Signature:', signature.slice(0, 20) + '...');

// Parse into v, r, s
const sig = ethers.Signature.from(signature);
console.log(`  v=${sig.v}, r=${sig.r.slice(0, 12)}..., s=${sig.s.slice(0, 12)}...`);

// Step 4: Send createProxy transaction
console.log('\nSending createProxy transaction...');
const tx = await factory.createProxy(
  ZERO,  // paymentToken
  0n,     // payment
  ZERO,  // paymentReceiver
  { v: sig.v, r: sig.r, s: sig.s },
);

console.log('TX hash:', tx.hash);
console.log('Waiting for confirmation...');

const receipt = await tx.wait();
console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
console.log('Block:', receipt.blockNumber);
console.log('Gas used:', receipt.gasUsed.toString());

// Verify deployment
const codeAfter = await provider.getCode(proxyAddress);
if (codeAfter !== '0x') {
  console.log('\n=== Safe Proxy Deployed Successfully! ===');
  console.log('Proxy address:', proxyAddress);
  console.log(`BscScan: https://bscscan.com/address/${proxyAddress}`);
} else {
  console.log('\nWARNING: Proxy code still empty after tx. Check BscScan.');
}

console.log(`TX: https://bscscan.com/tx/${tx.hash}`);
console.log('\nDone! You can now trade on Probable.');
