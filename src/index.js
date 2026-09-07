import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export const name = 'update-notifier'
export const inject = ['webServer']

const DSH_PACKAGE = '@deepseek-ai/dsh'
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const REQUEST_TIMEOUT_MS = 5000

export const DIST_TAGS_ENDPOINTS = [
  'https://registry.npmmirror.com/-/package/@deepseek-ai/dsh/dist-tags',
  'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'
]

export const REGISTRY_ENDPOINTS = [
  'https://registry.npmmirror.com/@deepseek-ai%2fdsh/latest',
  'https://registry.npmjs.org/@deepseek-ai%2fdsh/latest'
]

export const GITHUB_RELEASES_ENDPOINTS = [
  'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases'
]

export const DEFAULT_RELEASE_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases'

/**
 * Extract clean semver string from a GitHub release tag name.
 * Handles formats: 'dsh-v0.1.3-alpha.1', 'v0.1.3-alpha.1', '0.1.3-alpha.1'
 * @param {string} tagName
 * @returns {string|null}
 */
export function parseGitHubReleaseTag(tagName) {
  if (!tagName || typeof tagName !== 'string') return null
  const m = tagName.trim().match(/^(?:dsh-)?v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/)
  return m ? m[1] : null
}

/**
 * Generate upgrade commands for a specific tag or package specifier.
 * Supports optional GitHub release tarball URL for zero-git environments.
 * @param {string} [tag='latest']
 * @param {string|null} [tarballUrl=null]
 * @returns {{ npm: string, pnpm: string, yarn: string, tarball?: string }}
 */
export function buildUpgradeCommands(tag = 'latest', tarballUrl = null) {
  const specifier = tag ? `${DSH_PACKAGE}@${tag}` : DSH_PACKAGE
  const cmds = {
    npm: `npm install -g ${specifier}`,
    pnpm: `pnpm add -g ${specifier}`,
    yarn: `yarn global add ${specifier}`
  }
  if (tarballUrl) {
    cmds.tarball = `npm install -g ${tarballUrl}`
  }
  return cmds
}

/**
 * Parse a semver string into structured components.
 * Supports standard semver 2.0: major.minor.patch[-prerelease][+build]
 * @param {string} v
 */
export function parseSemver(v) {
  if (!v || typeof v !== 'string') return null
  const cleaned = v.trim().replace(/^[vV]/, '')
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/)
  if (!match) return null

  return {
    raw: v,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : []
  }
}

/**
 * Compare two semver strings according to SemVer 2.0.0 rules.
 * @param {string} v1
 * @param {string} v2
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  const s1 = parseSemver(v1)
  const s2 = parseSemver(v2)

  if (!s1 || !s2) {
    if (s1 && !s2) return 1
    if (!s1 && s2) return -1
    return String(v1).localeCompare(String(v2))
  }

  if (s1.major !== s2.major) return s1.major > s2.major ? 1 : -1
  if (s1.minor !== s2.minor) return s1.minor > s2.minor ? 1 : -1
  if (s1.patch !== s2.patch) return s1.patch > s2.patch ? 1 : -1

  // Core versions match, compare prereleases
  const p1 = s1.prerelease
  const p2 = s2.prerelease

  // Normal version has higher precedence than prerelease version
  if (p1.length === 0 && p2.length > 0) return 1
  if (p1.length > 0 && p2.length === 0) return -1
  if (p1.length === 0 && p2.length === 0) return 0

  // Compare prerelease identifiers left to right
  const maxLen = Math.max(p1.length, p2.length)
  for (let i = 0; i < maxLen; i++) {
    const id1 = p1[i]
    const id2 = p2[i]

    if (id1 === undefined) return -1 // smaller set of prerelease identifiers
    if (id2 === undefined) return 1
    if (id1 === id2) continue

    const isNum1 = /^\d+$/.test(id1)
    const isNum2 = /^\d+$/.test(id2)

    if (isNum1 && isNum2) {
      const n1 = parseInt(id1, 10)
      const n2 = parseInt(id2, 10)
      if (n1 !== n2) return n1 > n2 ? 1 : -1
      continue
    }

    // Numeric identifiers have lower precedence than non-numeric
    if (isNum1 && !isNum2) return -1
    if (!isNum1 && isNum2) return 1

    // Both non-numeric: lexical comparison
    const cmp = id1.localeCompare(id2)
    if (cmp !== 0) return cmp > 0 ? 1 : -1
  }

  return 0
}

/**
 * Safely reads and parses package.json if it exists at target directory.
 * @param {string} dir
 */
function readPackageJsonVersion(dir) {
  try {
    const file = path.join(dir, 'package.json')
    if (!fs.existsSync(file)) return null
    const content = fs.readFileSync(file, 'utf8')
    const pkg = JSON.parse(content)
    if (pkg.name === DSH_PACKAGE && typeof pkg.version === 'string') {
      return { version: pkg.version, path: file }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Multi-tier detection of current local DSH version.
 * @returns {{ version: string, source: string, packagePath?: string }}
 */
export function detectLocalVersion() {
  // Tier 1: Traverse upwards from process.argv[1] (typically .../dsh/lib/bin.js)
  if (process.argv[1]) {
    try {
      let cur = path.resolve(path.dirname(process.argv[1]))
      for (let i = 0; i < 6; i++) {
        const res = readPackageJsonVersion(cur)
        if (res) {
          return { version: res.version, source: 'process-argv', packagePath: res.path }
        }
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
    } catch {}
  }

  // Tier 2: Check Windows global npm directory
  if (process.env.APPDATA) {
    const winGlobal = path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh')
    const res = readPackageJsonVersion(winGlobal)
    if (res) {
      return { version: res.version, source: 'global-npm-win', packagePath: res.path }
    }
  }

  // Tier 3: Check global pnpm directories
  if (process.env.LOCALAPPDATA) {
    const pnpmGlobal = path.join(process.env.LOCALAPPDATA, 'pnpm', 'global', '5', 'node_modules', '@deepseek-ai', 'dsh')
    const res = readPackageJsonVersion(pnpmGlobal)
    if (res) {
      return { version: res.version, source: 'global-pnpm-win', packagePath: res.path }
    }
  }

  // Tier 4: Check standard Unix / macOS paths
  const unixPaths = [
    '/usr/local/lib/node_modules/@deepseek-ai/dsh',
    '/usr/lib/node_modules/@deepseek-ai/dsh'
  ]
  for (const up of unixPaths) {
    const res = readPackageJsonVersion(up)
    if (res) {
      return { version: res.version, source: 'global-unix', packagePath: res.path }
    }
  }

  // Tier 5: Fallback to running CLI `dsh --version`
  try {
    const stdout = execSync('dsh --version', { encoding: 'utf8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (stdout) {
      const parsed = stdout.replace(/^[vV]/, '').split(/\s+/)[0]
      if (parseSemver(parsed)) {
        return { version: parsed, source: 'cli-exec' }
      }
    }
  } catch {}

  // Tier 6: Default fallback
  return { version: '0.1.2-rc.1', source: 'fallback-default' }
}

/**
 * Fetch all dist-tags from npm registry endpoints with dual-source fallback.
 * @param {object} [options]
 * @param {string[]} [options.endpoints]
 * @param {number} [options.timeout]
 * @returns {Promise<{ distTags: Record<string, string>, registryUrl: string }>}
 */
export async function fetchDistTags(options = {}) {
  const endpoints = options.endpoints || DIST_TAGS_ENDPOINTS
  const timeout = options.timeout || REQUEST_TIMEOUT_MS
  let lastError = null

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'dsh-version-status/0.1.4'
        },
        signal: AbortSignal.timeout(timeout)
      })

      if (!res.ok) {
        lastError = new Error(`Registry HTTP ${res.status}: ${res.statusText} (${url})`)
        continue
      }

      const data = await res.json()
      if (data && typeof data === 'object' && (typeof data.latest === 'string' || typeof data.alpha === 'string')) {
        return {
          distTags: data,
          registryUrl: url
        }
      }
      lastError = new Error(`Invalid dist-tags payload from ${url}`)
    } catch (err) {
      lastError = err
    }
  }

  // Fallback: try individual tag manifest
  try {
    const fallbackLatest = await fetchLatestVersion({ timeout })
    return {
      distTags: {
        latest: fallbackLatest.version
      },
      registryUrl: fallbackLatest.registryUrl
    }
  } catch {
    throw lastError || new Error('Failed to fetch dist-tags from all registry endpoints')
  }
}

/**
 * Fetch the latest version from npm registry endpoints with dual-source fallback.
 * Backward-compatible helper.
 * @param {object} [options]
 * @param {string[]} [options.endpoints]
 * @param {number} [options.timeout]
 * @returns {Promise<{ version: string, registryUrl: string }>}
 */
export async function fetchLatestVersion(options = {}) {
  const endpoints = options.endpoints || REGISTRY_ENDPOINTS
  const timeout = options.timeout || REQUEST_TIMEOUT_MS
  let lastError = null

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'dsh-version-status/0.1.4'
        },
        signal: AbortSignal.timeout(timeout)
      })

      if (!res.ok) {
        lastError = new Error(`Registry HTTP ${res.status}: ${res.statusText} (${url})`)
        continue
      }

      const data = await res.json()
      if (data && typeof data.version === 'string') {
        return {
          version: data.version.trim(),
          registryUrl: url
        }
      }
      lastError = new Error(`Invalid registry response payload from ${url}`)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Failed to fetch latest version from all registry endpoints')
}

/**
 * Fetch GitHub Releases for deepseek-harness with rate-limit and error resilience.
 * @param {object} [options]
 * @param {string[]} [options.endpoints]
 * @param {number} [options.timeout]
 * @returns {Promise<{ releases: Array<object>, latestAlpha: object|null, latestStable: object|null, githubUrl: string, error?: string }>}
 */
export async function fetchGitHubReleases(options = {}) {
  const endpoints = options.endpoints || GITHUB_RELEASES_ENDPOINTS
  const timeout = options.timeout || REQUEST_TIMEOUT_MS
  let lastError = null

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'dsh-version-status/0.1.4'
        },
        signal: AbortSignal.timeout(timeout)
      })

      if (!res.ok) {
        lastError = new Error(`GitHub API HTTP ${res.status}: ${res.statusText} (${url})`)
        continue
      }

      const data = await res.json()
      if (!Array.isArray(data)) {
        lastError = new Error(`Invalid GitHub releases payload from ${url}`)
        continue
      }

      const parsedReleases = []
      for (const item of data) {
        if (item.draft) continue
        const version = parseGitHubReleaseTag(item.tag_name)
        if (!version) continue
        const sem = parseSemver(version)
        if (!sem) continue

        const tagName = item.tag_name
        parsedReleases.push({
          tagName,
          version,
          name: item.name || tagName,
          prerelease: !!item.prerelease,
          publishedAt: item.published_at,
          htmlUrl: item.html_url || `https://github.com/deepseek-ai/deepseek-harness/releases/tag/${tagName}`,
          tarballUrl: `https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/${tagName}`
        })
      }

      let latestAlpha = null
      let latestStable = null

      for (const rel of parsedReleases) {
        const isAlpha = rel.version.includes('alpha') || (rel.prerelease && rel.version.includes('alpha'))
        if (isAlpha) {
          if (!latestAlpha || compareSemver(rel.version, latestAlpha.version) > 0) {
            latestAlpha = rel
          }
        }
        if (!rel.prerelease) {
          if (!latestStable || compareSemver(rel.version, latestStable.version) > 0) {
            latestStable = rel
          }
        }
      }

      // If no specific alpha found, fallback to highest prerelease
      if (!latestAlpha) {
        for (const rel of parsedReleases) {
          if (rel.prerelease) {
            if (!latestAlpha || compareSemver(rel.version, latestAlpha.version) > 0) {
              latestAlpha = rel
            }
          }
        }
      }

      return {
        releases: parsedReleases,
        latestAlpha,
        latestStable,
        githubUrl: url
      }
    } catch (err) {
      lastError = err
    }
  }

  // Graceful degradation: return empty release list with error recorded, do not throw
  return {
    releases: [],
    latestAlpha: null,
    latestStable: null,
    githubUrl: endpoints[0],
    error: lastError ? lastError.message : 'GitHub API unavailable'
  }
}

/**
 * Service class managing version checks, caching, channel support, and multi-source response assembly.
 */
export class VersionService {
  constructor(options = {}) {
    this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS
    this.requestTimeoutMs = options.requestTimeoutMs || REQUEST_TIMEOUT_MS
    this.cachedRaw = null
    this.inFlightPromise = null
  }

  /**
   * Builds update status, utilizing cache unless force is specified.
   * @param {object} [opts]
   * @param {boolean} [opts.force]
   * @param {string} [opts.channel] 'latest' | 'alpha'
   * @param {string} [opts.mockLatest]
   * @param {string} [opts.mockAlpha]
   * @param {object|null} [opts.mockGitHubRelease]
   */
  async getStatus(opts = {}) {
    const { force = false, channel = 'latest', mockLatest, mockAlpha, mockGitHubRelease } = opts
    const now = Date.now()

    // If mock parameters are provided, build instant synthetic result for testing
    if (mockLatest !== undefined || mockAlpha !== undefined || mockGitHubRelease !== undefined) {
      const local = detectLocalVersion()
      const effectiveLatest = mockLatest || '0.1.2-rc.1'
      let effectiveAlpha = mockAlpha
      let effectiveGh = null

      if (mockGitHubRelease !== undefined) {
        effectiveGh = mockGitHubRelease
        if (effectiveGh && !effectiveAlpha) {
          effectiveAlpha = effectiveGh.version
        }
      } else if (mockAlpha !== undefined) {
        if (mockAlpha) {
          effectiveGh = {
            tagName: `dsh-v${mockAlpha}`,
            version: mockAlpha,
            name: `v${mockAlpha}`,
            prerelease: true,
            publishedAt: '2026-09-04T11:34:32Z',
            htmlUrl: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${mockAlpha}`,
            tarballUrl: `https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/dsh-v${mockAlpha}`
          }
        }
      }

      return this._formatResponse({
        currentVersion: local.version,
        channel,
        distTags: {
          latest: effectiveLatest,
          alpha: effectiveAlpha || '0.1.2-alpha.5'
        },
        githubData: {
          releases: effectiveGh ? [effectiveGh] : [],
          latestAlpha: effectiveGh,
          latestStable: null
        },
        hasError: false,
        errorMessage: null,
        checkedAt: now,
        sources: {
          local: local.source,
          registry: 'mock-override',
          github: 'mock-override'
        }
      })
    }

    // Return unexpired cache if available and not forced
    if (!force && this.cachedRaw && (now - this.cachedRaw.checkedAt < this.cacheTtlMs)) {
      return this._formatResponse({
        ...this.cachedRaw,
        channel
      })
    }

    // Reuse in-flight fetch if multiple requests arrive simultaneously
    if (this.inFlightPromise) {
      const raw = await this.inFlightPromise
      return this._formatResponse({ ...raw, channel })
    }

    this.inFlightPromise = (async () => {
      const local = detectLocalVersion()
      let distTags = {}
      let registryUrl = null
      let githubData = null
      let hasError = false
      let errorMessage = null

      const [npmRes, ghRes] = await Promise.allSettled([
        fetchDistTags({ timeout: this.requestTimeoutMs }),
        fetchGitHubReleases({ timeout: this.requestTimeoutMs })
      ])

      if (npmRes.status === 'fulfilled') {
        distTags = npmRes.value.distTags || {}
        registryUrl = npmRes.value.registryUrl
      } else {
        hasError = true
        errorMessage = npmRes.reason instanceof Error ? npmRes.reason.message : String(npmRes.reason)

        // If we have stale cache, preserve its distTags while noting error
        if (this.cachedRaw && this.cachedRaw.distTags) {
          distTags = this.cachedRaw.distTags
          registryUrl = this.cachedRaw.sources?.registry || 'stale-cache'
        }
      }

      if (ghRes.status === 'fulfilled') {
        githubData = ghRes.value
      } else {
        githubData = {
          releases: [],
          latestAlpha: null,
          latestStable: null,
          error: ghRes.reason instanceof Error ? ghRes.reason.message : String(ghRes.reason)
        }
      }

      const rawResult = {
        currentVersion: local.version,
        distTags,
        githubData,
        hasError,
        errorMessage,
        checkedAt: Date.now(),
        sources: {
          local: local.source,
          registry: registryUrl || 'none',
          github: githubData?.githubUrl || GITHUB_RELEASES_ENDPOINTS[0]
        }
      }

      if (!hasError || !this.cachedRaw) {
        this.cachedRaw = rawResult
      }
      return rawResult
    })().finally(() => {
      this.inFlightPromise = null
    })

    const raw = await this.inFlightPromise
    return this._formatResponse({ ...raw, channel })
  }

  /**
   * Format structured API response with dual-channel metadata and multi-source arbitration.
   * @private
   */
  _formatResponse(data) {
    const localVersion = data.currentVersion
    const distTags = data.distTags || {}
    const githubData = data.githubData || {}
    const ghAlpha = githubData.latestAlpha || null
    const ghStable = githubData.latestStable || null

    // 1. Latest Version arbitration: compare npm latest with GitHub stable
    let latestVersion = distTags.latest || localVersion
    let latestSource = 'npm'
    if (ghStable && compareSemver(ghStable.version, latestVersion) > 0) {
      latestVersion = ghStable.version
      latestSource = 'github-release'
    }

    // 2. Alpha Version arbitration: compare npm alpha with GitHub alpha
    let alphaVersion = distTags.alpha || null
    let alphaSource = 'npm'
    let alphaReleaseTagName = null
    let alphaReleaseUrl = null
    let alphaTarballUrl = null

    if (ghAlpha) {
      if (!alphaVersion || compareSemver(ghAlpha.version, alphaVersion) >= 0) {
        alphaVersion = ghAlpha.version
        alphaSource = 'github-release'
        alphaReleaseTagName = ghAlpha.tagName
        alphaReleaseUrl = ghAlpha.htmlUrl
        alphaTarballUrl = ghAlpha.tarballUrl
      }
    }

    if (!alphaVersion) {
      alphaVersion = latestVersion
    }

    const channels = {}

    // 1. latest channel entry
    const latestCmp = compareSemver(latestVersion, localVersion)
    channels.latest = {
      tag: 'latest',
      version: latestVersion,
      source: latestSource,
      updateAvailable: latestCmp > 0,
      comparison: latestCmp,
      upgradeCommand: `npm install -g ${DSH_PACKAGE}@latest`,
      upgradeCommands: buildUpgradeCommands('latest')
    }

    // 2. alpha channel entry
    const alphaCmp = compareSemver(alphaVersion, localVersion)
    const alphaTarballCmd = alphaTarballUrl
      ? `npm install -g ${alphaTarballUrl}`
      : (alphaReleaseTagName ? `npm install -g https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/${alphaReleaseTagName}` : null)

    const alphaUpgradeCmds = buildUpgradeCommands('alpha', alphaTarballUrl)
    if (alphaTarballCmd && !alphaUpgradeCmds.tarball) {
      alphaUpgradeCmds.tarball = alphaTarballCmd
    }

    channels.alpha = {
      tag: 'alpha',
      version: alphaVersion,
      source: alphaSource,
      releaseTagName: alphaReleaseTagName || null,
      releaseUrl: alphaReleaseUrl || (alphaReleaseTagName ? `https://github.com/deepseek-ai/deepseek-harness/releases/tag/${alphaReleaseTagName}` : DEFAULT_RELEASE_URL),
      updateAvailable: alphaCmp > 0,
      comparison: alphaCmp,
      upgradeCommand: `npm install -g ${DSH_PACKAGE}@alpha`,
      upgradeCommands: alphaUpgradeCmds
    }

    const selectedChannel = data.channel === 'alpha' ? 'alpha' : 'latest'
    const activeChannel = channels[selectedChannel] || channels.latest
    const targetVersion = activeChannel.version
    const updateAvailable = activeChannel.updateAvailable

    const releaseUrl = activeChannel.releaseUrl || (ghAlpha ? ghAlpha.htmlUrl : DEFAULT_RELEASE_URL)

    return {
      ok: true,
      currentVersion: localVersion,
      channel: selectedChannel,
      latestVersion,
      alphaVersion,
      targetVersion,
      updateAvailable,
      hasUpdate: updateAvailable,
      distTags,
      githubRelease: ghAlpha ? {
        tagName: ghAlpha.tagName,
        version: ghAlpha.version,
        name: ghAlpha.name || ghAlpha.tagName,
        prerelease: ghAlpha.prerelease,
        publishedAt: ghAlpha.publishedAt,
        htmlUrl: ghAlpha.htmlUrl,
        tarballUrl: ghAlpha.tarballUrl
      } : null,
      channels,
      hasError: !!data.hasError,
      errorMessage: data.errorMessage || null,
      checkedAt: data.checkedAt,
      checkedAtIso: new Date(data.checkedAt).toISOString(),
      sources: data.sources || {
        local: 'unknown',
        registry: 'none',
        github: GITHUB_RELEASES_ENDPOINTS[0]
      },
      upgradeCommand: activeChannel.upgradeCommand,
      upgradeCommands: activeChannel.upgradeCommands,
      releaseUrl,
      changelogUrl: releaseUrl
    }
  }
}

/**
 * Send JSON HTTP response with no-store cache control.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {any} body
 */
export function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(body, null, 2))
}

/**
 * Cordis plugin apply entrypoint.
 * Registers WebServer routes:
 *   - GET /api/dsh-version
 *   - GET /api/dsh-update/status
 */
export function apply(ctx) {
  const service = new VersionService()

  async function handleStatusRequest(req, res) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } })
    }

    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const channel = url.searchParams.get('channel') || 'latest'
      const force = url.searchParams.has('force') || url.searchParams.has('refresh')
      const mockLatest = url.searchParams.get('mockLatest') || process.env.DSH_MOCK_LATEST_VERSION || undefined
      const mockAlpha = url.searchParams.get('mockAlpha') || process.env.DSH_MOCK_ALPHA_VERSION || undefined
      const mockGitHubRelease = url.searchParams.get('mockGitHubRelease') ? JSON.parse(url.searchParams.get('mockGitHubRelease')) : undefined

      const status = await service.getStatus({ force, channel, mockLatest, mockAlpha, mockGitHubRelease })
      sendJson(res, 200, status)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err)
        }
      })
    }
  }

  // 1. Register GET /api/dsh-version (Primary contract)
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-version',
      handler: handleStatusRequest
    })
  )

  // 2. Register GET /api/dsh-update/status (Alias for compatibility)
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-update/status',
      handler: handleStatusRequest
    })
  )
}
