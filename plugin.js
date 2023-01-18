/// <reference path="./global.d.ts" />
'use strict'

const { request } = require('undici')
const { computeBackoff } = require('./lib/backoff')

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app) {
  let timer = null
  let nextTime = -1
  // TODO: make this configurable
  const maxRetries = 3

  app.platformatic.addEntityHooks('item', {
    async save (original, { input, ...rest }) {
      if (!input.when) {
        input.when = new Date().getTime() // now
      }

      const date = new Date(input.when)
      if ((nextTime > 0 && date.getTime() < nextTime) || !timer) {
        clearTimeout(timer)
        nextTime = date.getTime()
        const delay = nextTime - Date.now()
        timer = setTimeout(execute, delay)
      }

      return original({ input, ...rest })
    }
  })

  async function execute () {
    const now = Date.now()
    const items = await app.platformatic.entities.item.find({
      where: {
        when: {
          lte: now
        },
        sentAt: {
          eq: null
        }
      }
    })

    let [next] = await app.platformatic.entities.item.find({
      where: {
        when: {
          gt: now
        },
        sentAt: {
          eq: null
        }
      },
      limit: 1
    })

    // TODO run this in parallel
    for (const item of items) {
      const { callbackUrl, method, body } = item
      // We must JSON.parse(item.headers) because SQLite store JSON
      // as strings.
      const headers = item.headers ? JSON.parse(item.headers) : { 'content-type': 'application/json' }

      const succesful = await makeCallback(callbackUrl, method, headers, body)
      if (succesful) {
        await app.platformatic.entities.item.save({
          input: {
            id: item.id,
            sentAt: new Date().getTime()
          }
        })
        app.log.info({ callbackUrl, method }, 'callback succesful!')
      } else {
        const backoff = computeBackoff({ retries: item.retries, maxRetries })
        if (!backoff) {
          app.log.warn({ item, statusCode: res.statusCode, body }, 'callback failed')
          await app.platformatic.entities.item.save({
            input: {
              id: item.id,
              sentAt: new Date().getTime(),
              failed: true
            }
          })
        } else {
          app.log.info({ callbackUrl, method }, 'callback failed, scheduling retry!')
          const newItem = {
            id: item.id,
            retries: backoff.retries,
            when: new Date(Date.now() + backoff.waitFor).getTime()
          }
          await app.platformatic.entities.item.save({ input: newItem })
          if (!next || next.when > newItem.when) {
            next = newItem
          }
        }
      }
    }

    if (next) {
      const delay = next.when - now
      timer = setTimeout(execute, delay)
    }
  }

  async function makeCallback (callbackUrl, method, headers, body, item) {
    try {
      const res = await request(callbackUrl, {
        method,
        headers,
        body
      })
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return true
      } else {
        let body
        if (res.headers['content-type'].indexOf('application/json') === 0) {
          body = await res.body.json()
        } else if (res.headers['content-type'] === 'text/plain') {
          body = await res.body.text()
        } else {
          res.body.resume()
          // not interested in the errors
          res.body.on('error', () => {})
        }

        app.log.warn({ item, statusCode: res.statusCode, body }, 'callback unsuccessful, maybe retry')
        return false
      }
    } catch (err) {
      app.log.warn({ err }, 'error processing callback')
      return false
    }
  }

  await execute()

  app.addHook('onClose', () => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}
