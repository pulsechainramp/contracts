import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = "0x7872B42710294ce16fEA60575da45Fde51db78e8"; // your existing AffiliateRouter proxy
  const AffiliateRouterFactory = await ethers.getContractFactory("AffiliateRouter");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, AffiliateRouterFactory);
  await upgraded.waitForDeployment();
  console.log("AffiliateRouter upgraded. New implementation:", await upgrades.erc1967.getImplementationAddress(proxyAddress));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});