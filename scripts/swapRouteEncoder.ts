import { ethers } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';
import { AbiCoder, ParamType } from '@ethersproject/abi';
import { SwapManager } from "../typechain-types"

// Types matching the Solidity structs
export interface SwapStep {
    dex: string;
    path: string[];
    pool: string;
    percent: number;
    groupId: number;
    parentGroupId: number;
    userData: string;
}

export interface Group {
    id: number;
    percent: number;
}

export interface SwapRoute {
    steps: SwapStep[];
    parentGroups: Group[];
    destination: string;
    tokenIn: string;
    tokenOut: string;
    groupCount: number;
    deadline: number;
    amountIn: string;
    amountOutMin: string;
}

// ABI for encoding/decoding
const SWAP_ROUTE_ABI = [
    ParamType.from({
        name: 'SwapRoute',
        type: 'tuple',
        components: [
            {
                name: 'steps',
                type: 'tuple[]',
                components: [
                    { name: 'dex', type: 'string' },
                    { name: 'path', type: 'address[]' },
                    { name: 'pool', type: 'address' },
                    { name: 'percent', type: 'uint256' },
                    { name: 'groupId', type: 'uint256' },
                    { name: 'parentGroupId', type: 'uint256' },
                    { name: 'userData', type: 'bytes' }
                ]
            },
            {
                name: 'parentGroups',
                type: 'tuple[]',
                components: [
                    { name: 'id', type: 'uint256' },
                    { name: 'percent', type: 'uint256' }
                ]
            },
            { name: 'destination', type: 'address' },
            { name: 'tokenIn', type: 'address' },
            { name: 'tokenOut', type: 'address' },
            { name: 'groupCount', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' }
        ]
    })
];

export function encodeSwapRoute(route: SwapRoute): string {
    // Encode the route using ethers.js
    const abiCoder = new AbiCoder();
    return abiCoder.encode(SWAP_ROUTE_ABI, [route]);
}

// Example usage:
/*
const route: SwapRoute = {
    steps: [{
        dex: "pulsexV2",
        path: ["0x...", "0x..."],
        pool: "0x...",
        percent: 100000, // 100%
        groupId: 0,
        parentGroupId: 0,
        userData: "0x"
    }],
    parentGroups: [{
        id: 0,
        percent: 100000 // 100%
    }],
    tokenIn: "0x...",
    tokenOut: "0x...",
    groupCount: 1,
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    amountIn: "1000000000000000000", // 1 ETH in wei
    amountOutMin: "990000000000000000" // 0.99 ETH in wei (1% slippage)
};

const encodedRoute = encodeSwapRoute(route);
*/ 