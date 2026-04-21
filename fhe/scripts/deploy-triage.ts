import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying HackTriage with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const factory = await hre.ethers.getContractFactory("HackTriage");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx?.wait();
  if (!receipt) throw new Error("Deploy transaction receipt is null — deployment may have failed");
  const blockNumber = receipt.blockNumber;

  console.log("HackTriage deployed to:", address);
  console.log("Block number:", blockNumber);

  // Write deployment record
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    HackTriage: address,
    block: blockNumber,
    deployer: deployer.address,
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    timestamp: new Date().toISOString(),
  };

  const outPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log("Deployment recorded at:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
