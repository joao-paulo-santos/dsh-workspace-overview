/**
 * dsh-workspace-overview - host half.
 *
 * Workspace-wide detection surface for the client half:
 *
 *   GET /workspace-overview/github?path=<absolute workspace path>
 *     -> { github: "owner/repo" }   when the workspace's .git has a
 *                                    github.com remote (origin preferred)
 *     -> { github: null }           no repo, no github remote, unreadable
 *
 * Results are cached per path (git config rarely changes mid-session; a
 * harness restart refreshes).
 */
export const name = 'workspace-overview'

export const inject = ['fs', 'webServer', 'granularSettings']

const msg = (error) => String((error && error.message) || error)

// Extract "owner/repo" from a git remote URL pointing at github.com.
// Handles ssh (git@github.com:owner/repo.git), https, and ssh:// forms.
const githubSlugOf = (url) => {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(String(url))
  return m !== null ? m[1] + '/' + m[2] : null
}

// Pull the origin remote's URL from a .git config body; fall back to the
// first remote when origin is absent.
const remoteUrlOf = (config) => {
  let url = undefined
  let inOrigin = false
  for (const line of String(config).split(/\r?\n/)) {
    const section = /^\[remote "([^"]+)"\]/.exec(line)
    if (section !== null) { inOrigin = section[1] === 'origin'; continue }
    if (inOrigin) {
      const m = /^\s*url\s*=\s*(\S+)/.exec(line)
      if (m !== null) { url = m[1]; break }
    }
  }
  if (url === undefined) {
    const first = /^\s*url\s*=\s*(\S+)/m.exec(config)
    if (first !== null) url = first[1]
  }
  return url
}

export function apply(ctx) {
  const fs = ctx.fs
  const webServer = ctx.webServer

  // The visibility toggle lives in the Plugin tab of Granular Settings
  // (global). The client reads it through the granularSettings facade;
  // the host only owns persistence here.
  const toggleSetting = ctx.granularSettings.register({
    namespace: 'workspace-overview', owner: 'Workspace Overview', scope: 'global',
    key: 'show-github-pill', type: 'toggle',
    label: 'GitHub pill in session header',
    description: 'Show a pill beside the session title when the current workspace has a github.com repository. Clicking opens the repository in a new tab.',
    defaultValue: true,
  })

  const cache = new Map()   // workspace path -> { github: slug | null }
  webServer.register({
    kind: 'exact',
    path: '/workspace-overview/github',
    handler: async (req, res) => {
      const sendJson = (status, body) => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(body))
      }
      try {
        const url = new URL(req.url, 'http://localhost')
        const path = url.searchParams.get('path')
        if (typeof path !== 'string' || path === '') { sendJson(400, { error: 'path required' }); return }
        if (cache.has(path)) { sendJson(200, cache.get(path)); return }
        let slug = null
        try {
          const config = await fs.readText(await fs.resolve(path + '/.git/config'))
          slug = githubSlugOf(remoteUrlOf(config))
        } catch (e) { slug = null }   // no repo or unreadable: not github
        const body = { github: slug }
        cache.set(path, body)
        sendJson(200, body)
      } catch (error) { sendJson(500, { error: msg(error) }) }
    },
  })

  return () => {
    try { toggleSetting.dispose() } catch (e) {}
  }
}
