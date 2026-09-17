import type { Transaction } from "../../ckb/index.js";
import { JsonRpcTransformers } from "../../client/jsonRpc/advanced.js";
import { JsonRpcError, type JsonRpcPayload } from "../../jsonRpc/index.js";
import { abortSignalAny, sleep } from "../../utils/index.js";
import type { Signer } from "../signer/index.js";
import { signerJsonRpcNetworkIdFromAddressPrefix } from "./network.js";
import {
  SignerJsonRpcTransformers,
  type SignerJsonRpcInfo,
  type SignerJsonRpcMessageToSign,
} from "./transformers.js";

export type SignerJsonRpcConfirmation =
  | { method: "connect"; networkId: string }
  | { method: "sign_message"; message: SignerJsonRpcMessageToSign }
  | { method: "sign_transaction"; transaction: Transaction };

const GET_RESULT_CACHE_MS = 120_000;
const GET_RESULT_WAIT_MS = 10_000;
const GET_RESULT_PENDING_RESULT = Symbol("pending");

export enum SignerJsonRpcErrorCode {
  MethodNotFound = -32601,
  InvalidParams = -32602,
  ServerError = -32000,
  InvalidState = -32001,
  NetworkMismatch = -32002,
  UserRejected = -32003,
  DuplicateRequestId = -32005,
}

export type SignerJsonRpcHandlerOptions = { signal?: AbortSignal };

export type SignerJsonRpcResultRecord =
  | { status: "not_found" }
  | { status: "pending" }
  | { status: "completed"; result: unknown };

export type SignerJsonRpcHandlerConfig = {
  getSigner: () => Signer | undefined;
  getSignerMetadata?: () => Pick<SignerJsonRpcInfo, "name" | "icon">;
  /** Connects the requested network and returns its connected Signer. */
  connect: (
    networkId: string,
    options?: SignerJsonRpcHandlerOptions,
  ) => Promise<Signer>;
  confirmRequest: (
    request: SignerJsonRpcConfirmation,
    options?: SignerJsonRpcHandlerOptions,
  ) => Promise<boolean>;
};

export class SignerJsonRpcHandler {
  private readonly resultRecords = new Map<string, Promise<unknown>>();
  private readonly handlers;

  constructor(private readonly config: SignerJsonRpcHandlerConfig) {
    this.handlers = new Map<
      string,
      (
        payload: JsonRpcPayload,
        options?: SignerJsonRpcHandlerOptions,
      ) => unknown
    >([
      [
        "get_info",
        (payload) => {
          requireParams(payload, 0);
          return buildSignerInfo(
            this.requireSigner(),
            this.config.getSignerMetadata?.() ?? {},
          );
        },
      ],
      [
        "connect",
        async (payload, options) => {
          const [networkId] = requireParams(payload, 1);
          if (typeof networkId !== "string" || !networkId) {
            throw new JsonRpcError({
              code: SignerJsonRpcErrorCode.InvalidParams,
              message: "Invalid network ID",
            });
          }

          await this.requireConfirmation(
            { method: "connect", networkId },
            options,
          );

          const signer = await this.config.connect(networkId, options);
          const actualNetworkId = signerJsonRpcNetworkIdFromAddressPrefix(
            signer.client.addressPrefix,
          );
          if (actualNetworkId !== networkId) {
            throw new JsonRpcError({
              code: SignerJsonRpcErrorCode.NetworkMismatch,
              message: `Signer uses ${actualNetworkId}, expected ${networkId}`,
            });
          }

          return null;
        },
      ],
      [
        "get_scripts",
        async (payload) => {
          requireParams(payload, 0);
          return (await this.requireSigner().getAddressObjs()).map(
            ({ script }) => JsonRpcTransformers.scriptFrom(script),
          );
        },
      ],
      [
        "get_native_address",
        (payload) => {
          requireParams(payload, 0);
          return this.requireSigner().getInternalAddress();
        },
      ],
      [
        "get_identity",
        (payload) => {
          requireParams(payload, 0);
          return this.requireSigner().getIdentity();
        },
      ],
      [
        "sign_message",
        async (payload, options) => {
          const [message] = requireParams(payload, 1);
          const parsedMessage = parseMessageParam(message);
          await this.requireConfirmation(
            {
              method: "sign_message",
              message: SignerJsonRpcTransformers.messageFrom(parsedMessage),
            },
            options,
          );
          return this.requireSigner().signMessageRaw(parsedMessage);
        },
      ],
      [
        "prepare_transaction",
        async (payload) => {
          const [transaction] = requireParams(payload, 1);
          return JsonRpcTransformers.transactionFrom(
            await this.requireSigner().prepareTransaction(
              parseTransactionParam(transaction),
            ),
          );
        },
      ],
      [
        "sign_transaction",
        async (payload, options) => {
          const [transaction] = requireParams(payload, 1);
          const parsedTransaction = parseTransactionParam(transaction);
          await this.requireConfirmation(
            { method: "sign_transaction", transaction: parsedTransaction },
            options,
          );
          return JsonRpcTransformers.transactionFrom(
            await this.requireSigner().signOnlyTransaction(parsedTransaction),
          );
        },
      ],
    ]);
  }

  handle = (payload: JsonRpcPayload, options?: SignerJsonRpcHandlerOptions) => {
    const positionalParams = requireParams(payload);

    if (payload.method === "get_result") {
      const [targetRequestId] = requireParams(payload, 1);
      requireRequestId(targetRequestId);
      return this.getResult(
        this.resultRecords.get(targetRequestId),
        options?.signal,
      );
    }

    const [requestId, ...params] = positionalParams;
    requireRequestId(requestId);
    if (this.resultRecords.has(requestId)) {
      throw new JsonRpcError({
        code: SignerJsonRpcErrorCode.DuplicateRequestId,
        message: "Request ID already exists",
      });
    }

    const handler = this.handlers.get(payload.method);
    if (!handler) {
      throw new JsonRpcError({
        code: SignerJsonRpcErrorCode.MethodNotFound,
        message: `Unsupported method: ${payload.method}`,
      });
    }

    return this.executeRequest(requestId, () =>
      handler({ ...payload, params }, options),
    );
  };

  private requireSigner() {
    const signer = this.config.getSigner();
    if (!signer) {
      throw new JsonRpcError({
        code: SignerJsonRpcErrorCode.ServerError,
        message: "No signer is connected",
      });
    }

    return signer;
  }

  private async requireConfirmation(
    request: SignerJsonRpcConfirmation,
    options?: SignerJsonRpcHandlerOptions,
  ) {
    if (!(await this.config.confirmRequest(request, options))) {
      throw new JsonRpcError({
        code: SignerJsonRpcErrorCode.UserRejected,
        message: "User rejected request",
      });
    }
  }

  private executeRequest(requestId: string, request: () => unknown) {
    const completion = Promise.resolve().then(request);
    this.resultRecords.set(requestId, completion);
    const expire = () => {
      setTimeout(() => {
        if (this.resultRecords.get(requestId) === completion) {
          this.resultRecords.delete(requestId);
        }
      }, GET_RESULT_CACHE_MS);
    };
    void completion.then(expire, expire);
    return completion;
  }

  private async getResult(
    completion: Promise<unknown> | undefined,
    signal?: AbortSignal,
  ): Promise<SignerJsonRpcResultRecord> {
    if (!completion) return { status: "not_found" };

    const controller = new AbortController();
    try {
      const result = await Promise.race([
        completion,
        sleep(
          GET_RESULT_WAIT_MS,
          signal
            ? abortSignalAny([signal, controller.signal])
            : controller.signal,
        ).then(
          (): typeof GET_RESULT_PENDING_RESULT => GET_RESULT_PENDING_RESULT,
        ),
      ]);
      return result === GET_RESULT_PENDING_RESULT
        ? { status: "pending" }
        : { status: "completed", result };
    } finally {
      controller.abort();
    }
  }
}

function parseMessageParam(message: unknown) {
  try {
    return SignerJsonRpcTransformers.messageTo(message);
  } catch (cause) {
    throw new JsonRpcError({
      code: SignerJsonRpcErrorCode.InvalidParams,
      message:
        cause instanceof Error ? cause.message : "Invalid signer message",
    });
  }
}

function parseTransactionParam(transaction: unknown) {
  try {
    return JsonRpcTransformers.transactionTo(
      transaction as Parameters<typeof JsonRpcTransformers.transactionTo>[0],
    );
  } catch (cause) {
    throw new JsonRpcError({
      code: SignerJsonRpcErrorCode.InvalidParams,
      message:
        cause instanceof Error ? cause.message : "Invalid signer transaction",
    });
  }
}

function requireParams(payload: JsonRpcPayload, count?: number) {
  if (!Array.isArray(payload.params)) {
    throw new JsonRpcError({
      code: SignerJsonRpcErrorCode.InvalidParams,
      message: `${payload.method} expects positional parameters`,
    });
  }
  if (count !== undefined && payload.params.length !== count) {
    throw new JsonRpcError({
      code: SignerJsonRpcErrorCode.InvalidParams,
      message: `${payload.method} expects ${count} parameter${count === 1 ? "" : "s"}`,
    });
  }

  return payload.params;
}

function requireRequestId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value) {
    throw new JsonRpcError({
      code: SignerJsonRpcErrorCode.InvalidParams,
      message: "Invalid request ID",
    });
  }
}

function buildSignerInfo(
  signer: Signer,
  metadata: Pick<SignerJsonRpcInfo, "name" | "icon">,
) {
  return SignerJsonRpcTransformers.infoFrom({
    type: signer.type,
    signType: signer.signType,
    name: metadata.name,
    icon: metadata.icon,
  });
}
