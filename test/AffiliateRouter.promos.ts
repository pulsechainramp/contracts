import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (amountIn: bigint, amountOutMin: bigint, tokenIn = ethers.ZeroAddress) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const route = {
    steps: [],
    parentGroups: [],
    destination: ethers.ZeroAddress,
    tokenIn,
    tokenOut: ethers.ZeroAddress,
    groupCount: 0,
    deadline: 0n,
    amountIn,
    amountOutMin,
    isETHOut: false,
  };

  return abiCoder.encode([routeType], [route]);
};

describe("AffiliateRouter promos", () => {
  const tailBps = 10n;

  const deployRouter = async () => {
    const MockSwapManager = await ethers.getContractFactory("MockSwapManager");
    const mockSwapManager = await MockSwapManager.deploy();
    await mockSwapManager.waitForDeployment();

    const AffiliateRouter = await ethers.getContractFactory("AffiliateRouter");
    const router = await upgrades.deployProxy(AffiliateRouter, [await mockSwapManager.getAddress()]);
    await router.waitForDeployment();

    await mockSwapManager.setAffiliateRouter(await router.getAddress());

    return { router, mockSwapManager };
  };

  it("binds first referrer, caps promo rate, and decrements promos on qualifying swaps", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("250"); // 2.5%

    const amountIn = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amountIn, amountIn);

    await expect(
      router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amountIn })
    )
      .to.emit(router, "PromoConsumed")
      .withArgs(await user.getAddress(), await referrer.getAddress(), 2);

    const promo = await router.referral(await user.getAddress());
    expect(promo.firstReferrer).to.equal(await referrer.getAddress());
    expect(promo.promoBps).to.equal(250);
    expect(promo.promoRemaining).to.equal(2);

    const fee = (amountIn * 250n) / 10000n;
    expect(await router.referrerEarnings(await referrer.getAddress(), ethers.ZeroAddress)).to.equal(fee);
    expect(await mockSwapManager.lastMsgValue()).to.equal(amountIn - fee);
  });

  it("ignores rebind attempts and preserves remaining promo count", async () => {
    const { router } = await deployRouter();
    const [, referrer, newReferrer, user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("300"); // capped at 3%

    const amount = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amount, amount);

    await router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amount });

    await router.connect(user).executeSwap(routeBytes, await newReferrer.getAddress(), { value: amount });

    const promo = await router.referral(await user.getAddress());
    expect(promo.firstReferrer).to.equal(await referrer.getAddress());
    expect(promo.promoRemaining).to.equal(1); // two promos consumed
  });

  it("charges tail fee after promos are exhausted", async () => {
    const { router } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("300");
    const amount = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amount, amount);

    for (let i = 0; i < 3; i++) {
      await router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amount });
    }

    const promoAfterThree = await router.referral(await user.getAddress());
    expect(promoAfterThree.promoRemaining).to.equal(0);

    await router.connect(user).executeSwap(routeBytes, ethers.ZeroAddress, { value: amount });

    const totalEarned = await router.referrerEarnings(await referrer.getAddress(), ethers.ZeroAddress);
    const promoFeePerSwap = (amount * 300n) / 10000n;
    const tailFee = (amount * tailBps) / 10000n;
    expect(totalEarned).to.equal(promoFeePerSwap * 3n + tailFee);
  });

});
