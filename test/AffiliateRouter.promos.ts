import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (
  amountIn: bigint,
  amountOutMin: bigint,
  tokenIn = ethers.ZeroAddress,
  overrides: Partial<Record<string, bigint | string>> = {}
) => {
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

  return abiCoder.encode([routeType], [{ ...route, ...overrides }]);
};

describe("AffiliateRouter promos", () => {
  const tailCapBps = 30n;

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

  it("charges capped tail fee after promos are exhausted", async () => {
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
    const tailFee = (amount * tailCapBps) / 10000n;
    expect(totalEarned).to.equal(promoFeePerSwap * 3n + tailFee);
  });

  it("respects lower referrer rate when promos are depleted", async () => {
    const { router } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("10"); // 0.1%

    const amount = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amount, amount);

    for (let i = 0; i < 4; i++) {
      await router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amount });
    }

    const promoAfterFour = await router.referral(await user.getAddress());
    expect(promoAfterFour.promoRemaining).to.equal(0);

    const totalEarned = await router.referrerEarnings(await referrer.getAddress(), ethers.ZeroAddress);
    const promoFeePerSwap = (amount * 10n) / 10000n;
    const tailFee = (amount * 10n) / 10000n;
    expect(totalEarned).to.equal(promoFeePerSwap * 3n + tailFee);
  });

  it("preserves positive amountOutMin after fee scaling", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("300"); // 3%

    const amountIn = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amountIn, 1n);

    await router
      .connect(user)
      .executeSwap(routeBytes, await referrer.getAddress(), { value: amountIn });

    expect(await mockSwapManager.lastAmountOutMin()).to.equal(1n);
  });

  it("allows zero minimum outputs to remain zero after scaling", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("300"); // 3%

    const amountIn = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amountIn, 0n);

    await router
      .connect(user)
      .executeSwap(routeBytes, await referrer.getAddress(), { value: amountIn });

    expect(await mockSwapManager.lastAmountOutMin()).to.equal(0n);
  });

  it("keeps promo rate at referrer's setting when below max", async () => {
    const { router } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("150"); // 1.5%

    const amount = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amount, amount);

    await router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amount });

    const promo = await router.referral(await user.getAddress());
    expect(promo.promoBps).to.equal(150);
  });

  it("uses default referrer tail capped at 0.3%", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [owner, , , user] = await ethers.getSigners();

    await router.connect(owner).setDefaultReferrer(await owner.getAddress());
    await router.connect(owner).setDefaultReferrerBasisPoints(25);

    const amount = ethers.parseUnits("1", 18);
    const routeBytes = encodeRoute(amount, amount);

    await router.connect(user).executeSwap(routeBytes, ethers.ZeroAddress, { value: amount });

    const earnings = await router.referrerEarnings(await owner.getAddress(), ethers.ZeroAddress);
    const expected = (amount * 25n) / 10000n;
    expect(earnings).to.equal(expected);
    expect(await mockSwapManager.lastMsgValue()).to.equal(amount - expected);
  });

  it("supports non-standard allowance tokens across repeated swaps", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [, , , user] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const token = await MockUSDT.deploy();
    await token.waitForDeployment();

    const amountIn = ethers.parseUnits("100", 6);
    const routeBytes = encodeRoute(amountIn, 0n, await token.getAddress());

    await token.mint(await user.getAddress(), amountIn * 2n);
    await token.connect(user).approve(await router.getAddress(), 0);
    await token.connect(user).approve(await router.getAddress(), amountIn * 2n);

    await expect(
      router.connect(user).executeSwap(routeBytes, ethers.ZeroAddress)
    ).to.not.be.reverted;

    await expect(
      router.connect(user).executeSwap(routeBytes, ethers.ZeroAddress)
    ).to.not.be.reverted;

    expect(await mockSwapManager.lastAmountIn()).to.equal(amountIn);
    expect(
      await token.allowance(await router.getAddress(), await mockSwapManager.getAddress())
    ).to.equal(amountIn);
  });

  it("handles fee-on-transfer tokens by basing fees on received amount", async () => {
    const { router, mockSwapManager } = await deployRouter();
    const [, referrer, , user] = await ethers.getSigners();

    await router.connect(referrer).updateFeeBasisPoints("300"); // 3%

    const MockFeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const feeToken = await MockFeeToken.deploy(200); // 2% transfer fee
    await feeToken.waitForDeployment();

    const amountIn = ethers.parseUnits("100", 18);
    const expectedFeeMax = (amountIn * 300n) / 10000n;
    const transferAmount = amountIn + expectedFeeMax;

    await feeToken.mint(await user.getAddress(), transferAmount);
    await feeToken.connect(user).approve(await router.getAddress(), transferAmount);

    const routeBytes = encodeRoute(amountIn, amountIn, await feeToken.getAddress(), {
      tokenOut: await feeToken.getAddress(),
    });

    await router.connect(user).executeSwap(routeBytes, await referrer.getAddress());

    const lastAmountIn = await mockSwapManager.lastAmountIn();
    const recordedFee = await router.referrerEarnings(await referrer.getAddress(), await feeToken.getAddress());
    const received = lastAmountIn + recordedFee;
    const expectedFee = (received * 300n) / 10000n;

    expect(lastAmountIn).to.be.gt(0n);
    expect(recordedFee).to.equal(expectedFee);
    expect(received).to.be.lte(transferAmount);
  });

  it("caps default referrer basis points at 0.3%", async () => {
    const { router } = await deployRouter();
    const [owner] = await ethers.getSigners();

    await expect(router.connect(owner).setDefaultReferrerBasisPoints(40)).to.be.revertedWith(
      "Default fee too high"
    );
  });
});
