// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ISwapManager.sol";

contract MockSwapManager is ISwapManager, Ownable {
    address public override affiliateRouter;
    mapping(string => address) private dexRouterMap;

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

    constructor(address _affiliateRouter) Ownable(msg.sender) {
        affiliateRouter = _affiliateRouter;
    }

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

    function dexRouters(string calldata key) external view override returns (address) {
        return dexRouterMap[key];
    }

    function setAffiliateRouter(address _affiliateRouter) external override onlyOwner {
        affiliateRouter = _affiliateRouter;
        emit AffiliateRouterSet(_affiliateRouter);
    }

    function setDexRouters(
        string[] calldata keys,
        address[] calldata routers
    ) external override onlyOwner {
        require(keys.length == routers.length, "Keys and routers length mismatch");
        for (uint256 i = 0; i < keys.length; i++) {
            dexRouterMap[keys[i]] = routers[i];
            emit DexRouterSet(keys[i], routers[i]);
        }
    }

    function weth() external pure override returns (IWETH9) {
        return IWETH9(address(0));
    }
}
