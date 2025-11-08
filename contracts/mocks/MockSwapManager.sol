// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISwapManager.sol";

contract MockSwapManager is ISwapManager {
    address public override affiliateRouter;

    address public lastDestination;
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountIn;
    uint256 public lastAmountOutMin;
    uint256 public lastMsgValue;

    event SwapRecorded(
        address indexed caller,
        address indexed destination,
        address tokenIn,
        uint256 amountIn,
        uint256 msgValue
    );

    function setDexRouters(string[] calldata, address[] calldata) external override {}

    function executeSwap(bytes calldata routeBytes) external payable override {
        SwapRoute memory route = abi.decode(routeBytes, (SwapRoute));

        lastDestination = route.destination;
        lastTokenIn = route.tokenIn;
        lastTokenOut = route.tokenOut;
        lastAmountIn = route.amountIn;
        lastAmountOutMin = route.amountOutMin;
        lastMsgValue = msg.value;

        emit SwapRecorded(msg.sender, route.destination, route.tokenIn, route.amountIn, msg.value);
    }

    function setAffiliateRouter(address _affiliateRouter) external override {
        affiliateRouter = _affiliateRouter;
    }

    function dexRouters(string calldata) external pure override returns (address) {
        return address(0);
    }

    function weth() external pure override returns (IWETH9) {
        return IWETH9(address(0));
    }
}
