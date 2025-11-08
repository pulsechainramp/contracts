import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = "0x3c400d6966F8539798f88C4dDe50cF082aBA3037"; // your existing AffiliateRouter proxy
  const AffiliateRouterFactory = await ethers.getContractFactory("AffiliateRouter");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, AffiliateRouterFactory);
  await upgraded.waitForDeployment();
  console.log("AffiliateRouter upgraded. New implementation:", await upgrades.erc1967.getImplementationAddress(proxyAddress));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});