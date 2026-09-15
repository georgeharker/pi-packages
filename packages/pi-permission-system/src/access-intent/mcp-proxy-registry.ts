/**
 * Registry for MCP proxy tool declarations.
 *
 * Lets an extension declare that one of its tools proxies MCP calls, and how to
 * read the server/tool identity out of the tool's input — so the `mcp`
 * permission surface (per-server rules, tool patterns, baseline auto-allows,
 * `payload.target` evidence for authorizers) applies to the proxy under ANY
 * tool name, instead of only the literal `mcp` hardwired to one package's
 * argument shape.
 *
 * Fact-shaping in the same sense as the tool-access-extractor registry: a
 * registration describes *what a call touches* (verb, tool, server) and decides
 * nothing. One registration per tool name; duplicate registration throws.
 */

/**
 * The MCP invocation a proxy tool input carries, as declared by the proxy's
 * own `describeInvocation`. Facts only — the permission system remains the
 * authority on how invocations become rule targets.
 */
export type McpInvocation =
  | { verb: "call"; tool: string; server?: string }
  | { verb: "search" | "describe"; value: string; server?: string }
  | { verb: "connect" | "list"; server?: string }
  | { verb: "status" };

/** A proxy tool's declaration: its name, its argument structure, its servers. */
export interface McpProxyRegistration {
  /** Exact pi tool name that proxies MCP calls (e.g. `"mcp"`, `"combiner"`). */
  toolName: string;
  /**
   * Map a raw tool input to the MCP invocation it carries. Return `undefined`
   * to decline for this input — the call then evaluates on the generic
   * extension surface. Throwing is treated as declining.
   */
  describeInvocation(input: Record<string, unknown>): McpInvocation | undefined;
  /**
   * Live upstream server names, used to derive bare-server candidates when an
   * invocation names a tool but no server (e.g. an aggregator's health list).
   * Falls back to the configured MCP server names when absent.
   */
  getServers?(): string[];
}

/** Read-only lookup used by the gate pipeline (ISP — no registration surface). */
export interface McpProxyLookup {
  resolve(toolName: string): McpProxyRegistration | undefined;
}

/** Registration side (ISP — mirrors {@link McpProxyLookup}). */
export interface McpProxyRegistrar {
  register(registration: McpProxyRegistration): () => void;
}

export class McpProxyRegistry implements McpProxyLookup, McpProxyRegistrar {
  private readonly registrations = new Map<string, McpProxyRegistration>();

  /**
   * Register a proxy declaration for `toolName`.
   *
   * Throws when a registration already exists for that name — keeps resolution
   * deterministic. The returned disposer is identity-guarded so a stale call
   * cannot evict a later registration.
   */
  register(registration: McpProxyRegistration): () => void {
    const toolName = registration.toolName.trim();
    if (this.registrations.has(toolName)) {
      throw new Error(
        `An MCP proxy registration already exists for '${toolName}'.`,
      );
    }
    this.registrations.set(toolName, registration);
    return () => {
      if (this.registrations.get(toolName) === registration) {
        this.registrations.delete(toolName);
      }
    };
  }

  resolve(toolName: string): McpProxyRegistration | undefined {
    return this.registrations.get(toolName.trim());
  }
}

/**
 * The built-in descriptor for the literal `mcp` tool: pi-mcp-adapter's argument
 * shape, pre-registered so the existing hardwire behaves exactly as before and
 * alternative clients can register alongside or instead of it.
 */
export const BUILTIN_MCP_PROXY_TOOL_NAME = "mcp";

export function describeBuiltinMcpInvocation(
  input: Record<string, unknown>,
): McpInvocation {
  const tool = typeof input.tool === "string" ? input.tool.trim() : "";
  const server = typeof input.server === "string" ? input.server.trim() : "";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const describe =
    typeof input.describe === "string" ? input.describe.trim() : "";
  const connect = typeof input.connect === "string" ? input.connect.trim() : "";

  if (tool) return { verb: "call", tool, ...(server ? { server } : {}) };
  if (search)
    return { verb: "search", value: search, ...(server ? { server } : {}) };
  if (describe)
    return { verb: "describe", value: describe, ...(server ? { server } : {}) };
  if (connect) return { verb: "connect", server: connect };
  if (server) return { verb: "list", server };
  return { verb: "status" };
}
