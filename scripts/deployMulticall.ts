import { ethers, artifacts } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const MulticallFactory = await ethers.getContractFactory("Multicall");
  const desiredAddress = process.env.MULTICALL_ADDRESS;

  if (desiredAddress) {
    const onChainCode = await ethers.provider.getCode(desiredAddress);
    if (onChainCode !== "0x") {
      const { deployedBytecode } = await artifacts.readArtifact("Multicall");
      if (
        deployedBytecode &&
        deployedBytecode !== "0x" &&
        onChainCode.toLowerCase() === deployedBytecode.toLowerCase()
      ) {
        console.log("Reusing existing Multicall at:", desiredAddress);
        return;
      }
      throw new Error(
        `MULTICALL_ADDRESS ${desiredAddress} has mismatched bytecode; unset env or deploy fresh.`
      );
    }
  }

  const multicall = await MulticallFactory.deploy();
  await multicall.waitForDeployment();
  const deployedAddress = await multicall.getAddress();
  console.log("Multicall deployed to:", deployedAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
