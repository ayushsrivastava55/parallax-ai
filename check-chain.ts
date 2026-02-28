import { ethers } from 'ethers';

// Check exchange on BSC mainnet
const mainnet = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
const mainCode = await mainnet.getCode('0xF99F5367ce708c66F0860B77B4331301A5597c86');
console.log('Exchange on mainnet (56):', mainCode.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

// Check factory on mainnet  
const factoryMain = await mainnet.getCode('0xB99159aBF0bF59a512970586F38292f8b9029924');
console.log('Factory on mainnet (56):', factoryMain.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

// Check factory implementation on mainnet
const implMain = await mainnet.getCode('0xb99edA5281a3d2BefeF2f2243Dc37183dD2999FF');
console.log('Factory impl on mainnet:', implMain.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

// Check testnet
const testnet = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');
const testCode = await testnet.getCode('0x8b4E7A0c6d014b99F1E8B5CDB1e19Fb59284db90');
console.log('\nExchange on testnet (97):', testCode.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

const factoryTest = await testnet.getCode('0xB99159aBF0bF59a512970586F38292f8b9029924');
console.log('Factory on testnet (97):', factoryTest.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

const implTest = await testnet.getCode('0x5E7174dBa4Af3d85E9DAf7889f0B3EE65DC185d5');
console.log('Factory impl on testnet:', implTest.length > 2 ? 'EXISTS' : 'NOT DEPLOYED');

// Check our proxy on testnet!
const FACTORY_ABI = ['function computeProxyAddress(address user) view returns (address)'];
const testFactory = new ethers.Contract('0xB99159aBF0bF59a512970586F38292f8b9029924', FACTORY_ABI, testnet);
try {
  const proxyTest = await testFactory.computeProxyAddress('0x6d84e5b3728c7716535594f9E5d78630E847a02a');
  console.log('\nProxy addr on testnet:', proxyTest);
  const proxyCode = await testnet.getCode(proxyTest);
  console.log('Proxy deployed on testnet:', proxyCode.length > 2 ? 'YES' : 'NO');
} catch (e: any) {
  console.log('Testnet factory error:', e.message?.slice(0, 100));
}
