import { SpvProofProvider } from "../interfaces/spv.js";
import { SpvProof } from "../types/spv.js";

export async function pollForSpvProof(
  spvProofProvider: SpvProofProvider,
  btcTxId: string,
  confirmations: number = 0,
  intervalInSeconds?: number,
): Promise<SpvProof> {
  return new Promise((resolve) => {
    const polling = setInterval(
      async () => {
        try {
          console.log(`[SPV] Polling for BTC tx ${btcTxId}`);
          const proof = await spvProofProvider.getRgbppSpvProof(
            btcTxId,
            confirmations,
          );

          if (proof) {
            clearInterval(polling);
            resolve(proof);
          }
        } catch (e) {
          console.error(`[SPV] Error polling for BTC tx ${btcTxId}:`, e);
          // Continue polling on error
        }
      },
      intervalInSeconds ?? 10 * 1000,
    );
  });
}
