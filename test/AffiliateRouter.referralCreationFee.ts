import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

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

    expect(await router.defaultFeeBasisPoints()).to.equal(30);
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

  it("allows owner to update default fee basis points", async () => {
    const { router } = await deployRouter();
    const [owner, outsider] = await ethers.getSigners();

    expect(await router.defaultFeeBasisPoints()).to.equal(30);

    await expect(router.connect(outsider).setDefaultFeeBasisPoints(50)).to.be.revertedWithCustomError(
      router,
      "OwnableUnauthorizedAccount"
    ).withArgs(await outsider.getAddress());

    await expect(router.connect(owner).setDefaultFeeBasisPoints(25))
      .to.emit(router, "DefaultFeeBasisPointsSet")
      .withArgs(25);

    expect(await router.defaultFeeBasisPoints()).to.equal(25);

    await expect(router.connect(owner).setDefaultFeeBasisPoints(5)).to.be.revertedWith(
      "Not valid default bps"
    );
  });
});
