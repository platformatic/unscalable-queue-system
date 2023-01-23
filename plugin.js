/// <reference path="./global.d.ts" />
'use strict'

const { request } = require('undici')
const { computeBackoff } = require('./lib/backoff')
const cronParser = require('cron-parser')

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

    // TODO run this in parallel
    for (const item of items) {
      const { callbackUrl, method, body } = item
      // We must JSON.parse(item.headers) because SQLite store JSON
      // as strings.
      const headers = item.headers ? JSON.parse(item.headers) : { 'content-type': 'application/json' }

      const succesful = await makeCallback(callbackUrl, method, headers, body)

      // TODO maybe we want to run these in a transaction
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
        }
      }

      // let's schedule the next call if it's a cron
      if (item.cronId) {
        const [cron] = await app.platformatic.entities.cron.find({ where: { id: { eq: item.cronId } } })
        const interval = cronParser.parseExpression(cron.schedule)
        const next = interval.next().getTime()
        await app.platformatic.entities.item.save({
          input: {
            queueId: cron.queueId,
            when: next,
            method: cron.method,
            callbackUrl: cron.callbackUrl,
            headers: cron.headers,
            body: cron.body,
            cronId: cron.id
          }
        })
      }
    }

    const [next] = await app.platformatic.entities.item.find({
      where: {
        sentAt: {
          eq: null
        }
      },
      orderBy: [{
        field: 'when', direction: 'asc'
      }],
      limit: 1
    })

    if (next) {
      const delay = next.when - now
      clearTimeout(timer)
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

  app.platformatic.addEntityHooks('cron', {
    async save (original, args) {
      // TODO add transactions
      const input = args.input
      const schedule = args.input.schedule
      const interval = cronParser.parseExpression(schedule)
      const next = interval.next().getTime()
      const cron = await original(args)
      await app.platformatic.entities.item.save({
        ...args,
        input: {
          cronId: cron.id,
          queueId: input.queueId,
          when: next,
          callbackUrl: input.callbackUrl,
          method: input.method,
          headers: input.headers,
          body: input.body
        }
      })
      return cron
    }
  })

  await execute()

  app.addHook('onClose', () => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}
