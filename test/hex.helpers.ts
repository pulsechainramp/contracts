import { expect } from "chai";
import { Interface, JsonRpcProvider } from "ethers";
import HexAbi from "../abis/Hex.json";
import { getHexAddress, getHexContract, heartsToHex, hexDecimals, hexToHearts } from "../src/hex";
import { HEX_ADDRESS_BY_CHAIN_ID } from "../src/networks/hex";

describe("hex helpers", () => {
  it("parses HEX ABI and exposes expected functions", () => {
    const abi = (HexAbi as any).abi ?? HexAbi;
    const iface = new Interface(abi);

    expect(() => iface.getFunction("stakeStart")).to.not.throw();
    expect(() => iface.getFunction("stakeEnd")).to.not.throw();
    expect(() => iface.getFunction("stakeGoodAccounting")).to.not.throw();
    expect(() => iface.getFunction("stakeLists")).to.not.throw();
    expect(() => iface.getFunction("stakeCount")).to.not.throw();
    expect(() => iface.getFunction("currentDay")).to.not.throw();
  });

  it("maps supported chain ids to the PulseChain HEX address only", () => {
    const pulseAddress = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";
    expect(getHexAddress(369)).to.equal(pulseAddress);
    expect(HEX_ADDRESS_BY_CHAIN_ID[369]).to.equal(pulseAddress);
    expect(() => getHexAddress(1)).to.throw("Unsupported HEX chain id");
    expect(() => getHexAddress(999999)).to.throw("Unsupported HEX chain id");
  });

  it("converts between hearts and HEX", () => {
    const oneHex = 100_000_000n;
    expect(heartsToHex(oneHex)).to.equal("1.0");
    expect(hexToHearts("1")).to.equal(oneHex);
    expect(hexToHearts("1.25")).to.equal(125_000_000n);
    expect(hexDecimals).to.equal(8);
  });

  it("creates a contract instance with the provided signer or provider", () => {
    const provider = new JsonRpcProvider();
    const contract = getHexContract(provider, 369);
    const target =
      (contract as any).target ??
      (contract as any).address ??
      (contract as any).deploymentTransaction()?.to ?? "";
    expect(String(target).toLowerCase()).to.equal(
      HEX_ADDRESS_BY_CHAIN_ID[369].toLowerCase()
    );
  });
});
