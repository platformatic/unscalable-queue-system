/// <reference path="./global.d.ts" />
'use strict'

// Needed to work with dates & postgresql
// See https://node-postgres.com/features/types/
process.env.TZ = 'UTC'

const cronPlugin = require('./lib/cron')
const Executor = require('./lib/executor')
const { scheduler } = require('timers/promises')
const { on } = require('events')

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app, options) {
  const lock = Number(options.lock) || 42
  /* c8 ignore next 1 */
  const leaderPoll = Number(options.leaderPoll) || 10000

  app.log.info('Locking cron plugin to advisory lock %d', lock)

  const dummyExecutor = {
    execute () {},
    updateTimer () {
      const { db, sql } = app.platformatic
      db.query(sql`
        NOTIFY "update_timer";
      `)
        /* c8 ignore next 3 */
        .catch((err) => {
          app.log.error({ err }, 'Error in dummy updateTimer')
        })
    },
    stop () {}
  }

  let executor = dummyExecutor
  let elected = false

  const abortController = new AbortController()

  async function amITheLeader () {
    const { db, sql } = app.platformatic
    await db.task(async (t) => {
      while (!abortController.signal.aborted) {
        const [{ leader }] = await t.query(sql`
          SELECT pg_try_advisory_lock(${lock}) as leader;
        `)
        if (leader && !elected) {
          app.log.info('This instance is the leader')
          executor = new Executor(app)
          executor.execute()
          elected = true
          ;(async () => {
            await t.query(sql`
              LISTEN "update_timer";
            `)
            for await (const notification of on(t._driver.client, 'notification', { signal: abortController.signal })) {
              app.log.debug({ notification }, 'Received notification')
              try {
                await executor.execute()
                /* c8 ignore next 3 */
              } catch (err) {
                app.log.warn({ err }, 'error while processing notification')
              }
              // TODO: write automated tests for this
            }
            /* c8 ignore next 19 */
          })()
            .catch((err) => {
              if (err.name !== 'AbortError') {
              // an error occurred, and it's expected
                app.log.error({ err }, 'Error in notification loop')
              } else {
                abortController.abort()
              }
            })
        } else if (leader && elected) {
          app.log.debug('This instance is still the leader')
        } else if (!leader && elected) {
          // this should never happen
          app.log.warn('This instance was the leader but is not anymore')
          await executor.stop()
          executor = dummyExecutor
          elected = false
        } else {
          app.log.debug('This instance is not the leader')
          executor = dummyExecutor
        }
        try {
          await scheduler.wait(leaderPoll, { signal: abortController.signal })
        } catch {
          break
        }
      }
    })
    app.log.debug('leader loop stopped')
  }

  let leaderLoop = amITheLeader()

  retryLeaderLoop(leaderLoop)

  /* c8 ignore next 10 */
  function retryLeaderLoop () {
    leaderLoop.catch((err) => {
      app.log.error({ err }, 'Error in leader loop')
      return executor.stop()
    }).then(() => {
      if (!abortController.signal.aborted) {
        leaderLoop = amITheLeader()
        retryLeaderLoop(leaderLoop)
      }
    })
  }

  app.platformatic.addEntityHooks('message', {
    async insert (original, { inputs, ...rest }) {
      const now = new Date() // now
      for (const input of inputs) {
        input.when = now
      }

      const res = await original({ inputs, ...rest })

      for (const input of inputs) {
        const date = new Date(input.when)
        executor.updateTimer(date)
      }

      return res
    },

    async save (original, { input, ...rest }) {
      if (!input.when) {
        input.when = new Date() // now
      }

      const res = await original({ input, ...rest })

      const date = new Date(input.when)
      executor.updateTimer(date)

      return res
    }
  })

  await app.register(cronPlugin)

  await executor.execute()

  app.get('/hello', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  app.addHook('onClose', async () => {
    abortController.abort()
    await leaderLoop
    executor.stop()
  })
}
