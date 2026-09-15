import { getNonEmptyString, toRecord } from "#src/value-guards";

/**
 * An ordered accumulator that owns the uniqueness invariant.
 *
 * `add` ignores null/empty values and silently skips duplicates (first-insertion
 * wins). `toArray` returns the ordered result as an independent copy.
 */
export class McpTargetList {
  private readonly targets: string[] = [];

  add(value: string | null): void {
    if (!value) {
      return;
    }
    if (!this.targets.includes(value)) {
      this.targets.push(value);
    }
  }

  toArray(): string[] {
    return [...this.targets];
  }
}

/**
 * Parse a qualified MCP tool name of the form `server:tool`.
 *
 * Returns `{ server, tool }` when the string contains exactly one colon with
 * non-empty text on both sides; otherwise returns `null`.
 */
export function parseQualifiedMcpToolName(
  value: string,
): { server: string; tool: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0 || colonIndex >= trimmed.length - 1) {
    return null;
  }

  const server = trimmed.slice(0, colonIndex).trim();
  const tool = trimmed.slice(colonIndex + 1).trim();
  if (!server || !tool) {
    return null;
  }

  return { server, tool };
}

function addDerivedMcpServerTargets(
  toolName: string,
  configuredServerNames: readonly string[],
  targets: McpTargetList,
): void {
  const trimmedToolName = toolName.trim();
  if (!trimmedToolName) {
    return;
  }

  // The configured list is ordered longest-first, so the first prefix match is
  // the most specific server. A tool name qualifies against exactly ONE server
  // by prefix (foo_bar_baz belongs to foo_bar, not also to foo), so derivation
  // stops at the first hit: a rule for a shorter, coincidentally-matching
  // server must not fire on a longer name. A prefix hit also wins over any
  // suffix coincidence — one naming convention per name, disambiguated.
  for (const serverName of configuredServerNames) {
    const trimmedServerName = serverName.trim();
    if (!trimmedServerName) {
      continue;
    }

    if (trimmedToolName.startsWith(`${trimmedServerName}_`)) {
      // Prefix convention (pi-mcp-adapter proxy `tool` values, mcp-combiner combined
      // names): the server is already the leading segment, so the only useful
      // derived candidate is the bare server name — exact-server rules
      // (mcp: {"github": "deny"}) can then fire without an explicit server argument.
      targets.add(trimmedServerName);
      return;
    }
  }

  // Suffix convention (legacy names like search_code_github): derive the
  // qualified and bare forms. Pre-existing behavior, unchanged.
  for (const serverName of configuredServerNames) {
    const trimmedServerName = serverName.trim();
    if (!trimmedServerName) {
      continue;
    }

    if (!trimmedToolName.endsWith(`_${trimmedServerName}`)) {
      continue;
    }

    targets.add(`${trimmedServerName}_${trimmedToolName}`);
    targets.add(`${trimmedServerName}:${trimmedToolName}`);
    targets.add(trimmedServerName);
  }
}

function pushMcpToolPermissionTargets(
  rawReference: string,
  serverHint: string | null,
  configuredServerNames: readonly string[],
  targets: McpTargetList,
): void {
  const qualified = parseQualifiedMcpToolName(rawReference);
  const resolvedServer = serverHint ?? qualified?.server ?? null;
  const resolvedTool = qualified?.tool ?? rawReference;

  if (resolvedServer) {
    // A tool name already carrying the server prefix (pi-mcp-adapter proxy values
    // like github_search_code) needs no re-prefixed candidates — they match nothing
    // and push the useful candidates down the ordered list.
    if (!resolvedTool.startsWith(`${resolvedServer}_`)) {
      targets.add(`${resolvedServer}_${resolvedTool}`);
      targets.add(`${resolvedServer}:${resolvedTool}`);
    }
    targets.add(resolvedServer);
  } else {
    addDerivedMcpServerTargets(resolvedTool, configuredServerNames, targets);
  }

  targets.add(resolvedTool);
  targets.add(rawReference);
}

/**
 * Derive the ordered list of MCP permission-lookup candidates from a raw MCP
 * tool invocation input.
 *
 * Candidates are ordered from most-specific to least-specific so that
 * `evaluateFirst()` stops at the first non-default match.
 */
export function createMcpPermissionTargets(
  input: unknown,
  configuredServerNames: readonly string[] = [],
): string[] {
  const record = toRecord(input);
  const tool = getNonEmptyString(record.tool);
  const server = getNonEmptyString(record.server);
  const connect = getNonEmptyString(record.connect);
  const describe = getNonEmptyString(record.describe);
  const search = getNonEmptyString(record.search);

  const targets = new McpTargetList();

  if (tool) {
    pushMcpToolPermissionTargets(tool, server, configuredServerNames, targets);
    targets.add("mcp_call");
    return targets.toArray();
  }

  if (connect) {
    targets.add(`mcp_connect_${connect}`);
    targets.add(connect);
    targets.add("mcp_connect");
    return targets.toArray();
  }

  if (describe) {
    pushMcpToolPermissionTargets(
      describe,
      server,
      configuredServerNames,
      targets,
    );
    targets.add("mcp_describe");
    return targets.toArray();
  }

  if (search) {
    if (server) {
      targets.add(`mcp_server_${server}`);
      targets.add(server);
    }

    targets.add(search);
    targets.add("mcp_search");
    return targets.toArray();
  }

  if (server) {
    targets.add(`mcp_server_${server}`);
    targets.add(server);
    targets.add("mcp_list");
    return targets.toArray();
  }

  targets.add("mcp_status");
  return targets.toArray();
}
