'use strict'

const { buildServer, adminSecret, cleandb } = require('./helper')
const { test, beforeEach } = require('tap')
const { once, EventEmitter } = require('events')
const Fastify = require('fastify')

beforeEach(cleandb)

test('retries on failure', async ({ teardown, equal, plan, same }) => {
  plan(6)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

  const target = Fastify()
  let called = 0
  target.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called')
    if (called++ === 0) {
      throw new Error('first call')
    }
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

  let p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, body: $body }) {
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
  p = once(ee, 'called')
  await p
})

test('send a message to the dead letter queue after retries are completed', async ({ teardown, equal, plan, same }) => {
  plan(9)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

  const target = Fastify()
  target.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    throw new Error('This is down')
  })

  teardown(() => target.close())
  await target.listen({ port: 0 })
  const targetUrl = `http://localhost:${target.server.address().port}`

  const deadLetterTarget = Fastify()
  deadLetterTarget.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called')
    return { ok: true }
  })

  teardown(() => deadLetterTarget.close())
  await deadLetterTarget.listen({ port: 0 })
  const deadLetterTargetURL = `http://localhost:${deadLetterTarget.server.address().port}`

  let deadLetterQueue
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
          callbackUrl: deadLetterTargetURL
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    deadLetterQueue = data.saveQueue.id
    equal(deadLetterQueue, '1')
  }

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
          mutation($callbackUrl: String!, $deadLetterQueueId: ID) {
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST", deadLetterQueueId: $deadLetterQueueId, maxRetries: 1 }) {
              id
            }
          }
        `,
        variables: {
          callbackUrl: targetUrl,
          deadLetterQueueId: deadLetterQueue
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '2')
  }

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, body: $body }) {
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

test('send a message to the dead letter queue after retries are completed without content-type', async ({ teardown, equal, plan, same }) => {
  plan(9)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

  const target = Fastify()
  target.post('/', (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    reply.status(500).send('This is down')
  })

  teardown(() => target.close())
  await target.listen({ port: 0 })
  const targetUrl = `http://localhost:${target.server.address().port}`

  const deadLetterTarget = Fastify()
  deadLetterTarget.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called')
    return { ok: true }
  })

  teardown(() => deadLetterTarget.close())
  await deadLetterTarget.listen({ port: 0 })
  const deadLetterTargetURL = `http://localhost:${deadLetterTarget.server.address().port}`

  let deadLetterQueue
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
          callbackUrl: deadLetterTargetURL
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    deadLetterQueue = data.saveQueue.id
    equal(deadLetterQueue, '1')
  }

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
          mutation($callbackUrl: String!, $deadLetterQueueId: ID) {
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST", deadLetterQueueId: $deadLetterQueueId, maxRetries: 1 }) {
              id
            }
          }
        `,
        variables: {
          callbackUrl: targetUrl,
          deadLetterQueueId: deadLetterQueue
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '2')
  }

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, body: $body }) {
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

test('send a message to the dead letter queue after retries are completed with text/plain', async ({ teardown, equal, plan, same }) => {
  plan(9)
  const ee = new EventEmitter()
  const server = await buildServer(teardown)

  const target = Fastify()
  target.post('/', (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    reply.status(500).headers({ 'content-type': 'text/plain' }).send('This is down')
  })

  teardown(() => target.close())
  await target.listen({ port: 0 })
  const targetUrl = `http://localhost:${target.server.address().port}`

  const deadLetterTarget = Fastify()
  deadLetterTarget.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called')
    return { ok: true }
  })

  teardown(() => deadLetterTarget.close())
  await deadLetterTarget.listen({ port: 0 })
  const deadLetterTargetURL = `http://localhost:${deadLetterTarget.server.address().port}`

  let deadLetterQueue
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
          callbackUrl: deadLetterTargetURL
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    deadLetterQueue = data.saveQueue.id
    equal(deadLetterQueue, '1')
  }

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
          mutation($callbackUrl: String!, $deadLetterQueueId: ID) {
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST", deadLetterQueueId: $deadLetterQueueId, maxRetries: 1 }) {
              id
            }
          }
        `,
        variables: {
          callbackUrl: targetUrl,
          deadLetterQueueId: deadLetterQueue
        }
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    queueId = data.saveQueue.id
    equal(queueId, '2')
  }

  const p = once(ee, 'called')
  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const now = Date.now()
    const query = `
      mutation($body: String!, $queueId: ID) {
        saveMessage(input: { queueId: $queueId, body: $body }) {
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
