// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBasisPoints;

    constructor(uint256 feeBps) ERC20("Mock Fee Token", "MFT") {
        require(feeBps <= 1000, "Fee too high"); // <=10%
        feeBasisPoints = feeBps;
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || value == 0 || feeBasisPoints == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * feeBasisPoints) / 10000;
        uint256 amountAfterFee = value - fee;

        super._update(from, to, amountAfterFee);
        if (fee > 0) {
            super._update(from, address(0), fee); // burn fee
        }
    }
}
