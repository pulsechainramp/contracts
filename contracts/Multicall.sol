// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Multicall
 * @notice Allows batching multiple view function calls into a single transaction
 * @dev This contract enables efficient querying of multiple contracts' view functions
 *      in a single RPC call, reducing network overhead and improving performance.
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

    /**
     * @notice Execute multiple calls in a single transaction
     * @param calls Array of Call structs containing target addresses and calldata
     * @return results Array of Result structs containing success status and return data
     * @dev This function uses staticcall to ensure it only reads state and doesn't modify it
     *      If a call fails, it will still return a result with success=false
     */
    function multicall(Call[] calldata calls) external view returns (Result[] memory results) {
        results = new Result[](calls.length);
        
        for (uint256 i = 0; i < calls.length; i++) {
            if (calls[i].target != address(0)) {
                (bool success, bytes memory returnData) = calls[i].target.staticcall(calls[i].callData);
                results[i] = Result({
                    success: success,
                    returnData: returnData
                });
            } else {
                // Extract address from callData
                // callData structure: [4 bytes selector][32 bytes address parameter]
                require(calls[i].callData.length >= 36, "Invalid callData length");
                
                // Skip first 4 bytes (function selector) and decode the address
                // Copy bytes 4-36 (the address parameter) to a new bytes array
                bytes memory paramData = new bytes(32);
                for (uint256 j = 0; j < 32; j++) {
                    paramData[j] = calls[i].callData[j + 4];
                }
                address user = abi.decode(paramData, (address));
                
                results[i] = Result({
                    success: true,
                    returnData: abi.encode(user.balance)
                });
            }
        }
    }

    function getTokenBalances(
        address[] calldata tokens,
        address account
    ) external view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            // Use low-level call to handle tokens that might not follow ERC20 standard exactly
            (bool success, bytes memory returnData) = tokens[i].staticcall(
                abi.encodeWithSignature("balanceOf(address)", account)
            );
            
            if (success && returnData.length >= 32) {
                balances[i] = abi.decode(returnData, (uint256));
            } else {
                balances[i] = 0; // Return 0 if call fails
            }
        }
    }

    function getTokenBalancesBatch(
        address[] calldata tokens,
        address[] calldata accounts
    ) external view returns (uint256[][] memory balances) {
        balances = new uint256[][](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = new uint256[](accounts.length);
            
            for (uint256 j = 0; j < accounts.length; j++) {
                (bool success, bytes memory returnData) = tokens[i].staticcall(
                    abi.encodeWithSignature("balanceOf(address)", accounts[j])
                );
                
                if (success && returnData.length >= 32) {
                    balances[i][j] = abi.decode(returnData, (uint256));
                } else {
                    balances[i][j] = 0;
                }
            }
        }
    }
}

