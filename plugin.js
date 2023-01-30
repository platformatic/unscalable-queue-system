/// <reference path="./global.d.ts" />
'use strict'

const { request } = require('undici')
const { computeBackoff } = require('./lib/backoff')
const cronParser = require('cron-parser')

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app) {
  let timer = null
  let nextTime = -1

  app.platformatic.addEntityHooks('message', {
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
    const { db, sql } = app.platformatic

    /* Write a join sql query between messages and queue on queue_id column */
    const messages = await db.query(sql`
      SELECT  queues.callback_url AS callbackUrl,
              queues.method as method,
              messages.body AS body,
              messages.headers AS headers,
              messages.retries AS retries,
              queues.headers AS queueHeaders,
              queues.max_retries AS maxRetries,
              queues.dead_letter_queue_id AS deadLetterQueueId,
              messages.\`when\` AS \`when\`,
              messages.cron_id AS cronId,
              messages.id AS id

      FROM    messages

      INNER JOIN queues ON messages.queue_id = queues.id

      WHERE messages.sent_at IS NULL
      AND   messages.\`when\` <= ${now}

      LIMIT 10
    `)


    // TODO run this in parallel
    for (const message of messages) {
      const { callbackUrl, method, body, queueId, maxRetries, deadLetterQueueId } = message
      // We must JSON.parse(message.headers) because SQLite store JSON
      // as strings.
      const headers = {
        ...(message.queueHeaders ? JSON.parse(message.queueHeaders) : {}),
        ...(message.headers ? JSON.parse(message.headers) : {})
      }
      headers['content-type'] ||= 'application/json' 

      const succesful = await makeCallback(callbackUrl, method, headers, body)

      // TODO maybe we want to run these in a transaction
      if (succesful) {
        await app.platformatic.entities.message.save({
          input: {
            id: message.id,
            sentAt: new Date().getTime()
          }
        })
        app.log.info({ callbackUrl, method }, 'callback succesful!')
      } else {
        const backoff = computeBackoff({ retries: message.retries, maxRetries })
        if (!backoff) {
          app.log.warn({ message, body }, 'callback failed')
          await app.platformatic.entities.message.save({
            input: {
              id: message.id,
              sentAt: new Date().getTime(),
              failed: true
            }
          })
          if (deadLetterQueueId) {
            await app.platformatic.entities.message.save({
              input: {
                queueId: deadLetterQueueId,
                body: message.body,
                headers: message.headers
              }
            })
          }
        } else {
          app.log.info({ callbackUrl, method }, 'callback failed, scheduling retry!')
          const newItem = {
            id: message.id,
            retries: backoff.retries,
            when: new Date(Date.now() + backoff.waitFor).getTime()
          }
          await app.platformatic.entities.message.save({ input: newItem })
        }
      }

      // let's schedule the next call if it's a cron
      if (message.cronId) {
        const [cron] = await app.platformatic.entities.cron.find({ where: { id: { eq: message.cronId } } })
        const interval = cronParser.parseExpression(cron.schedule)
        const next = interval.next().getTime()
        await app.platformatic.entities.message.save({
          input: {
            queueId: cron.queueId,
            when: next,
            headers: cron.headers,
            body: cron.body,
            cronId: cron.id
          }
        })
      }
    }

    const [next] = await app.platformatic.entities.message.find({
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

  async function makeCallback (callbackUrl, method, headers, body, message) {
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

        app.log.warn({ message, statusCode: res.statusCode, body }, 'callback unsuccessful, maybe retry')
        return false
      }
      /* c8 ignore next 4 */
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
      await app.platformatic.entities.message.save({
        ...args,
        input: {
          cronId: cron.id,
          queueId: input.queueId,
          when: next,
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
