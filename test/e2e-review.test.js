import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import { VersionService } from '../src/index.js'

test('package.json and cordis.patch.yml alignment', () => {
  const pkgPath = path.resolve('package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  assert.equal(pkg.name, 'dsh-version-status')
  assert.equal(pkg.type, 'module')
  assert.ok(pkg.exports['.'])
  assert.ok(pkg.exports['./client'])
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh?.client?.platform, 'web')

  const patchContent = fs.readFileSync(path.resolve('cordis.patch.yml'), 'utf8')
  assert.ok(patchContent.includes('dsh-version-status'))
})

test('client bundle syntax and module structure', () => {
  const clientCode = fs.readFileSync(path.resolve('src/client.js'), 'utf8')
  
  let registeredModule = null
  const fakeWindow = {
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    __ModuleLoader__: {
      load: (mod) => {
        registeredModule = mod
      }
    }
  }

  const context = vm.createContext({
    window: fakeWindow,
    console
  })

  vm.runInContext(clientCode, context)
  assert.ok(registeredModule, 'Client must call window.__ModuleLoader__.load')
  assert.equal(registeredModule.id, 'dsh-version-status')
  assert.equal(typeof registeredModule.factory, 'function')
})

test('VersionService response contract against README specification', async () => {
  const service = new VersionService()
  const res = await service.getStatus({
    channel: 'latest',
    mockLatest: '0.1.4',
    mockAlpha: '0.1.5-alpha.1'
  })

  // Check required fields documented in README
  assert.equal(res.ok, true)
  assert.ok(typeof res.currentVersion === 'string')
  assert.equal(res.channel, 'latest')
  assert.equal(res.latestVersion, '0.1.4')
  assert.equal(res.alphaVersion, '0.1.5-alpha.1')
  assert.ok(res.channels.latest)
  assert.ok(res.channels.alpha)
  assert.ok(res.upgradeCommand)
  assert.ok(res.upgradeCommands.npm)
  assert.ok(res.upgradeCommands.pnpm)
  assert.ok(res.upgradeCommands.yarn)
  assert.ok(res.releaseUrl)
  assert.ok(res.sources)
})
