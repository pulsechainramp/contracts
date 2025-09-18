// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/I9InchV3PoolImmutables.sol';
// import './pool/I9InchV3PoolState.sol';
// import './pool/I9InchV3PoolDerivedState.sol';
import './pool/I9InchV3PoolActions.sol';
// import './pool/I9InchV3PoolOwnerActions.sol';
// import './pool/I9InchV3PoolEvents.sol';

/// @title The interface for a NineinchSwap V3 Pool
/// @notice A NineinchSwap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface I9InchV3Pool is
    I9InchV3PoolImmutables,
    I9InchV3PoolActions
{

}
