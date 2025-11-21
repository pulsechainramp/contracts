// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Multicall
 * @notice Batches multiple view calls to reduce RPC round trips.
 * @dev Passing `target = address(0)` and `callData = abi.encodeWithSelector(BALANCE_OF_SELECTOR, account)`
 *      returns the native balance of `account` (encoded as uint256) and always reports `success = true`.
 */
contract Multicall {
    struct Call {
        address target;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    // keccak256("balanceOf(address)")
    bytes4 private constant BALANCE_OF_SELECTOR = 0x70a08231;

    /**
     * @notice Execute multiple static calls in a single view.
     * @param calls Array of Call structs containing target and calldata.
     * @return results Array of Result structs mirroring each call's outcome.
     * @dev When target == address(0), the callData is expected to encode a single address parameter
     *      using the BALANCE_OF selector; the native balance for that address is returned.
     */
    function multicall(Call[] calldata calls) external view returns (Result[] memory results) {
        results = new Result[](calls.length);

        for (uint256 i = 0; i < calls.length; i++) {
            if (calls[i].target != address(0)) {
                (bool success, bytes memory returnData) = calls[i].target.staticcall(calls[i].callData);
                results[i] = Result({success: success, returnData: returnData});
                continue;
            }

            bytes memory callData = calls[i].callData;
            require(callData.length >= 4 + 32, "Invalid callData length");

            // Copy the encoded address parameter (skip selector)
            bytes memory paramData = new bytes(callData.length - 4);
            for (uint256 j = 0; j < paramData.length; j++) {
                paramData[j] = callData[j + 4];
            }
            address account = abi.decode(paramData, (address));
            results[i] = Result({success: true, returnData: abi.encode(account.balance)});
        }
    }

    /**
     * @notice Fetch balances for a list of tokens for a single account.
     * @dev `address(0)` tokens return the native balance for the account.
     */
    function getTokenBalances(address[] calldata tokens, address account) external view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];

            if (token == address(0)) {
                balances[i] = account.balance;
                continue;
            }

            (bool success, bytes memory returnData) = token.staticcall(
                abi.encodeWithSelector(BALANCE_OF_SELECTOR, account)
            );

            balances[i] = success && returnData.length >= 32 ? abi.decode(returnData, (uint256)) : 0;
        }
    }

    /**
     * @notice Fetch balances for multiple tokens across multiple accounts.
     * @dev `address(0)` tokens return native balances; failures return zero.
     */
    function getTokenBalancesBatch(
        address[] calldata tokens,
        address[] calldata accounts
    ) external view returns (uint256[][] memory balances) {
        balances = new uint256[][](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256[] memory row = new uint256[](accounts.length);

            for (uint256 j = 0; j < accounts.length; j++) {
                if (token == address(0)) {
                    row[j] = accounts[j].balance;
                    continue;
                }

                (bool success, bytes memory returnData) = token.staticcall(
                    abi.encodeWithSelector(BALANCE_OF_SELECTOR, accounts[j])
                );

                row[j] = success && returnData.length >= 32 ? abi.decode(returnData, (uint256)) : 0;
            }

            balances[i] = row;
        }
    }
}
