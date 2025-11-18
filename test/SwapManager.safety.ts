import { expect } from "chai";
import { ethers } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (route: any) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return abiCoder.encode([routeType], [route]);
};

const deploySwapManager = async () => {
  const MockRouter = await ethers.getContractFactory("MockRouter");
  const pulsexV1Router = await MockRouter.deploy();
  await pulsexV1Router.waitForDeployment();
  const pulsexV2Router = await MockRouter.deploy();
  await pulsexV2Router.waitForDeployment();
  const pulsexStablePool = await MockRouter.deploy();
  await pulsexStablePool.waitForDeployment();
  const pulsexStablePoolAddress = await pulsexStablePool.getAddress();

  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWeth = await MockWETH.deploy();
  await mockWeth.waitForDeployment();

  const SwapManager = await ethers.getContractFactory("SwapManager");
  const swapManager = await SwapManager.deploy(
    await mockWeth.getAddress(),
    await pulsexV1Router.getAddress(),
    await pulsexV2Router.getAddress(),
    pulsexStablePoolAddress,
    [],
    []
  );
  await swapManager.waitForDeployment();

  return { swapManager, pulsexStablePool: pulsexStablePoolAddress };
};

describe("SwapManager safety guards", () => {
  it("rejects routes with zero amountOutMin", async () => {
    const { swapManager } = await deploySwapManager();

    const [owner] = await ethers.getSigners();
    await swapManager.setAffiliateRouter(await owner.getAddress());

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);

    const route = {
      steps: [
        {
          dex: "pulsexV2",
          path: [ethers.ZeroAddress, ethers.ZeroAddress],
          pool: ethers.ZeroAddress,
          percent: 100_000n,
          groupId: 0n,
          parentGroupId: 0n,
          userData: "0x",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await owner.getAddress(),
      tokenIn: ethers.ZeroAddress,
      tokenOut: ethers.ZeroAddress,
      groupCount: 1n,
      deadline,
      amountIn: 1n,
      amountOutMin: 0n,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.be.revertedWith(
      "amountOutMin must be positive"
    );
  });

  it("rejects routes that never produce the declared tokenOut", async () => {
    const { swapManager } = await deploySwapManager();

    const [owner] = await ethers.getSigners();
    await swapManager.setAffiliateRouter(await owner.getAddress());

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("TokenIn", "TIN");
    await tokenIn.waitForDeployment();
    const tokenOut = await MockERC20.deploy("TokenOut", "TOUT");
    await tokenOut.waitForDeployment();
    const tokenMid = await MockERC20.deploy("TokenMid", "TMID");
    await tokenMid.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);

    const route = {
      steps: [
        {
          dex: "pulsexV2",
          path: [await tokenIn.getAddress(), await tokenMid.getAddress()],
          pool: ethers.ZeroAddress,
          percent: 100_000n,
          groupId: 0n,
          parentGroupId: 0n,
          userData: "0x",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await owner.getAddress(),
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      groupCount: 1n,
      deadline,
      amountIn: 1n,
      amountOutMin: 1n,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.be.revertedWith(
      "Route never outputs tokenOut"
    );
  });

  it("rejects PulseX stable steps targeting unexpected pools", async () => {
    const { swapManager } = await deploySwapManager();

    const [owner] = await ethers.getSigners();
    await swapManager.setAffiliateRouter(await owner.getAddress());

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("TokenIn", "TIN");
    await tokenIn.waitForDeployment();
    const tokenOut = await MockERC20.deploy("TokenOut", "TOUT");
    await tokenOut.waitForDeployment();

    const amountIn = 1n;
    await tokenIn.mint(await owner.getAddress(), amountIn);
    await tokenIn.approve(await swapManager.getAddress(), amountIn);

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);

    const route = {
      steps: [
        {
          dex: "pulsexStable",
          path: [await tokenIn.getAddress(), await tokenOut.getAddress()],
          pool: "0x0000000000000000000000000000000000000002",
          percent: 100_000n,
          groupId: 0n,
          parentGroupId: 0n,
          userData: "0x0000",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await owner.getAddress(),
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      groupCount: 1n,
      deadline,
      amountIn,
      amountOutMin: 1n,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.be.revertedWith(
      "Invalid PulseX stable pool"
    );
  });

  it("sweeps leftover intermediate tokens back to the destination", async () => {
    const [owner, affiliateRouter, destination] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("TokenIn", "TIN");
    await tokenIn.waitForDeployment();
    const tokenOut = await MockERC20.deploy("TokenOut", "TOUT");
    await tokenOut.waitForDeployment();
    const tokenExtra = await MockERC20.deploy("TokenExtra", "TEXT");
    await tokenExtra.waitForDeployment();

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

    await swapManager.connect(owner).setAffiliateRouter(await affiliateRouter.getAddress());

    const amountIn = ethers.parseUnits("100", 18);
    const half = amountIn / 2n;
    await tokenIn.mint(await affiliateRouter.getAddress(), amountIn);
    await tokenIn.connect(affiliateRouter).approve(await swapManager.getAddress(), amountIn);

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? 0) + 3600);

    const route = {
      steps: [
        {
          dex: "pulsexV2",
          path: [await tokenIn.getAddress(), await tokenOut.getAddress()],
          pool: ethers.ZeroAddress,
          percent: 50_000n,
          groupId: 1n,
          parentGroupId: 0n,
          userData: "0x",
        },
        {
          dex: "pulsexV2",
          path: [await tokenIn.getAddress(), await tokenExtra.getAddress()],
          pool: ethers.ZeroAddress,
          percent: 50_000n,
          groupId: 2n,
          parentGroupId: 0n,
          userData: "0x",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await destination.getAddress(),
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      groupCount: 3n,
      deadline,
      amountIn,
      amountOutMin: half,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(affiliateRouter).executeSwap(routeBytes))
      .to.emit(tokenOut, "Transfer")
      .withArgs(await swapManager.getAddress(), await destination.getAddress(), half);

    expect(await tokenOut.balanceOf(await destination.getAddress())).to.equal(half);
    expect(await tokenExtra.balanceOf(await destination.getAddress())).to.equal(half);
    expect(await tokenExtra.balanceOf(await swapManager.getAddress())).to.equal(0n);
  });
});
