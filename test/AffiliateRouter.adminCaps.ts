import { expect } from "chai";
import { ethers } from "hardhat";

describe("AffiliateRouter admin caps", () => {
  it("enforces bounds when updating tail cap and default referrer fee", async () => {
    const [owner] = await ethers.getSigners();

    const MockSwapManager = await ethers.getContractFactory("MockSwapManager");
    const swapManager = await MockSwapManager.deploy(owner.address);
    await swapManager.waitForDeployment();

    const AffiliateRouter = await ethers.getContractFactory("AffiliateRouter");
    const router = await AffiliateRouter.deploy(await swapManager.getAddress());
    await router.waitForDeployment();

    // valid tail update
    await expect(router.connect(owner).setTailBps(10)).to.emit(router, "TailBpsUpdated").withArgs(10);
    expect(await router.tailBps()).to.equal(10);

    // invalid tail (above max)
    await expect(router.connect(owner).setTailBps(101)).to.be.revertedWith("Invalid tail cap");

    // valid default referrer fee update
    await expect(router.connect(owner).setDefaultReferrerBasisPoints(50))
      .to.emit(router, "DefaultReferrerFeeUpdated")
      .withArgs(50);
    expect(await router.defaultReferrerBasisPoints()).to.equal(50);

    // invalid default referrer fee
    await expect(router.connect(owner).setDefaultReferrerBasisPoints(101)).to.be.revertedWith(
      "Invalid default referrer fee",
    );
  });

  it("allows extending promo cap down to 0.1%", async () => {
    const [owner] = await ethers.getSigners();

    const MockSwapManager = await ethers.getContractFactory("MockSwapManager");
    const swapManager = await MockSwapManager.deploy(owner.address);
    await swapManager.waitForDeployment();

    const AffiliateRouter = await ethers.getContractFactory("AffiliateRouter");
    const router = await AffiliateRouter.deploy(await swapManager.getAddress());
    await router.waitForDeployment();

    await expect(router.connect(owner).setMaxPromoBps(10))
      .to.emit(router, "MaxPromoBpsUpdated")
      .withArgs(10);
    expect(await router.maxPromoBps()).to.equal(10);

    await expect(router.connect(owner).setMaxPromoBps(9)).to.be.revertedWith("Invalid promo cap");
  });
});
