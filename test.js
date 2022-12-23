'use strict'

const { test } = require('tap')
const { buildServer } = require('@platformatic/db')
const { join } = require('path')
const { readFile, rm } = require('fs/promises')
const { tmpdir } = require('os')
const { once, EventEmitter } = require('events')
const Fastify = require('fastify')

const { setGlobalDispatcher, Agent } = require('undici')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10
}))

let count = 0

function getFilename () {
  return join(tmpdir(), `test-${process.pid}-${count++}.db`)
}

async function getConfig () {
  const config = JSON.parse(await readFile(join(__dirname, './platformatic.db.json'), 'utf8'))
  config.server.port = 0
  config.server.logger = false
  const filename = getFilename()
  config.core.connectionString = `sqlite://${filename}`
  config.migrations.autoApply = true
  config.types.autogenerate = false
  return { config, filename }
}

test('happy path', async ({ teardown, equal, plan, same }) => {
  plan(5)
  const ee = new EventEmitter()
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const target = Fastify()
  target.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called')
    return { ok: true }
  })

  teardown(() => target.close())
  await target.listen({ port: 0 })
  const targetUrl = `http://${target.server.address().address}:${target.server.address().port}`

  let queueId
  {
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `
          mutation {
            saveQueue(input: { name: "test" }) {
              id
            }
          }
        `
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '1')
  }

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `
          mutation($body: String!, $queueId: ID, $callbackUrl: String!) {
            saveItem(input: { queueId: $queueId, callbackUrl: $callbackUrl, method: "POST", body: $body }) {
              id
              when
            }
          }
        `,
        variables: {
          body: msg,
          queueId,
          callbackUrl: targetUrl
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)
    const { data } = body
    const when = new Date(data.saveItem.when)
    equal(when.getTime() - now >= 0, true)
  }

  await p
})
