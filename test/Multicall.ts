import { expect } from "chai";
import { ethers } from "hardhat";

describe("Multicall", () => {
  const iface = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);
  let multicall: any;
  let owner: any;
  let other: any;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Multicall = await ethers.getContractFactory("Multicall");
    multicall = await Multicall.deploy();
    await multicall.waitForDeployment();
  });

  it("returns native balance when target is zero address in multicall", async () => {
    const callData = iface.encodeFunctionData("balanceOf", [owner.address]);
    const [result] = await multicall.multicall([
      { target: ethers.ZeroAddress, callData },
    ]);

    expect(result.success).to.equal(true);
    const [decoded] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result.returnData);
    expect(decoded).to.equal(await ethers.provider.getBalance(owner.address));
  });

  it("returns ERC20 and native balances via getTokenBalances", async () => {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const mintAmount = ethers.parseUnits("5", 18);
    await token.mint(owner.address, mintAmount);

    const balances = await multicall.getTokenBalances([await token.getAddress(), ethers.ZeroAddress], owner.address);
    expect(balances.length).to.equal(2);
    expect(balances[0]).to.equal(mintAmount);
    expect(balances[1]).to.equal(await ethers.provider.getBalance(owner.address));
  });

  it("returns zero for failing calls and supports batch native balances", async () => {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const mintAmount = ethers.parseUnits("10", 18);
    await token.mint(owner.address, mintAmount);
    await token.mint(other.address, mintAmount / 2n);

    const results = await multicall.getTokenBalancesBatch(
      [await token.getAddress(), await multicall.getAddress(), ethers.ZeroAddress],
      [owner.address, other.address]
    );

    expect(results.length).to.equal(3);
    expect(results[0][0]).to.equal(mintAmount);
    expect(results[0][1]).to.equal(mintAmount / 2n);

    // Non-ERC20 target returns zero
    expect(results[1][0]).to.equal(0n);
    expect(results[1][1]).to.equal(0n);

    // Native balances surfaced via address(0)
    expect(results[2][0]).to.equal(await ethers.provider.getBalance(owner.address));
    expect(results[2][1]).to.equal(await ethers.provider.getBalance(other.address));
  });
});
