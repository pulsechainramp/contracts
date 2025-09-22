import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, ZeroAddress, parseEther } from "ethers";

// Match ISwapManager.SwapRoute from your interfaces
const SwapStep = "tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)";
const Group = "tuple(uint256 id,uint256 percent)";
const SwapRoute = `tuple(${SwapStep}[] steps, ${Group}[] parentGroups, address destination, address tokenIn, address tokenOut, uint256 groupCount, uint256 deadline, uint256 amountIn, uint256 amountOutMin)`;

function encodeRoute(params: {
  tokenIn: string;
  amountIn: bigint;
  amountOutMin?: bigint;
  deadline?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const route = {
    steps: [],
    parentGroups: [],
    destination: ZeroAddress,
    tokenIn: params.tokenIn,
    tokenOut: ZeroAddress,
    groupCount: 0,
    deadline: params.deadline ?? now + 3600,
    amountIn: params.amountIn,
    amountOutMin: params.amountOutMin ?? 0n,
  };
  const coder = AbiCoder.defaultAbiCoder();
  return coder.encode([SwapRoute], [route]);
}

describe("AffiliateRouter - last-touch + default", () => {
  it("binds default when no mapping and no explicit code", async () => {
    const [owner, user, platform] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockSwapManager");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Router = await ethers.getContractFactory("AffiliateRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();
    await router.initialize(await mock.getAddress());

    // set default referrer
    await (router as any).setDefaultReferrer(platform.address);

    const amountIn = parseEther("1");
    const routeBytes = encodeRoute({
      tokenIn: ZeroAddress,
      amountIn,
    });

    await expect(router.connect(user).executeSwap(routeBytes, ZeroAddress, { value: amountIn }))
      .to.emit(router, "ReferralRegistered")
      .withArgs(user.address, platform.address);

    expect(await router.userReferrer(user.address)).to.eq(platform.address);
  });

  it("explicit code overwrites (last-touch)", async () => {
    const [owner, user, A, B] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockSwapManager");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Router = await ethers.getContractFactory("AffiliateRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();
    await router.initialize(await mock.getAddress());

    await (router as any).setDefaultReferrer(A.address);

    const amountIn = parseEther("1");
    const routeBytes = encodeRoute({
      tokenIn: ZeroAddress,
      amountIn,
    });

    // First swap with no explicit -> binds default A
    await router.connect(user).executeSwap(routeBytes, ZeroAddress, { value: amountIn });
    expect(await router.userReferrer(user.address)).to.eq(A.address);

    // Next swap with explicit B -> overwrite to B (last-touch)
    await expect(router.connect(user).executeSwap(routeBytes, B.address, { value: amountIn }))
      .to.emit(router, "ReferralRegistered")
      .withArgs(user.address, B.address);

    expect(await router.userReferrer(user.address)).to.eq(B.address);
  });

  it("ignores self-referral", async () => {
    const [owner, user, plat] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockSwapManager");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Router = await ethers.getContractFactory("AffiliateRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();
    await router.initialize(await mock.getAddress());

    await (router as any).setDefaultReferrer(plat.address);

    const amountIn = parseEther("1");
    const routeBytes = encodeRoute({
      tokenIn: ZeroAddress,
      amountIn,
    });

    // Bind default
    await router.connect(user).executeSwap(routeBytes, ZeroAddress, { value: amountIn });
    expect(await router.userReferrer(user.address)).to.eq(plat.address);

    // Try self-referral -> mapping stays platform
    await router.connect(user).executeSwap(routeBytes, user.address, { value: amountIn });
    expect(await router.userReferrer(user.address)).to.eq(plat.address);
  });

  it("credits fee to chosen referrer (ETH path)", async () => {
    const [owner, user, ref] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockSwapManager");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Router = await ethers.getContractFactory("AffiliateRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();
    await router.initialize(await mock.getAddress());

    const amountIn = parseEther("2"); // 2 ETH
    const routeBytes = encodeRoute({
      tokenIn: ZeroAddress,
      amountIn,
    });

    // Set explicit referrer
    await router.connect(user).executeSwap(routeBytes, ref.address, { value: amountIn });

    // Default fee bps is 10 (0.10%)
    const fee = (amountIn * 10n) / 10000n;
    const earned = await router.referrerEarnings(ref.address, ZeroAddress);
    expect(earned).to.eq(fee);
  });
});
