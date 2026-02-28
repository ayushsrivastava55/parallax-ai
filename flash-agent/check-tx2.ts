import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
const receipt = await provider.getTransactionReceipt('0xf78031232e04ef7eeb355db990d1769dea952bbb35248c784c458cfb61ced900');
console.log('Status:', receipt?.status);
console.log('Gas used:', receipt?.gasUsed?.toString());
console.log('Logs:', receipt?.logs?.length);

// Also check our remaining balance
const bal = await provider.getBalance('0x6d84e5b3728c7716535594f9E5d78630E847a02a');
console.log('BNB balance:', ethers.formatEther(bal));

// Let me try a completely different approach — look at how other users have deployed
// Check a real deployed Safe proxy address from Probable 
// Look at a recent ProxyCreation event from the factory
const FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';
const currentBlock = await provider.getBlockNumber();
console.log('\nCurrent block:', currentBlock);

// Check the ProxyCreation event topic from the 2nd log of our first TX
// Topic: 0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235
const eventTopic = '0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235';

// Look back a few thousand blocks for recent proxy creations
const fromBlock = currentBlock - 50000; // ~40 hours back
console.log('Searching for ProxyCreation events from block', fromBlock);

try {
  const logs = await provider.getLogs({
    address: FACTORY,
    topics: [eventTopic],
    fromBlock,
    toBlock: currentBlock,
  });
  console.log('Found', logs.length, 'ProxyCreation events');
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    console.log('Last event block:', last.blockNumber, 'tx:', last.transactionHash);
    console.log('Data:', last.data.slice(0, 130));
  }
} catch (e: any) {
  console.log('Event query error:', e.message?.slice(0, 100));
}
