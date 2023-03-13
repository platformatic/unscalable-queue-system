/// <reference path="../global.d.ts" />
'use strict'

const cronParser = require('cron-parser')
const fp = require('fastify-plugin')

/** @param {import('fastify').FastifyInstance} app */
module.exports = fp(async function (app) {
  app.platformatic.addEntityHooks('cron', {
    save (original, args) {
      const input = args.input

      // This might fail if save is called from a transaction
      // this is not the case right now.
      return app.platformatic.db.tx(runInTransaction)

      async function runInTransaction (tx) {
        const schedule = args.input.schedule
        let interval
        try {
          interval = cronParser.parseExpression(schedule)
        } catch (err) {
          const _err = new Error('Invalid cron expression')
          _err.cause = err
          throw _err
        }

        const next = interval.next()
        const cron = await original({
          ...args,
          tx
        })
        await app.platformatic.entities.message.save({
          ...args,
          input: {
            cronId: cron.id,
            queueId: input.queueId,
            when: next,
            headers: input.headers,
            body: input.body
          },
          tx
        })
        return cron
      }
    }
  })
})
