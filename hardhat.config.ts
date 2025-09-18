import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
			forking: {
				// url: "https://alpha-weathered-card.bsc.quiknode.pro/5ee1c5dc4700fd50e42762ca281bf35b7dc36b88",
				// url: 'https://newest-falling-layer.bsc-testnet.quiknode.pro/97d2bad70da983db0c16ab40774d882c718e4e10',
				url: 'https://rpc-pulsechain.g4mm4.io',
        // url: 'https://rpc.pulsechain.com',
        // blockNumber: 24366695,
			}, 
      chains: {
				// 369: {
				// 	hardforkHistory: {
				// 		london: 24366694
				// 	}
				// }
			},
			accounts: {
				accountsBalance: "10000000000000000000000000000",
			},
		},
    monad: {
      url: "https://testnet-rpc.monad.xyz",
      accounts: [PRIVATE_KEY],
      chainId: 10143,
    },
    pulse: {
			// url: 'https://rpc.pls.pulsefusion.io/LfhyA4xeTyu8Re2jek6CdP5D',
			// url: 'https://pulsechain.publicnode.com',
			url: "https://rpc.pulsechain.com",
			// url: 'https://rpc-pulsechain.g4mm4.io',
			// url: 'https://pulsechain-rpc.publicnode.com',
			accounts: [PRIVATE_KEY],
			chainId: 369,
			gasPrice: 7280540000000000,
		},
    local: {
      url: "http://127.0.0.1:8545",
      accounts: [PRIVATE_KEY],
      chainId: 31337,
    }
  },
  etherscan: {
    apiKey: {
      pulse: "0",
      mainnet: "VERKPGM6FHAHUQ1TGAH1XYQHEXF4Y1NMES",
      bsc: "HXKZWCQRWVATI4INBUWRBUAYYBNRD5XVES",
      goerli: "D7VHJ687GHKP79N8I2FGTE6NX9Q8P1F8YI",
    },
    customChains: [
      {
        network: "pulse",
        chainId: 369,
        urls: {
          apiURL: "https://api.scan.pulsechain.com/api",
					browserURL: "https://scan.pulsechain.com",
        },
      },
    ],
  },
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  mocha: {
		timeout: 200000,
	}
};
export default config;
