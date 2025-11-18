import { ethers } from "hardhat";

const DEFAULT_WPLS_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const DEFAULT_PULSEX_V1_ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
const DEFAULT_PULSEX_V2_ROUTER = "0x165C3410fC91EF562C50559f7d2289fEbed552d9";
const DEFAULT_PULSEX_STABLE_POOL = "0xDA9aBA4eACF54E0273f56dfFee6B8F1e20B23Bba";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const wethAddress = process.env.WETH_ADDRESS ?? DEFAULT_WPLS_ADDRESS;
  const pulsexV1Router = process.env.PULSEX_V1_ROUTER ?? DEFAULT_PULSEX_V1_ROUTER;
  const pulsexV2Router = process.env.PULSEX_V2_ROUTER ?? DEFAULT_PULSEX_V2_ROUTER;
  const pulsexStablePool = process.env.PULSEX_STABLE_POOL ?? DEFAULT_PULSEX_STABLE_POOL;
  console.log("Using WETH address:", wethAddress);
  console.log("Using PulseX V1 router:", pulsexV1Router);
  console.log("Using PulseX V2 router:", pulsexV2Router);
  console.log("Using PulseX stable pool:", pulsexStablePool);

  const SwapManagerFactory = await ethers.getContractFactory("SwapManager");
  const otherDexKeys = (process.env.OTHER_DEX_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const otherDexRouters = (process.env.OTHER_DEX_ROUTER_ADDRESSES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (otherDexKeys.length !== otherDexRouters.length) {
    throw new Error("OTHER_DEX_KEYS/OTHER_DEX_ROUTER_ADDRESSES must have matching counts");
  }

  const swapManager = await SwapManagerFactory.deploy(
    wethAddress,
    pulsexV1Router,
    pulsexV2Router,
    pulsexStablePool,
    otherDexKeys,
    otherDexRouters
  );
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
