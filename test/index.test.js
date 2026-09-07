import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSemver,
  compareSemver,
  parseGitHubReleaseTag,
  buildUpgradeCommands,
  detectLocalVersion,
  VersionService,
  sendJson,
  apply,
  name,
  inject
} from '../src/index.js'

test('plugin metadata', () => {
  assert.equal(name, 'update-notifier')
  assert.deepEqual(inject, ['webServer'])
})

test('parseSemver and compareSemver', () => {
  const v1 = parseSemver('0.1.2-rc.1')
  assert.ok(v1)
  assert.equal(v1.major, 0)
  assert.equal(v1.minor, 1)
  assert.equal(v1.patch, 2)
  assert.deepEqual(v1.prerelease, ['rc', '1'])

  assert.equal(compareSemver('0.1.3-alpha.1', '0.1.2-rc.1'), 1)
  assert.equal(compareSemver('0.1.2-rc.1', '0.1.3-alpha.1'), -1)
  assert.equal(compareSemver('0.1.2', '0.1.2-rc.1'), 1)
  assert.equal(compareSemver('0.1.2-rc.1', '0.1.2'), -1)
  assert.equal(compareSemver('0.1.2', '0.1.2'), 0)
  assert.equal(compareSemver('0.1.4', '0.1.3'), 1)
  assert.equal(compareSemver('0.1.2-alpha.5', '0.1.2-alpha.4'), 1)
  assert.equal(compareSemver('0.1.2-alpha.1', '0.1.2-alpha.2'), -1)
})

test('parseGitHubReleaseTag', () => {
  assert.equal(parseGitHubReleaseTag('dsh-v0.1.3-alpha.1'), '0.1.3-alpha.1')
  assert.equal(parseGitHubReleaseTag('v0.1.4'), '0.1.4')
  assert.equal(parseGitHubReleaseTag('0.1.2'), '0.1.2')
  assert.equal(parseGitHubReleaseTag('invalid-tag'), null)
  assert.equal(parseGitHubReleaseTag(''), null)
  assert.equal(parseGitHubReleaseTag(null), null)
})

test('buildUpgradeCommands', () => {
  const latestCmds = buildUpgradeCommands('latest')
  assert.equal(latestCmds.npm, 'npm install -g @deepseek-ai/dsh@latest')
  assert.equal(latestCmds.pnpm, 'pnpm add -g @deepseek-ai/dsh@latest')
  assert.equal(latestCmds.yarn, 'yarn global add @deepseek-ai/dsh@latest')
  assert.equal(latestCmds.tarball, undefined)

  const alphaTarball = 'https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/dsh-v0.1.3-alpha.1'
  const alphaCmds = buildUpgradeCommands('alpha', alphaTarball)
  assert.equal(alphaCmds.npm, 'npm install -g @deepseek-ai/dsh@alpha')
  assert.equal(alphaCmds.pnpm, 'pnpm add -g @deepseek-ai/dsh@alpha')
  assert.equal(alphaCmds.yarn, 'yarn global add @deepseek-ai/dsh@alpha')
  assert.equal(alphaCmds.tarball, `npm install -g ${alphaTarball}`)
})

test('detectLocalVersion', () => {
  const res = detectLocalVersion()
  assert.ok(res)
  assert.ok(typeof res.version === 'string')
  assert.ok(typeof res.source === 'string')
  assert.ok(parseSemver(res.version), 'Local version must be valid semver')
})

test('VersionService with mock parameters', async () => {
  const service = new VersionService({ cacheTtlMs: 1000 })
  
  // Test mockLatest and mockAlpha
  const resLatest = await service.getStatus({
    channel: 'latest',
    mockLatest: '99.0.0',
    mockAlpha: '99.1.0-alpha.1'
  })
  assert.equal(resLatest.ok, true)
  assert.equal(resLatest.channel, 'latest')
  assert.equal(resLatest.latestVersion, '99.0.0')
  assert.equal(resLatest.alphaVersion, '99.1.0-alpha.1')
  assert.equal(resLatest.updateAvailable, true)
  assert.equal(resLatest.channels.latest.updateAvailable, true)

  // Test alpha channel selection
  const resAlpha = await service.getStatus({
    channel: 'alpha',
    mockLatest: '99.0.0',
    mockAlpha: '99.1.0-alpha.1'
  })
  assert.equal(resAlpha.channel, 'alpha')
  assert.equal(resAlpha.targetVersion, '99.1.0-alpha.1')
  assert.equal(resAlpha.updateAvailable, true)
})

test('apply Cordis plugin registration and route invocation', async () => {
  const routes = []
  const ctx = {
    effect(fn) {
      fn()
    },
    webServer: {
      register(opts) {
        routes.push(opts)
      }
    }
  }

  apply(ctx)
  assert.equal(routes.length, 2)
  const paths = routes.map(r => r.path)
  assert.ok(paths.includes('/api/dsh-version'))
  assert.ok(paths.includes('/api/dsh-update/status'))

  // Test invocation of route handler
  const handler = routes.find(r => r.path === '/api/dsh-version').handler

  let statusCode = 0
  let responseData = null
  const fakeRes = {
    writeHead(code, headers) {
      statusCode = code
    },
    end(content) {
      responseData = JSON.parse(content)
    }
  }

  // 1. GET request with mocks
  const fakeReqGet = {
    method: 'GET',
    url: '/api/dsh-version?channel=alpha&mockLatest=1.0.0&mockAlpha=1.1.0-alpha.1'
  }
  await handler(fakeReqGet, fakeRes)
  assert.equal(statusCode, 200)
  assert.equal(responseData.ok, true)
  assert.equal(responseData.channel, 'alpha')
  assert.equal(responseData.latestVersion, '1.0.0')
  assert.equal(responseData.alphaVersion, '1.1.0-alpha.1')

  // 2. Method Not Allowed for POST
  const fakeReqPost = {
    method: 'POST',
    url: '/api/dsh-version'
  }
  await handler(fakeReqPost, fakeRes)
  assert.equal(statusCode, 405)
  assert.equal(responseData.ok, false)
  assert.equal(responseData.error.code, 'METHOD_NOT_ALLOWED')
})
