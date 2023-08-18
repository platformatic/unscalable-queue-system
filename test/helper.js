'use strict'

const { teardown } = require('tap')
const { join } = require('path')
const { readFile } = require('fs/promises')
const { setGlobalDispatcher, Agent } = require('undici')
const db = require('@platformatic/db')
const createConnectionPool = require('@databases/pg')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10
}))

const adminSecret = 'admin-secret'

async function getConfig () {
  const config = JSON.parse(await readFile(join(__dirname, '../platformatic.db.json'), 'utf8'))
  config.server.port = 0
  config.server.logger = { level: 'error' }
  // config.server.logger = false
  config.db.connectionString = 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  config.migrations.autoApply = true
  config.types.autogenerate = false
  config.authorization.adminSecret = adminSecret
  config.plugins.paths[0].options.leaderPoll = 1000
  return { config }
}

async function buildServer (teardown) {
  const { config } = await getConfig()
  const server = await db.buildServer(config)
  teardown(() => server.close())
  return server
}

let pool = null

async function cleandb () {
  if (!pool) {
    pool = createConnectionPool({
      connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
      bigIntMode: 'bigint'
    })
    teardown(() => pool.dispose())
  }

  const sql = createConnectionPool.sql

  // TODO use schemas
  try {
    await pool.query(sql`DROP TABLE MESSAGES;`)
  } catch {}
  try {
    await pool.query(sql`DROP TABLE CRONS;`)
  } catch {}
  try {
    await pool.query(sql`DROP TABLE QUEUES;`)
  } catch {}
  try {
    await pool.query(sql`DROP TABLE VERSIONS;`)
  } catch {}
}

module.exports.getConfig = getConfig
module.exports.adminSecret = adminSecret
module.exports.buildServer = buildServer
module.exports.cleandb = cleandb
