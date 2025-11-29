import { expect } from "chai";
import { ethers } from "hardhat";

describe("AffiliateRouter swap manager admin", () => {
  it("allows owner to update swapManager and blocks non-owners", async () => {
    const [owner, other] = await ethers.getSigners();

    const MockSwapManager = await ethers.getContractFactory("MockSwapManager");
    const initialSwapManager = await MockSwapManager.deploy(owner.address);
    await initialSwapManager.waitForDeployment();
    const newSwapManager = await MockSwapManager.deploy(owner.address);
    await newSwapManager.waitForDeployment();

    const AffiliateRouter = await ethers.getContractFactory("AffiliateRouter");
    const affiliateRouter = await AffiliateRouter.deploy(await initialSwapManager.getAddress());
    await affiliateRouter.waitForDeployment();

    await expect(
      affiliateRouter.connect(other).setSwapManager(await newSwapManager.getAddress())
    )
      .to.be.revertedWithCustomError(affiliateRouter, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await expect(
      affiliateRouter.connect(owner).setSwapManager(await newSwapManager.getAddress())
    )
      .to.emit(affiliateRouter, "SwapManagerUpdated")
      .withArgs(await newSwapManager.getAddress());

    expect(await affiliateRouter.swapManager()).to.equal(await newSwapManager.getAddress());
  });

  it("rejects zero swapManager address", async () => {
    const [owner] = await ethers.getSigners();

    const MockSwapManager = await ethers.getContractFactory("MockSwapManager");
    const initialSwapManager = await MockSwapManager.deploy(owner.address);
    await initialSwapManager.waitForDeployment();

    const AffiliateRouter = await ethers.getContractFactory("AffiliateRouter");
    const affiliateRouter = await AffiliateRouter.deploy(await initialSwapManager.getAddress());
    await affiliateRouter.waitForDeployment();

    await expect(
      affiliateRouter.connect(owner).setSwapManager(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid swap manager");
  });
});
