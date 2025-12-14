// HEX on PulseChain mainnet (staking only supports Pulse)
export const HEX_ADDRESS = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";

export const HEX_ADDRESS_BY_CHAIN_ID: Record<number, string> = {
  369: HEX_ADDRESS,
};

export const isSupportedHexChain = (chainId: number): boolean =>
  Boolean(HEX_ADDRESS_BY_CHAIN_ID[chainId]);
