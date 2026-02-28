import { ethers } from "hardhat";

async function main() {
  console.log("═══ Deploying FlashAgent NFA to BSC Testnet ═══\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB\n");

  // Deploy FlashAgent
  const FlashAgent = await ethers.getContractFactory("FlashAgent");
  const flashAgent = await FlashAgent.deploy();
  await flashAgent.waitForDeployment();

  const contractAddress = await flashAgent.getAddress();
  console.log("FlashAgent deployed to:", contractAddress);

  // Mint the Flash NFA
  console.log("\nMinting Flash agent NFA...");
  const tx = await flashAgent.mintAgent(
    deployer.address,
    "prediction market trader",
    "cross-platform arbitrage, deep research, statistical analysis",
    "https://eyebalz.xyz/metadata.json" // Replace with IPFS URI
  );
  await tx.wait();

  console.log("Flash NFA minted! Token ID: 0");
  console.log("\n═══ Deployment Summary ═══");
  console.log("Contract:", contractAddress);
  console.log("Owner:", deployer.address);
  console.log("Token ID: 0");
  console.log(`BSCScan: https://testnet.bscscan.com/address/${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
