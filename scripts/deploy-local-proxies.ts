import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const SwapManagerFactory = await ethers.getContractFactory("SwapManager");
  const swapManager = await upgrades.deployProxy(SwapManagerFactory, [], {
    initializer: "initialize",
  });
  await swapManager.waitForDeployment();
  const swapManagerAddress = await swapManager.getAddress();
  console.log("SwapManager proxy:", swapManagerAddress);

  const AffiliateRouterFactory = await ethers.getContractFactory("AffiliateRouter");
  const affiliateRouter = await upgrades.deployProxy(
    AffiliateRouterFactory,
    [swapManagerAddress],
    { initializer: "initialize" }
  );
  await affiliateRouter.waitForDeployment();
  const affiliateRouterAddress = await affiliateRouter.getAddress();
  console.log("AffiliateRouter proxy:", affiliateRouterAddress);

  // Wire the router into SwapManager
  const tx = await swapManager.setAffiliateRouter(affiliateRouterAddress);
  await tx.wait();
  console.log("Affiliate router set on SwapManager");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});