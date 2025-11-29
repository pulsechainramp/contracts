import { expect } from "chai";
import { ethers } from "hardhat";

const deploySwapManager = async () => {
  const MockRouter = await ethers.getContractFactory("MockRouter");
  const pulsexV1Router = await MockRouter.deploy();
  await pulsexV1Router.waitForDeployment();
  const pulsexV2Router = await MockRouter.deploy();
  await pulsexV2Router.waitForDeployment();
  const pulsexStablePool = await MockRouter.deploy();
  await pulsexStablePool.waitForDeployment();

  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWeth = await MockWETH.deploy();
  await mockWeth.waitForDeployment();

  const SwapManager = await ethers.getContractFactory("SwapManager");
  const swapManager = await SwapManager.deploy(
    await mockWeth.getAddress(),
    await pulsexV1Router.getAddress(),
    await pulsexV2Router.getAddress(),
    await pulsexStablePool.getAddress(),
    [],
    []
  );
  await swapManager.waitForDeployment();

  return { swapManager };
};

describe("SwapManager router administration", () => {
  it("enforces only owner can set routers", async () => {
    const [, other] = await ethers.getSigners();
    const { swapManager } = await deploySwapManager();

    await expect(
      swapManager.connect(other).setDexRouters(["phux"], [await other.getAddress()])
    )
      .to.be.revertedWithCustomError(swapManager, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });

  it("allows updating PulseX routers via setter", async () => {
    const [owner] = await ethers.getSigners();
    const { swapManager } = await deploySwapManager();
    const MockRouter = await ethers.getContractFactory("MockRouter");
    const newRouter = await MockRouter.deploy();
    await newRouter.waitForDeployment();

    await swapManager.connect(owner).setDexRouters(["pulsexV1"], [await newRouter.getAddress()]);

    expect(await swapManager.dexRouters("pulsexV1")).to.equal(await newRouter.getAddress());
  });

  it("allows updating affiliate router more than once", async () => {
    const [owner, other] = await ethers.getSigners();
    const { swapManager } = await deploySwapManager();

    await swapManager.connect(owner).setAffiliateRouter(await owner.getAddress());
    await swapManager.connect(owner).setAffiliateRouter(await other.getAddress());

    expect(await swapManager.affiliateRouter()).to.equal(other.address);
  });

  it("allows clearing non-PulseX routers", async () => {
    const [owner] = await ethers.getSigners();
    const { swapManager } = await deploySwapManager();
    const MockRouter = await ethers.getContractFactory("MockRouter");
    const phuxRouter = await MockRouter.deploy();
    await phuxRouter.waitForDeployment();

    await swapManager.connect(owner).setDexRouters(["phux"], [await phuxRouter.getAddress()]);
    expect(await swapManager.dexRouters("phux")).to.equal(await phuxRouter.getAddress());

    await swapManager.connect(owner).setDexRouters(["phux"], [ethers.ZeroAddress]);
    expect(await swapManager.dexRouters("phux")).to.equal(ethers.ZeroAddress);
  });

  it("rejects mismatched keys/routers lengths", async () => {
    const [owner] = await ethers.getSigners();
    const { swapManager } = await deploySwapManager();

    await expect(
      swapManager.connect(owner).setDexRouters(["phux", "pulsexV1"], [await owner.getAddress()])
    ).to.be.revertedWith("Keys and routers length mismatch");
  });
});
