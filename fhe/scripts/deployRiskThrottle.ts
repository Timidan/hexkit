import hre from "hardhat";
import fs from "fs";
import path from "path";

// Read HackTriage address from deployments/sepolia.json, or fall back to env var override
function getHackTriageAddress(): string {
  const envAddr = process.env.TRIAGE_ADDR;
  if (envAddr) return envAddr;

  const sepoliaPath = path.join(__dirname, "..", "deployments", "sepolia.json");
  if (fs.existsSync(sepoliaPath)) {
    const data = JSON.parse(fs.readFileSync(sepoliaPath, "utf-8"));
    if (data.HackTriage) return data.HackTriage;
  }
  throw new Error("HackTriage address not found. Set TRIAGE_ADDR env var or deploy HackTriage first.");
}

async function main() {
  const HACK_TRIAGE_ADDRESS = getHackTriageAddress();
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying RiskThrottle with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  console.log("HackTriage address:", HACK_TRIAGE_ADDRESS);

  const factory = await hre.ethers.getContractFactory("RiskThrottle");
  const contract = await factory.deploy(HACK_TRIAGE_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx?.wait();
  if (!receipt) throw new Error("Deploy transaction receipt is null — deployment may have failed");
  const blockNumber = receipt.blockNumber;

  console.log("RiskThrottle deployed to:", address);
  console.log("Block number:", blockNumber);

  // Write deployment record (merge into existing sepolia.json)
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outPath = path.join(deploymentsDir, `throttle-${hre.network.name}.json`);
  const deploymentData = {
    RiskThrottle: address,
    HackTriage: HACK_TRIAGE_ADDRESS,
    block: blockNumber,
    deployer: deployer.address,
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log("Deployment recorded at:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
