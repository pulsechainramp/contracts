import { ethers } from "hardhat";

const DEFAULT_WPLS_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const wethAddress = process.env.WETH_ADDRESS ?? DEFAULT_WPLS_ADDRESS;
  console.log("Using WETH address:", wethAddress);

  const SwapManagerFactory = await ethers.getContractFactory("SwapManager");
  const swapManager = await SwapManagerFactory.deploy(wethAddress);
  await swapManager.waitForDeployment();
  const swapManagerAddress = await swapManager.getAddress();
  console.log("SwapManager deployed to:", swapManagerAddress);

  const AffiliateRouterFactory = await ethers.getContractFactory("AffiliateRouter");
  const affiliateRouter = await AffiliateRouterFactory.deploy(swapManagerAddress);
  await affiliateRouter.waitForDeployment();
  const affiliateRouterAddress = await affiliateRouter.getAddress();
  console.log("AffiliateRouter deployed to:", affiliateRouterAddress);

  const tx = await swapManager.setAffiliateRouter(affiliateRouterAddress);
  await tx.wait();
  console.log("Affiliate router wired into SwapManager");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
