// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ISwapManager} from "./interfaces/ISwapManager.sol";
import "hardhat/console.sol";

/**
 * @title AffiliateRouter
 * @dev Router contract that takes 3% referral fees and executes swaps through SwapManager
 * Contract parameters are encrypted to prevent easy interpretation by competitors
 */
contract AffiliateRouter is OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public defaultFeeBasisPoints;
    uint256 public totalBasisPoints;
    
    // Referral tracking - permanent relationships
    mapping(address => address) public userReferrer; // user => referrer (permanent)
    mapping(address => mapping(address => uint256)) public referrerEarnings; // referrer => token => amount
    mapping(address => uint256) public userFeeBasisPoints; // user => fee basis points
    
    // Contract state
    ISwapManager public swapManager;
    
    // Events
    event ReferralRegistered(address indexed user, address indexed referrer);
    event SwapExecuted(address indexed user, address indexed referrer, uint256 amountIn, uint256 feeAmount);
    event FeeBasisPointsUpdated(address indexed user, uint256 newFeeBasisPoints);
    event ReferralFeeWithdrawn(address referrer, address token, uint256 amount);
    event ReferralFeeAdded(address user, address referrer, address token, uint256 amount);
    event ReferralFeeAmountUpdated(address referrer, address token, uint256 amount);

    // Modifiers
    modifier onlyValidReferrer(address referrer) {
        require(referrer != address(0) && referrer != msg.sender, "Invalid referrer");
        _;
    }
    
    modifier onlyValidSwap(bytes calldata routeBytes) {
        require(routeBytes.length > 0, "Invalid route data");
        _;
    }
    
    /**
     * @dev Initialize the contract
     * @param _swapManager Address of the SwapManager contract
     */
    function initialize(
        address _swapManager
    ) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        
        require(_swapManager != address(0), "Invalid swap manager");
        
        swapManager = ISwapManager(_swapManager);
        defaultFeeBasisPoints = 10; // 0.1%
        totalBasisPoints = 10000; // 100%
    }
    
    /**
     * @dev Execute swap with referral fee
     * @param routeBytes Encoded swap route data
     * @param referrerCode Referrer address (can be zero for no referral)
     */
    function executeSwap(
        bytes calldata routeBytes,
        address referrerCode
    ) external payable nonReentrant whenNotPaused onlyValidSwap(routeBytes) {
        // Decode the route to get amountIn
        ISwapManager.SwapRoute memory route = abi.decode(routeBytes, (ISwapManager.SwapRoute));
        console.log("route.tokenIn", route.tokenIn);
        console.log("route.amountIn", route.amountIn);
        
        bool isEthSwap = route.tokenIn == address(0) || (route.tokenIn == 0xA1077a294dDE1B09bB078844df40758a5D0f9a27 && msg.value > 0);
        // Validate amount
        if (isEthSwap) {
            require(msg.value == route.amountIn, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not needed for token swap");
        }
        
        // Auto-bind referral relationship if user doesn't have one and referrer code is provided
        if (userReferrer[msg.sender] == address(0) && referrerCode != address(0) && referrerCode != msg.sender) {
            userReferrer[msg.sender] = referrerCode;
            emit ReferralRegistered(msg.sender, referrerCode);
        }
        
        // Get the referrer (either existing or newly bound)
        address referrer = userReferrer[msg.sender];
        
        // Calculate and process referral fee
        uint256 feeAmount = 0;
        if (referrer != address(0)) {
            uint256 feeBasisPoints = getFeeBasisPoints(msg.sender);

            feeAmount = route.amountIn * feeBasisPoints / totalBasisPoints;
            _processReferral(msg.sender, referrer, feeAmount, isEthSwap ? address(0) : route.tokenIn);

            route.amountIn = route.amountIn - feeAmount;
            route.amountOutMin = route.amountOutMin * (totalBasisPoints - feeBasisPoints) / totalBasisPoints;
        }
        
        route.destination = msg.sender;
        bytes memory newRouteBytes = abi.encode(route);
        // Execute the swap through SwapManager with remaining amount
        if (isEthSwap) {
            console.log("route.amountIn", route.amountIn);
            // ETH swap - execute swap with remaining amount after fee deduction
            swapManager.executeSwap{value: route.amountIn}(newRouteBytes);
        } else {
            // Token swap - transfer tokens, take fee, then execute swap with remaining amount
            IERC20(route.tokenIn).safeTransferFrom(msg.sender, address(this), route.amountIn + feeAmount);
            IERC20(route.tokenIn).approve(address(swapManager), route.amountIn);

            // Execute swap with remaining amount
            swapManager.executeSwap(newRouteBytes);
        }

        emit SwapExecuted(msg.sender, referrer, route.amountIn, feeAmount);
    }
    
    /**
     * @dev Withdraw accumulated referral earnings for a specific token
     * @param tokens Token addresses to withdraw (must be provided)
     */
    function withdrawReferralEarnings(address[] memory tokens) external nonReentrant {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = referrerEarnings[msg.sender][token];
            if (amount == 0) {
                continue;
            }

            if (token == address(0)) {
                uint256 contractBalance = address(this).balance;
                require(contractBalance >= amount, "Insufficient ETH balance");

                referrerEarnings[msg.sender][address(0)] = 0;

                (bool success, ) = msg.sender.call{value: amount}("");
                require(success, "Failed to send ETH");

                emit ReferralFeeAmountUpdated(msg.sender, address(0), 0);
                emit ReferralFeeWithdrawn(msg.sender, address(0), amount);
            } else {
                // Check if contract has enough tokens
                uint256 contractBalance = IERC20(token).balanceOf(address(this));
                require(contractBalance >= amount, "Insufficient token balance");
                
                referrerEarnings[msg.sender][token] = 0;
                IERC20(token).safeTransfer(msg.sender, amount);

                emit ReferralFeeAmountUpdated(msg.sender, token, 0);
                emit ReferralFeeWithdrawn(msg.sender, token, amount);
            }
        }
    }
    
    /**
     * @dev Get referrer earnings for a specific token
     * @param referrer Address of the referrer
     * @param token Token address
     * @return earnings Amount of earnings for this token
     */
    function getReferrerEarnings(address referrer, address token) external view returns (uint256 earnings) {
        return referrerEarnings[referrer][token];
    }

    /**
     * @dev Process referral and update earnings
     * @param user Address of the user
     * @param referrer Address of the referrer
     * @param feeAmount Fee amount
     * @param token Token being swapped
     */
    function _processReferral(
        address user,
        address referrer,
        uint256 feeAmount,
        address token
    ) internal {
        // Add to referrer's earnings for this specific token
        referrerEarnings[referrer][token] += feeAmount;

        emit ReferralFeeAdded(user, referrer, token, feeAmount);
        emit ReferralFeeAmountUpdated(referrer, token, referrerEarnings[referrer][token]);
    }

    function updateFeeBasisPoints(uint256 newFeeBasisPoints) external {
        require(newFeeBasisPoints <= totalBasisPoints, "Fee cannot exceed total");
        require(newFeeBasisPoints >= 10 && newFeeBasisPoints <= 300, "not valid fee basis points");
        
        userFeeBasisPoints[msg.sender] = newFeeBasisPoints;
        
        emit FeeBasisPointsUpdated(msg.sender, newFeeBasisPoints);
    }

    function getFeeBasisPoints(address user) public view returns (uint256 feeBasisPoints) {
        feeBasisPoints = userFeeBasisPoints[user];
        if (feeBasisPoints == 0) {
            feeBasisPoints = defaultFeeBasisPoints;
        }

        return feeBasisPoints;
    }
    
    /**
     * @dev Pause the contract (owner only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency withdraw tokens (owner only)
     * @param token Token to withdraw
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        
        if (token == address(0)) {
            require(amount <= address(this).balance, "Insufficient ETH balance");
            (bool success, ) = to.call{value: amount}("");
            require(success, "Failed to send ETH");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
    
    /**
     * @dev Receive ETH
     */
    receive() external payable {}
} 