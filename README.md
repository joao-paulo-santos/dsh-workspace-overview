# dsh-workspace-overview

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)
plugin: a Workspace Overview tab beside Chat.

The Overview page itself is an empty state, but the tab is a **subtab
host**: other plugins contribute tabs through the `workspaceOverview`
facade (`registerTab({id,label,order}, Component)`), the same shape as
`granularSettings.registerTab`.

Also working: a **GitHub pill** in the session header when the current
workspace's `.git` config points at github.com. Clicking it opens the
repository in a new tab; visibility is the "GitHub pill in session header"
toggle in the Plugin tab of Granular Settings (default on).

## How to install

Requires a DeepSeek Harness checkout and a profile, here `web`. Clone the
dependencies and this plugin into a plugins folder:

```sh
mkdir -p ~/dsh-plugins && cd ~/dsh-plugins
git clone https://github.com/joao-paulo-santos/dsh-granular-settings.git
git clone https://github.com/joao-paulo-santos/dsh-workspace-overview.git

# from the harness checkout
pnpm dsh plugin --profile web add ~/dsh-plugins/dsh-granular-settings
pnpm dsh plugin --profile web add ~/dsh-plugins/dsh-workspace-overview

# verify the profile still composes
pnpm dsh --profile web --dump-config
```

Restart the harness; the tab appears beside Chat.

## Dependencies

- [dsh-granular-settings](https://github.com/joao-paulo-santos/dsh-granular-settings) owns the "GitHub pill in session header" toggle this plugin registers and reads (required; the plugin does not activate without it)

## Plugins dependent on this

- [dsh-workspace-history](https://github.com/joao-paulo-santos/dsh-workspace-history) contributes a History subtab listing the workspace's compaction journal
