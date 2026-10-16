import WebSocket from "isomorphic-ws";
import { RequestorJsonRpc } from "../jsonRpc/requestor.js";
import type { ClientConfig } from "./client.js";
import { MAINNET_SCRIPTS } from "./clientPublicMainnet.advanced.js";
import { ClientJsonRpc, type ClientJsonRpcConfig } from "./jsonRpc/client.js";

/**
 * @public
 */
export class ClientPublicMainnet extends ClientJsonRpc {
  private static defaultUrls(): readonly [string, ...string[]] {
    return typeof WebSocket !== "undefined"
      ? [
          "wss://mainnet.ckb.dev/ws",
          "https://mainnet.ckb.dev/",
          "https://mainnet.ckbapp.dev/",
        ]
      : ["https://mainnet.ckb.dev/", "https://mainnet.ckbapp.dev/"];
  }

  private static resolveConfig(
    config?: ClientJsonRpcConfig & {
      /** @deprecated URL belongs to Transport construction. */
      url?: string;
    },
  ): ClientJsonRpcConfig & { url: string; fallbacks: string[] } {
    const defaultUrls = this.defaultUrls();
    return {
      ...config,
      url: config?.url ?? defaultUrls[0],
      fallbacks: config?.fallbacks ?? [...defaultUrls],
      scripts: config?.scripts ?? MAINNET_SCRIPTS,
    };
  }

  /**
   * @deprecated Use {@link ClientPublicMainnet.new} with a borrowed Transport or
   * {@link ClientPublicMainnet.open} when creating Transports.
   */
  constructor(
    config?: ClientJsonRpcConfig & {
      /** @deprecated URL belongs to Transport construction. */
      url?: string;
    },
  ) {
    const resolved = ClientPublicMainnet.resolveConfig(config);
    super(resolved.url, resolved);
  }

  /**
   * Creates a Client with a new requestor that borrows an existing Transport.
   * The caller remains responsible for the transport's lifecycle.
   *
   * Do not pass the same `JsonRpcTransportWebSocket` to independently created
   * clients or requestors. Their request IDs can collide, causing responses to
   * reach the wrong caller or requests to remain unresolved even after timeout.
   * Reuse one client for concurrent calls, or give each client a separate
   * transport, for example by calling {@link ClientPublicMainnet.open} for each.
   * See {@link RequestorJsonRpc.new} for details.
   */
  static new(
    config: Omit<Parameters<typeof RequestorJsonRpc.new>[0], "onError"> &
      ClientConfig,
  ): ClientPublicMainnet {
    const { cache, scripts, addressResolver, ...requestorConfig } = config;
    const requestor = this.newRequestor(requestorConfig);
    return new ClientPublicMainnet({
      cache,
      scripts,
      addressResolver,
      requestor,
    });
  }

  /** Opens a Client with explicit ownership of its default dependencies. */
  static open(
    config?: Omit<
      Parameters<typeof RequestorJsonRpc.open>[0],
      "onError" | "urls"
    > &
      ClientConfig & {
        urls?: Parameters<typeof RequestorJsonRpc.open>[0]["urls"];
      },
  ) {
    const {
      cache,
      scripts,
      addressResolver,
      urls = this.defaultUrls(),
      ...requestorConfig
    } = config ?? {};
    return this.openRequestor({
      ...requestorConfig,
      urls,
    }).map(
      (requestor) =>
        new ClientPublicMainnet({
          cache,
          scripts,
          addressResolver,
          requestor,
          url: urls[0],
          fallbacks: [...urls.slice(1)],
        }),
    );
  }

  get addressPrefix(): string {
    return "ckb";
  }
}
