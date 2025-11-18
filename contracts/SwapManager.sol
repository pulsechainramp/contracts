// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "hardhat/console.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPulseXRouter02} from "./interfaces/pulsex/IPulseXRouter.sol";
import {IPhuxVault} from "./interfaces/phux/IPhuxVault.sol";
import {IPhuxPool} from "./interfaces/phux/IPhuxPool.sol";
import {I9InchSwapRouter} from "./interfaces/9inch/I9InchSwapRouter.sol";
import {I9InchV3Pool} from "./interfaces/9inch/I9InchV3Pool.sol";
import {IPulseXStableSwapPool} from "./interfaces/pulsex/IPulseXStableSwapPool.sol";
import {ITideVault} from "./interfaces/tide/ITideVault.sol";
import {IAsset} from "./interfaces/phux/IAsset.sol";
import {IWETH9} from "./interfaces/IWETH9.sol";

contract SwapManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant DEX_HASH_PULSEX_V1 = keccak256("pulsexV1");
    bytes32 private constant DEX_HASH_PULSEX_V2 = keccak256("pulsexV2");
    bytes32 private constant DEX_HASH_PULSEX_STABLE = keccak256("pulsexStable");
    bytes32 private constant DEX_HASH_PHUX = keccak256("phux");
    bytes32 private constant DEX_HASH_9INCH_V2 = keccak256("9inchV2");
    bytes32 private constant DEX_HASH_9INCH_V3 = keccak256("9inchV3");
    bytes32 private constant DEX_HASH_9MM_V2 = keccak256("9mmV2");
    bytes32 private constant DEX_HASH_9MM_V3 = keccak256("9mmV3");
    bytes32 private constant DEX_HASH_PDEX_V3 = keccak256("pDexV3");
    bytes32 private constant DEX_HASH_DEXTOP = keccak256("dexTop");
    bytes32 private constant DEX_HASH_TIDE = keccak256("tide");

    // Non-PulseX router addresses keyed by dex hash
    mapping(bytes32 => address) private otherDexRouters;
    address public immutable pulsexV1Router;
    address public immutable pulsexV2Router;
    address public immutable pulsexStablePool;
    address public affiliateRouter;
    IWETH9 public immutable weth;

    // Struct to represent a single swap step
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

    // Struct to represent a complete swap route
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

    // Struct to hold execution context variables to reduce stack usage
    struct SwapExecutionContext {
        uint256 totalAmountOut;
        uint256[] groupOutputs;
        uint256 i;
        uint256 stepAmountIn;
        uint256 stepOutput;
    }

    constructor(
        address _weth,
        address _pulsexV1Router,
        address _pulsexV2Router,
        address _pulsexStablePool,
        string[] memory routerKeys,
        address[] memory routerAddresses
    ) Ownable(msg.sender) {
        require(_weth != address(0), "Invalid WETH address");
        require(_pulsexV1Router != address(0), "Invalid PulseX V1 router");
        require(_pulsexV2Router != address(0), "Invalid PulseX V2 router");
        require(_pulsexStablePool != address(0), "Invalid PulseX stable pool");

        weth = IWETH9(_weth);
        pulsexV1Router = _pulsexV1Router;
        pulsexV2Router = _pulsexV2Router;
        pulsexStablePool = _pulsexStablePool;

        _setInitialRouters(routerKeys, routerAddresses);
    }

    function dexRouters(string calldata key) external view returns (address) {
        bytes32 dexHash = keccak256(bytes(key));
        if (dexHash == DEX_HASH_PULSEX_V1) {
            return pulsexV1Router;
        }
        if (dexHash == DEX_HASH_PULSEX_V2) {
            return pulsexV2Router;
        }
        if (dexHash == DEX_HASH_PULSEX_STABLE) {
            return pulsexStablePool;
        }
        return otherDexRouters[dexHash];
    }

    function _executeSwap(SwapRoute memory route) internal {
        require(route.steps.length > 0, "Empty route");
        require(block.timestamp <= route.deadline, "Route expired");
        require(route.amountOutMin > 0, "amountOutMin must be positive");
        require(route.destination != address(0), "Destination cannot be empty");

        address inputAsset = route.tokenIn == address(0)
            ? address(weth)
            : route.tokenIn;
        uint256 inputBalanceBefore = IERC20(inputAsset).balanceOf(address(this));

        uint256 trackedCapacity = route.steps.length * 2 + 2;
        address[] memory trackedTokens = new address[](trackedCapacity);
        uint256 trackedCount = 0;
        bool producesTokenOut = false;

        trackedCount = _trackToken(inputAsset, trackedTokens, trackedCount);
        for (uint256 i = 0; i < route.steps.length; i++) {
            SwapStep memory validationStep = route.steps[i];
            require(validationStep.path.length == 2, "Invalid path length");
            trackedCount = _trackToken(validationStep.path[0], trackedTokens, trackedCount);
            trackedCount = _trackToken(validationStep.path[1], trackedTokens, trackedCount);
            if (validationStep.path[1] == route.tokenOut) {
                producesTokenOut = true;
            }
        }

        require(producesTokenOut, "Route never outputs tokenOut");

        uint256[] memory trackedBalancesBefore;

        // Transfer tokens from user
        if (route.tokenIn != address(0) && route.tokenIn != address(weth)) {
            IERC20(route.tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                route.amountIn
            );
        } else {
            if (msg.value > 0) { // eth swap
                require(msg.value == route.amountIn, "PLS amount mismatch");
                weth.deposit{value: route.amountIn}();
            } else { // weth swap
                IERC20(weth).safeTransferFrom(
                    msg.sender,
                    address(this),
                    route.amountIn
                );
            }
        }

        trackedBalancesBefore = new uint256[](trackedCount);
        for (uint256 i = 0; i < trackedCount; i++) {
            trackedBalancesBefore[i] = _snapshotBalance(trackedTokens[i]);
        }

        SwapExecutionContext memory ctx;
        ctx.totalAmountOut = 0;
        ctx.groupOutputs = new uint256[](route.groupCount);

        for (ctx.i = 0; ctx.i < route.parentGroups.length; ctx.i++) {
            require(route.parentGroups[ctx.i].percent <= 100000, "Invalid parent group percent");

            ctx.groupOutputs[route.parentGroups[ctx.i].id] =
                (route.amountIn * route.parentGroups[ctx.i].percent) /
                100000;
        }

        // Execute all sub-steps
        for (ctx.i = 0; ctx.i < route.steps.length; ctx.i++) {
            SwapStep memory step = route.steps[ctx.i];
            require(step.percent <= 100000, "Invalid step percent");
            
            ctx.stepAmountIn = (ctx.groupOutputs[step.parentGroupId] *
                step.percent) / 100000;
            require(ctx.stepAmountIn > 0, "Invalid sub-step amount");

            ctx.stepOutput = _executeSwapStep(
                step,
                ctx.stepAmountIn,
                route.deadline
            );

            ctx.groupOutputs[step.groupId] += ctx.stepOutput;
            if (step.path[1] == route.tokenOut) {
                ctx.totalAmountOut += ctx.stepOutput;
            }
        }

        require(ctx.totalAmountOut >= route.amountOutMin, "Slippage exceeded");

        // Transfer final output tokens to user
        if (route.tokenOut == address(weth) && route.isETHOut) {
            weth.withdraw(ctx.totalAmountOut);
            console.log("weth.withdraw(ctx.totalAmountOut)");
            (bool success, ) = route.destination.call{value: ctx.totalAmountOut}("");
            require(success, "Failed to send PLS");
        } else {
            IERC20(route.tokenOut).safeTransfer(route.destination, ctx.totalAmountOut);
        }

        uint256 inputBalanceAfter = IERC20(inputAsset).balanceOf(address(this));
        if (inputBalanceAfter > inputBalanceBefore) {
            uint256 leftoverInput = inputBalanceAfter - inputBalanceBefore;
            if (route.tokenIn == address(0)) {
                weth.withdraw(leftoverInput);
                (bool refundSuccess, ) = route.destination.call{value: leftoverInput}("");
                require(refundSuccess, "Failed to refund PLS");
            } else {
                IERC20(inputAsset).safeTransfer(route.destination, leftoverInput);
            }
        }

        for (uint256 i = 0; i < trackedCount; i++) {
            address trackedToken = trackedTokens[i];
            if (trackedToken == route.tokenOut || trackedToken == inputAsset) {
                continue;
            }

            uint256 balanceBefore = trackedBalancesBefore[i];
            uint256 balanceAfter = _snapshotBalance(trackedToken);
            if (balanceAfter > balanceBefore) {
                uint256 surplus = balanceAfter - balanceBefore;
                _returnToken(trackedToken, route.destination, surplus);
            }
        }
    }

    function executeSwap(bytes calldata routeBytes) external payable nonReentrant {
        require(msg.sender == affiliateRouter, "Only affiliate router can call this function");
        SwapRoute memory route = abi.decode(routeBytes, (SwapRoute));
        _executeSwap(route);
    }

    function _executeSwapStep(
        SwapStep memory step,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        bytes32 dexHash = keccak256(bytes(step.dex));
        address router = _resolveRouter(dexHash);
        if (dexHash != DEX_HASH_PULSEX_STABLE) {
            require(router != address(0), "DEX not supported");
        } else {
            require(step.pool == pulsexStablePool, "Invalid PulseX stable pool");
        }
        require(step.path.length == 2, "Invalid path length");
        require(step.path[0] != step.path[1], "Invalid path");

        // console.log("path0", step.path[0], "path1", step.path[1]);

        bool isNativeSwap = step.path[0] == address(0);
        if (!isNativeSwap) {
            if (dexHash == keccak256(bytes("pulsexStable"))) {
                // Approve tokens for the current step
                IERC20(step.path[0]).forceApprove(step.pool, amountIn);
            } else if (dexHash != keccak256(bytes("tide"))) {
                // Approve tokens for the current step
                IERC20(step.path[0]).forceApprove(router, amountIn);
            }
        }

        uint256 stepAmountOut;
        // Execute swap based on DEX type
        if (dexHash == keccak256(bytes("phux"))) {
            // PHUX (Balancer V2 fork) specific swap
            // Disable userData to prevent arbitrary external calls
            require(step.userData.length == 0, "userData not allowed for PHUX swaps");
            
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            
            IPhuxVault.SingleSwap memory singleSwap = IPhuxVault.SingleSwap({
                poolId: IPhuxPool(step.pool).getPoolId(),
                kind: IPhuxVault.SwapKind.GIVEN_IN,
                assetIn: IAsset(step.path[0]),
                assetOut: IAsset(step.path[1]),
                amount: amountIn,
                userData: step.userData
            });

            IPhuxVault.FundManagement memory funds = IPhuxVault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: payable(address(this)),
                toInternalBalance: false
            });

            if (isNativeSwap) {
                IPhuxVault(router).swap{value: amountIn}(
                    singleSwap,
                    funds,
                    0,
                    deadline
                );
            } else {
                IPhuxVault(router).swap(
                    singleSwap,
                    funds,
                    0,
                    deadline
                );
            }
            
            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        } else if (
            dexHash == keccak256(bytes("pulsexV1")) ||
            dexHash == keccak256(bytes("pulsexV2")) ||
            dexHash == keccak256(bytes("9inchV2"))
        ) {
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            if (step.path[0] == address(0)) {
                // PulseX V1/V2 (Uniswap V2 fork) swap
                IPulseXRouter02(router)
                    .swapExactETHForTokensSupportingFeeOnTransferTokens{
                    value: amountIn
                }(0, step.path, address(this), deadline);
            } else if (step.path[1] == address(0)) {
                IPulseXRouter02(router)
                    .swapExactTokensForETHSupportingFeeOnTransferTokens(
                        amountIn,
                        0,
                        step.path,
                        address(this),
                        deadline
                    );
            } else {
                IPulseXRouter02(router)
                    .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                        amountIn,
                        0,
                        step.path,
                        address(this),
                        deadline
                    );
            }
            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        } else if (
            dexHash == keccak256(bytes("9inchV3")) ||
            dexHash == keccak256(bytes("9mmV3")) ||
            dexHash == keccak256(bytes("pDexV3")) ||
            dexHash == keccak256(bytes("dexTop"))
        ) {
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            uint24 fee = I9InchV3Pool(step.pool).fee();

            I9InchSwapRouter(router).exactInput(
                I9InchSwapRouter.ExactInputParams({
                    path: abi.encodePacked(
                        step.path[0],
                        fee,
                        step.path[1]
                    ),
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: 0
                })
            );
            
            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        } else if (dexHash == keccak256(bytes("9mmV2"))) {
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            I9InchSwapRouter(router).swapExactTokensForTokens(
                amountIn,
                0,
                step.path,
                address(this)
            );
            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        } else if (dexHash == keccak256(bytes("pulsexStable"))) {
            uint8 index1 = uint8(step.userData[0]);
            uint8 index2 = uint8(step.userData[1]);
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            IPulseXStableSwapPool(step.pool).exchange(
                index1,
                index2,
                amountIn,
                0
            );
            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        } else if (dexHash == keccak256(bytes("tide"))) {
            uint256 beforeBalance = _snapshotBalance(step.path[1]);
            ITideVault(router).unlock(
                abi.encodeWithSignature(
                    "swapTideVaultHook(address,address,address,uint256)",
                    step.pool,
                    step.path[0],
                    step.path[1],
                    amountIn
                )
            );

            stepAmountOut = _snapshotBalance(step.path[1]) - beforeBalance;
        }

        return stepAmountOut;
    }

    function swapTideVaultHook(address pool, address tokenIn, address tokenOut, uint256 amountIn) external {
        address tideVault = otherDexRouters[DEX_HASH_TIDE];
        require(msg.sender == tideVault, "Only tide vault can call this function");

        (, , uint256 amountOutRaw) = ITideVault(tideVault).swap(
            ITideVault.VaultSwapParams({
                kind: ITideVault.SwapKind.EXACT_IN,
                pool: pool,
                tokenIn: IERC20(tokenIn),
                tokenOut: IERC20(tokenOut),
                amountGivenRaw: amountIn,
                limitRaw: 0,
                userData: ""
            })
        );
        IERC20(tokenIn).safeTransfer(tideVault, amountIn);
        ITideVault(tideVault).settle(IERC20(tokenIn), amountIn);
        ITideVault(tideVault).sendTo(IERC20(tokenOut), address(this), amountOutRaw);
    }

    function _snapshotBalance(address token) internal view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function _setInitialRouters(
        string[] memory keys,
        address[] memory routers
    ) internal {
        require(keys.length == routers.length, "Keys and routers length mismatch");
        for (uint256 i = 0; i < keys.length; i++) {
            bytes32 dexHash = keccak256(bytes(keys[i]));
            require(!_isPulseXHash(dexHash), "PulseX routers are immutable");
            address router = routers[i];
            require(router != address(0), "Router cannot be zero");
            require(otherDexRouters[dexHash] == address(0), "Duplicate DEX key");
            otherDexRouters[dexHash] = router;
        }
    }

    function _resolveRouter(bytes32 dexHash) internal view returns (address) {
        if (dexHash == DEX_HASH_PULSEX_V1) {
            return pulsexV1Router;
        }
        if (dexHash == DEX_HASH_PULSEX_V2) {
            return pulsexV2Router;
        }
        if (dexHash == DEX_HASH_PULSEX_STABLE) {
            return pulsexStablePool;
        }
        return otherDexRouters[dexHash];
    }

    function _isPulseXHash(bytes32 dexHash) internal pure returns (bool) {
        return (
            dexHash == DEX_HASH_PULSEX_V1 ||
            dexHash == DEX_HASH_PULSEX_V2 ||
            dexHash == DEX_HASH_PULSEX_STABLE
        );
    }

    function _trackToken(
        address token,
        address[] memory tokens,
        uint256 count
    ) internal pure returns (uint256) {
        for (uint256 i = 0; i < count; i++) {
            if (tokens[i] == token) {
                return count;
            }
        }
        tokens[count] = token;
        return count + 1;
    }

    function _returnToken(address token, address destination, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        if (token == address(0)) {
            (bool success, ) = destination.call{value: amount}("");
            require(success, "Failed to sweep PLS");
        } else {
            IERC20(token).safeTransfer(destination, amount);
        }
    }

    function setAffiliateRouter(address _affiliateRouter) external onlyOwner {
        affiliateRouter = _affiliateRouter;
    }

    receive() external payable {}

    uint256[50] private __gap;
}
