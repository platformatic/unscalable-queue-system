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

const adminSecret = 'admin-secret'

let count = 0

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

test('happy path', async ({ teardown, equal, plan, same }) => {
  plan(6)
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
  const targetUrl = `http://localhost:${target.server.address().port}`

  let queueId
  {
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query: `
          mutation($callbackUrl: String!) {
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST" }) {
              id
            }
          }
        `,
        variables: {
          callbackUrl: targetUrl
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '1')
  }

  const p1 = once(ee, 'called')
  const schedule = '*/1 * * * * *'

  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const query = `
      mutation($body: String!, $queueId: ID, $schedule: String!) {
        saveCron(input: { queueId: $queueId, headers: "{ \\"content-type\\": \\"application/json\\" }", body: $body, schedule: $schedule }) {
          id
          schedule
        }
      }
    `

    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query,
        variables: {
          body: msg,
          queueId,
          schedule
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)

    const { data } = body
    equal(data.saveCron.schedule, schedule)

    /*
     * Add items
     *
     *     items {
     *       id
     *       when
     *     }
     *
     * equal(data.saveCron.items.length, 1)
     * const item = data.saveCron.items[0]
     * const when = new Date(item.when)
     * equal(when.getTime() - now <= 1000, true)
     */
  }

  await p1

  const p2 = once(ee, 'called')
  await p2
})

test('invalid cron expression', async ({ teardown, equal, plan, same }) => {
  plan(4)
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const targetUrl = 'http://localhost:4242'

  let queueId
  {
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query: `
          mutation($callbackUrl: String!) {
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST" }) {
              id
            }
          }
        `,
        variables: {
          callbackUrl: targetUrl
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '1')
  }

  const schedule = 'hello world'

  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const query = `
      mutation($body: String!, $queueId: ID, $schedule: String!) {
        saveCron(input: { queueId: $queueId, headers: "{ \\"content-type\\": \\"application/json\\" }", body: $body, schedule: $schedule }) {
          id
          schedule
        }
      }
    `

    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query,
        variables: {
          body: msg,
          queueId,
          schedule
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)
    same(body.errors[0].message, 'Invalid cron expression')
  }
})
