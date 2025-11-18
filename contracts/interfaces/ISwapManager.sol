// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH9} from "./IWETH9.sol";

interface ISwapManager {
    // Structs
    struct SwapStep {
        string dex; // DEX identifier
        address[] path; // Token path for this step
        address pool; // Pool address
        uint256 percent; // Percentage of amount to swap in this step
        uint256 groupId; // Index of current sub step group
        uint256 parentGroupId; // Index of parent group (-1 for top-level steps)
        bytes userData; // Additional data for complex swaps
    }

    struct Group {
        uint256 id;
        uint256 percent;
    }

    struct SwapRoute {
        SwapStep[] steps; // Array of all steps (both top-level and sub-steps)
        Group[] parentGroups;
        address destination;
        address tokenIn;
        address tokenOut;
        uint256 groupCount;
        uint256 deadline; // Deadline for the entire route
        uint256 amountIn; // Amount in for the entire route
        uint256 amountOutMin; // Minimum amount out for the entire route
        bool isETHOut;
    }

    // Events
    event AffiliateRouterSet(address indexed oldRouter, address indexed newRouter);

    // State variables
    function affiliateRouter() external view returns (address);
    function weth() external view returns (IWETH9);

    // Functions
    function executeSwap(bytes calldata routeBytes) external payable;
    function setAffiliateRouter(address _affiliateRouter) external;

    function dexRouters(string calldata) external view returns (address);
}
