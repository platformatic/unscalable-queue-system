'use strict'

const { buildServer, adminSecret, cleandb } = require('./helper')
const { test, beforeEach } = require('tap')
const { once, EventEmitter } = require('events')
const Fastify = require('fastify')

beforeEach(cleandb)

test('happy path', async ({ teardown, equal, plan, same }) => {
  plan(6)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

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

    const res = await server.inject({
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
  const server = await buildServer(teardown)

  const targetUrl = 'http://localhost:4242'

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

    const res = await server.inject({
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
