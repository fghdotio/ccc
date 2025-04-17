import { ccc, mol } from "@ckb-ccc/shell";

export interface RgbppUdtToken {
  decimal: number;
  name: string;
  symbol: string;
}

export interface UtxoSeal {
  txId: string;
  index: number;
}

export interface ScriptInfo {
  name: string;
  script: ccc.Script;
  cellDep: ccc.CellDep;
}

// struct ExtraCommitmentData {
//   input_len: byte,
//   output_len: byte,
//  }

/**
 * @public
 */
export type ExtraCommitmentDataLike = {
  inputLen: ccc.NumLike;
  outputLen: ccc.NumLike;
};

@mol.codec(
  mol.struct({
    inputLen: mol.Uint8,
    outputLen: mol.Uint8,
  }),
)
export class ExtraCommitmentDataCCC extends mol.Entity.Base<
  ExtraCommitmentDataLike,
  ExtraCommitmentDataCCC
>() {
  constructor(
    public inputLen: ccc.Num,
    public outputLen: ccc.Num,
  ) {
    super();
  }

  static from(ec: ExtraCommitmentDataLike): ExtraCommitmentDataCCC {
    return new ExtraCommitmentDataCCC(
      ccc.numFrom(ec.inputLen),
      ccc.numFrom(ec.outputLen),
    );
  }
}

// table RGBPPUnlock {
//   version: Uint16,
//   extra_data: ExtraCommitmentData,
//   btc_tx: Bytes,
//   btc_tx_proof: Bytes,
// }

/**
 * @public
 */
export type RgbppUnlockLike = {
  version: ccc.NumLike;
  extraData: ExtraCommitmentDataLike;
  btcTx: ccc.HexLike;
  btcTxProof: ccc.HexLike;
};
/**
 * @public
 */
@mol.codec(
  mol.table({
    version: mol.Uint16,
    extraData: ExtraCommitmentDataCCC,
    btcTx: mol.Bytes,
    btcTxProof: mol.Bytes,
  }),
)
export class RgbppUnlock extends mol.Entity.Base<
  RgbppUnlockLike,
  RgbppUnlock
>() {
  constructor(
    public version: ccc.Num,
    public extraData: ExtraCommitmentDataCCC,
    public btcTx: ccc.Hex,
    public btcTxProof: ccc.Hex,
  ) {
    super();
  }

  static from(ru: RgbppUnlockLike): RgbppUnlock {
    return new RgbppUnlock(
      ccc.numFrom(ru.version),
      ExtraCommitmentDataCCC.from(ru.extraData),
      ccc.hexFrom(ru.btcTx),
      ccc.hexFrom(ru.btcTxProof),
    );
  }
}
