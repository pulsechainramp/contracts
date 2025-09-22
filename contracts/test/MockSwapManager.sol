// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISwapManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal mock that satisfies the interface and accepts any route bytes.
contract MockSwapManager is ISwapManager {
    // Dummy storage to satisfy interface getters (not used by tests)
    mapping(string => address) private _dexRouters;
    address private _affiliateRouter;
    IWETH9 private _weth;

    function dexRouters(string calldata k) external view override returns (address) {
        return _dexRouters[k];
    }
    function affiliateRouter() external view override returns (address) {
        return _affiliateRouter;
    }
    function weth() external view override returns (IWETH9) {
        return _weth;
    }

    function initialize(address _aff) external override { _affiliateRouter = _aff; }
    function setDexRouters(string[] calldata, address[] calldata) external override {}
    function setAffiliateRouter(address _aff) external override { _affiliateRouter = _aff; }

    // The router under test will call this with whatever remains after fees.
    function executeSwap(bytes calldata /*routeBytes*/) external payable override {
        // no-op
    }

    function rescueTokens(address token, address to) external override {
        if (token == address(0)) {
            (bool s,) = to.call{value: address(this).balance}("");
            require(s, "eth xfer fail");
        } else {
            IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
        }
    }

    receive() external payable {}
}
