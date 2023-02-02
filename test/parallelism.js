'use strict'

const { test } = require('tap')
const { buildServer } = require('@platformatic/db')
const { join } = require('path')
const { readFile, rm } = require('fs/promises')
const { tmpdir } = require('os')
const { once, EventEmitter, on } = require('events')
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

test('happy path', async ({ teardown, equal, plan, same, pass }) => {
  plan(5)
  const ee = new EventEmitter()
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const target = Fastify()
  const p = once(ee, 'called')
  let called = false
  target.post('/', async (req, reply) => {
    // This if block is to make sure that the first request waits
    // for the second to complete
    if (!called) {
      called = true
      await p
    } else {
      ee.emit('called')
    }
    
    pass('request completed')
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

  {
    const now = Date.now()
    const query = `
      mutation($messages: [MessageInput]!) {
        insertMessages(inputs: $messages) {
          id
          when
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
          messages: [{
            body: JSON.stringify({ message: 'HELLO FOLKS!' }),
            queueId
          }, {
            body: JSON.stringify({ message: 'HELLO FOLKS2!' }),
            queueId
          }]
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)
  }

  console.log('await p')
  await p
  await new Promise(resolve => setImmediate(resolve))
})
