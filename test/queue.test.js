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

test('`text plain` content type', async ({ teardown, equal, plan, same }) => {
  plan(5)
  const ee = new EventEmitter()
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const target = Fastify()
  target.post('/', async (req, reply) => {
    same(req.body, 'HELLO FOLKS!', 'message is equal')
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

  const p = once(ee, 'called')
  {
    const msg = 'HELLO FOLKS!'
    const now = Date.now()
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query: `
          mutation($body: String!, $queueId: ID) {
            saveMessage(input: { queueId: $queueId, body: $body, headers: "{ \\"content-type\\": \\"text/plain\\" }" } ) {
              id
              when
            }
          }
        `,
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

test('future when', async ({ teardown, equal, plan, same }) => {
  plan(6)

  const ee = new EventEmitter()
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const target = Fastify()
  target.post('/', async (req, reply) => {
    same(req.body, { message: 'HELLO FOLKS!' }, 'message is equal')
    ee.emit('called', Date.now())
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

  const p = once(ee, 'called')
  const now = Date.now()

  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
    const afterOneSecond = new Date(now + 1000).toISOString()
    const query = `
      mutation($body: String!, $queueId: ID, $when: DateTime!) {
        saveMessage(input: { queueId: $queueId, body: $body, when: $when  }) {
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
          queueId,
          callbackUrl: targetUrl,
          when: afterOneSecond
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)

    const { data } = body
    equal(data.saveMessage.when, afterOneSecond)
  }

  const [calledAt] = await p
  equal(calledAt - now >= 1000, true)
})

test('only admins can write', async ({ teardown, equal, plan, same }) => {
  plan(4)
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const targetUrl = 'http://localhost:4242'

  {
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
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
    equal(body.errors[0].message, 'operation not allowed')
  }

  {
    const msg = JSON.stringify({
      message: 'HELLO FOLKS!'
    })
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
      payload: {
        query,
        variables: {
          body: msg,
          queueId: 1
        }
      }
    })
    const body = res.json()
    equal(res.statusCode, 200)
    equal(body.errors[0].message, 'operation not allowed')
  }
})

test('`text plain` content type header in the Queue', async ({ teardown, equal, plan, same }) => {
  plan(5)
  const ee = new EventEmitter()
  const { config, filename } = await getConfig()
  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

  const target = Fastify()
  target.post('/', async (req, reply) => {
    same(req.body, 'HELLO FOLKS!', 'message is equal')
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
            saveQueue(input: { name: "test", callbackUrl: $callbackUrl, method: "POST", headers: "{ \\"content-type\\": \\"text/plain\\" }" }) {
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
    const msg = 'HELLO FOLKS!'
    const now = Date.now()
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'X-PLATFORMATIC-ADMIN-SECRET': adminSecret
      },
      payload: {
        query: `
          mutation($body: String!, $queueId: ID) {
            saveMessage(input: { queueId: $queueId, body: $body } ) {
              id
              when
            }
          }
        `,
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
