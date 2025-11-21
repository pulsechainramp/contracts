import { expect } from "chai";
import { ethers } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (route: any) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return abiCoder.encode([routeType], [route]);
};

describe("SwapManager allowance handling", () => {
  it("handles repeated swaps for tokens requiring zeroed allowances", async () => {
    const [owner] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const tokenIn = await MockUSDT.deploy();
    await tokenIn.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenOut = await MockERC20.deploy("TokenOut", "TOUT");
    await tokenOut.waitForDeployment();

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
    await swapManager.setAffiliateRouter(await owner.getAddress());

    const amountIn = ethers.parseUnits("100", 6);
    await tokenIn.mint(await owner.getAddress(), amountIn * 2n);

    await tokenIn.connect(owner).approve(await swapManager.getAddress(), 0);
    await tokenIn.connect(owner).approve(await swapManager.getAddress(), amountIn * 2n);

    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const route = {
      steps: [
        {
          dex: "pulsexV2",
          path: [await tokenIn.getAddress(), await tokenOut.getAddress()],
          pool: ethers.ZeroAddress,
          percent: 100_000n,
          groupId: 1n,
          parentGroupId: 0n,
          userData: "0x",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await owner.getAddress(),
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      groupCount: 2n,
      deadline,
      amountIn,
      amountOutMin: amountIn,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.not.be.reverted;
    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.not.be.reverted;

    expect(
      await tokenIn.allowance(await swapManager.getAddress(), await pulsexV2Router.getAddress())
    ).to.equal(0n);
  });
});
