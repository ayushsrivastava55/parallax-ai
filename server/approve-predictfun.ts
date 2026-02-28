import 'dotenv/config';
import { ethers } from 'ethers';

const pk = process.env.BNB_PRIVATE_KEY;
if (!pk) { console.log('ERROR: BNB_PRIVATE_KEY not set'); process.exit(1); }

const provider = new ethers.JsonRpcProvider('https://bsc-testnet-dataseed.bnbchain.org/');
const wallet = new ethers.Wallet(pk, provider);
console.log('Wallet:', wallet.address);

const USDT = '0xB32171ecD878607FFc4F8FC0bCcE6852BB3149E0';
const usdt = new ethers.Contract(USDT, [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
], wallet);

const bal = await usdt.balanceOf(wallet.address);
console.log('USDT balance:', ethers.formatEther(bal));

const exchanges = [
  ['CTF_EXCHANGE', '0x2A6413639BD3d73a20ed8C95F634Ce198ABbd2d7'],
  ['NEG_RISK_CTF_EXCHANGE', '0xd690b2bd441bE36431F6F6639D7Ad351e7B29680'],
  ['YIELD_BEARING_CTF_EXCHANGE', '0x8a6B4Fa700A1e310b106E7a48bAFa29111f66e89'],
  ['YIELD_BEARING_NEG_RISK_CTF_EXCHANGE', '0x95D5113bc50eD201e319101bbca3e0E250662fCC'],
] as const;

for (const [name, addr] of exchanges) {
  const allowance = await usdt.allowance(wallet.address, addr);
  console.log(`\n${name} allowance:`, ethers.formatEther(allowance));

  if (allowance === 0n) {
    console.log(`  Approving max USDT...`);
    const tx = await usdt.approve(addr, ethers.MaxUint256);
    console.log('  TX:', tx.hash);
    const receipt = await tx.wait();
    console.log('  Status:', receipt!.status === 1 ? 'OK' : 'FAILED');
  } else {
    console.log('  Already approved');
  }
}

// Also approve Conditional Tokens contract for Exchange (ERC-1155 setApprovalForAll)
const CONDITIONAL_TOKENS = '0x2827AAef52D71910E8FBad2FfeBC1B6C2DA37743';
const ct = new ethers.Contract(CONDITIONAL_TOKENS, [
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
], wallet);

for (const [name, addr] of exchanges) {
  const approved = await ct.isApprovedForAll(wallet.address, addr);
  console.log(`\nCT approved for ${name}:`, approved);
  if (!approved) {
    console.log('  Setting approval...');
    const tx = await ct.setApprovalForAll(addr, true);
    console.log('  TX:', tx.hash);
    const receipt = await tx.wait();
    console.log('  Status:', receipt!.status === 1 ? 'OK' : 'FAILED');
  }
}

console.log('\nDone!');
