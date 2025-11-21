# Add Multicall with native balance support and validated deployment

## Summary
- Introduce a Multicall contract that batches view calls and supports native balance lookups via `address(0)`, with selector constants and tests for single/batch ERC20/native flows.
- Update deployment tooling to deploy or reuse Multicall with runtime bytecode verification, add a standalone `deployMulticall` script, and document the optional `MULTICALL_ADDRESS` env (example provided).
- Extend README with Multicall-only deployment instructions and ensure scripts fail fast on mismatched bytecode.

## Testing
- `npx hardhat test`
