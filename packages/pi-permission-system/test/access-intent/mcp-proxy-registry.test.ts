import { describe, expect, it } from "vitest";
import {
  BUILTIN_MCP_PROXY_TOOL_NAME,
  describeBuiltinMcpInvocation,
  McpProxyRegistry,
} from "#src/access-intent/mcp-proxy-registry";

describe("McpProxyRegistry", () => {
  it("resolves a registration by exact tool name", () => {
    const registry = new McpProxyRegistry();
    const dispose = registry.register({
      toolName: "combiner",
      describeInvocation: () => ({ verb: "status" }),
    });
    expect(registry.resolve("combiner")?.toolName).toBe("combiner");
    expect(registry.resolve("other")).toBeUndefined();
    dispose();
    expect(registry.resolve("combiner")).toBeUndefined();
  });

  it("throws on duplicate registration for the same tool name", () => {
    const registry = new McpProxyRegistry();
    registry.register({
      toolName: "combiner",
      describeInvocation: () => undefined,
    });
    expect(() =>
      registry.register({
        toolName: "combiner",
        describeInvocation: () => undefined,
      }),
    ).toThrow(/already exists/);
  });

  it("a stale disposer cannot evict a later registration", () => {
    const registry = new McpProxyRegistry();
    const first = registry.register({
      toolName: "combiner",
      describeInvocation: () => undefined,
    });
    first();
    const second = registry.register({
      toolName: "combiner",
      describeInvocation: () => ({ verb: "status" }),
    });
    first(); // stale
    expect(registry.resolve("combiner")).toBeDefined();
    second();
    expect(registry.resolve("combiner")).toBeUndefined();
  });
});

describe("describeBuiltinMcpInvocation", () => {
  it("maps a call with and without an explicit server", () => {
    expect(describeBuiltinMcpInvocation({ tool: "exa_search" })).toEqual({
      verb: "call",
      tool: "exa_search",
    });
    expect(
      describeBuiltinMcpInvocation({ tool: "search", server: "exa" }),
    ).toEqual({ verb: "call", tool: "search", server: "exa" });
  });

  it("maps search, describe, connect, list, and status verbs", () => {
    expect(describeBuiltinMcpInvocation({ search: "issue" })).toEqual({
      verb: "search",
      value: "issue",
    });
    expect(describeBuiltinMcpInvocation({ describe: "exa_search" })).toEqual({
      verb: "describe",
      value: "exa_search",
    });
    expect(describeBuiltinMcpInvocation({ connect: "exa" })).toEqual({
      verb: "connect",
      server: "exa",
    });
    expect(describeBuiltinMcpInvocation({ server: "exa" })).toEqual({
      verb: "list",
      server: "exa",
    });
    expect(describeBuiltinMcpInvocation({})).toEqual({ verb: "status" });
  });
});

describe("built-in default registration", () => {
  it("the literal mcp tool is pre-registered with the adapter shape", () => {
    const registry = new McpProxyRegistry();
    registry.register({
      toolName: BUILTIN_MCP_PROXY_TOOL_NAME,
      describeInvocation: describeBuiltinMcpInvocation,
    });
    const proxy = registry.resolve(BUILTIN_MCP_PROXY_TOOL_NAME);
    expect(proxy).toBeDefined();
    expect(proxy?.describeInvocation({ tool: "exa_search" })).toEqual({
      verb: "call",
      tool: "exa_search",
    });
  });
});
