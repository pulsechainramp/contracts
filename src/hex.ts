import { BrowserProvider, Contract, InterfaceAbi, Provider, Signer, formatUnits, parseUnits } from "ethers";
import HexAbi from "../abis/Hex.json";
import { HEX_ADDRESS_BY_CHAIN_ID } from "./networks/hex";

const HEX_DECIMALS = 8;

export type HexContract = Contract & {
  stakeStart: (amountHearts: bigint, stakeDays: bigint | number) => Promise<any>;
  stakeEnd: (stakeIndex: bigint | number, stakeId: bigint | number) => Promise<any>;
  stakeGoodAccounting: (
    staker: string,
    stakeIndex: bigint | number,
    stakeId: bigint | number
  ) => Promise<any>;
  globalInfo: () => Promise<any>;
  stakeLists: (staker: string, index: bigint | number) => Promise<any>;
  stakeCount: (staker: string) => Promise<bigint>;
  currentDay: () => Promise<bigint>;
  globals: () => Promise<any>;
  dailyDataRange: (beginDay: bigint | number, days: bigint | number) => Promise<bigint[]>;
  balanceOf: (owner: string) => Promise<bigint>;
};

const abi: InterfaceAbi = (HexAbi as any).abi ?? (HexAbi as InterfaceAbi);

export const getHexAddress = (chainId: number): string => {
  const address = HEX_ADDRESS_BY_CHAIN_ID[chainId];
  if (!address) {
    throw new Error(`Unsupported HEX chain id ${chainId}`);
  }
  return address;
};

export const getHexContract = (
  providerOrSigner: Provider | Signer | BrowserProvider,
  chainId: number
): HexContract => {
  const address = getHexAddress(chainId);
  return new Contract(address, abi, providerOrSigner) as unknown as HexContract;
};

export const heartsToHex = (hearts: bigint): string => {
  return formatUnits(hearts, HEX_DECIMALS);
};

export const hexToHearts = (hexAmount: string | bigint): bigint => {
  const value =
    typeof hexAmount === "bigint" ? hexAmount.toString() : (hexAmount ?? "").toString();
  return parseUnits(value, HEX_DECIMALS);
};

export const hexDecimals = HEX_DECIMALS;
