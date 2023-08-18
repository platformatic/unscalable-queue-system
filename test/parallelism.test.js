'use strict'

const { buildServer, adminSecret, cleandb } = require('./helper')
const { test, beforeEach } = require('tap')
const { once, EventEmitter } = require('events')
const Fastify = require('fastify')

beforeEach(cleandb)

test('happy path', async ({ teardown, equal, plan, same, pass }) => {
  plan(5)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

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
    const res = await server.inject({
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
    const query = `
      mutation($messages: [MessageInput]!) {
        insertMessages(inputs: $messages) {
          id
          when
        }
      }
    `

    const res = await server.inject({
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
    equal(res.statusCode, 200)
  }

  await p
  await new Promise(resolve => setImmediate(resolve))
})
