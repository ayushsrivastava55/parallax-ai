import 'dotenv/config';
import { ethers } from 'ethers';

const BSC_RPC = 'https://bsc-dataseed.binance.org';
const CHAIN_ID = 56;
const provider = new ethers.JsonRpcProvider(BSC_RPC);

const pk = process.env.BNB_PRIVATE_KEY!;
const wallet = new ethers.Wallet(pk, provider);

const PROXY_FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';
const factory = new ethers.Contract(PROXY_FACTORY, [
  'function computeProxyAddress(address user) view returns (address)',
], provider);
const proxyAddress = await factory.computeProxyAddress(wallet.address) as string;
console.log('EOA:', wallet.address);
console.log('Proxy:', proxyAddress);

// Contracts
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const CTF_EXCHANGE = '0xF99F5367ce708c66F0860B77B4331301A5597c86';
const CTF_TOKEN = ethers.getAddress('0xbcb0b99d9e005b4e872e9bc28f78f29e4361ad49'); // Probable CTF token

// Check current state
const usdt = new ethers.Contract(USDT, [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
], provider);

const eoaUsdtBal = await usdt.balanceOf(wallet.address);
const proxyUsdtBal = await usdt.balanceOf(proxyAddress);
console.log('\nUSDT balances:');
console.log('  EOA:', ethers.formatEther(eoaUsdtBal));
console.log('  Proxy:', ethers.formatEther(proxyUsdtBal));

const proxyAllowanceExchange = await usdt.allowance(proxyAddress, CTF_EXCHANGE);
const proxyAllowanceCTF = await usdt.allowance(proxyAddress, CTF_TOKEN);
console.log('\nProxy USDT allowances:');
console.log('  → Exchange:', ethers.formatEther(proxyAllowanceExchange));
console.log('  → CTF Token:', ethers.formatEther(proxyAllowanceCTF));

// The proxy is a Gnosis Safe, so we need to execute transactions THROUGH it
// Safe transactions require the owner (our EOA) to sign an execTransaction call
// The Safe contract ABI for execTransaction:
const SAFE_ABI = [
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) payable returns (bool success)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function nonce() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];

const safe = new ethers.Contract(proxyAddress, SAFE_ABI, wallet);

// Check Safe owners and threshold
const owners = await safe.getOwners();
const threshold = await safe.getThreshold();
const safeNonce = await safe.nonce();
console.log('\nSafe info:');
console.log('  Owners:', owners);
console.log('  Threshold:', threshold.toString());
console.log('  Nonce:', safeNonce.toString());

// We need to:
// 1. Transfer USDT from EOA to Proxy
// 2. Approve USDT from Proxy to CTF_EXCHANGE (via Safe execTransaction)
// 3. Approve USDT from Proxy to CTF_TOKEN (via Safe execTransaction)

// Step 1: Transfer USDT from EOA to Proxy
if (proxyUsdtBal === 0n && eoaUsdtBal > 0n) {
  console.log(`\n=== Step 1: Transferring USDT to proxy ===`);
  const usdtWithSigner = new ethers.Contract(USDT, [
    'function transfer(address to, uint256 amount) returns (bool)',
  ], wallet);
  
  const transferAmount = eoaUsdtBal; // Send all USDT
  console.log(`Transferring ${ethers.formatEther(transferAmount)} USDT to proxy...`);
  const tx = await usdtWithSigner.transfer(proxyAddress, transferAmount);
  console.log('TX:', tx.hash);
  const receipt = await tx.wait();
  console.log('Status:', receipt.status === 1 ? 'SUCCESS ✓' : 'FAILED ✗');
  
  const newBal = await usdt.balanceOf(proxyAddress);
  console.log('Proxy USDT balance now:', ethers.formatEther(newBal));
}

// Step 2 & 3: Approve USDT from Proxy via Safe execTransaction
const MAX_UINT = ethers.MaxUint256;
const erc20Iface = new ethers.Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

async function execSafeTx(to: string, data: string, label: string) {
  const nonce = await safe.nonce();
  
  // Build the Safe transaction hash
  const txHash = await safe.getTransactionHash(
    to,           // to
    0n,           // value
    data,         // data
    0,            // operation (0 = Call)
    0n,           // safeTxGas
    0n,           // baseGas
    0n,           // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    nonce         // _nonce
  );
  
  console.log(`\n${label}:`);
  console.log('  Safe tx hash:', txHash);
  
  // Sign the hash with our EOA
  // For GnosisSafe, we sign the raw hash (not EIP-191 personal sign)
  const sigBytes = wallet.signingKey.sign(txHash);
  // Safe expects signature as r + s + v (with v adjusted: 0->31, 1->32 for eth_sign type)
  // For a direct hash sign (contract signature), v should be adjusted
  // For threshold=1 with single owner, we need:
  // r(32) + s(32) + v(1) where v = 27 or 28
  const sig = ethers.Signature.from(sigBytes);
  const packedSig = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
  
  console.log('  Signature ready');
  
  // Execute the Safe transaction
  const execTx = await safe.execTransaction(
    to,
    0n,
    data,
    0,            // operation: Call
    0n,           // safeTxGas
    0n,           // baseGas
    0n,           // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    packedSig,
  );
  
  console.log('  TX:', execTx.hash);
  const receipt = await execTx.wait();
  console.log('  Status:', receipt.status === 1 ? 'SUCCESS ✓' : 'FAILED ✗');
}

// Approve USDT for CTF Exchange
if (proxyAllowanceExchange === 0n) {
  const approveData = erc20Iface.encodeFunctionData('approve', [CTF_EXCHANGE, MAX_UINT]);
  await execSafeTx(USDT, approveData, 'Approve USDT → Exchange');
}

// Approve USDT for CTF Token  
if (proxyAllowanceCTF === 0n) {
  const approveData = erc20Iface.encodeFunctionData('approve', [CTF_TOKEN, MAX_UINT]);
  await execSafeTx(USDT, approveData, 'Approve USDT → CTF Token');
}

// Also approve CTF Token (ERC-1155) for Exchange
const ctf1155 = new ethers.Contract(CTF_TOKEN, [
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
], provider);
const ctfApproved = await ctf1155.isApprovedForAll(proxyAddress, CTF_EXCHANGE);
console.log('\nCTF Token approved for Exchange:', ctfApproved);

if (!ctfApproved) {
  const erc1155Iface = new ethers.Interface([
    'function setApprovalForAll(address operator, bool approved)',
  ]);
  const approveData = erc1155Iface.encodeFunctionData('setApprovalForAll', [CTF_EXCHANGE, true]);
  await execSafeTx(CTF_TOKEN, approveData, 'Approve CTF Token → Exchange');
}

// Final state
console.log('\n=== Final State ===');
const finalProxyUsdt = await usdt.balanceOf(proxyAddress);
const finalAllowExchange = await usdt.allowance(proxyAddress, CTF_EXCHANGE);
const finalAllowCTF = await usdt.allowance(proxyAddress, CTF_TOKEN);
const finalCTFApproved = await ctf1155.isApprovedForAll(proxyAddress, CTF_EXCHANGE);

console.log('Proxy USDT balance:', ethers.formatEther(finalProxyUsdt));
console.log('USDT allowance → Exchange:', finalAllowExchange > 0n ? 'MAX ✓' : 'NONE ✗');
console.log('USDT allowance → CTF Token:', finalAllowCTF > 0n ? 'MAX ✓' : 'NONE ✗');
console.log('CTF Token approved → Exchange:', finalCTFApproved ? 'YES ✓' : 'NO ✗');

