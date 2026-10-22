import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

// Besu runs one zero-base-fee QBFT node per participant (besu/docker-compose.yml). Each node's RPC is on its own
// port; gasPrice 0 because the chain charges no gas (genesis zeroBaseFee, --min-gas-price=0). The deployer account
// is the market operator's node key, passed as DEPLOYER_KEY by scripts/deploy.ts' wrapper (see README).
const deployerKey = process.env.DEPLOYER_KEY;
const besuAccounts = deployerKey ? [deployerKey] : [];

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    // The Besu genesis activates Berlin + London only (no Shanghai), so the EVM has no PUSH0. solc defaults to the
    // cancun target and would emit PUSH0/MCOPY, which revert as invalid opcodes on this chain — pin to london.
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "london" },
  },
  networks: {
    // In-memory EDR network for unit and property tests.
    hardhat: {
      type: "edr-simulated",
      chainId: 1337,
    },
    // The running local Besu network, market operator node (besu-mkt, JSON-RPC 8545).
    besuMkt: {
      type: "http",
      url: process.env.BESU_RPC_URL ?? "http://localhost:8545",
      chainId: 1337,
      gasPrice: 0,
      accounts: besuAccounts,
    },
  },
};

export default config;
