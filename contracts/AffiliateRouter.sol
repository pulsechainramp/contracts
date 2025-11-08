// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ISwapManager} from "./interfaces/ISwapManager.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title AffiliateRouter
 * @dev Router contract that takes 3% referral fees and executes swaps through SwapManager
 * Contract parameters are encrypted to prevent easy interpretation by competitors
 */
contract AffiliateRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public defaultFeeBasisPoints;
    uint256 public totalBasisPoints;
    
    // Referral tracking - permanent relationships
    mapping(address => address) public userReferrer; // user => referrer (permanent)
    mapping(address => mapping(address => uint256)) public referrerEarnings; // referrer => token => amount
    mapping(address => uint256) public userFeeBasisPoints; // user => fee basis points
    
    // Contract state
    ISwapManager public swapManager;
    address public defaultReferrer;
    uint256 public defaultReferrerBasisPoints;
    struct ReferralPromo {
        address firstReferrer;
        uint64 boundAt;
        uint16 promoBps;
        uint8 promoRemaining;
    }

    mapping(address => ReferralPromo) public referral;
    uint256 public referralCreationFee;
    mapping(address => bool) public referralCreationFeePaid;
    address payable public referralFeeRecipient;
    uint256 public constant MAX_REFERRAL_CREATION_FEE = 100_000 ether;
    uint16 public constant PROMO_CAP_MIN_BPS = 100; // 1.0%
    uint16 public constant PROMO_CAP_MAX_BPS = 300; // 3.0%
    uint16 public constant DEFAULT_TAIL_BPS = 100; // 1.0%
    uint16 public maxPromoBps;
    uint16 public tailBps;
    uint8 public constant PROMO_SWAP_COUNT = 3;
    
    // Events
    event ReferralRegistered(address indexed user, address indexed referrer);
    event ReferralBound(address indexed user, address indexed referrer, uint256 boundAt, uint16 promoBps);
    event PromoConsumed(address indexed user, address indexed referrer, uint8 remaining);
    event SwapExecuted(address indexed user, address indexed referrer, uint256 amountIn, uint256 feeAmount);
    event FeeBasisPointsUpdated(address indexed user, uint256 newFeeBasisPoints);
    event ReferralFeeWithdrawn(address referrer, address token, uint256 amount);
    event ReferralFeeAdded(address user, address referrer, address token, uint256 amount);
    event ReferralFeeAmountUpdated(address referrer, address token, uint256 amount);
    event DefaultReferrerUpdated(address indexed referrer, uint256 feeBasisPoints);
    event ReferralCreationFeePaid(address indexed payer, uint256 amount);
    event ReferralCreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event ReferralFeeRecipientUpdated(address indexed newRecipient);
    event MaxPromoBpsUpdated(uint16 newMaxPromoBps);

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
    constructor(
        address _swapManager
    ) Ownable(msg.sender) {
        require(_swapManager != address(0), "Invalid swap manager");
        
        swapManager = ISwapManager(_swapManager);
        defaultFeeBasisPoints = 100; // 1.0%
        totalBasisPoints = 10000; // 100%
        defaultReferrer = address(0);
        defaultReferrerBasisPoints = 100; // 1.0%
        referralCreationFee = 0;
        referralFeeRecipient = payable(msg.sender);
        maxPromoBps = PROMO_CAP_MAX_BPS;
        tailBps = DEFAULT_TAIL_BPS;
    }
    
    /**
     * @dev Execute swap with referral fee
     * @param routeBytes Encoded swap route data
     * @param referrerCode Referrer address (can be zero for no referral)
     */
    function executeSwap(
        bytes calldata routeBytes,
        address referrerCode
    ) external payable nonReentrant onlyValidSwap(routeBytes) {
        ISwapManager.SwapRoute memory route = abi.decode(routeBytes, (ISwapManager.SwapRoute));

        bool isEthSwap = route.tokenIn == address(0) ||
            (route.tokenIn == 0xA1077a294dDE1B09bB078844df40758a5D0f9a27 && msg.value > 0);

        if (isEthSwap) {
            require(msg.value == route.amountIn, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not needed for token swap");
        }

        if (referrerCode != address(0) && referrerCode != msg.sender) {
            _bindFirst(msg.sender, referrerCode, uint16(getFeeBasisPoints(referrerCode)));
        }

        (address referrer, uint16 feeBasisPoints, bool consumePromo) = _computeReferral(
            msg.sender
        );

        uint256 originalAmountIn = route.amountIn;
        uint256 originalAmountOutMin = route.amountOutMin;
        uint256 feeAmount = 0;

        require(feeBasisPoints < totalBasisPoints, "Fee exceeds total basis points");

        route.destination = msg.sender;

        if (isEthSwap) {
            if (referrer != address(0) && feeBasisPoints > 0) {
                feeAmount = Math.mulDiv(originalAmountIn, feeBasisPoints, totalBasisPoints);
                if (feeAmount > 0) {
                    uint256 swapAmount = originalAmountIn - feeAmount;
                    require(swapAmount > 0, "Insufficient amount after fees");

                    uint256 scaledMin = Math.mulDiv(originalAmountOutMin, swapAmount, originalAmountIn);
                    if (originalAmountOutMin > 0 && scaledMin == 0) {
                        scaledMin = 1;
                    }

                    route.amountIn = swapAmount;
                    route.amountOutMin = scaledMin;

                    _processReferral(msg.sender, referrer, feeAmount, address(0));
                }
            }

            bytes memory newRouteBytes = abi.encode(route);
            swapManager.executeSwap{value: route.amountIn}(newRouteBytes);
        } else {
            IERC20 tokenIn = IERC20(route.tokenIn);
            uint256 balanceBefore = tokenIn.balanceOf(address(this));
            tokenIn.safeTransferFrom(msg.sender, address(this), originalAmountIn);
            uint256 received = tokenIn.balanceOf(address(this)) - balanceBefore;
            require(received > 0, "No tokens received");

            if (referrer != address(0) && feeBasisPoints > 0) {
                feeAmount = Math.mulDiv(received, feeBasisPoints, totalBasisPoints);
                if (feeAmount > 0) {
                    _processReferral(msg.sender, referrer, feeAmount, route.tokenIn);
                }
            }

            uint256 swapAmount = received - feeAmount;
            require(swapAmount > 0, "Insufficient amount after fees");

            uint256 scaledMin = Math.mulDiv(originalAmountOutMin, swapAmount, originalAmountIn);
            if (originalAmountOutMin > 0 && scaledMin == 0) {
                scaledMin = 1;
            }

            route.amountIn = swapAmount;
            route.amountOutMin = scaledMin;

            bytes memory newRouteBytes = abi.encode(route);
            tokenIn.forceApprove(address(swapManager), swapAmount);
            swapManager.executeSwap(newRouteBytes);
        }

        _afterSwapConsumePromo(msg.sender, consumePromo);

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
     * @param tokens Token addresses
     * @return earnings Amount of earnings for this token
     */
    function getReferrerEarnings(address referrer, address[] memory tokens) external view returns (uint256[] memory earnings) {
        earnings = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            earnings[i] = referrerEarnings[referrer][token];
        }
    }

    function _bindFirst(
        address user,
        address ref,
        uint16 affiliateBps
    ) internal {
        if (ref == address(0) || ref == user) {
            return;
        }

        ReferralPromo storage promo = referral[user];

        if (promo.firstReferrer != address(0) || userReferrer[user] != address(0)) {
            return;
        }

        _requireEligibleReferrer(ref);

        uint16 promoBps = affiliateBps > maxPromoBps ? maxPromoBps : affiliateBps;

        promo.firstReferrer = ref;
        promo.boundAt = uint64(block.timestamp);
        promo.promoBps = promoBps;
        promo.promoRemaining = PROMO_SWAP_COUNT;

        if (userReferrer[user] == address(0)) {
            userReferrer[user] = ref;
            emit ReferralRegistered(user, ref);
        }

        emit ReferralBound(user, ref, block.timestamp, promoBps);
    }

    function _computeReferral(
        address user
    ) internal view returns (address referrer, uint16 bps, bool willConsumePromo) {
        ReferralPromo memory promo = referral[user];

        if (promo.firstReferrer != address(0)) {
            (uint16 effectiveBps, bool consume) = _effectiveBps(promo);
            return (promo.firstReferrer, effectiveBps, consume);
        }

        address legacyRef = userReferrer[user];
        if (legacyRef != address(0)) {
            uint16 legacyBps = uint16(getFeeBasisPoints(legacyRef));
            uint16 effectiveTail = legacyBps < tailBps ? legacyBps : tailBps;
            return (legacyRef, effectiveTail, false);
        }

        if (defaultReferrer != address(0)) {
            uint16 defaultTail = defaultReferrerBasisPoints <= tailBps
                ? uint16(defaultReferrerBasisPoints)
                : tailBps;
            return (defaultReferrer, defaultTail, false);
        }

        return (address(0), 0, false);
    }

    function _effectiveBps(
        ReferralPromo memory promo
    ) internal view returns (uint16 bps, bool willConsumePromo) {
        if (promo.firstReferrer == address(0)) {
            return (0, false);
        }

        if (promo.promoRemaining > 0) {
            uint16 currentBps = uint16(getFeeBasisPoints(promo.firstReferrer));
            uint16 cappedPromo = currentBps < maxPromoBps ? currentBps : maxPromoBps;
            return (cappedPromo, true);
        }

        uint16 referrerBps = uint16(getFeeBasisPoints(promo.firstReferrer));
        uint16 effectiveTail = referrerBps < tailBps ? referrerBps : tailBps;

        return (effectiveTail, false);
    }

    function _afterSwapConsumePromo(address user, bool consumed) internal {
        if (!consumed) {
            return;
        }

        ReferralPromo storage promo = referral[user];

        if (promo.promoRemaining > 0) {
            unchecked {
                promo.promoRemaining -= 1;
            }
            emit PromoConsumed(user, promo.firstReferrer, promo.promoRemaining);
        }
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

    function _requireEligibleReferrer(address referrer) internal view {
        if (referralCreationFee == 0) {
            return;
        }

        require(referralCreationFeePaid[referrer], "Referrer must pay creation fee");
    }

    function updateFeeBasisPoints(uint256 newFeeBasisPoints) external {
        require(newFeeBasisPoints <= totalBasisPoints, "Fee cannot exceed total");
        require(newFeeBasisPoints >= 10 && newFeeBasisPoints <= 300, "not valid fee basis points");
        _requireEligibleReferrer(msg.sender);
        
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
     * @dev Update the default referrer address (owner only). Set to zero address to disable fallback.
     */
    function setDefaultReferrer(address _defaultReferrer) external onlyOwner {
        defaultReferrer = _defaultReferrer;
        emit DefaultReferrerUpdated(_defaultReferrer, defaultReferrerBasisPoints);
    }

    function payReferralCreationFee() external payable nonReentrant {
        require(!referralCreationFeePaid[msg.sender], "Referral creation fee already paid");

        uint256 fee = referralCreationFee;
        require(fee > 0, "Referral creation fee disabled");
        require(msg.value >= fee, "Insufficient referral creation fee");

        referralCreationFeePaid[msg.sender] = true;

        address payable recipient = referralFeeRecipient;
        if (recipient == address(0)) {
            recipient = payable(owner());
        }

        Address.sendValue(recipient, fee);

        if (msg.value > fee) {
            Address.sendValue(payable(msg.sender), msg.value - fee);
        }

        emit ReferralCreationFeePaid(msg.sender, fee);
    }

    function setReferralCreationFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_REFERRAL_CREATION_FEE, "Fee too high");
        uint256 oldFee = referralCreationFee;
        referralCreationFee = newFee;
        emit ReferralCreationFeeUpdated(oldFee, newFee);
    }

    function setReferralFeeRecipient(address payable newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid fee recipient");
        referralFeeRecipient = newRecipient;
        emit ReferralFeeRecipientUpdated(newRecipient);
    }

    function setMaxPromoBps(uint16 newMaxPromoBps) external onlyOwner {
        require(newMaxPromoBps >= PROMO_CAP_MIN_BPS && newMaxPromoBps <= PROMO_CAP_MAX_BPS, "Invalid promo cap");
        maxPromoBps = newMaxPromoBps;
        emit MaxPromoBpsUpdated(newMaxPromoBps);
    }

    function hasPaidReferralCreationFee(address account) external view returns (bool) {
        return referralCreationFeePaid[account];
    }
    
    
    /**
     * @dev Receive ETH
     */
    receive() external payable {}

    uint256[50] private __gap;
}
