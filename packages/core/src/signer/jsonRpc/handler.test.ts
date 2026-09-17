import { describe, expect, it, vi } from "vitest";
import { ClientPublicTestnet } from "../../client/index.js";
import { JsonRpcError, type JsonRpcPayload } from "../../jsonRpc/index.js";
import { SignerSignType, SignerType, type Signer } from "../signer/index.js";
import { SignerJsonRpcErrorCode, SignerJsonRpcHandler } from "./index.js";
import { SignerJsonRpcTransformers } from "./transformers.js";

let nextRequestId = 0;

function payload(
  method: string,
  params: unknown[] = [],
  requestId = `request-${nextRequestId++}`,
): JsonRpcPayload {
  return {
    id: 0,
    jsonrpc: "2.0",
    method,
    params: method === "get_result" ? params : [requestId, ...params],
  };
}

function mockSigner(overrides: Partial<Signer> = {}) {
  return {
    client: new ClientPublicTestnet(),
    connect: vi.fn(async () => {}),
    isConnected: vi.fn(async () => true),
    signType: SignerSignType.CkbSecp256k1,
    type: SignerType.CKB,
    ...overrides,
  } as unknown as Signer;
}

describe("SignerJsonRpcHandler", () => {
  it("returns signer information with application metadata", async () => {
    const signer = mockSigner();
    const handler = new SignerJsonRpcHandler({
      connect: async () => signer,
      confirmRequest: async () => true,
      getSigner: () => signer,
      getSignerMetadata: () => ({ name: "Test wallet", icon: "test.svg" }),
    });

    await expect(handler.handle(payload("get_info"))).resolves.toEqual({
      type: SignerType.CKB,
      sign_type: SignerSignType.CkbSecp256k1,
      name: "Test wallet",
      icon: "test.svg",
    });
  });

  it("confirms and connects the requested network", async () => {
    const signerConnect = vi.fn(async () => {});
    const signer = mockSigner({ connect: signerConnect });
    const connect = vi.fn(async () => signer);
    const confirmRequest = vi.fn(async () => true);
    const handler = new SignerJsonRpcHandler({
      connect,
      confirmRequest,
      getSigner: () => signer,
    });

    await expect(
      handler.handle(payload("connect", ["ckb-testnet"])),
    ).resolves.toBeNull();
    expect(confirmRequest).toHaveBeenCalledWith(
      { method: "connect", networkId: "ckb-testnet" },
      undefined,
    );
    expect(connect).toHaveBeenCalledWith("ckb-testnet", undefined);
    expect(signerConnect).not.toHaveBeenCalled();
  });

  it("validates methods and parameters with JSON-RPC errors", async () => {
    const signer = mockSigner();
    const handler = new SignerJsonRpcHandler({
      connect: async () => signer,
      confirmRequest: async () => true,
      getSigner: () => signer,
    });

    expect(() => handler.handle(payload("unknown"))).toThrow(
      new JsonRpcError({
        code: SignerJsonRpcErrorCode.MethodNotFound,
        message: "Unsupported method: unknown",
      }),
    );
    await expect(handler.handle(payload("connect"))).rejects.toMatchObject({
      code: SignerJsonRpcErrorCode.InvalidParams,
    });
  });

  it("does not sign rejected requests", async () => {
    const message = Uint8Array.from([1, 2]);
    const signMessageRaw = vi.fn();
    const signer = mockSigner({ signMessageRaw });
    const confirmRequest = vi.fn(async () => false);
    const handler = new SignerJsonRpcHandler({
      connect: async () => signer,
      confirmRequest,
      getSigner: () => signer,
    });

    const request = handler.handle(
      payload("sign_message", [SignerJsonRpcTransformers.messageFrom(message)]),
    );

    await expect(request).rejects.toEqual(
      new JsonRpcError({
        code: SignerJsonRpcErrorCode.UserRejected,
        message: "User rejected request",
      }),
    );
    expect(confirmRequest).toHaveBeenCalledWith(
      {
        method: "sign_message",
        message: { type: "bytes", value: "0x0102" },
      },
      undefined,
    );
    expect(signMessageRaw).not.toHaveBeenCalled();
  });

  it("caches completed results and rejects duplicate request IDs", async () => {
    const signer = mockSigner({
      getIdentity: vi.fn(async () => "identity"),
    });
    const handler = new SignerJsonRpcHandler({
      connect: async () => signer,
      confirmRequest: async () => true,
      getSigner: () => signer,
    });
    const request = payload("get_identity", [], "same-request");

    await expect(handler.handle(request)).resolves.toBe("identity");
    await expect(
      handler.handle(payload("get_result", ["same-request"])),
    ).resolves.toEqual({
      status: "completed",
      result: "identity",
    });
    expect(() => handler.handle(request)).toThrow(
      new JsonRpcError({
        code: SignerJsonRpcErrorCode.DuplicateRequestId,
        message: "Request ID already exists",
      }),
    );
  });

  it("caches and rethrows the original error object", async () => {
    const error = new JsonRpcError({
      code: SignerJsonRpcErrorCode.UserRejected,
      message: "Rejected",
    });
    const signer = mockSigner({
      getIdentity: vi.fn(async () => {
        throw error;
      }),
    });
    const handler = new SignerJsonRpcHandler({
      connect: async () => signer,
      confirmRequest: async () => true,
      getSigner: () => signer,
    });

    await expect(
      handler.handle(payload("get_identity", [], "failed-request")),
    ).rejects.toBe(error);
    await expect(
      handler.handle(payload("get_result", ["failed-request"])),
    ).rejects.toBe(error);
  });
});
