#!/usr/bin/env node

/**
 * Sync compiled contract ABIs into dependent repos (frontend + routing API).
 *
 * Run via `npm run sync-abis` after `hardhat compile`, or rely on the `npm run compile`
 * script which bundles both steps.
 */

const { copyFileSync, existsSync, mkdirSync } = require("fs");
const { dirname, resolve } = require("path");

const ROOT = resolve(__dirname, "..");

/**
 * Contracts whose ABIs should propagate into downstream packages.
 * Extend this list as new shared contracts are introduced.
 */
const contractsToSync = [
  {
    artifact: resolve(
      ROOT,
      "artifacts",
      "contracts",
      "AffiliateRouter.sol",
      "AffiliateRouter.json"
    ),
    targets: [
      resolve(
        ROOT,
        "..",
        "aggregator-frontend",
        "src",
        "abis",
        "AffiliateRouter.json"
      ),
      resolve(ROOT, "..", "routing-api", "src", "abis", "AffiliateRouter.json"),
    ],
  },
];

function ensureFileExists(path) {
  if (!existsSync(path)) {
    throw new Error(
      `Missing artifact at ${path}. Run "npx hardhat compile" first to generate it.`
    );
  }
}

function syncAbi({ artifact, targets }) {
  ensureFileExists(artifact);

  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(artifact, target);
    console.log(`Synced ABI from ${artifact} -> ${target}`);
  }
}

function main() {
  contractsToSync.forEach(syncAbi);
}

main();
