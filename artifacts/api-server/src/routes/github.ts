import { Router, type IRouter } from "express";
import { getGithubUser, listRepos, listBranches } from "../lib/github";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GitHub connection status — Settings uses this to show whether the account is linked.
router.get("/github/status", async (_req, res): Promise<void> => {
  const user = await getGithubUser();
  res.json(user ? { connected: true, login: user.login } : { connected: false });
});

// List repositories accessible to the connected GitHub account.
router.get("/github/repos", async (_req, res): Promise<void> => {
  try {
    res.json(await listRepos());
  } catch (err) {
    // Log the raw upstream detail server-side, return a generic message to the client.
    logger.error({ err }, "Failed to list GitHub repositories");
    res.status(502).json({ error: "Could not load repositories from GitHub." });
  }
});

// List branch names for a given repository.
router.get("/github/repos/:owner/:repo/branches", async (req, res): Promise<void> => {
  try {
    res.json(await listBranches(req.params.owner, req.params.repo));
  } catch (err) {
    logger.error(
      { err, owner: req.params.owner, repo: req.params.repo },
      "Failed to list GitHub branches",
    );
    res.status(502).json({ error: "Could not load branches from GitHub." });
  }
});

export default router;
