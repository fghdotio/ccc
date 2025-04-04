import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcTimeUnlockWitness,
  parseBtcTimeLockArgs,
  pollForSpvProof,
} from "../../utils/index.js";

import { PredefinedScriptName } from "../../types/script.js";

import { testnetSudtCellDep } from "../common/assets.js";
import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";
import { RgbppTxLogger } from "../common/logger.js";
import { collectBtcTimeLockCells } from "../common/utils.js";

async function unlockBtcTimeLock(btcTimeLockArgs: string) {
  const { rgbppBtcWallet, rgbppUdtClient } = initializeRgbppEnv();

  const btcTimeLockCells = await collectBtcTimeLockCells(
    btcTimeLockArgs,
    rgbppUdtClient,
  );

  const tx = ccc.Transaction.default();

  btcTimeLockCells.forEach((cell) => {
    const cellInput = ccc.CellInput.from({
      previousOutput: cell.outPoint,
    });
    cellInput.completeExtraInfos(ckbClient);

    tx.inputs.push(cellInput);

    tx.addOutput(
      {
        lock: parseBtcTimeLockArgs(cell.cellOutput.lock.args).lock,
        type: cell.cellOutput.type,
        // * https://github.com/utxostack/rgbpp/blob/main/contracts/btc-time-lock/src/main.rs#L97
        // ? Too many details, capacity, cell deps. Encapsulate it in `rgbppUdtClient`?
        capacity: cell.cellOutput.capacity,
      },
      cell.outputData,
    );
  });

  const lockArgs: Set<string> = new Set();
  const btcTimeLockCellDep =
    rgbppUdtClient.getRgbppScriptInfos()[PredefinedScriptName.BtcTimeLock]
      .cellDep;
  tx.cellDeps.push(
    testnetSudtCellDep,
    btcTimeLockCellDep,
    ccc.CellDep.from({
      outPoint: {
        ...btcTimeLockCellDep.outPoint,
        index: 1,
      },
      depType: btcTimeLockCellDep.depType,
    }),
  );

  for await (const btcTimeLockCell of btcTimeLockCells) {
    if (lockArgs.has(btcTimeLockCell.cellOutput.lock.args)) {
      tx.witnesses.push("0x");
      continue;
    }
    lockArgs.add(btcTimeLockCell.cellOutput.lock.args);
    const { btcTxId, confirmations } = parseBtcTimeLockArgs(
      btcTimeLockCell.cellOutput.lock.args,
    );
    const spvProof = await pollForSpvProof(
      rgbppBtcWallet,
      btcTxId,
      confirmations,
    );
    if (!spvProof) {
      throw new Error("Failed to get spv proof");
    }

    tx.cellDeps.push(
      ccc.CellDep.from({
        outPoint: spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );

    tx.witnesses.push(buildBtcTimeUnlockWitness(spvProof.proof));
  }

  await tx.completeFeeBy(ckbSigner);
  const signedTx = await ckbSigner.signTransaction(tx);

  const txHash = await ckbSigner.client.sendTransaction(signedTx);
  await ckbSigner.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "unlock-btc-time-lock" });

unlockBtcTimeLock(
  "0x7d00000010000000590000005d000000490000001000000030000000310000009bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8011400000021e782eeb1c9893b341ed71c2dfe6fa496a6435c060000007d56f9d4e256552292905c792a3769e1ff5e85e2e57fe7a458753b90dfda7ef6",
)
  .then(() => {
    logger.saveOnSuccess();
    process.exit(0);
  })
  .catch((e) => {
    console.log(e.message);
    logger.saveOnError(e);
    process.exit(1);
  });

/* 
pnpm tsx packages/rgbpp/src/examples/udt/4-unlock-btc-time-lock.ts
*/
