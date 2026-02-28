import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
const PROXY_FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';

const code = await provider.getCode(PROXY_FACTORY);
console.log('Factory code length:', code.length);

// Extract 4-byte selectors from the bytecode
// They typically appear as PUSH4 instructions (0x63) followed by 4 bytes
// Also try common function selectors
const knownSelectors: Record<string, string> = {
  '0xa1884d2c': 'createProxy(address,uint256,address,(uint8,bytes32,bytes32))',
  '0x1688f0b9': 'createProxyWithNonce(address,bytes,uint256)',
  '0x61b69abd': 'computeProxyAddress(address)',
  '0xd18af54d': 'proxyCreationCode()',
  '0x15d56225': 'proxyRuntimeCode()',
  '0x53e5d935': 'getProxyCreationCode()',
};

// Try calling various view functions
const iface = new ethers.Interface([
  'function computeProxyAddress(address user) view returns (address)',
  'function proxyCreationCode() view returns (bytes)',
  'function proxyRuntimeCode() view returns (bytes)',
]);

// Let's check if there's a proxyCreationCode function
for (const [name, fragment] of Object.entries({
  'proxyCreationCode': 'function proxyCreationCode() view returns (bytes)',
  'proxyRuntimeCode': 'function proxyRuntimeCode() view returns (bytes)',
  'getChainId': 'function getChainId() view returns (uint256)',
})) {
  try {
    const iface2 = new ethers.Interface([fragment]);
    const data = iface2.encodeFunctionData(name);
    const result = await provider.call({ to: PROXY_FACTORY, data });
    if (result !== '0x') {
      console.log(`${name}: exists, result length=${result.length}`);
      if (result.length < 200) console.log(`  value: ${result}`);
    }
  } catch {
    // skip
  }
}

// The real question: what creation code does createProxy use vs what computeProxyAddress uses?
// Let's call proxyCreationCode if it exists
try {
  const iface3 = new ethers.Interface(['function proxyCreationCode() view returns (bytes)']);
  const data = iface3.encodeFunctionData('proxyCreationCode');
  const result = await provider.call({ to: PROXY_FACTORY, data });
  if (result && result.length > 66) {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], result);
    console.log('\nproxyCreationCode:', decoded[0].toString().slice(0, 100) + '...');
    console.log('proxyCreationCode length:', decoded[0].toString().length);
    
    // Compare with @prob/core's SINGLETON_INITIALIZATION_CODE
    const PROB_CORE_INIT = '0x608060405234801561001057600080fd5b5060405161019738038061019783398101604081905261002f916100b9565b6001600160a01b0381166100945760405162461bcd60e51b815260206004820152602260248201527f496e76616c69642073696e676c65746f6e20616464726573732070726f766964604482015261195960f21b606482015260840160405180910390fd5b600080546001600160a01b0319166001600160a01b03929092169190911790556100e7565b6000602082840312156100ca578081fd5b81516001600160a01b03811681146100e0578182fd5b9392505050565b60a2806100f56000396000f3fe6080604052600073ffffffffffffffffffffffffffffffffffffffff8154167fa619486e0000000000000000000000000000000000000000000000000000000082351415604e57808252602082f35b3682833781823684845af490503d82833e806067573d82fd5b503d81f3fea26469706673582212209b0d0387f8972950e63c2381667fe9ace03a967c9df0ec7747d9860f7be9476664736f6c63430008040033';
    
    console.log('\n@prob/core init code matches factory proxyCreationCode:', decoded[0].toString().toLowerCase() === PROB_CORE_INIT.toLowerCase());
  }
} catch(e: any) {
  console.log('proxyCreationCode not available:', e.message?.slice(0, 80));
}

// Another approach: let's disassemble the createProxy function to see 
// what salt it actually uses. The function selector is 0xa1884d2c.
// 
// Alternatively, let's just look at what CREATE2 parameters were actually used
// by examining the deploy TX traces.
// 
// Let's look at the code at the DEPLOYED proxy to compare with the expected init code
const DEPLOYED_PROXY = ethers.getAddress('0xbe02034e7102e0e2ad929821d8dc7c590df57405');
const proxyRuntime = await provider.getCode(DEPLOYED_PROXY);
console.log('\nDeployed proxy runtime code:', proxyRuntime);
console.log('Runtime code length:', proxyRuntime.length);

// The singleton slot
const slot0 = await provider.getStorage(DEPLOYED_PROXY, 0);
console.log('Singleton (slot 0):', slot0);
const singleton = ethers.getAddress('0x' + slot0.slice(26));
console.log('Singleton address:', singleton);

// Now compute what CREATE2 address should be with the ACTUAL creation code from the factory
// We know:
// - Factory: 0xB99159aBF0bF59a512970586F38292f8b9029924
// - Salt: keccak256(abi.encode(signer))
// - Init code: proxyCreationCode() + abi.encode(singleton)

// The runtime code we see matches @prob/core, so the init code should match too
// The question is: does the factory use a DIFFERENT init code in createProxy?

