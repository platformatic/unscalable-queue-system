'use strict'

const { test } = require('tap')
const { buildServer } = require('@platformatic/db')
const { join } = require('path')
const { readFile, rm } = require('fs/promises')
const { tmpdir } = require('os')

let count = 0

function getFilename () {
  return join(tmpdir(), `test-${process.pid}-${count++}.db`)
}

test('storing a queue and an item', async ({ teardown, equal }) => {
  const config = JSON.parse(await readFile(join(__dirname, './platformatic.db.json'), 'utf8'))
  config.server.port = 0
  config.server.logger = false
  const filename = getFilename()
  config.core.connectionString = `sqlite://${filename}`
  config.migrations.autoApply = true
  config.types.autogenerate = false

  const server = await buildServer(config)
  teardown(() => server.stop())
  teardown(() => rm(filename))

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

  {
    const now = Date.now()
    const res = await server.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `
          mutation {
            saveItem(input: { queueId: ${queueId}, callbackUrl: "http://localhost:3000", method: "POST", body: "HELLO FOLKS!" }) { id
              when
            }
          }
        `
      }
    })
    equal(res.statusCode, 200)
    const body = res.json()
    const { data } = body
    const when = new Date(data.saveItem.when)
    equal(when.getTime() - now >= 0, true)
  }
})
