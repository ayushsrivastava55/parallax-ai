import 'dotenv/config';
import { Wallet, ethers } from 'ethers';
import { createHmac } from 'node:crypto';

const EVENTS_API = 'https://market-api.probable.markets';
const CLOB_API = 'https://api.probable.markets';
const CHAIN_ID = 56;
const PROXY_FACTORY = '0xB99159aBF0bF59a512970586F38292f8b9029924';
const PROXY_FACTORY_ABI = [
  'function computeProxyAddress(address user) view returns (address)',
];

const pk = process.env.BNB_PRIVATE_KEY;
if (!pk) { console.error('ERROR: BNB_PRIVATE_KEY not set in .env'); process.exit(1); }

const wallet = new Wallet(pk);
console.log(`\n=== Probable End-to-End Test ===`);
console.log(`Wallet (EOA): ${wallet.address}\n`);

// ── Step 0: Resolve Proxy Address ──
console.log('── Step 0: Resolving proxy address...');
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
const factory = new ethers.Contract(PROXY_FACTORY, PROXY_FACTORY_ABI, provider);
const proxyAddress = await factory.computeProxyAddress(wallet.address) as string;
console.log(`  Proxy address: ${proxyAddress}`);

const proxyCode = await provider.getCode(proxyAddress);
const proxyDeployed = proxyCode.length > 2;
console.log(`  Deployed: ${proxyDeployed ? 'YES' : 'NO'}`);

if (!proxyDeployed) {
  console.log('\n  WARNING: Proxy wallet not deployed on-chain.');
  console.log('  Visit probable.markets and connect your wallet to auto-deploy.');
  console.log('  Continuing test with proxy address anyway (order will fail at submission)...\n');
}

// ── Step 1: Fetch Markets ──
console.log('── Step 1: Fetching markets...');
const eventsRes = await fetch(`${EVENTS_API}/public/api/v1/events?active=true&limit=5`, {
  signal: AbortSignal.timeout(15_000),
});
if (!eventsRes.ok) { console.error(`Events API failed: ${eventsRes.status}`); process.exit(1); }

const events = await eventsRes.json() as any[];
console.log(`✓ Got ${events.length} events`);

let targetMarket: any = null;
let targetEvent: any = null;
let yesTokenId = '';
let noTokenId = '';

for (const event of events) {
  for (const market of event.markets || []) {
    if (market.tokens?.length >= 2) {
      targetEvent = event;
      targetMarket = market;
      yesTokenId = market.tokens.find((t: any) => t.outcome === 'Yes')?.token_id || market.tokens[0].token_id;
      noTokenId = market.tokens.find((t: any) => t.outcome === 'No')?.token_id || market.tokens[1].token_id;
      break;
    }
  }
  if (targetMarket) break;
}

if (!targetMarket) { console.error('No market with tokens found'); process.exit(1); }
console.log(`  Event: ${targetEvent.title}`);
console.log(`  Market: ${targetMarket.question}`);
console.log(`  YES token: ${yesTokenId.slice(0, 20)}...`);

// ── Step 2: Fetch Orderbook ──
console.log('\n── Step 2: Fetching orderbook...');
const yesBookRes = await fetch(`${CLOB_API}/public/api/v1/book?token_id=${yesTokenId}`, { signal: AbortSignal.timeout(5_000) });
if (!yesBookRes.ok) { console.error(`YES orderbook failed: ${yesBookRes.status}`); process.exit(1); }

const yesBook = await yesBookRes.json() as any;
const yesBestBid = yesBook.bids?.sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price))[0];
const yesBestAsk = yesBook.asks?.sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))[0];

console.log(`✓ YES orderbook: ${yesBook.bids?.length || 0} bids, ${yesBook.asks?.length || 0} asks`);
console.log(`  Best bid: ${yesBestBid?.price || 'none'} | Best ask: ${yesBestAsk?.price || 'none'}`);

// ── Step 3: L1 Auth (EIP-712) ──
console.log('\n── Step 3: L1 Authentication...');
const authDomain = { name: 'ClobAuthDomain', version: '1', chainId: CHAIN_ID };
const authTypes = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
};
const authTimestamp = Math.floor(Date.now() / 1000).toString();
const authMsg = {
  address: wallet.address,
  timestamp: authTimestamp,
  nonce: 0n,
  message: 'This message attests that I control the given wallet',
};

const authSig = await wallet.signTypedData(authDomain, authTypes, authMsg);
console.log(`✓ Auth signature: ${authSig.slice(0, 20)}...`);

const l1Headers: Record<string, string> = {
  'Content-Type': 'application/json',
  Prob_address: wallet.address,
  Prob_signature: authSig,
  Prob_timestamp: authTimestamp,
  Prob_nonce: '0',
};

// ── Step 4: Create/Derive API Key ──
console.log('\n── Step 4: Getting L2 API key...');
let apiKey = '', apiSecret = '', apiPassphrase = '';

const createRes = await fetch(`${CLOB_API}/public/api/v1/auth/api-key/${CHAIN_ID}`, {
  method: 'POST',
  headers: l1Headers,
  signal: AbortSignal.timeout(10_000),
});

let authData: any = null;
if (createRes.ok) {
  authData = await createRes.json();
  console.log(`✓ API key created`);
} else {
  const deriveTimestamp = Math.floor(Date.now() / 1000).toString();
  const deriveSig = await wallet.signTypedData(authDomain, authTypes, {
    ...authMsg,
    timestamp: deriveTimestamp,
  });

  const deriveRes = await fetch(`${CLOB_API}/public/api/v1/auth/derive-api-key/${CHAIN_ID}`, {
    method: 'GET',
    headers: {
      Prob_address: wallet.address,
      Prob_signature: deriveSig,
      Prob_timestamp: deriveTimestamp,
      Prob_nonce: '0',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (deriveRes.ok) {
    authData = await deriveRes.json();
    console.log(`✓ API key derived`);
  } else {
    console.error(`✗ Auth failed: ${deriveRes.status} — ${await deriveRes.text()}`);
    process.exit(1);
  }
}

apiKey = authData.apiKey;
apiSecret = authData.secret;
apiPassphrase = authData.passphrase;
console.log(`  API key: ${apiKey?.slice(0, 12)}...`);

// ── Step 5: Build & Sign Order ──
console.log('\n── Step 5: Building order (maker=proxy, signer=EOA)...');

const side = 'BUY';
const price = 0.01;
const sizeShares = 1;

const SCALE = 1_000_000_000_000_000_000n;
const QTY_STEP = 10n ** 16n;

let sharesRaw = BigInt(Math.round(sizeShares * 1e8)) * SCALE / 100_000_000n;
sharesRaw = (sharesRaw / QTY_STEP) * QTY_STEP;
if (sharesRaw === 0n) sharesRaw = QTY_STEP;

const priceScaled = BigInt(Math.round(price * 10000));
const usdtRaw = sharesRaw * priceScaled / 10000n;

const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

const SIG_TYPE_PROB_GNOSIS_SAFE = 2;

const orderDomain = {
  name: 'Probable CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: '0xF99F5367ce708c66F0860B77B4331301A5597c86',
};

const orderTypes = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
};

const orderMsg = {
  salt,
  maker: proxyAddress,          // PROXY address
  signer: wallet.address,       // EOA signs
  taker: '0x0000000000000000000000000000000000000000',
  tokenId: BigInt(yesTokenId),
  makerAmount: usdtRaw,         // USDT paying
  takerAmount: sharesRaw,       // Shares receiving
  expiration: 0n,               // No expiration
  nonce: 0n,
  feeRateBps: 175n,
  side: 0, // BUY
  signatureType: SIG_TYPE_PROB_GNOSIS_SAFE,
};

console.log(`  maker (proxy): ${proxyAddress}`);
console.log(`  signer (EOA): ${wallet.address}`);
console.log(`  signatureType: ${SIG_TYPE_PROB_GNOSIS_SAFE} (ProbGnosisSafe)`);
console.log(`  Side: ${side}, Price: $${price}, Shares: ${sizeShares}`);
console.log(`  makerAmount: ${usdtRaw.toString()}`);
console.log(`  takerAmount: ${sharesRaw.toString()}`);

const orderSig = await wallet.signTypedData(orderDomain, orderTypes, orderMsg);
console.log(`✓ Order signed: ${orderSig.slice(0, 20)}...`);

// ── Step 6: Submit Order ──
console.log('\n── Step 6: Submitting order to CLOB...');

const orderBody = {
  deferExec: true,
  order: {
    salt: salt.toString(),
    maker: proxyAddress,
    signer: wallet.address,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: yesTokenId,
    makerAmount: usdtRaw.toString(),
    takerAmount: sharesRaw.toString(),
    side: 'BUY',
    expiration: '0',
    nonce: '0',
    feeRateBps: '175',
    signatureType: SIG_TYPE_PROB_GNOSIS_SAFE,
    signature: orderSig,
  },
  owner: proxyAddress,
  orderType: 'GTC',
};

const requestPath = `/public/api/v1/order/${CHAIN_ID}`;
const bodyStr = JSON.stringify(orderBody);

const hmacTimestamp = Math.floor(Date.now() / 1000);
const hmacMessage = String(hmacTimestamp) + 'POST' + requestPath + bodyStr;
const keyBuffer = Buffer.from(apiSecret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmacSig = createHmac('sha256', keyBuffer).update(hmacMessage).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');

const orderRes = await fetch(`${CLOB_API}${requestPath}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Prob_address: wallet.address,
    Prob_signature: hmacSig,
    Prob_timestamp: String(hmacTimestamp),
    Prob_api_key: apiKey,
    Prob_passphrase: apiPassphrase,
  },
  body: bodyStr,
  signal: AbortSignal.timeout(10_000),
});

const orderResult = await orderRes.json();
console.log(`  HTTP status: ${orderRes.status}`);
console.log(`  Response:`, JSON.stringify(orderResult, null, 2));

if (orderRes.ok) {
  console.log(`\n✓ ORDER SUBMITTED SUCCESSFULLY!`);

  const orderId = (orderResult as any).orderId || (orderResult as any).orderID || (orderResult as any).id;
  if (orderId) {
    console.log(`\n── Step 7: Cancelling test order ${orderId}...`);
    const cancelPath = `/public/api/v1/order/${CHAIN_ID}/${orderId}`;
    const cancelTimestamp = Math.floor(Date.now() / 1000);
    const cancelMessage = String(cancelTimestamp) + 'DELETE' + cancelPath;
    const cancelSig = createHmac('sha256', keyBuffer).update(cancelMessage).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const cancelRes = await fetch(`${CLOB_API}${cancelPath}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Prob_address: wallet.address,
        Prob_signature: cancelSig,
        Prob_timestamp: String(cancelTimestamp),
        Prob_api_key: apiKey,
        Prob_passphrase: apiPassphrase,
      },
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`  Cancel status: ${cancelRes.status}`);
    if (cancelRes.ok) console.log(`✓ Test order cancelled`);
    else console.log(`  Cancel response:`, await cancelRes.text());
  }
} else {
  console.log(`\n✗ Order submission failed`);
}

console.log('\n=== Test Complete ===\n');
