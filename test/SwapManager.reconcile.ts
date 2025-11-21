import { expect } from "chai";
import { ethers } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (route: any) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return abiCoder.encode([routeType], [route]);
};

describe("SwapManager input reconciliation", () => {
  it("refunds unused input amounts back to the destination", async () => {
    const [owner, affiliateRouter, destination] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("TokenIn", "TIN");
    await tokenIn.waitForDeployment();

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
    await swapManager.setAffiliateRouter(await affiliateRouter.getAddress());

    const amountIn = ethers.parseUnits("100", 18);
    const expectedStepAmount = ethers.parseUnits("1", 18);
    await tokenIn.mint(await affiliateRouter.getAddress(), amountIn);
    await tokenIn.connect(affiliateRouter).approve(await swapManager.getAddress(), amountIn);

    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    const route = {
      steps: [
        {
          dex: "pulsexV2",
          path: [await tokenIn.getAddress(), await tokenOut.getAddress()],
          pool: ethers.ZeroAddress,
          percent: 1_000n, // 1%
          groupId: 1n,
          parentGroupId: 0n,
          userData: "0x",
        },
      ],
      parentGroups: [{ id: 0n, percent: 100_000n }],
      destination: await destination.getAddress(),
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      groupCount: 2n,
      deadline,
      amountIn,
      amountOutMin: expectedStepAmount,
      isETHOut: false,
    };

    const routeBytes = encodeRoute(route);

    await expect(swapManager.connect(affiliateRouter).executeSwap(routeBytes))
      .to.emit(tokenOut, "Transfer")
      .withArgs(await swapManager.getAddress(), await destination.getAddress(), ethers.parseUnits("1", 18));

    const expectedLeftover = amountIn - expectedStepAmount;
    expect(await tokenIn.balanceOf(await destination.getAddress())).to.equal(expectedLeftover);
    expect(await tokenOut.balanceOf(await destination.getAddress())).to.equal(expectedStepAmount);
    expect(await tokenIn.balanceOf(await swapManager.getAddress())).to.equal(0n);
  });
});
