"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TextInput } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Textarea } from "@/src/components/Textarea";
import { ccc } from "@ckb-ccc/connector-react";
import { bytesFromAnyString, useGetExplorerLink } from "@/src/utils";
import { useApp } from "@/src/context";
import { ButtonsPanel } from "@/src/components/ButtonsPanel";
import { Message } from "@/src/components/Message";

const testnetTimeLockScript = {
  codeHash:
    "0x907a4018590da3abd9be783a8a38a03b3772414b32bfe58a6291797a02c53eb0",
  hashType: "type",
};
const testnetTimeLockScriptCellDep = {
  outPoint: {
    txHash:
      "0x6124a800ec69dc75cb98be2b99686ccbeace3b648ca84496e01e4e7f8d48c759",
    index: 0,
  },
  depType: "code",
};
const feeRate = 3000;

export default function TimeLockedTransfer() {
  const { signer, createSender } = useApp();
  const { log, error } = createSender("Transfer with a time lock");

  const { explorerTransaction } = useGetExplorerLink();

  const [transferTo, setTransferTo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [data, setData] = useState<string>("");
  const [lockedForBlocks, setLockedForBlocks] = useState<string>("");
  const [liveTimeLockCell, setLiveTimeLockCell] = useState<ccc.Cell | null>(
    null,
  );
  const [showClaimPage, setShowClaimPage] = useState<boolean>(false);
  const [claimData, setClaimData] = useState<string>("");

  const handleTimeLockedTransfer = async () => {
    if (!signer) {
      return;
    }

    // Verify destination addresses
    const toAddress = await ccc.Address.fromString(transferTo, signer.client);

    const currentBlockNumber = await signer.client.getTip();
    const lockedUntil = ccc.Since.from({
      relative: "absolute",
      metric: "blockNumber",
      value: currentBlockNumber + ccc.numFrom(lockedForBlocks),
    });
    const lockedUntilToNum = lockedUntil.toNum();
    const timeLockScript = ccc.Script.from({
      ...testnetTimeLockScript,
      args: buildTimeLockArgs(
        toAddress.script.hash(),
        lockedUntilToNum.toString(),
      ),
    });

    const timeLockCellOutput = { lock: timeLockScript };

    const tx = ccc.Transaction.from({
      outputs: [timeLockCellOutput],
      outputsData: [bytesFromAnyString(data)],
    });

    const minimumCapacity = tx.getOutputsCapacity();
    if (minimumCapacity > ccc.fixedPointFrom(amount)) {
      error(`Insufficient capacity to store data`);
      return;
    }
    tx.outputs[0].capacity = ccc.fixedPointFrom(amount);

    // Complete missing parts for transaction
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, feeRate);

    signer
      .sendTransaction(tx)
      .then((hash: string) => {
        log("Transaction sent:", explorerTransaction(hash));
      })
      .catch((err: Error) => {
        error(err.message);
      });
  };

  const checkTimeLockedCells = useCallback(async () => {
    if (!signer) {
      return;
    }

    for await (const address of await signer.getAddressObjs()) {
      for await (const cell of signer.client.findCells(
        {
          script: ccc.Script.from({
            ...testnetTimeLockScript,
            args: bytesFromAnyString(address.script.hash()),
          }),
          scriptType: "lock",
          scriptSearchMode: "prefix",
        },
        "desc",
        1,
      )) {
        setLiveTimeLockCell(cell);
        break;
      }
    }
  }, [signer]);

  useEffect(() => {
    checkTimeLockedCells();
  }, [checkTimeLockedCells]);

  const handleClaim = async () => {
    if (!signer || !liveTimeLockCell) {
      return;
    }
    const toAddress = await signer.getRecommendedAddressObj();
    const tx = ccc.Transaction.from({
      outputs: [{ lock: toAddress.script }],
      inputs: [{ previousOutput: liveTimeLockCell.outPoint }],
      cellDeps: [ccc.CellDep.from(testnetTimeLockScriptCellDep)],
      outputsData: [bytesFromAnyString(claimData)],
    });

    tx.outputs[0].capacity = liveTimeLockCell.cellOutput.capacity;

    await tx.completeInputsByCapacity(signer);
    let currentBlockNumber = await signer.client.getTip();
    const currentBlockNumberInSince = ccc.Since.from({
      relative: "absolute",
      metric: "blockNumber",
      value: currentBlockNumber,
    });

    await tx.completeFeeBy(signer, feeRate);
    tx.inputs[0].since = currentBlockNumberInSince.toNum();

    signer
      .sendTransaction(tx)
      .then((hash: string) => {
        log("Transaction sent:", explorerTransaction(hash));

        setLiveTimeLockCell(null);
      })
      .catch((err: Error) => {
        error(err.message);
      });
  };

  return (
    <div className="flex w-full flex-col items-stretch">
      {!showClaimPage ? (
        <>
          {liveTimeLockCell && (
            <Message title="Notification" type="info">
              You have locked CKB! Try to{" "}
              <a
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.preventDefault();
                  setShowClaimPage(true);
                }}
              >
                CLAIM
              </a>{" "}
              it now.
            </Message>
          )}
          <TextInput
            label="Address"
            placeholder="Address to transfer to"
            state={[transferTo, setTransferTo]}
          />
          <TextInput
            label="Amount"
            placeholder="Amount to transfer"
            state={[amount, setAmount]}
          />
          <TextInput
            label="Locked for N Blocks"
            placeholder="Can be claimed after N new blocks"
            state={[lockedForBlocks, setLockedForBlocks]}
          />
          <Textarea
            label="Output Data(Options)"
            state={[data, setData]}
            placeholder="Leave empty if you don't know what this is. Data in the first output. Hex string will be parsed."
          />
          <ButtonsPanel>
            <Button className="ml-2" onClick={handleTimeLockedTransfer}>
              Transfer
            </Button>
          </ButtonsPanel>
        </>
      ) : (
        <>
          <Message title="Notification" type="info">
            You have{" "}
            <span className="font-bold">
              {liveTimeLockCell
                ? Number(liveTimeLockCell.cellOutput.capacity) / 10 ** 8
                : 0}
            </span>{" "}
            CKB locked in a time-lock output cell. Try to claim it by clicking
            the button below. <br />
            <a
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.preventDefault();
                setShowClaimPage(false);
                checkTimeLockedCells();
              }}
            >
              Click here
            </a>{" "}
            to go back to the Transfer page.
          </Message>
          <Textarea
            label="Output Data(Options)"
            state={[claimData, setClaimData]}
            placeholder="Leave empty if you don't know what this is. Data in the first output. Hex string will be parsed."
          />
          <ButtonsPanel>
            <Button className="ml-2" onClick={handleClaim}>
              Claim{" "}
              {liveTimeLockCell
                ? Number(liveTimeLockCell.cellOutput.capacity) / 10 ** 8
                : 0}{" "}
              CKB
            </Button>
          </ButtonsPanel>
        </>
      )}
    </div>
  );
}

const buildTimeLockArgs = (requiredScriptHash: string, lockedUntil: string) => {
  // requiredScriptHash is 32 bytes
  const requiredScriptHashBytes = bytesFromAnyString(requiredScriptHash);
  const lockedUntilBytes8 = ccc.numToBytes(lockedUntil, 8);
  return ccc.bytesConcat(requiredScriptHashBytes, lockedUntilBytes8);
};
