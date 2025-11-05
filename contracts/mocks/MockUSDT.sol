// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        uint256 currentAllowance = allowance(_msgSender(), spender);
        if (currentAllowance != 0 && amount != 0) {
            revert("NON_ZERO_ALLOWANCE");
        }
        return super.approve(spender, amount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
