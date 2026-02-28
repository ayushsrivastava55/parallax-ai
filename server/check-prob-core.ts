import { ethers } from 'ethers';

const wallet = '0x6d84e5b3728c7716535594f9E5d78630E847a02a';
const PROXY_FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';

// From @prob/core source, getSafeAddress uses:
// 1. salt = keccak256(abi.encodePacked(signerAddress))
// Actually, let's try both encodePacked and encode
const salt1 = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [wallet]));
const salt2 = ethers.keccak256(ethers.solidityPacked(['address'], [wallet]));

console.log('salt (abi.encode):', salt1);
console.log('salt (encodePacked):', salt2);

// Now we need the creation code hash to compute CREATE2
// CREATE2: address = keccak256(0xff ++ factory ++ salt ++ keccak256(creation_code))

// The creation code is the Safe proxy bytecode with the singleton address embedded
// Standard GnosisSafe singleton on BSC is typically at:
// 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552 (Safe v1.3.0)

// Let's check what @prob/core uses as SAFE_SINGLETON
// From prob/core source inspection, they use a specific singleton
// Let's try different common Safe singletons

const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');

// Let's look at the bytecode of the deployed proxy to find the singleton
const REAL_PROXY = ethers.getAddress('0xb9f8fd02f3e2e403e69c0a03e9195b396838d50e');
const proxyCode = await provider.getCode(REAL_PROXY);
console.log('\nDeployed proxy bytecode:', proxyCode);

// Safe proxy bytecode typically contains the singleton address
// The standard GnosisSafeProxy bytecode delegates all calls to the singleton
// The singleton address is stored in slot 0
const slot0 = await provider.getStorage(REAL_PROXY, 0);
console.log('Storage slot 0 (singleton):', slot0);

// The singleton address should be the last 20 bytes of slot 0
const singleton = ethers.getAddress('0x' + slot0.slice(26));
console.log('Singleton address:', singleton);

// Now let's look at the factory's storage to understand computeProxyAddress
// We need to know the proxy creation code the factory uses

// Check another well-known Polymarket-style factory
// Polymarket uses their own factory at different address
// Let's check Prob's factory owner/config
const factoryCode = await provider.getCode(PROXY_FACTORY);
console.log('\nFactory bytecode length:', factoryCode.length);

// Try to find the standard Safe proxy creation code
// The Safe proxy creation code for GnosisSafeProxy is:
// 0x608060405234801561001057600080fd5b5060405161016d38038061016d8339818101604052810190610032919061005c565b60008082600001519050600260ff168160ff16036100595760008360200151905080600001905050505b80fd5b610089565b600061006482610075565b905082810382811115610075578182fd5b92915050565b60006020828403121561009c57600080fd5b604051602081016001600160401b03811182821017156100c1576100c16100c5565b60405281516100cf816100d5565b8082525090505b60006020828403121561009c57600080fd5b634e487b7160e01b600052604160045260246000fd5b6001600160a01b038116811461010057600080fd5bfe

// Actually, let's just try the CLOB's expected proxy check directly
// Perhaps the CLOB uses a DIFFERENT factory or method

// Let's check if there's a standard Safe ProxyFactory on BSC
const STANDARD_SAFE_FACTORY = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
const standardFactoryCode = await provider.getCode(STANDARD_SAFE_FACTORY);
console.log('Standard Safe factory exists on BSC:', standardFactoryCode.length > 2 ? 'YES' : 'NO');

// What if probable's CLOB computes the proxy address using @prob/core's getSafeAddress
// which might use a different creation code than what the factory actually deploys?
// That would explain the discrepancy

// Let's check the Probable website's frontend for clues
// The website likely has a JS bundle that shows how it deploys proxies

console.log('\n=== Trying @prob/core approach ===');
// From @prob/core: getSafeAddress(chainId, signerAddress)
// It likely does: CREATE2(factory, salt=keccak256(encode(signer)), initCodeHash)
// We need the initCodeHash

// Standard GnosisSafeProxy init code hash from Safe contracts:
// It's the keccak256 of the proxy creation code that includes the singleton address
// For standard Safe v1.3.0:
// Proxy creation code = 0x608060...{singleton padded to 32 bytes}

// Let's compute it using the singleton we found
const PROXY_CREATION_CODE_PREFIX = '0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260248152602001806101c26024913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050610057806101656000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564';

// The init code is: PROXY_CREATION_CODE_PREFIX + abi.encode(singleton)
const singletonEncoded = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [singleton]);
const initCode = PROXY_CREATION_CODE_PREFIX + singletonEncoded.slice(2);
const initCodeHash = ethers.keccak256(initCode);
console.log('Init code hash:', initCodeHash);

// Compute CREATE2 address with each salt
const create2Addr1 = ethers.getCreate2Address(PROXY_FACTORY, salt1, initCodeHash);
const create2Addr2 = ethers.getCreate2Address(PROXY_FACTORY, salt2, initCodeHash);
console.log('CREATE2 with abi.encode salt:', create2Addr1);
console.log('CREATE2 with encodePacked salt:', create2Addr2);
console.log('Matches real proxy?', create2Addr1.toLowerCase() === REAL_PROXY.toLowerCase() || create2Addr2.toLowerCase() === REAL_PROXY.toLowerCase());
console.log('Matches computed proxy?', create2Addr1.toLowerCase() === '0x7A4272cBEac3C25933dD6009fcfFbE1A1427Be94'.toLowerCase() || create2Addr2.toLowerCase() === '0x7A4272cBEac3C25933dD6009fcfFbE1A1427Be94'.toLowerCase());

