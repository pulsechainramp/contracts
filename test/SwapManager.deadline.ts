import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

const routeType =
  "tuple(tuple(string dex,address[] path,address pool,uint256 percent,uint256 groupId,uint256 parentGroupId,bytes userData)[] steps,tuple(uint256 id,uint256 percent)[] parentGroups,address destination,address tokenIn,address tokenOut,uint256 groupCount,uint256 deadline,uint256 amountIn,uint256 amountOutMin,bool isETHOut)";

const encodeRoute = (overrides: Partial<Record<string, unknown>> = {}) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const route = {
    steps: [
      {
        dex: "pulsexV2",
        path: [ethers.ZeroAddress, ethers.ZeroAddress],
        pool: ethers.ZeroAddress,
        percent: 100000n,
        groupId: 0n,
        parentGroupId: 0n,
        userData: "0x",
      },
    ],
    parentGroups: [{ id: 0n, percent: 100000n }],
    destination: ethers.ZeroAddress,
    tokenIn: ethers.ZeroAddress,
    tokenOut: ethers.ZeroAddress,
    groupCount: 1n,
    deadline: 0n,
    amountIn: 1n,
    amountOutMin: 1n,
    isETHOut: false,
  };

  return abiCoder.encode([routeType], [{ ...route, ...overrides }]);
};

describe("SwapManager deadlines", () => {
  it("reverts when executing a route past its deadline", async () => {
    const SwapManager = await ethers.getContractFactory("SwapManager");
    const swapManager = await upgrades.deployProxy(SwapManager, []);
    await swapManager.waitForDeployment();

    const [owner] = await ethers.getSigners();
    await swapManager.setAffiliateRouter(await owner.getAddress());

    const latestBlock = await ethers.provider.getBlock("latest");
    const pastDeadline = BigInt((latestBlock?.timestamp ?? 0) - 1);

    const routeBytes = encodeRoute({
      deadline: pastDeadline,
      destination: await owner.getAddress(),
    });

    await expect(swapManager.connect(owner).executeSwap(routeBytes)).to.be.revertedWith("Route expired");
  });
});
