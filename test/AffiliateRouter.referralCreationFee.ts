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

describe("AffiliateRouter referral creation fee gate", () => {
  it("starts with zero fee, updated defaults, and rejects pay attempts while disabled", async () => {
    const { router } = await deployRouter();
    const [, user] = await ethers.getSigners();

    expect(await router.defaultFeeBasisPoints()).to.equal(100);
    expect(await router.referralCreationFee()).to.equal(0);
    expect(await router.referralFeeRecipient()).to.equal(await router.owner());

    await expect(router.connect(user).payReferralCreationFee({ value: 0 })).to.be.revertedWith(
      "Referral creation fee disabled"
    );
    expect(await router.hasPaidReferralCreationFee(await user.getAddress())).to.equal(false);
  });

  it("collects the configured fee, forwards funds, refunds excess, and prevents repeats", async () => {
    const { router } = await deployRouter();
    const [owner, payer, treasury] = await ethers.getSigners();

    const fee = ethers.parseEther("1");

    await expect(router.connect(owner).setReferralCreationFee(fee))
      .to.emit(router, "ReferralCreationFeeUpdated")
      .withArgs(0, fee);

    await expect(router.connect(owner).setReferralFeeRecipient(await treasury.getAddress()))
      .to.emit(router, "ReferralFeeRecipientUpdated")
      .withArgs(await treasury.getAddress());

    const recipientBalanceBefore = await ethers.provider.getBalance(await treasury.getAddress());

    const overpayment = ethers.parseEther("0.4");
    const tx = await router.connect(payer).payReferralCreationFee({ value: fee + overpayment });
    await expect(tx).to.emit(router, "ReferralCreationFeePaid").withArgs(await payer.getAddress(), fee);

    await tx.wait();

    const recipientBalanceAfter = await ethers.provider.getBalance(await treasury.getAddress());
    expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(fee);

    const contractBalance = await ethers.provider.getBalance(await router.getAddress());
    expect(contractBalance).to.equal(0);

    expect(await router.referralCreationFeePaid(await payer.getAddress())).to.equal(true);
    expect(await router.hasPaidReferralCreationFee(await payer.getAddress())).to.equal(true);

    await expect(router.connect(payer).payReferralCreationFee({ value: fee })).to.be.revertedWith(
      "Referral creation fee already paid"
    );
  });

  it("allows the owner to zero the fee again", async () => {
    const { router } = await deployRouter();
    const [owner] = await ethers.getSigners();

    await router.connect(owner).setReferralCreationFee(10n);
    await expect(router.connect(owner).setReferralCreationFee(0))
      .to.emit(router, "ReferralCreationFeeUpdated")
      .withArgs(10n, 0);
    expect(await router.referralCreationFee()).to.equal(0);
  });

  it("rejects invalid fee recipient updates", async () => {
    const { router } = await deployRouter();
    const [owner] = await ethers.getSigners();

    await expect(router.connect(owner).setReferralFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith(
      "Invalid fee recipient"
    );
  });

  it("requires referral fee payment before updating custom fee basis points", async () => {
    const { router } = await deployRouter();
    const [owner, referrer] = await ethers.getSigners();

    const fee = ethers.parseEther("0.25");
    await router.connect(owner).setReferralCreationFee(fee);

    await expect(router.connect(referrer).updateFeeBasisPoints(100)).to.be.revertedWith(
      "Referrer must pay creation fee"
    );

    await router.connect(referrer).payReferralCreationFee({ value: fee });

    await expect(router.connect(referrer).updateFeeBasisPoints(100))
      .to.emit(router, "FeeBasisPointsUpdated")
      .withArgs(await referrer.getAddress(), 100);
  });

  it("blocks binding to unpaid referrers until they pay the fee", async () => {
    const { router } = await deployRouter();
    const [owner, referrer, , user] = await ethers.getSigners();

    const fee = ethers.parseEther("0.1");
    await router.connect(owner).setReferralCreationFee(fee);
    expect(await router.referralCreationFee()).to.equal(fee);

    const amountIn = ethers.parseEther("1");
    const routeBytes = encodeRoute(amountIn, amountIn);

    await expect(
      router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amountIn })
    ).to.be.revertedWith("Referrer must pay creation fee");

    await router.connect(referrer).payReferralCreationFee({ value: fee });

    await expect(
      router.connect(user).executeSwap(routeBytes, await referrer.getAddress(), { value: amountIn })
    ).to.not.be.reverted;

    const promo = await router.referral(await user.getAddress());
    expect(promo.firstReferrer).to.equal(await referrer.getAddress());
  });
});
