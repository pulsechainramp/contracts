import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import { getImplementationAddressFromProxy } from "@openzeppelin/upgrades-core"
import { BigNumberish, ContractTransaction, ContractTransactionResponse, ethers } from "ethers"
import fs from "fs"
import hre from "hardhat"
import { SwapManager } from "../typechain-types"
import { responseData, responseData1 } from "./data"
import { encodeSwapRoute, SwapRoute, SwapStep } from "./swapRouteEncoder"

export const writeAddr = (addressFile: string, network: string, addr: string, name: string) => {
	fs.appendFileSync(
		addressFile,
		`${name}: [https://${network}.etherscan.io/address/${addr}](https://${network}.etherscan.io/address/${addr})<br/>`
	)
}

export const verify = async (addr: string, args: any[], contract: any = undefined) => {
	try {
		await hre.run("verify:verify", {
			address: addr,
			constructorArguments: args,
			contract,
		})
	} catch (ex: any) {
		if (ex.toString().indexOf("Already Verified") == -1) {
			throw ex
		}
	}
}

export const verifyProxyImplementation = async (addr: string, contract: any = undefined) => {
	const implementationAddress = await getImplementationAddressFromProxy(hre.network.provider, addr)
	await verify(implementationAddress as string, [], contract)
}

export const verifyPulseContract = async (promise: Promise<any>) => {
	try {
		await promise
	} catch (error) {
		console.log(error)
	}
}

export const executeTx = async (contractFunctionCall: Promise<ContractTransactionResponse>) => {
	const tx = await contractFunctionCall
	await tx.wait()
	return tx
}

export const replaceTx = async (wallet: SignerWithAddress, nonce: number) => {
	const tx = await wallet.sendTransaction({
		from: wallet.address,
		to: wallet.address,
		value: ethers.parseEther("0"),
		nonce,
	})
	await tx.wait()
	console.log("replaced")
}

export const toFloat = (value: BigNumberish | string) => {
	return Number(ethers.formatEther(value))
}

export const toSwapTokens = (tokens: { name: string; decimal: number; tokenAddress: string, isStable?: boolean }[]) => {
	const defaultConfig = {
		isEnabled: true,
		price: 0,
		isStable: false,
	}
	const tokenConfigs = tokens.map((item) => ({ ...defaultConfig, ...item }))
	return tokenConfigs
}

export const waitFor = async (secs: number) => {
	console.log(`waiting for ${secs} seconds`);
	await new Promise((resolve) => setTimeout(resolve, secs * 1000));
}

export const correctDexName = (dex: string) => {
	if (dex === 'PulseX V1') return 'pulsexV1';
	if (dex === 'PulseX V2') return 'pulsexV2';
	if (dex === '9inch V2') return '9inchV2';
	if (dex === '9inch V3') return '9inchV3';
	if (dex === '9mm V3') return '9mmV3';
	if (dex === '9mm V2') return '9mmV2';
	if (dex === 'Phux') return 'phux';
	if (dex === 'PulseX Stable') return 'pulsexStable';
	return dex;
}

export const generateSwapRoute = async () => {
	const { srcToken, destToken, route: { paths, swaps } } = responseData1;
	// Convert paths and swaps into steps
	const route: SwapRoute = {
		steps: [],
		deadline: Math.floor(Date.now() / 1000 + 1000 * 10),
		amountIn: ethers.parseEther('1000').toString(),
		amountOutMin: ethers.parseEther('0').toString(),
		parentGroups: [],
		groupCount: 0,
		destination: ethers.ZeroAddress,
		tokenIn: ethers.ZeroAddress,
		tokenOut: destToken.address,
	}

	let currentGroupId = 0;
	for (const [swapIndex, swap] of swaps.entries()) {
		const parentGroupId = currentGroupId ++;
		route.parentGroups.push({ id: parentGroupId, percent: swap.percent })
		
		for (const [subswapIndex, subswap] of swap.subswaps.entries()) {
			const groupId = currentGroupId ++;
			for (const [pathIndex, path] of subswap.paths.entries()) {
				let userData = '0x';
				if (path.exchange == "PulseX Stable") {
					let index1: number = -1, index2: number = -1;
					const StablePool = await hre.ethers.getContractAt("IPulseXStableSwapPool", path.address);
					for (let i = 0; i <= 2; i ++) {
						const token = await StablePool.coins(i);
						if (token.toLowerCase() == paths[swapIndex][subswapIndex].address.toLowerCase()) {
							index1 = i;
						} else if (token.toLowerCase() == paths[swapIndex][subswapIndex + 1].address.toLowerCase()) {
							index2 = i;
						}
					}

					userData = ethers.solidityPacked(
						["uint8", "uint8"], 
						[index1, index2]
					)
				}
				const step: SwapStep = {
					dex: correctDexName(path.exchange),
					path: [paths[swapIndex][subswapIndex].address, paths[swapIndex][subswapIndex + 1].address],
					percent: path.percent,
					pool: path.address,
					userData,
					groupId: groupId,
					parentGroupId: (pathIndex == 0 && subswapIndex == 0) ? parentGroupId : groupId - 1
				}
				route.steps.push(step);
			}
		}
	}
	route.groupCount = currentGroupId;

	const encodedRoute = encodeSwapRoute(route);
	console.log(encodedRoute);
	return encodedRoute;
};
