import { ReplitConnectors } from "@replit/connectors-sdk";

/**
 * GitHub access via the Replit-managed GitHub connection (integration blueprint
 * id: github). Added through the Replit integrations system so users do NOT need
 * to create or paste a personal access token — the connectors SDK injects the
 * OAuth token automatically and refreshes it as needed. All calls go through the
 * proxy pattern, e.g. connectors.proxy("github", "/repos/{owner}/{repo}").
 */

const connectors = new ReplitConnectors();

/**
 * Performs a single GitHub REST call and returns the raw Response. Two
 * implementations exist: one backed by the Replit connection (no token needed)
 * and one backed by a user-supplied personal access token.
 */
export type GithubCaller = (
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<Response>;

/** Caller backed by the Replit-managed GitHub connection. */
export function connectionCaller(): GithubCaller {
  return (path, init) =>
    connectors.proxy("github", path, {
      method: init?.method ?? "GET",
      body: init?.body,
    });
}

/** Caller backed by a user-supplied personal access token. */
export function tokenCaller(token: string): GithubCaller {
  return (path, init) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "ShipKit-Agent/1.0",
    };
    const hasBody = init?.body !== undefined && init?.body !== null;
    if (hasBody) headers["Content-Type"] = "application/json";
    return fetch(`https://api.github.com${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
  };
}

/**
 * Whether the Replit-managed GitHub connection is available for this Repl. Used
 * by the pipeline to decide whether code sync can run without a per-config token.
 */
export async function isGithubConnected(): Promise<boolean> {
  try {
    const conns = await connectors.listConnections({ connector_names: "github" });
    return conns.length > 0;
  } catch {
    return false;
  }
}

/** Fetch the authenticated GitHub user via the Replit connection, or null. */
export async function getGithubUser(): Promise<{ login: string } | null> {
  try {
    const res = await connectionCaller()("/user");
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: string };
    return data.login ? { login: data.login } : null;
  } catch {
    return null;
  }
}

export interface GithubRepoSummary {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/** List repositories the connected GitHub account can access. */
export async function listRepos(): Promise<GithubRepoSummary[]> {
  const res = await connectionCaller()(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
  );
  if (!res.ok) {
    throw new Error(`GitHub repos request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
    private: boolean;
  }>;
  return data.map((r) => ({
    owner: r.owner.login,
    repo: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    private: r.private,
  }));
}

/** List branch names for a repo via the connected GitHub account. */
export async function listBranches(owner: string, repo: string): Promise<string[]> {
  const res = await connectionCaller()(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
  );
  if (!res.ok) {
    throw new Error(`GitHub branches request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{ name: string }>;
  return data.map((b) => b.name);
}

/**
 * Pick the caller for a pipeline run: prefer an explicit per-config personal
 * access token, otherwise fall back to the Replit-managed connection. Returns
 * null when neither is available (dry-run mode).
 */
export async function resolveGithubCaller(
  token: string | null,
): Promise<{ caller: GithubCaller; mode: "token" | "connection" } | null> {
  if (token) return { caller: tokenCaller(token), mode: "token" };
  if (await isGithubConnected()) return { caller: connectionCaller(), mode: "connection" };
  return null;
}
