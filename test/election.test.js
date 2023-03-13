'use strict'

const { buildServer, adminSecret, cleandb } = require('./helper')
const { test, beforeEach } = require('tap')
const { once, EventEmitter } = require('events')
const Fastify = require('fastify')

beforeEach(cleandb)

test('happy path', async ({ teardown, equal, plan, same }) => {
  const ee = new EventEmitter()
  const server1 = await buildServer(teardown)
  const server2 = await buildServer(teardown)

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
    const res = await server1.app.inject({
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

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, headers: "{ \\"content-type\\": \\"application/json\\" }", body: $body  }) {
          id
          when
        }
      }
    `

    const res = await server2.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query,
        variables: {
          body: msg,
          queueId
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)

    const { data } = body
    const when = new Date(data.saveMessage.when)
    equal(when.getTime() - now >= 0, true)
  }

  await p
})

test('re-election', async ({ teardown, equal, plan, same }) => {
  const ee = new EventEmitter()
  const server1 = await buildServer(teardown)
  const server2 = await buildServer(teardown)

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
    const res = await server1.app.inject({
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

  await server1.stop()

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, headers: "{ \\"content-type\\": \\"application/json\\" }", body: $body  }) {
          id
          when
        }
      }
    `

    const res = await server2.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query,
        variables: {
          body: msg,
          queueId
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)

    const { data } = body
    const when = new Date(data.saveMessage.when)
    equal(when.getTime() - now >= 0, true)
  }

  await p
})
