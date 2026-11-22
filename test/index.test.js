import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import zlib from 'node:zlib'
import {
  parseSemver,
  compareSemver,
  parseGitHubReleaseTag,
  buildUpgradeCommands,
  detectLocalVersion,
  VersionService,
  safeFetchJson,
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
  
  // Test mockLatest, mockNext, and mockAlpha
  const resLatest = await service.getStatus({
    channel: 'latest',
    mockLatest: '99.0.0',
    mockNext: '99.0.5-rc.1',
    mockAlpha: '99.1.0-alpha.1'
  })
  assert.equal(resLatest.ok, true)
  assert.equal(resLatest.channel, 'latest')
  assert.equal(resLatest.latestVersion, '99.0.0')
  assert.equal(resLatest.nextVersion, '99.0.5-rc.1')
  assert.equal(resLatest.alphaVersion, '99.1.0-alpha.1')
  assert.equal(resLatest.updateAvailable, true)
  assert.equal(resLatest.channels.latest.updateAvailable, true)
  assert.equal(resLatest.channels.next.updateAvailable, true)

  // Test next channel selection
  const resNext = await service.getStatus({
    channel: 'next',
    mockLatest: '99.0.0',
    mockNext: '99.0.5-rc.1',
    mockAlpha: '99.1.0-alpha.1'
  })
  assert.equal(resNext.channel, 'next')
  assert.equal(resNext.targetVersion, '99.0.5-rc.1')
  assert.equal(resNext.updateAvailable, true)
  assert.equal(resNext.upgradeCommand, 'npm install -g @deepseek-ai/dsh@next')

  // Test alpha channel selection
  const resAlpha = await service.getStatus({
    channel: 'alpha',
    mockLatest: '99.0.0',
    mockNext: '99.0.5-rc.1',
    mockAlpha: '99.1.0-alpha.1'
  })
  assert.equal(resAlpha.channel, 'alpha')
  assert.equal(resAlpha.targetVersion, '99.1.0-alpha.1')
  assert.equal(resAlpha.updateAvailable, true)
  assert.equal(resAlpha.upgradeCommand, 'npm install -g @deepseek-ai/dsh@alpha')
})

test('apply Cordis plugin registration and route invocation', async () => {
  const routes = []
  const ctx = {
    effect(fn) {
      fn()
    },
    webServer: {
      host: '127.0.0.1',
      protocol: 'http:',
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

  // 1. GET request with mocks (loopback Host 通过来源 fence)
  const fakeReqGet = {
    method: 'GET',
    url: '/api/dsh-version?channel=next&mockLatest=1.0.0&mockNext=1.0.5-rc.1&mockAlpha=1.1.0-alpha.1',
    headers: { host: '127.0.0.1:3080' }
  }
  await handler(fakeReqGet, fakeRes)
  assert.equal(statusCode, 200)
  assert.equal(responseData.ok, true)
  assert.equal(responseData.channel, 'next')
  assert.equal(responseData.latestVersion, '1.0.0')
  assert.equal(responseData.nextVersion, '1.0.5-rc.1')
  assert.equal(responseData.alphaVersion, '1.1.0-alpha.1')
  assert.equal(responseData.targetVersion, '1.0.5-rc.1')
  assert.ok(responseData.channels.next)

  // 2. Method Not Allowed for POST
  const fakeReqPost = {
    method: 'POST',
    url: '/api/dsh-version',
    headers: { host: '127.0.0.1:3080' }
  }
  await handler(fakeReqPost, fakeRes)
  assert.equal(statusCode, 405)
  assert.equal(responseData.ok, false)
  assert.equal(responseData.error.code, 'METHOD_NOT_ALLOWED')
})

/**
 * 构造带 route 记录的 ctx；webServer.host/protocol 与 connection 服务可按需注入。
 * @param {{host?: string, protocol?: string, connection?: object}} [options]
 */
function createRouteHarness({ host = '127.0.0.1', protocol = 'http:', connection } = {}) {
  const routes = []
  const ctx = {
    effect(fn) {
      fn()
    },
    get(name) {
      // 真实 DSH 宿主的 ctx.get 对未知服务返回 null（不是 undefined），
      // 缺省就按这个形态注入，确保 fence 的 null 分支被真实覆盖。
      return name === 'connection' ? (connection ?? null) : undefined
    },
    webServer: {
      host,
      protocol,
      register(opts) {
        routes.push(opts)
        return () => {}
      }
    }
  }
  apply(ctx)
  return routes
}

/** 以给定 method/url/headers 调用路由 handler，返回 { status, body }。 */
async function invokeRoute(route, method, url, headers) {
  let status = 0
  let body = null
  const res = {
    writeHead(code) {
      status = code
    },
    end(chunk) {
      body = chunk ? JSON.parse(chunk) : null
    }
  }
  await route.handler({ method, url, headers }, res)
  return { status, body }
}

const versionQuery = '/api/dsh-version?channel=latest&mockLatest=1.0.0&mockNext=1.0.5-rc.1&mockAlpha=1.1.0-alpha.1'

test('来源 fence 拒绝伪造 Host、cross-site 与不匹配 Origin', async () => {
  const routes = createRouteHarness()
  const versionRoute = routes.find(r => r.path === '/api/dsh-version')
  const aliasRoute = routes.find(r => r.path === '/api/dsh-update/status')

  // DNS rebinding 形态：Origin 与 Host 同为攻击者域名，Origin 自洽也必须被 Host 白名单拒绝。
  const forged = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: 'evil.example.test:3080',
    origin: 'http://evil.example.test:3080'
  })
  assert.equal(forged.status, 403)
  assert.equal(forged.body.ok, false)
  assert.equal(forged.body.error.code, 'FORBIDDEN')
  assert.equal(forged.body.currentVersion, undefined)

  // 别名路由同样受保护。
  const forgedAlias = await invokeRoute(aliasRoute, 'GET', versionQuery, { host: 'evil.example.test:3080' })
  assert.equal(forgedAlias.status, 403)
  assert.equal(forgedAlias.body.error.code, 'FORBIDDEN')

  // 缺失 Host 与无法解析的 Host 一律拒绝。
  const noHost = await invokeRoute(versionRoute, 'GET', versionQuery, {})
  assert.equal(noHost.status, 403)
  const badHost = await invokeRoute(versionRoute, 'GET', versionQuery, { host: 'bad host' })
  assert.equal(badHost.status, 403)

  // 主机可信但浏览器标记跨站：拒绝。
  const crossSite = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: '127.0.0.1:3080',
    'sec-fetch-site': 'cross-site'
  })
  assert.equal(crossSite.status, 403)
  assert.equal(crossSite.body.error.code, 'FORBIDDEN')

  // 主机可信但 Origin 指向别的源：拒绝。
  const mismatched = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: '127.0.0.1:3080',
    origin: 'http://evil.example.test:3080'
  })
  assert.equal(mismatched.status, 403)

  // 非 http(s) Origin 与自洽但不同 authority 的 Origin 同样拒绝。
  const nullOrigin = await invokeRoute(aliasRoute, 'GET', versionQuery, {
    host: '127.0.0.1:3080',
    origin: 'null'
  })
  assert.equal(nullOrigin.status, 403)
})

test('来源 fence 放行正常 loopback 请求', async () => {
  const routes = createRouteHarness()
  const versionRoute = routes.find(r => r.path === '/api/dsh-version')
  const aliasRoute = routes.find(r => r.path === '/api/dsh-update/status')

  // 浏览器同源形态：Host 与 Origin 一致。
  const loopback = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: '127.0.0.1:3080',
    origin: 'http://127.0.0.1:3080'
  })
  assert.equal(loopback.status, 200)
  assert.equal(loopback.body.ok, true)
  assert.equal(loopback.body.channel, 'latest')

  // 无 Origin（同进程 / curl 形态）同样放行。
  const noOrigin = await invokeRoute(aliasRoute, 'GET', versionQuery, { host: '127.0.0.1:3080' })
  assert.equal(noOrigin.status, 200)
  assert.equal(noOrigin.body.ok, true)

  // localhost 与 [::1] 都是 loopback。
  const viaLocalhost = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: 'localhost:3080',
    origin: 'http://localhost:3080'
  })
  assert.equal(viaLocalhost.status, 200)
  const viaIpv6 = await invokeRoute(versionRoute, 'GET', versionQuery, {
    host: '[::1]:3080',
    origin: 'http://[::1]:3080'
  })
  assert.equal(viaIpv6.status, 200)

  // 监听器绑定非 loopback 地址时，浏览器用 bind 地址访问同样放行。
  const boundRoutes = createRouteHarness({ host: '192.168.1.5' })
  const viaBind = await invokeRoute(boundRoutes.find(r => r.path === '/api/dsh-version'), 'GET', versionQuery, {
    host: '192.168.1.5:3080',
    origin: 'http://192.168.1.5:3080'
  })
  assert.equal(viaBind.status, 200)

  // connection.trustedHosts 声明的部署域名。
  const trustedRoutes = createRouteHarness({ connection: { trustedHosts: ['harness.internal'] } })
  const viaTrusted = await invokeRoute(trustedRoutes.find(r => r.path === '/api/dsh-version'), 'GET', versionQuery, {
    host: 'harness.internal:3080',
    origin: 'http://harness.internal:3080'
  })
  assert.equal(viaTrusted.status, 200)
})

test('宿主提供 connection.isTrusted 时读请求委托官方判定', async () => {
  const routes = createRouteHarness({
    connection: { isTrusted: (req) => req.headers?.host === 'harness.internal:3080' }
  })
  const versionRoute = routes.find(r => r.path === '/api/dsh-version')

  // 官方判定拒绝的 Host 即便看起来像 loopback 也不放行。
  const rejected = await invokeRoute(versionRoute, 'GET', versionQuery, { host: '127.0.0.1:3080' })
  assert.equal(rejected.status, 403)

  // 官方判定认可的 Host 即便不是 loopback 也放行。
  const allowed = await invokeRoute(versionRoute, 'GET', versionQuery, { host: 'harness.internal:3080' })
  assert.equal(allowed.status, 200)
})

// 缺陷回归：t16 审查发现 F16-1。
// 真实宿主 ctx.get('connection') 返回 null 时，若空值判定写成 !== undefined，
// null 会进入官方判定分支读 null.isTrusted，抛 TypeError；该错误没有 statusCode，
// 被 guard 包成 500，围栏因此失效，还把内部错误文本泄漏给客户端。
test('无 connection 服务（ctx.get 返回 null）时伪造 Host 返回 403 而非 500', async () => {
  // 缺省 harness 的 connection 即 null，等价于真实宿主无 connection 服务。
  const routes = createRouteHarness()
  const versionRoute = routes.find(r => r.path === '/api/dsh-version')
  const aliasRoute = routes.find(r => r.path === '/api/dsh-update/status')

  for (const route of [versionRoute, aliasRoute]) {
    const forged = await invokeRoute(route, 'GET', versionQuery, {
      host: 'evil.example.test:3080',
      origin: 'http://evil.example.test:3080'
    })
    assert.equal(forged.status, 403, '无 connection 服务时伪造 Host 必须 403，不能退化为 500')
    assert.equal(forged.body.error.code, 'FORBIDDEN')

    // 不得把内部异常文本回传给客户端。
    const payload = JSON.stringify(forged.body)
    assert.doesNotMatch(payload, /TypeError/)
    assert.doesNotMatch(payload, /Cannot read properties/)
    assert.doesNotMatch(payload, /isTrusted/)
  }

  // 缺失 Host 同样走本地回退、得到 403。
  const noHost = await invokeRoute(versionRoute, 'GET', versionQuery, {})
  assert.equal(noHost.status, 403)
  assert.equal(noHost.body.error.code, 'FORBIDDEN')

  // 对照组：无 connection 服务时可信 loopback 仍要放行，
  // 证明 403 来自围栏判定本身，而不是把所有请求一律拒掉。
  const trusted = await invokeRoute(versionRoute, 'GET', versionQuery, { host: '127.0.0.1:3080' })
  assert.equal(trusted.status, 200, '无 connection 服务时 loopback 必须回退到本地 fence 并放行')
})

test('safeFetchJson handles gzipped payload without content-encoding header', async () => {
  const payload = { test: true, version: '1.2.3', list: [1, 2, 3] }
  const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))

  const server = http.createServer((req, res) => {
    // Deliberately omit content-encoding header to simulate proxy strip/bug
    res.writeHead(200, {
      'content-type': 'application/json'
    })
    res.end(gzipped)
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await safeFetchJson(`http://127.0.0.1:${port}/test`)
    assert.deepEqual(res, payload)
  } finally {
    server.close()
  }
})

test('safeFetchJson throws on non-200 HTTP responses', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    await assert.rejects(
      async () => safeFetchJson(`http://127.0.0.1:${port}/notfound`),
      /HTTP 404/
    )
  } finally {
    server.close()
  }
})

