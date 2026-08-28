/**
 * dsh-workspace-overview - browser half.
 *
 * Two contributions:
 *
 *   1. "Workspace Overview" entry in the conversation.view seat, now a
 *      SUBTAB HOST: its own Overview page plus any tabs other plugins
 *      contribute through the workspaceOverview facade
 *      (registerTab({id,label,order}, Component) -> disposer, same shape
 *      as granularSettings.registerTab).
 *
 *   2. A GitHub pill in the session header's utilities slot: when the
 *      current workspace's .git config has a github.com remote, the pill
 *      links to the repository in a new tab. Visibility is the global
 *      'show-github-pill' setting, read through the granularSettings
 *      facade.
 */
window.__ModuleLoader__.load({ id: 'dsh-workspace-overview', factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;
  const React = require('react')

  let settingsService = undefined   // granularSettings (set in apply)

  // Standard GitHub mark, currentColor so themes apply.
  const GithubIcon = () => React.createElement('svg', {
    width: '14', height: '14', viewBox: '0 0 16 16', 'aria-hidden': 'true',
    fill: 'currentColor',
  }, React.createElement('path', { d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z' }))

  const OverviewEmpty = () => React.createElement('div', { className: 'wsov-empty' },
    React.createElement('h3', { className: 'wsov-title' }, 'Workspace overview'),
    React.createElement('p', { className: 'wsov-line' }, 'Nothing here yet. Workspace-wide information will land in this tab.'))

  // ---- the subtab registry (the facade other plugins consume) ----
  const tabRegistry = new Map()          // id -> { id, label, order, component }
  const tabListeners = new Set()
  const notifyAllTabs = () => { for (const fn of tabListeners) { try { fn() } catch (e) {} } }
  const sortedTabs = () => [...tabRegistry.values()].sort((a, b) =>
    a.order !== b.order ? (a.order < b.order ? -1 : 1) : (a.id < b.id ? -1 : 1))

  const workspaceOverviewApi = {
    /** Contribute one subtab to the Workspace Overview page.
     *  @param options { id, label, order } — id unique (duplicate throws),
     *    order sorts the strip (built-in Overview sits at 0).
     *  @param component renders the tab body; receives the conversation
     *    view's standard props (useSessions, useWorkspaces, sessionId…).
     *  @returns an exact disposer. */
    registerTab(options, component) {
      const where = 'workspaceOverview.registerTab: '
      if (options === null || typeof options !== 'object') throw new Error(where + 'options object required')
      if (typeof options.id !== 'string' || options.id === '' || options.id.length > 60) {
        throw new Error(where + 'id must be a non-empty string (max 60 chars)')
      }
      if (typeof options.label !== 'string' || options.label === '' || options.label.length > 60) {
        throw new Error(where + 'label must be a non-empty string (max 60 chars)')
      }
      if (typeof options.order !== 'number' || !Number.isFinite(options.order)) {
        throw new Error(where + 'order must be a finite number')
      }
      if (typeof component !== 'function') throw new Error(where + 'component function required')
      if (tabRegistry.has(options.id)) throw new Error(where + 'tab id "' + options.id + '" is already registered')
      tabRegistry.set(options.id, { id: options.id, label: options.label, order: options.order, component: component })
      notifyAllTabs()
      return () => {
        if (tabRegistry.get(options.id) !== undefined && tabRegistry.get(options.id).component === component) {
          tabRegistry.delete(options.id)
          notifyAllTabs()
        }
      }
    },
  }

  const OverviewTab = (props) => {
    const [tab, setTab] = React.useState('overview')
    const [, forceTabs] = React.useState(0)
    React.useEffect(() => {
      const fn = () => forceTabs((n) => n + 1)
      tabListeners.add(fn)
      return () => { tabListeners.delete(fn) }
    }, [])
    // A vanished contributor (plugin unloaded) must not leave a dead
    // active tab: fall back to Overview when the id no longer exists.
    const tabs = [{ id: 'overview', label: 'Overview', component: null }, ...sortedTabs()]
    const active = tabs.some((t) => t.id === tab) ? tab : 'overview'
    const activeEntry = tabs.find((t) => t.id === active)
    const strip = React.createElement('div', { className: 'wsov-subtabs' },
      tabs.map((t) => React.createElement('button', {
        key: t.id,
        type: 'button',
        className: 'wsov-subtab' + (active === t.id ? ' wsov-subtab-active' : ''),
        onClick: () => { setTab(t.id) },
      }, t.label)))
    const body = activeEntry !== undefined && typeof activeEntry.component === 'function'
      ? React.createElement(activeEntry.component, props)
      : React.createElement(OverviewEmpty)
    return React.createElement('div', { className: 'wsov-page' },
      strip,
      React.createElement('div', { className: 'wsov-tabbody' }, body))
  }

  const slugCache = new Map()   // workspace path -> slug | null

  const GithubPill = (props) => {
    const [show] = settingsService.useSetting('workspace-overview', 'global', 'show-github-pill')
    const path = props.useWorkspaces((st) => {
      const w = st.items.find((item) => item.workspaceId === st.recentWorkspaceId)
      return w !== undefined ? w.path : undefined
    })
    const [slug, setSlug] = React.useState(slugCache.has(path) ? slugCache.get(path) : undefined)
    React.useEffect(() => {
      if (typeof path !== 'string' || path === '') return
      if (slugCache.has(path)) { setSlug(slugCache.get(path)); return }
      let live = true
      fetch('/workspace-overview/github?path=' + encodeURIComponent(path))
        .then((r) => (r.ok ? r.json() : { github: null }))
        .then((body) => {
          const resolved = body !== null && typeof body === 'object' && typeof body.github === 'string' ? body.github : null
          slugCache.set(path, resolved)
          if (live) setSlug(resolved)
        }, () => {
          slugCache.set(path, null)
          if (live) setSlug(null)
        })
      return () => { live = false }
    }, [path])
    if (show !== true) return null
    if (typeof slug !== 'string' || slug === '') return null
    const repo = slug.split('/')[1]
    return React.createElement('a', {
      className: 'wsov-pill',
      href: 'https://github.com/' + slug,
      target: '_blank',
      rel: 'noreferrer',
      title: 'Open ' + slug + ' on GitHub',
    }, React.createElement(GithubIcon), React.createElement('span', { className: 'wsov-pill-label' }, repo))
  }

  module.exports = {
    name: 'workspace-overview-client',
    inject: ['slots', 'granularSettings'],
    apply(ctx) {
      settingsService = ctx.granularSettings
      ctx.provide('workspaceOverview', workspaceOverviewApi)
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-workspace-overview'
      tag.textContent = '.wsov-page{flex:1 1 auto;min-height:0;height:100%;max-width:1100px;width:100%;margin:0 auto;padding:24px 32px 0;box-sizing:border-box;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}'
        + '.wsov-subtabs{flex:none;display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid var(--dsw-alias-label-tertiary)}'
        + '.wsov-subtab{font:inherit;font-size:13px;padding:8px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-bottom:2px solid transparent;opacity:.65;margin-bottom:-1px}'
        + '.wsov-subtab:hover{opacity:1}'
        + '.wsov-subtab-active{opacity:1;border-bottom-color:#3b82f6;font-weight:600}'
        + '.wsov-tabbody{flex:1;min-height:0;display:flex;flex-direction:column}'
        + '.wsov-empty{margin:64px auto 0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:36px 28px;border:1px dashed var(--dsw-alias-label-tertiary);border-radius:12px;text-align:center;max-width:420px;width:100%}'
        + '.wsov-title{margin:0;font-size:15px;font-weight:650}'
        + '.wsov-line{margin:0;font-size:13px;opacity:.65}'
        + '.wsov-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:1;padding:4px 10px;text-decoration:none;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-label-tertiary);border-radius:999px}'
        + '.wsov-pill:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary)}'
        + '.wsov-pill-label{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      document.head.appendChild(tag)

      const offTab = ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: 'workspace-overview', order: 30, label: 'Workspace Overview' },
        OverviewTab))

      // The utilities seat is the shell's own top-right slot in the title
      // row (session log lives here); its container collapses when empty,
      // so an off toggle or non-github workspace costs nothing.
      const offPill = ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'github-pill', order: 40, label: 'GitHub' },
        GithubPill))

      return () => {
        try { offTab() } catch (e) {}
        try { offPill() } catch (e) {}
        try { tag.remove() } catch (e) {}
      }
    },
  }
  return module.exports
} })
