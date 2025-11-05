// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockERC20.sol";

contract MockRouter {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external {
        require(path.length == 2, "Invalid path");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(path[1]).mint(to, amountIn);
    }
}
