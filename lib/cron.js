/// <reference path="../global.d.ts" />
'use strict'

const cronParser = require('cron-parser')
const fp = require('fastify-plugin')

/** @param {import('fastify').FastifyInstance} app */
module.exports = fp(async function (app) { 
  app.platformatic.addEntityHooks('cron', {
    async save (original, args) {
      // TODO add transactions
      const input = args.input
      const schedule = args.input.schedule
      let interval
      try {
        interval = cronParser.parseExpression(schedule)
      } catch (err) {
        const _err = new Error('Invalid cron expression')
        _err.cause = err
        throw _err
      }

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
})
