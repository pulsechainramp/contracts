// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IPulseXStableSwapPool {
    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256);
    function add_liquidity(uint256[2] memory _amounts, uint256 _min_mint_amount) external;
    function remove_liquidity(uint256 _burn_amount, uint256[2] memory _min_amounts) external;
    function remove_liquidity_one_coin(uint256 _burn_amount, int128 i, uint256 _min_amount) external;
    function coins(uint256 i) external view returns (address);
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external;
}

