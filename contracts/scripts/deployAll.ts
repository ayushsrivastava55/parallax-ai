import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("═══ ERC-8004 + FlashAgent — Full Deployment ═══\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB\n");

  // 1. Deploy IdentityRegistry
  console.log("1/4 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  const identityAddr = await identityRegistry.getAddress();
  console.log("  IdentityRegistry:", identityAddr);

  // 2. Deploy ReputationRegistry
  console.log("2/4 Deploying ReputationRegistry...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(identityAddr);
  await reputationRegistry.waitForDeployment();
  const reputationAddr = await reputationRegistry.getAddress();
  console.log("  ReputationRegistry:", reputationAddr);

  // 3. Deploy ValidationRegistry
  console.log("3/4 Deploying ValidationRegistry...");
  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validationRegistry = await ValidationRegistry.deploy(identityAddr);
  await validationRegistry.waitForDeployment();
  const validationAddr = await validationRegistry.getAddress();
  console.log("  ValidationRegistry:", validationAddr);

  // 4. Deploy FlashAgent NFA
  console.log("4/4 Deploying FlashAgent NFA...");
  const FlashAgent = await ethers.getContractFactory("FlashAgent");
  const flashAgent = await FlashAgent.deploy();
  await flashAgent.waitForDeployment();
  const flashAgentAddr = await flashAgent.getAddress();
  console.log("  FlashAgent:", flashAgentAddr);

  // 5. Register agent in IdentityRegistry (use explicit overload for ethers v6)
  console.log("\nRegistering Flash agent in IdentityRegistry...");
  const agentURI = "https://flash-agent.example.com/erc8004-metadata.json";
  const registerTx = await identityRegistry["register(string)"](agentURI);
  const registerReceipt = await registerTx.wait();

  // Get agentId from Registered event
  let agentId = 0;
  for (const log of registerReceipt!.logs) {
    try {
      const parsed = identityRegistry.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === "Registered") {
        agentId = Number(parsed.args.agentId);
        break;
      }
    } catch {
      // Skip non-matching logs
    }
  }
  console.log("  Agent registered! ID:", agentId);

  // 6. Link FlashAgent NFA to IdentityRegistry
  console.log("Linking FlashAgent to IdentityRegistry...");
  const linkTx = await flashAgent.linkToIdentityRegistry(identityAddr, agentId);
  await linkTx.wait();
  console.log("  Linked!");

  // 7. Mint FlashAgent NFA
  console.log("Minting Flash agent NFA...");
  const mintTx = await flashAgent.mintAgent(
    deployer.address,
    "prediction market trader",
    "cross-platform arbitrage, deep research, statistical analysis",
    "https://flash-agent.example.com/metadata.json"
  );
  await mintTx.wait();
  console.log("  NFA minted! Token ID: 0");

  // 8. Store FlashAgent address as metadata in IdentityRegistry
  console.log("Setting FlashAgent contract address as metadata...");
  const encodedAddr = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [flashAgentAddr]);
  const metaTx = await identityRegistry.setMetadata(agentId, "flashAgentContract", encodedAddr);
  await metaTx.wait();
  console.log("  Metadata set!");

  // 9. Write deployment JSON
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deployment = {
    network: "bscTestnet",
    chainId: 97,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      IdentityRegistry: identityAddr,
      ReputationRegistry: reputationAddr,
      ValidationRegistry: validationAddr,
      FlashAgent: flashAgentAddr,
    },
    agentId,
  };

  const deploymentPath = path.join(deploymentsDir, "bscTestnet.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment saved to: ${deploymentPath}`);

  // 10. Print .env-ready block
  console.log("\n═══ Copy-paste into flash-agent/.env ═══\n");
  console.log(`ERC8004_ENABLED=true`);
  console.log(`ERC8004_IDENTITY_REGISTRY=${identityAddr}`);
  console.log(`ERC8004_REPUTATION_REGISTRY=${reputationAddr}`);
  console.log(`ERC8004_VALIDATION_REGISTRY=${validationAddr}`);
  console.log(`FLASH_AGENT_CONTRACT=${flashAgentAddr}`);
  console.log(`ERC8004_AGENT_ID=${agentId}`);
  console.log(`BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545`);

  // 11. Print BSCScan links
  console.log("\n═══ BSCScan Links ═══\n");
  console.log(`IdentityRegistry:   https://testnet.bscscan.com/address/${identityAddr}`);
  console.log(`ReputationRegistry: https://testnet.bscscan.com/address/${reputationAddr}`);
  console.log(`ValidationRegistry: https://testnet.bscscan.com/address/${validationAddr}`);
  console.log(`FlashAgent:         https://testnet.bscscan.com/address/${flashAgentAddr}`);

  console.log("\n═══ Deployment Complete ═══");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
