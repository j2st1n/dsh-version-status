/**
 * dsh-version-status — Client half (Web GUI).
 *
 * Hand-written __ModuleLoader__ bundle, zero build step.
 * Slots:
 *   - sidebar.footer.action : Pill capsule in sidebar footer (status light, version text, update badge, channel badge)
 *   - shell.overlay         : Floating detail panel (dual-channel toggle, version diff, one-click upgrade commands, changelog link)
 */
window.__ModuleLoader__.load({
  id: 'dsh-version-status',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useRef, useSyncExternalStore } = React

    // ---------- Channel Storage Helper ----------
    function getSavedChannel() {
      try {
        const val = window.localStorage?.getItem('dsh_version_status_channel')
        return val === 'alpha' ? 'alpha' : 'latest'
      } catch {
        return 'latest'
      }
    }

    function saveChannel(channel) {
      try {
        window.localStorage?.setItem('dsh_version_status_channel', channel)
      } catch {}
    }

    // ---------- Styles & Animations ----------
    const CSS = `
      div[class*="footerActions"] {
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
        width: 100% !important;
      }
      @keyframes dshUpdateFadeSlideUp {
        from { opacity: 0; transform: translateY(8px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dshUpdateFadeSlideDown {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(8px) scale(0.98); }
      }
      @keyframes dshUpdatePulse {
        0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55); }
        70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
        100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
      }
      @keyframes dshUpdateSpin {
        to { transform: rotate(360deg); }
      }
      .dsh-update-panel-enter {
        animation: dshUpdateFadeSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .dsh-update-panel-exit {
        animation: dshUpdateFadeSlideDown 0.14s ease-in both;
        pointer-events: none !important;
      }
      .dsh-update-dot-pulse {
        animation: dshUpdatePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      .dsh-update-spin {
        display: inline-block;
        animation: dshUpdateSpin 0.9s linear infinite;
      }
      .dsh-update-btn {
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
      }
      .dsh-update-btn:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08)) !important;
      }
      .dsh-update-btn:active:not(:disabled) {
        transform: scale(0.97);
      }
      .dsh-update-pill:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06)) !important;
        border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15)) !important;
      }
      .dsh-channel-tab {
        transition: all 0.15s ease;
      }
      .dsh-channel-tab:hover:not(.active) {
        background: rgba(255, 255, 255, 0.06) !important;
        color: var(--dsw-alias-label-primary, #f4f4f5) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-update-panel-enter, .dsh-update-panel-exit, .dsh-update-dot-pulse, .dsh-update-spin {
          animation: none !important;
        }
      }
    `

    // ---------- Theme Tokens ----------
    const T = {
      bg: 'var(--dsw-alias-bg-layer-2, #18181b)',
      well: 'var(--dsw-alias-bg-layer-1, #27272a)',
      border: 'var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1))',
      border2: 'var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18))',
      label: 'var(--dsw-alias-label-primary, #f4f4f5)',
      secondary: 'var(--dsw-alias-label-secondary, #a1a1aa)',
      brand: 'var(--dsw-alias-brand-primary, #3b82f6)',
      ok: 'var(--dsw-alias-state-success-primary, #10b981)',
      warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      err: 'var(--dsw-alias-state-error-primary, #ef4444)',
      purple: '#a855f7',
    }

    // ---------- Global Store ----------
    const store = {
      state: {
        open: false,
        phase: 'closed', // 'closed' | 'open' | 'closing'
        loading: false,
        copiedKey: null,
        selectedTab: 'npm', // 'npm' | 'pnpm' | 'yarn' | 'tarball'
        selectedChannel: getSavedChannel(), // 'latest' | 'alpha'
        status: {
          ok: true,
          currentVersion: '...',
          channel: 'latest',
          latestVersion: '...',
          alphaVersion: '...',
          targetVersion: '...',
          updateAvailable: false,
          hasUpdate: false,
          hasError: false,
          errorMessage: null,
          checkedAt: 0,
          channels: {
            latest: {
              tag: 'latest',
              version: '...',
              source: 'npm',
              updateAvailable: false,
              comparison: 0,
              upgradeCommand: 'npm install -g @deepseek-ai/dsh@latest',
              upgradeCommands: {
                npm: 'npm install -g @deepseek-ai/dsh@latest',
                pnpm: 'pnpm add -g @deepseek-ai/dsh@latest',
                yarn: 'yarn global add @deepseek-ai/dsh@latest'
              }
            },
            alpha: {
              tag: 'alpha',
              version: '...',
              source: 'github-release',
              updateAvailable: false,
              comparison: 0,
              upgradeCommand: 'npm install -g @deepseek-ai/dsh@alpha',
              upgradeCommands: {
                npm: 'npm install -g @deepseek-ai/dsh@alpha',
                pnpm: 'pnpm add -g @deepseek-ai/dsh@alpha',
                yarn: 'yarn global add @deepseek-ai/dsh@alpha'
              }
            }
          },
          upgradeCommand: 'npm install -g @deepseek-ai/dsh@latest',
          upgradeCommands: {
            npm: 'npm install -g @deepseek-ai/dsh@latest',
            pnpm: 'pnpm add -g @deepseek-ai/dsh@latest',
            yarn: 'yarn global add @deepseek-ai/dsh@latest'
          },
          releaseUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases'
        }
      },
      listeners: new Set(),
      set(patch) {
        store.state = { ...store.state, ...patch }
        for (const fn of store.listeners) fn()
      },
      subscribe(fn) {
        store.listeners.add(fn)
        return () => store.listeners.delete(fn)
      }
    }

    function useStore() {
      return useSyncExternalStore(store.subscribe, () => store.state)
    }

    // ---------- API Call ----------
    async function fetchUpdateStatus(force = false) {
      store.set({ loading: true })
      try {
        const channel = store.state.selectedChannel || 'latest'
        const url = `/api/dsh-version?channel=${channel}${force ? '&force=1' : ''}`
        const res = await fetch(url, {
          headers: { accept: 'application/json' },
          cache: 'no-store'
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data && data.ok) {
          store.set({ status: data, loading: false })
        } else {
          store.set({ loading: false })
        }
      } catch (err) {
        store.set({
          loading: false,
          status: {
            ...store.state.status,
            hasError: true,
            errorMessage: err.message || '网络检查异常'
          }
        })
      }
    }

    // ---------- Helpers ----------
    async function copyToClipboard(text, key) {
      let copied = false
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          copied = true
        } catch (err) {
          // Clipboard API rejected, fall through to fallback
        }
      }
      if (!copied) {
        try {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          copied = document.execCommand('copy')
          document.body.removeChild(ta)
        } catch (e) {
          console.error('Failed to copy command via fallback:', e)
        }
      }
      if (copied) {
        store.set({ copiedKey: key })
        setTimeout(() => {
          if (store.state.copiedKey === key) {
            store.set({ copiedKey: null })
          }
        }, 2000)
      }
    }

    function toggleOpen() {
      const s = store.state
      if (s.phase === 'open') {
        store.set({ phase: 'closing' })
        setTimeout(() => {
          store.set({ open: false, phase: 'closed' })
        }, 150)
      } else {
        store.set({ open: true, phase: 'open' })
        // If not checked yet, fetch status
        if (!s.status.checkedAt) {
          fetchUpdateStatus(false)
        }
      }
    }

    function closePanel() {
      if (store.state.phase === 'open') {
        store.set({ phase: 'closing' })
        setTimeout(() => {
          store.set({ open: false, phase: 'closed' })
        }, 150)
      }
    }

    function formatTime(timestamp) {
      if (!timestamp) return '未检测'
      const d = new Date(timestamp)
      const now = Date.now()
      const diffSec = Math.floor((now - timestamp) / 1000)
      if (diffSec < 60) return '刚刚'
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      return `今日 ${h}:${m}`
    }

    // ---------- SVG Icons ----------
    const Icons = {
      rocket: () =>
        h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' }),
          h('path', { d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' }),
          h('path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' }),
          h('path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' })
        ),
      copy: () =>
        h('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
          h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
        ),
      check: () =>
        h('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('polyline', { points: '20 6 9 17 4 12' })
        ),
      refresh: () =>
        h('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' })
        ),
      external: () =>
        h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
          h('polyline', { points: '15 3 21 3 21 9' }),
          h('line', { x1: 10, y1: 14, x2: 21, y2: 3 })
        ),
      close: () =>
        h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
          h('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
        ),
      flask: () =>
        h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M10 2v7.31L4.62 17.8A2 2 0 0 0 6.31 21h11.38a2 2 0 0 0 1.69-3.2L14 9.31V2' }),
          h('line', { x1: 8, y1: 2, x2: 16, y2: 2 }),
          h('line', { x1: 8.5, y1: 15, x2: 15.5, y2: 15 })
        ),
      star: () =>
        h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })
        )
    }

    // ---------- Component: Footer Capsule Entry ----------
    function FooterEntry(props) {
      const state = useStore()
      const { wide } = props
      const st = state.status
      const selectedChannel = state.selectedChannel
      const chData = st.channels?.[selectedChannel] || {
        version: selectedChannel === 'alpha' ? st.alphaVersion : st.latestVersion,
        updateAvailable: st.updateAvailable
      }
      const hasUpdate = chData.updateAvailable
      const isFolded = wide === false

      // On mount: fetch initial status if not yet loaded
      useEffect(() => {
        if (!st.checkedAt) {
          fetchUpdateStatus(false)
        }
      }, [])

      // Indicator color & pulse
      const dotColor = state.loading
        ? T.brand
        : hasUpdate
          ? T.warn
          : st.hasError
            ? T.err
            : T.ok

      const channelPrefix = selectedChannel === 'alpha' ? 'DSH(α)' : 'DSH'
      const tooltip = hasUpdate
        ? `[${selectedChannel.toUpperCase()}] 当前运行 v${st.currentVersion} · 发现新版 v${chData.version} (点击查看升级与版本对比)`
        : `[${selectedChannel.toUpperCase()}] DSH v${st.currentVersion} (已是当前通道最新)`

      // Folded Rail (Compact Icon) Mode
      if (isFolded) {
        return h(
          'button',
          {
            className: 'dsh-update-btn',
            onClick: toggleOpen,
            title: tooltip,
            style: {
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${hasUpdate ? T.warn : T.border}`,
              background: hasUpdate ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
              color: hasUpdate ? T.warn : T.label,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              margin: '0 auto',
              padding: 0,
            }
          },
          [
            hasUpdate ? h(Icons.rocket) : h('span', {
              style: {
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
              }
            }),
            hasUpdate ? h('span', {
              className: 'dsh-update-dot-pulse',
              style: {
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: T.warn,
              }
            }) : null
          ]
        )
      }

      // Expanded Sidebar (Full Pill Capsule) Mode:
      // Capsule text is constantly pinned to current running version (v${st.currentVersion})!
      return h(
        'div',
        {
          className: 'dsh-update-pill dsh-update-btn',
          onClick: toggleOpen,
          title: tooltip,
          style: {
            display: 'flex',
            alignItems: 'center',
            height: 28,
            width: '100%',
            padding: '0 8px',
            borderRadius: 7,
            border: `1px solid ${hasUpdate ? 'rgba(245, 158, 11, 0.4)' : T.border}`,
            background: hasUpdate ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            userSelect: 'none',
            boxSizing: 'border-box',
          }
        },
        [
          // Dot or spinner
          state.loading
            ? h('span', {
                className: 'dsh-update-spin',
                style: {
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: `2px solid ${T.brand}`,
                  borderTopColor: 'transparent',
                  marginRight: 7,
                  flexShrink: 0
                }
              })
            : h('span', {
                className: hasUpdate ? 'dsh-update-dot-pulse' : '',
                style: {
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: dotColor,
                  marginRight: 7,
                  flexShrink: 0
                }
              }),

          // Constant Local Version Text: ● DSH · v0.1.2-rc.1 (or DSH(α) · v0.1.2-rc.1)
          h('span', {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: '18px',
              whiteSpace: 'nowrap',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1
            }
          }, [
            h('span', {
              key: 'prefix',
              style: {
                fontWeight: 700,
                color: hasUpdate ? T.warn : (selectedChannel === 'alpha' ? T.purple : T.label),
                flexShrink: 0
              }
            }, channelPrefix),
            h('span', {
              key: 'sep',
              style: {
                color: T.secondary,
                margin: '0 5px',
                opacity: 0.7,
                flexShrink: 0
              }
            }, '·'),
            h('span', {
              key: 'ver',
              style: {
                color: hasUpdate ? T.label : T.secondary,
                fontWeight: hasUpdate ? 600 : 400,
                fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }
            }, `v${st.currentVersion}`)
          ]),

          // Right badge
          hasUpdate
            ? h('span', {
                style: {
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  background: T.warn,
                  padding: '1px 5px',
                  borderRadius: 4,
                  marginLeft: 4,
                  flexShrink: 0,
                  letterSpacing: '0.3px'
                }
              }, 'UPGRADE')
            : (selectedChannel === 'alpha'
                ? h('span', {
                    style: {
                      fontSize: 9,
                      fontWeight: 600,
                      color: T.purple,
                      background: 'rgba(168, 85, 247, 0.15)',
                      padding: '1px 4px',
                      borderRadius: 3,
                      marginLeft: 4,
                      flexShrink: 0
                    }
                  }, 'α')
                : h('span', {
                    style: {
                      fontSize: 10,
                      color: T.secondary,
                      opacity: 0.6,
                      marginLeft: 4,
                      flexShrink: 0
                    }
                  }, '✓')
              )
        ]
      )
    }

    // ---------- Component: Overlay Panel ----------
    function OverlayPanel() {
      const state = useStore()
      const panelRef = useRef(null)
      const { phase, status: st, copiedKey, selectedTab, selectedChannel, loading } = state

      // Active channel data
      const chData = st.channels?.[selectedChannel] || {
        tag: selectedChannel,
        version: selectedChannel === 'alpha' ? (st.alphaVersion || st.latestVersion) : st.latestVersion,
        source: selectedChannel === 'alpha' ? 'github-release' : 'npm',
        updateAvailable: st.updateAvailable,
        comparison: 0,
        upgradeCommand: selectedChannel === 'alpha' ? 'npm install -g @deepseek-ai/dsh@alpha' : 'npm install -g @deepseek-ai/dsh@latest',
        upgradeCommands: {
          npm: `npm install -g @deepseek-ai/dsh@${selectedChannel}`,
          pnpm: `pnpm add -g @deepseek-ai/dsh@${selectedChannel}`,
          yarn: `yarn global add @deepseek-ai/dsh@${selectedChannel}`
        }
      }

      const hasUpdate = chData.updateAvailable
      const comparison = chData.comparison ?? 0

      // Close on clicking outside
      useEffect(() => {
        if (phase !== 'open') return
        function handleOutside(e) {
          if (panelRef.current && !panelRef.current.contains(e.target)) {
            const trigger = document.querySelector('.dsh-update-pill, .dsh-update-btn')
            if (trigger && trigger.contains(e.target)) return
            closePanel()
          }
        }
        window.addEventListener('mousedown', handleOutside)
        return () => window.removeEventListener('mousedown', handleOutside)
      }, [phase])

      if (phase === 'closed') return null

      const availableTabs = (chData.upgradeCommands && chData.upgradeCommands.tarball)
        ? ['npm', 'pnpm', 'yarn', 'tarball']
        : ['npm', 'pnpm', 'yarn']

      const currentTab = availableTabs.includes(selectedTab) ? selectedTab : 'npm'
      const activeCommand = (chData.upgradeCommands && chData.upgradeCommands[currentTab]) || chData.upgradeCommand

      function setChannel(channel) {
        store.set({ selectedChannel: channel })
        saveChannel(channel)
      }

      // Check if other channel has update available for badge
      const latestHasUpdate = st.channels?.latest?.updateAvailable
      const alphaHasUpdate = st.channels?.alpha?.updateAvailable

      return h(
        'div',
        {
          ref: panelRef,
          className: phase === 'closing' ? 'dsh-update-panel-exit' : 'dsh-update-panel-enter',
          style: {
            position: 'fixed',
            left: 12,
            bottom: 54,
            width: 378,
            maxWidth: 'calc(100vw - 24px)',
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pointerEvents: phase === 'closing' ? 'none' : 'auto',
            zIndex: 70,
            fontSize: 12,
            lineHeight: 1.4,
          }
        },
        [
          // Header
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: `1px solid ${T.border}`,
              background: 'rgba(255, 255, 255, 0.02)'
            }
          }, [
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: T.label } }, [
              h(Icons.rocket),
              'DSH 版本检测'
            ]),
            // Status Tag
            h('span', {
              style: {
                marginLeft: 8,
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: hasUpdate ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: hasUpdate ? T.warn : T.ok,
                fontWeight: 500,
              }
            }, hasUpdate ? '发现新版本' : '已是最新'),

            // Close button
            h('button', {
              className: 'dsh-update-btn',
              onClick: closePanel,
              title: '关闭',
              style: {
                marginLeft: 'auto',
                border: 'none',
                background: 'transparent',
                color: T.secondary,
                cursor: 'pointer',
                padding: '3px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            }, h(Icons.close))
          ]),

          // Body Content
          h('div', { style: { padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 } }, [
            // Channel Switcher Segmented Control
            h('div', {
              style: {
                display: 'flex',
                background: 'rgba(0,0,0,0.35)',
                padding: '3px',
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                gap: 4
              }
            }, [
              // Latest Tab
              h('button', {
                className: `dsh-channel-tab ${selectedChannel === 'latest' ? 'active' : ''}`,
                onClick: () => setChannel('latest'),
                style: {
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: selectedChannel === 'latest' ? 600 : 400,
                  background: selectedChannel === 'latest' ? T.brand : 'transparent',
                  color: selectedChannel === 'latest' ? '#fff' : T.secondary,
                }
              }, [
                h(Icons.star),
                '稳定版 (Latest)',
                latestHasUpdate ? h('span', {
                  style: {
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: T.warn,
                    display: 'inline-block'
                  }
                }) : null
              ]),

              // Alpha Tab
              h('button', {
                className: `dsh-channel-tab ${selectedChannel === 'alpha' ? 'active' : ''}`,
                onClick: () => setChannel('alpha'),
                style: {
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: selectedChannel === 'alpha' ? 600 : 400,
                  background: selectedChannel === 'alpha' ? T.purple : 'transparent',
                  color: selectedChannel === 'alpha' ? '#fff' : T.secondary,
                }
              }, [
                h(Icons.flask),
                '尝鲜版 (Alpha)',
                alphaHasUpdate ? h('span', {
                  style: {
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: T.warn,
                    display: 'inline-block'
                  }
                }) : null
              ])
            ]),

            // Version Comparison Card
            h('div', {
              style: {
                background: T.well,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }
            }, [
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                // Local version box
                h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
                  h('span', { style: { fontSize: 10, color: T.secondary } }, '当前运行版本'),
                  h('span', { style: { fontSize: 13, fontWeight: 600, color: T.label, fontFamily: 'monospace' } }, `v${st.currentVersion}`)
                ]),

                // Arrow
                h('span', { style: { fontSize: 14, color: hasUpdate ? T.warn : T.secondary, opacity: 0.8 } }, '➔'),

                // Target version box
                h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } }, [
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, [
                    h('span', { style: { fontSize: 10, color: T.secondary } },
                      selectedChannel === 'alpha'
                        ? (chData.source === 'github-release' ? 'GitHub Releases (先行版)' : 'npm 尝鲜版本 (alpha)')
                        : 'npm 稳定版本 (latest)'
                    ),
                    chData.source === 'github-release' ? h('span', {
                      style: {
                        fontSize: 9,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: T.brand,
                        fontWeight: 600
                      }
                    }, 'GH') : null
                  ]),
                  h('span', {
                    style: {
                      fontSize: 13,
                      fontWeight: 600,
                      color: hasUpdate ? T.warn : (selectedChannel === 'alpha' ? T.purple : T.ok),
                      fontFamily: 'monospace'
                    }
                  }, `v${chData.version || '...'}`)
                ])
              ]),

              // Comparison note
              h('div', {
                style: {
                  fontSize: 11,
                  color: hasUpdate ? T.warn : T.secondary,
                  borderTop: `1px dashed ${T.border}`,
                  paddingTop: 8,
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }
              }, [
                h('span', null,
                  comparison > 0
                    ? (selectedChannel === 'alpha'
                        ? `★ 发现新版 Alpha (v${chData.version})，可升级尝鲜体验`
                        : `★ 发现新稳定版 (v${chData.version})，建议及时升级`)
                    : comparison === 0
                      ? '✓ 当前运行已是此通道最新版本'
                      : 'ℹ 当前运行版本高于此通道版本'
                ),
                h('span', { style: { fontSize: 10, color: T.secondary, opacity: 0.75 } }, formatTime(st.checkedAt))
              ])
            ]),

            // One-Click Upgrade Command Section
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, [
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                h('span', { style: { fontSize: 11, fontWeight: 500, color: T.label } },
                  selectedChannel === 'alpha' ? 'Alpha 安装指令（一键复制）：' : '升级命令（一键复制）：'
                ),
                // Package Manager Tabs
                h('div', { style: { display: 'flex', gap: 4 } }, availableTabs.map(tab =>
                  h('button', {
                    key: tab,
                    className: 'dsh-update-btn',
                    onClick: () => store.set({ selectedTab: tab }),
                    style: {
                      border: 'none',
                      background: currentTab === tab ? (selectedChannel === 'alpha' ? T.purple : T.brand) : 'rgba(255,255,255,0.06)',
                      color: currentTab === tab ? '#fff' : T.secondary,
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: currentTab === tab ? 600 : 400
                    }
                  }, tab === 'tarball' ? 'tarball (容灾)' : tab)
                ))
              ]),

              // Code Box with Copy Button
              h('div', {
                style: {
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxSizing: 'border-box'
                }
              }, [
                h('code', {
                  style: {
                    flex: 1,
                    fontFamily: 'Consolas, Menlo, monospace',
                    fontSize: 11,
                    color: T.label,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    userSelect: 'all'
                  }
                }, activeCommand),

                // Copy Action Button
                h('button', {
                  className: 'dsh-update-btn',
                  onClick: () => copyToClipboard(activeCommand, `${selectedChannel}-${currentTab}`),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    border: `1px solid ${copiedKey === `${selectedChannel}-${currentTab}` ? T.ok : T.border2}`,
                    background: copiedKey === `${selectedChannel}-${currentTab}` ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    color: copiedKey === `${selectedChannel}-${currentTab}` ? T.ok : T.label,
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }
                }, [
                  copiedKey === `${selectedChannel}-${currentTab}` ? h(Icons.check) : h(Icons.copy),
                  copiedKey === `${selectedChannel}-${currentTab}` ? '已复制 ✓' : '复制'
                ])
              ])
            ])
          ]),

          // Ops Footer Bar
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderTop: `1px solid ${T.border}`,
              background: 'rgba(255, 255, 255, 0.02)'
            }
          }, [
            // Changelog Link
            h('a', {
              href: chData.releaseUrl || st.releaseUrl || 'https://github.com/deepseek-ai/deepseek-harness/releases',
              target: '_blank',
              rel: 'noopener noreferrer',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: T.brand,
                textDecoration: 'none',
                fontSize: 11
              }
            }, [
              chData.source === 'github-release' ? 'Release 页面' : '更新日志',
              h(Icons.external)
            ]),

            // Check Now Button
            h('button', {
              className: 'dsh-update-btn',
              disabled: loading,
              onClick: () => fetchUpdateStatus(true),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                border: `1px solid ${T.border2}`,
                background: 'rgba(255, 255, 255, 0.05)',
                color: T.label,
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                cursor: loading ? 'default' : 'pointer'
              }
            }, [
              loading
                ? h('span', { className: 'dsh-update-spin' }, h(Icons.refresh))
                : h(Icons.refresh),
              loading ? '检查中...' : '检查更新'
            ])
          ])
        ]
      )
    }

    // ---------- Plugin Apply Entrypoint ----------
    function apply(ctx) {
      // 1. Inject Stylesheet into Document Head
      ctx.effect(() => {
        const el = document.createElement('style')
        el.id = 'dsh-update-notifier-styles'
        el.textContent = CSS
        document.head.appendChild(el)
        return () => el.remove()
      })

      // 2. Register Sidebar Footer Action Capsule
      ctx.effect(() =>
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-update-notifier', order: 20 },
            (props) => h(FooterEntry, props)
          )
        )
      )

      // 3. Register Shell Overlay Floating Panel
      ctx.effect(() =>
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-update-panel', order: 20 },
            () => h(OverlayPanel)
          )
        )
      )
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  }
})
