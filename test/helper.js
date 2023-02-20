'use strict'

const { join } = require('path')
const { readFile, rm } = require('fs/promises')
const { tmpdir } = require('os')
const { setGlobalDispatcher, Agent } = require('undici')
const db = require('@platformatic/db')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10
}))

let count = 0
const adminSecret = 'admin-secret'

function getFilename () {
  return join(tmpdir(), `test-${process.pid}-${count++}.db`)
}

async function getConfig () {
  const config = JSON.parse(await readFile(join(__dirname, '../platformatic.db.json'), 'utf8'))
  config.server.port = 0
  config.server.logger = false
  const filename = getFilename()
  config.core.connectionString = `sqlite://${filename}`
  config.migrations.autoApply = true
  config.types.autogenerate = false
  config.authorization.adminSecret = adminSecret
  return { config, filename }
}

async function buildServer (teardown) {
  const { config, filename } = await getConfig()
  const server = await db.buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))
  return server
}

module.exports.getConfig = getConfig
module.exports.adminSecret = adminSecret
module.exports.buildServer = buildServer
