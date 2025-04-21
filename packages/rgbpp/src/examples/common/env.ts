import { ccc } from "@ckb-ccc/shell";

import dotenv from "dotenv";

import { dirname } from "path";
import { fileURLToPath } from "url";

import { parseAddressType, RgbppBtcWallet } from "../../bitcoin/index.js";
import { ScriptInfo } from "../../types/rgbpp/index.js";

import { CkbRgbppUnlockSinger } from "../../signer/index.js";
import { NetworkConfig, PredefinedNetwork } from "../../types/network.js";
import { RgbppUdtClient } from "../../udt/index.js";
import { buildNetworkConfig, isMainnet } from "../../utils/index.js";

dotenv.config({ path: dirname(fileURLToPath(import.meta.url)) + "/../.env" });

const utxoBasedChainName = process.env.UTXO_BASED_CHAIN_NAME!;
const ckbPrivateKey = process.env.CKB_SECP256K1_PRIVATE_KEY!;
const utxoBasedChainPrivateKey = process.env.UTXO_BASED_CHAIN_PRIVATE_KEY!;
const utxoBasedChainAddressType = process.env.UTXO_BASED_CHAIN_ADDRESS_TYPE!;
const btcAssetsApiUrl = process.env.BTC_ASSETS_API_URL!;
const btcAssetsApiToken = process.env.BTC_ASSETS_API_TOKEN!;
const btcAssetsApiOrigin = process.env.BTC_ASSETS_API_ORIGIN!;

export const ckbClient = isMainnet(utxoBasedChainName)
  ? new ccc.ClientPublicMainnet()
  : new ccc.ClientPublicTestnet();

const addressType = parseAddressType(utxoBasedChainAddressType);

export const ckbSigner = new ccc.SignerCkbPrivateKey(ckbClient, ckbPrivateKey);
// export const ckbAddress = await ckbSigner.getRecommendedAddress();

export function initializeRgbppEnv(scriptInfos?: ScriptInfo[]): {
  networkConfig: NetworkConfig;
  utxoBasedAccountAddress: string;
  rgbppUdtClient: RgbppUdtClient;
  rgbppBtcWallet: RgbppBtcWallet;
  ckbRgbppUnlockSinger: CkbRgbppUnlockSinger;
} {
  const scripts = scriptInfos?.reduce(
    (acc: Record<string, any>, { name, script, cellDep }) => {
      acc.scripts[name] = script;
      acc.cellDeps[name] = cellDep;
      return acc;
    },
    { scripts: {}, cellDeps: {} },
  );

  const networkConfig = buildNetworkConfig(
    utxoBasedChainName as PredefinedNetwork,
    scripts,
  );

  const rgbppUdtClient = new RgbppUdtClient(networkConfig, ckbClient);

  const rgbppBtcWallet = new RgbppBtcWallet(
    utxoBasedChainPrivateKey,
    addressType,
    networkConfig,
    {
      url: btcAssetsApiUrl,
      token: btcAssetsApiToken,
      origin: btcAssetsApiOrigin,
    },
  );

  return {
    networkConfig,
    utxoBasedAccountAddress: rgbppBtcWallet.getAddress(),
    rgbppUdtClient,
    rgbppBtcWallet,
    ckbRgbppUnlockSinger: new CkbRgbppUnlockSinger(
      ckbClient,
      rgbppBtcWallet.getAddress(),
      rgbppBtcWallet,
      rgbppBtcWallet,
      rgbppUdtClient.getRgbppScriptInfos(),
    ),
  };
}
