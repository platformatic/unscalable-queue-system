'use strict'

const cronParser = require('cron-parser')
const { computeBackoff } = require('./backoff')
const { request } = require('undici')

class Executor {
  constructor (app) {
    this.app = app
    this.timer = null
    this.execute = () => {
      /* c8 ignore next 3 */
      this._execute().catch((err) => {
        app.log.error({ err })
      })
    }
  }

  async _execute () {
    const app = this.app
    const now = new Date()
    const { db, sql } = app.platformatic

    /* Write a join sql query between messages and queue on queue_id column */
    const messages = await db.query(sql`
      SELECT  queues.callback_url AS "callbackUrl",
              queues.method as "method",
              messages.body AS "body",
              messages.headers AS "headers",
              messages.retries AS "retries",
              queues.headers AS "queueHeaders",
              queues.max_retries AS "maxRetries",
              queues.dead_letter_queue_id AS "deadLetterQueueId",
              messages."when" AS "when",
              messages.cron_id AS "cronId",
              messages.id AS "id"

      FROM    messages

      INNER JOIN queues ON messages.queue_id = queues.id

      WHERE messages.sent_at IS NULL
      AND   messages.failed = false
      AND   messages."when" <= ${now}

      LIMIT 10
    `)

    const res = await Promise.allSettled(messages.map(async (message) => {
      const { callbackUrl, method, body, maxRetries, deadLetterQueueId } = message
      // We must JSON.parse(message.headers) because SQLite store JSON
      // as strings.
      const headers = {
        ...message.queueHeaders,
        ...message.headers
      }
      headers['content-type'] ||= 'application/json'

      // We do not want this call to be inside a transaction
      const succesful = await this.makeCallback(callbackUrl, method, headers, body)

      // We are not handling this error right now, but we should
      await db.tx(async (tx) => {
        if (succesful) {
          await app.platformatic.entities.message.save({
            input: {
              id: message.id,
              sentAt: new Date()
            },
            tx
          })
          app.log.info({ callbackUrl, method }, 'callback succesful!')
        } else {
          const backoff = computeBackoff({ retries: message.retries, maxRetries })
          if (!backoff) {
            app.log.warn({ message, body }, 'callback failed')
            await app.platformatic.entities.message.save({
              input: {
                id: message.id,
                sentAt: new Date(),
                failed: true
              },
              tx
            })
            if (deadLetterQueueId) {
              await app.platformatic.entities.message.save({
                input: {
                  queueId: deadLetterQueueId,
                  body: message.body,
                  headers: message.headers
                },
                tx
              })
            }
          } else {
            app.log.info({ callbackUrl, method }, 'callback failed, scheduling retry!')
            const newItem = {
              id: message.id,
              retries: backoff.retries,
              when: new Date(Date.now() + backoff.waitFor)
            }
            await app.platformatic.entities.message.save({ input: newItem, tx })
          }
        }

        // let's schedule the next call if it's a cron
        if (message.cronId) {
          const [cron] = await app.platformatic.entities.cron.find({ where: { id: { eq: message.cronId } }, tx })
          const interval = cronParser.parseExpression(cron.schedule)
          const next = interval.next()
          await app.platformatic.entities.message.save({
            input: {
              queueId: cron.queueId,
              when: next,
              headers: cron.headers,
              body: cron.body,
              cronId: cron.id
            },
            tx
          })
        }
      })
    }))

    /* c8 ignore next 4 */
    for (const r of res) {
      if (r.status === 'rejected') {
        app.log.error({ err: r.reason }, 'error while executing message')
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
      const whenTime = new Date(next.when).getTime()
      const nowTime = new Date(now).getTime()
      const delay = whenTime - nowTime
      clearTimeout(this.timer)
      this.timer = setTimeout(this.execute, delay)
      this.nextTime = now + delay
    }
  }

  updateTimer (date) {
    if ((this.nextTime > 0 && date.getTime() < this.nextTime) || !this.timer) {
      clearTimeout(this.timer)
      this.nextTime = date.getTime()
      const delay = this.nextTime - Date.now()
      this.timer = setTimeout(this.execute, delay)
    }
  }

  stop () {
    clearTimeout(this.timer)
  }

  async makeCallback (callbackUrl, method, headers, body, message) {
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

        this.app.log.warn({ message, statusCode: res.statusCode, body }, 'callback unsuccessful, maybe retry')
        return false
      }
      /* c8 ignore next 4 */
    } catch (err) {
      this.app.log.warn({ err }, 'error processing callback')
      return false
    }
  }
}

module.exports = Executor
