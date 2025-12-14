#!/usr/bin/env node

/**
 * Sync compiled contract ABIs into dependent repos (frontend + routing API).
 *
 * Run via `npm run sync-abis` after `hardhat compile`, or rely on the `npm run compile`
 * script which bundles both steps.
 */

const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
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
  {
    artifact: resolve(ROOT, "abis", "Hex.json"),
    targets: [
      resolve(ROOT, "..", "aggregator-frontend", "src", "abis", "Hex.json"),
      resolve(ROOT, "..", "routing-api", "src", "abis", "Hex.json"),
    ],
  },
];

const helpersToSync = [
  {
    source: resolve(ROOT, "src", "networks", "hex.ts"),
    target: resolve(
      ROOT,
      "..",
      "aggregator-frontend",
      "src",
      "features",
      "hexStaking",
      "hexNetwork.ts"
    ),
  },
  {
    source: resolve(ROOT, "src", "hex.ts"),
    target: resolve(
      ROOT,
      "..",
      "aggregator-frontend",
      "src",
      "features",
      "hexStaking",
      "hexClient.ts"
    ),
    rewrites: [
      { from: '../abis/Hex.json', to: '../../abis/Hex.json' },
      { from: './networks/hex', to: './hexNetwork' },
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
  helpersToSync.forEach(({ source, target, rewrites }) => {
    ensureFileExists(source);
    mkdirSync(dirname(target), { recursive: true });
    let content = readFileSync(source, "utf8");
    if (Array.isArray(rewrites)) {
      rewrites.forEach(({ from, to }) => {
        content = content.replace(new RegExp(from, "g"), to);
      });
    }
    writeFileSync(target, content);
    console.log(`Synced helper from ${source} -> ${target}`);
  });
}

main();
