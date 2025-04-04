import { sha256 } from "js-sha256";

import { bytesFrom, ccc, Hex, hexFrom } from "@ckb-ccc/shell";

import { blockchain } from "@ckb-lumos/base";
import {
  blake2b,
  hexToBytes,
  PERSONAL,
  serializeOutPoint,
  serializeOutput,
} from "@nervosnetwork/ckb-sdk-utils";

import { convertToOutput, InitOutput, TxOutput } from "../bitcoin/index.js";

import {
  BLANK_TX_ID,
  BTC_TX_PSEUDO_INDEX,
  DEFAULT_CONFIRMATIONS,
  RGBPP_MAX_CELL_NUM,
  TX_ID_PLACEHOLDER,
} from "../constants/index.js";
import { Script } from "../schemas/generated/blockchain.js";

import {
  BTCTimeLock,
  RGBPPUnlock,
  Uint16,
} from "../schemas/generated/rgbpp.js";
import { RgbppUdtToken, UtxoSeal } from "../types/rgbpp/rgbpp.js";
import { RgbppUdtClient } from "../udt/index.js";
import { isSameScriptTemplate, isUsingOneOfScripts } from "./script.js";
import {
  prependHexPrefix,
  reverseHexByteOrder,
  trimHexPrefix,
  u32ToHex,
  u32ToLe,
  u64ToLe,
  u8ToHex,
  utf8ToHex,
} from "./encoder.js";

export const encodeRgbppUdtToken = (token: RgbppUdtToken): string => {
  const decimal = u8ToHex(token.decimal);
  const name = trimHexPrefix(utf8ToHex(token.name));
  const nameSize = trimHexPrefix(u8ToHex(name.length / 2));
  const symbol = trimHexPrefix(utf8ToHex(token.symbol));
  const symbolSize = trimHexPrefix(u8ToHex(symbol.length / 2));
  return `${decimal}${nameSize}${name}${symbolSize}${symbol}`;
};

/**
 * https://learnmeabitcoin.com/technical/general/byte-order/
 * Whenever you're working with transaction/block hashes internally (e.g. inside raw bitcoin data), you use the natural byte order.
 * Whenever you're displaying or searching for transaction/block hashes, you use the reverse byte order.
 */
export const buildRgbppLockArgs = (utxoSeal: UtxoSeal): Hex => {
  return prependHexPrefix(
    `${u32ToHex(utxoSeal.index, true)}${btcTxIdInReverseByteOrder(
      utxoSeal.txId,
    )}`,
  );
};

export function btcTxIdInReverseByteOrder(btcTxId: string): string {
  return trimHexPrefix(reverseHexByteOrder(prependHexPrefix(btcTxId)));
}

export function pseudoRgbppLockArgs(): Hex {
  return buildRgbppLockArgs({
    txId: TX_ID_PLACEHOLDER,
    index: BTC_TX_PSEUDO_INDEX,
  });
}

export function pseudoRgbppLockArgsForCommitment(index: number): Hex {
  return buildRgbppLockArgs({
    txId: BLANK_TX_ID,
    index,
  });
}

export const buildBtcTimeLockArgs = (
  receiverLock: ccc.Script,
  btcTxId: string,
  confirmations = DEFAULT_CONFIRMATIONS,
): Hex => {
  const btcTxid = blockchain.Byte32.pack(
    reverseHexByteOrder(prependHexPrefix(btcTxId)),
  );
  const lockScript = Script.unpack(receiverLock.toBytes());
  return hexFrom(
    BTCTimeLock.pack({
      lockScript,
      after: confirmations,
      btcTxid,
    }),
  );
};

export const buildUniqueTypeArgs = (
  firstInput: ccc.CellInput,
  firstOutputIndex: number,
) => {
  const input = bytesFrom(firstInput.toBytes());
  const s = blake2b(32, null, null, PERSONAL);
  s.update(input);
  s.update(bytesFrom(prependHexPrefix(u64ToLe(BigInt(firstOutputIndex)))));
  return prependHexPrefix(`${s.digest("hex").slice(0, 40)}`);
};

export const buildRgbppUnlock = (
  btcLikeTxBytes: string,
  btcLikeTxProof: Hex,
  inputLen: number,
  outputLen: number,
) => {
  return hexFrom(
    RGBPPUnlock.pack({
      version: Uint16.pack([0, 0]),
      extraData: {
        inputLen: u8ToHex(inputLen),
        outputLen: u8ToHex(outputLen),
      },
      btcTx: prependHexPrefix(btcLikeTxBytes),
      btcTxProof: prependHexPrefix(btcLikeTxProof),
    }),
  );
};

// The maximum length of inputs and outputs is 255, and the field type representing the length in the RGB++ protocol is Uint8
// refer to https://github.com/ckb-cell/rgbpp/blob/0c090b039e8d026aad4336395b908af283a70ebf/contracts/rgbpp-lock/src/main.rs#L173-L211
export const calculateCommitment = (ckbPartialTx: ccc.Transaction): string => {
  const hash = sha256.create();
  hash.update(hexToBytes(utf8ToHex("RGB++")));
  const version = [0, 0];
  hash.update(version);

  const { inputs, outputs, outputsData } = ckbPartialTx;

  if (
    inputs.length > RGBPP_MAX_CELL_NUM ||
    outputs.length > RGBPP_MAX_CELL_NUM
  ) {
    throw new Error(
      "The inputs or outputs length of RGB++ CKB virtual tx cannot be greater than 255",
    );
  }
  hash.update([inputs.length, outputs.length]);

  for (const input of inputs) {
    const outPoint = {
      ...input.previousOutput,
      index: prependHexPrefix(`${input.previousOutput.index.toString(16)}`),
    };
    hash.update(hexToBytes(serializeOutPoint(outPoint)));
  }
  for (let index = 0; index < outputs.length; index++) {
    const output = {
      capacity: prependHexPrefix(`${outputs[index].capacity.toString(16)}`),
      lock: outputs[index].lock,
      type: outputs[index].type,
    };
    const outputData = outputsData[index];
    hash.update(hexToBytes(serializeOutput(output)));

    const outputDataLen = u32ToLe(trimHexPrefix(outputData).length / 2);
    const odl = hexToBytes(prependHexPrefix(outputDataLen));
    const od = hexToBytes(outputData);
    hash.update(odl);
    hash.update(od);
  }
  // double sha256
  return sha256(hash.array());
};

export const isCommitmentMatched = (
  commitment: string,
  ckbPartialTx: ccc.Transaction,
  lastCkbTypedOutputIndex: number,
): boolean => {
  return (
    commitment ===
    calculateCommitment(
      ccc.Transaction.from({
        inputs: ckbPartialTx.inputs,
        outputs: ckbPartialTx.outputs.slice(0, lastCkbTypedOutputIndex + 1),
        outputsData: ckbPartialTx.outputsData.slice(
          0,
          lastCkbTypedOutputIndex + 1,
        ),
      }),
    )
  );
};

// RGB++ related outputs
export const buildBtcRgbppOutputs = (
  ckbPartialTx: ccc.Transaction,
  btcChangeAddress: string,
  receiverBtcAddresses: string[],
  rgbppUdtClient: RgbppUdtClient,
): TxOutput[] => {
  const commitment = calculateCommitment(ckbPartialTx);

  const rgbppLockScriptTemplate = rgbppUdtClient.rgbppLockScriptTemplate();
  const btcTimeLockScriptTemplate = rgbppUdtClient.btcTimeLockScriptTemplate();

  const outputs: InitOutput[] = [];
  let lastCkbTypedOutputIndex = -1;
  ckbPartialTx.outputs.forEach((output, index) => {
    // If output.type is not null, then the output.lock must be RGB++ Lock or BTC Time Lock
    if (output.type) {
      if (
        !isUsingOneOfScripts(output.lock, [
          rgbppLockScriptTemplate,
          btcTimeLockScriptTemplate,
        ])
      ) {
        throw new Error("Invalid cell lock");
      }
      lastCkbTypedOutputIndex = index;
    }

    // If output.lock is RGB++ Lock, generate a corresponding output in outputs
    if (isSameScriptTemplate(output.lock, rgbppLockScriptTemplate)) {
      outputs.push({
        fixed: true,
        // Out-of-range index indicates this is a RGB++ change output returning to the BTC address
        address: receiverBtcAddresses[index] ?? btcChangeAddress,
        value: 546,
        minUtxoSatoshi: 546,
      });
    }
  });

  if (lastCkbTypedOutputIndex < 0) {
    throw new Error("Invalid outputs");
  }

  if (!isCommitmentMatched(commitment, ckbPartialTx, lastCkbTypedOutputIndex)) {
    throw new Error("Commitment mismatch");
  }

  // place the commitment as the first output
  outputs.unshift({
    data: commitment,
    value: 0,
    fixed: true,
  });

  return outputs.map((output) => convertToOutput(output));
};
