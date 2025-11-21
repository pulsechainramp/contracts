# DEX Aggregator Protocol - Deployment Documentation

## Overview

This DEX aggregator protocol is designed for the PulseChain network and provides optimal swap routing across multiple decentralized exchanges (DEXs) with built-in referral functionality. The protocol consists of two main contracts: `SwapManager` and `AffiliateRouter`.

## Architecture

### Core Contracts

1. **SwapManager** - The core swap execution engine that handles multi-DEX routing
2. **AffiliateRouter** - The user-facing contract that manages referral fees and executes swaps through SwapManager

### Supported DEX Protocols

The protocol integrates with the following DEX protocols on PulseChain:

- **PulseX V1** - Uniswap V2 fork
- **PulseX V2** - Uniswap V2 fork (updated version)
- **9inch V2** - Uniswap V2 fork
- **9inch V3** - Uniswap V3 fork
- **9mm V3** - Uniswap V3 fork
- **9mm V2** - Uniswap V2 fork
- **Phux** - Balancer V2 fork
- **PulseX Stable** - Stable swap pools
- **DexTop** - Uniswap V3 fork
- **pDex V3** - Uniswap V3 fork
- **Tide** - Custom vault protocol

## Prerequisites

### Environment Setup

1. **Node.js** (v16 or higher)
2. **Hardhat** development environment
3. **PulseChain RPC** access
4. **Private key** with sufficient PLS for deployment

### Required Environment Variables

Create a `.env` file with the following variables:

```bash
PRIVATE_KEY=your_private_key_here
# Optional overrides:
# WETH_ADDRESS=0x...
# PULSEX_V1_ROUTER=0x...
# PULSEX_V2_ROUTER=0x...
# PULSEX_STABLE_POOL=0x...
# OTHER_DEX_KEYS=pulsexV2,phux
# OTHER_DEX_ROUTER_ADDRESSES=0x...,0x...
```

### Dependencies

Install required packages:

```bash
npm install
```

## Network Configuration

The protocol is configured for the following networks:

- **PulseChain Mainnet** (Chain ID: 369)
- **PulseChain Testnet** (if available)
- **Local Development** (Hardhat)

### PulseChain Configuration

```typescript
pulse: {
  url: "https://rpc.pulsechain.com",
  accounts: [PRIVATE_KEY],
  chainId: 369,
  gasPrice: 7280540000000000, // 0.00728054 PLS
}
```

## Deployment Process

### Step 1: Prepare Deployment Script

The deployment script (`scripts/deploy.ts`) contains the following key components:

1. **Contract Addresses** - Pre-deployed contract addresses for DEX routers
2. **Deployment Logic** - Constructor-based deployment with standard OpenZeppelin contracts
3. **Configuration** - DEX router setup and verification

### Step 2: Deploy Core Contracts

#### Deploy SwapManager

```bash
# Deploy SwapManager (pass WPLS/WETH address via env or script constant)
npx hardhat run scripts/deploy.ts --network pulse
```

The SwapManager contract:
- Uses standard OpenZeppelin contracts (no proxy/initializer)
- Initializes with WPLS address: `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`
- Implements reentrancy protection
- Supports complex multi-step swap routing
- Binds the AffiliateRouter post-deploy via a one-time `setAffiliateRouter` call.

#### Deploy AffiliateRouter

```bash
# Deploy AffiliateRouter with SwapManager reference and bind once
npx hardhat run scripts/deploy.ts --network pulse
```

### Step 3: Configure DEX Routers

After deployment, configure the DEX router addresses:

```typescript
// Example DEX router configuration
const dexRouters = {
  "pulsexV1": "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
  "pulsexV2": "0x165C3410fC91EF562C50559f7d2289fEbed552d9",
  "9inchV2": "0xeB45a3c4aedd0F47F345fB4c8A1802BB5740d725",
  "9inchV3": "0x42556A17EF0Bd815bF21aD628DFd2e2f3b5F9ac7",
  "phux": "0x7F51AC3df6A034273FB09bb29e383fCF655e473c",
  "9mmV3": "0xa9444246d80d6e3496c9242395213b4f22226a59",
  "dexTop": "0x1f849694Ef24a2245bCa415FE47500216B24d7FF",
  "pDexV3": "0x1eC2eaA62117486c9b2a05F098a7bF2568e19204",
  "tide": "0x634F6B9Cd1f860314871548d2224362825384B2D"
};
```

## Contract Addresses

### Mainnet Addresses

- **SwapManager**: `0x614Cc6667bD97367E01940eD6939cEA612a0c391`
- **AffiliateRouter**: `0x484f957900F15919f9d3D48e70703d66f34A22DE`

### Security Features

- **Reentrancy Protection** - All external calls protected
- **Access Control** - Owner-only functions for critical operations
- **Pausable** - Emergency pause functionality
- **Immutable** - Contracts must be redeployed for improvements; no proxy admin exists

## Usage Examples

### Basic Swap Execution

```typescript
// Execute a swap through AffiliateRouter
await executeTx(AffiliateRouter.connect(wallet).executeSwap(
  encodedSwapRoute,
  referrerAddress, // Can be zero address for no referral
  { value: ethAmount } // For ETH swaps
));
```

### Setting Referral Fees

```typescript
// Set custom referral fee (in basis points, 100 = 1%)
await executeTx(AffiliateRouter.connect(wallet).updateFeeBasisPoints(100)); // 1% fee
```

### Withdrawing Referral Earnings

```typescript
// Withdraw earnings for specific tokens
await executeTx(AffiliateRouter.connect(wallet).withdrawReferralEarnings([
  tokenAddress1,
  tokenAddress2,
  ethers.ZeroAddress // For ETH
]));
```

## Monitoring and Maintenance

### Event Monitoring

Key events to monitor:

- `SwapExecuted` - Track swap volume and fees
- `ReferralRegistered` - Monitor new referral relationships
- `ReferralFeeWithdrawn` - Track referral payouts


## Testing on Local Environment

### Network configuration

Update hardhat.config.ts
```typescript
 networks: {
    hardhat: {
		forking: {
			url: 'https://rpc-pulsechain.g4mm4.io',
            // url: 'https://rpc.pulsechain.com',
            // blockNumber: 24366695,
		},
        accounts: {
            accountsBalance: "10000000000000000000000000000",
        },
    }
 }
```

### Compose Test script in `test` folder

```typescript
import { ethers, network } from "hardhat";
import { AffiliateRouter, SwapManager } from "../typechain-types";
import dotenv from "dotenv";
import { ContractTransaction, Wallet } from "ethers";
import { executeTx, generateSwapRoute, waitFor } from "../scripts/util";
dotenv.config();

describe("SwapManager", () => {
  it("should execute a swap", async () => {
    const privateKey = process.env.PRIVATE_KEY as string;
    const signer = new ethers.Wallet(privateKey, ethers.provider);

    const SwapManagerAddress = "0x72124aeC242C4655179aCBD4eB0237f15b0498B7";
    const AffiliateRouterAddress = "0x72f1d19e38FBFCC085239D45fE563e81408afC78";

    const SwapManagerFactory = await ethers.getContractFactory("SwapManager", signer);
    const SwapManager = SwapManagerFactory.attach(SwapManagerAddress);
    await SwapManager.waitForDeployment();
    console.log("SwapManager deployed to:", await SwapManager.getAddress());
  
    const AffiliateRouterFactory = await ethers.getContractFactory("AffiliateRouter", signer);
    const AffiliateRouter = AffiliateRouterFactory.attach(AffiliateRouterAddress) as AffiliateRouter;
    console.log("AffiliateRouter deployed to:", await AffiliateRouter.getAddress());

    const swapRoute = "0x000000000000000000..."
    const referrer = ethers.ZeroAddress;
    await executeTx(AffiliateRouter.connect(signer).executeSwap(swapRoute, referrer, { value: ethers.parseEther('1000') }));
    console.log('Swap executed')
  });
});

```

### Run Test Script

```bash
# Run test/testSwap.ts in local test environment
npx hardhat test test/testSwap.ts
```

