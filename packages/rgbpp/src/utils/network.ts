import {
  predefinedCellDeps,
  predefinedScripts,
} from "../configs/scripts/index.js";

import {
  Network,
  NetworkConfig,
  NetworkConfigOverrides,
  PredefinedNetwork,
} from "../types/network.js";
import {
  CellDepSet,
  PredefinedScriptName,
  ScriptSet,
} from "../types/script.js";

import {
  DEFAULT_DUST_LIMIT,
  DEFAULT_FEE_RATE,
} from "../configs/scripts/index.js";

export function buildNetworkConfig(
  network: Network,
  overrides?: NetworkConfigOverrides,
): NetworkConfig {
  let config: NetworkConfig;

  switch (network) {
    case PredefinedNetwork.BitcoinTestnet3:
      config = {
        name: PredefinedNetwork.BitcoinTestnet3,
        isMainnet: false,
        btcDustLimit: overrides?.btcDustLimit || DEFAULT_DUST_LIMIT,
        btcFeeRate: overrides?.btcFeeRate || DEFAULT_FEE_RATE,
        scripts: predefinedScripts[PredefinedNetwork.BitcoinTestnet3],
        cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinTestnet3],
      };
      break;
    case PredefinedNetwork.BitcoinSignet:
      config = {
        name: PredefinedNetwork.BitcoinSignet,
        isMainnet: false,
        btcDustLimit: overrides?.btcDustLimit || DEFAULT_DUST_LIMIT,
        btcFeeRate: overrides?.btcFeeRate || DEFAULT_FEE_RATE,
        scripts: predefinedScripts[PredefinedNetwork.BitcoinSignet],
        cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinSignet],
      };
      break;
    case PredefinedNetwork.BitcoinMainnet:
      config = {
        name: PredefinedNetwork.BitcoinMainnet,
        isMainnet: true,
        btcDustLimit: overrides?.btcDustLimit || DEFAULT_DUST_LIMIT,
        btcFeeRate: overrides?.btcFeeRate || DEFAULT_FEE_RATE,
        scripts: predefinedScripts[PredefinedNetwork.BitcoinMainnet],
        cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinMainnet],
      };
      break;
    default:
      // if not in PredefinedNetwork, predefinedScripts and predefinedCellDeps must be provided
      if (!overrides?.scripts || !overrides?.cellDeps) {
        throw new Error(
          `For custom network ${network}, predefinedScripts and predefinedCellDeps must be provided`,
        );
      }
      const { scripts, cellDeps } = overrides;

      // Ensure all required scripts and cellDeps are provided
      const requiredScripts = Object.values(PredefinedScriptName);
      const missingScripts = requiredScripts.filter((name) => !scripts[name]);
      const missingCellDeps = requiredScripts.filter((name) => !cellDeps[name]);

      if (missingScripts.length > 0 || missingCellDeps.length > 0) {
        throw new Error(
          `For custom network ${network}, missing required scripts: ${missingScripts.join(", ")} or cellDeps: ${missingCellDeps.join(", ")}`,
        );
      }

      config = {
        name: network,
        isMainnet: false,
        btcDustLimit: overrides?.btcDustLimit || DEFAULT_DUST_LIMIT,
        btcFeeRate: overrides?.btcFeeRate || DEFAULT_FEE_RATE,
        scripts: scripts as ScriptSet,
        cellDeps: cellDeps as CellDepSet,
      };
      break;
  }

  return overrides ? mergeConfigs(config, overrides) : config;
}

function mergeConfigs(
  base: NetworkConfig,
  overrides: NetworkConfigOverrides,
): NetworkConfig {
  return {
    name: base.name,
    isMainnet: base.isMainnet,
    btcDustLimit: overrides?.btcDustLimit || base.btcDustLimit,
    btcFeeRate: overrides?.btcFeeRate || base.btcFeeRate,
    scripts: Object.assign(
      {},
      base.scripts,
      overrides.scripts || {},
    ) as ScriptSet,
    cellDeps: Object.assign(
      {},
      base.cellDeps,
      overrides.cellDeps || {},
    ) as CellDepSet,
  };
}

export function isMainnet(network: Network): boolean {
  return network === PredefinedNetwork.BitcoinMainnet;
}
