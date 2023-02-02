/// <reference path="./global.d.ts" />
'use strict'

const { request } = require('undici')
const cronParser = require('cron-parser')
const cronPlugin = require('./lib/cron')
const Executor = require('./lib/executor')

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app) {
  const executor = new Executor(app)

  app.platformatic.addEntityHooks('message', {
    async insert (original, { inputs, ...rest }) {
      const now = new Date().getTime() // now
      for (const input of inputs) {
        input.when = now
      }

      const res = await original({ inputs, ...rest })

      for (const input of inputs) {
        try {
          // TODO investigate why if this throw the Error is not logged
          // correctly by GraphQL
          const date = new Date(input.when)
          executor.updateTimer(date)
        } catch (err) {
          console.log(err)
        }
      }

      return res
    },
    
    async save (original, { input, ...rest }) {
      if (!input.when) {
        input.when = new Date().getTime() // now
      }

      const res = await original({ input, ...rest })

      try {
        // TODO investigate why if this throw the Error is not logged
        // correctly by GraphQL
        const date = new Date(input.when)
        executor.updateTimer(date)
      } catch (err) {
        console.log(err)
      }

      return res
    }
  })

  await app.register(cronPlugin)

  await executor.execute()

  app.addHook('onClose', () => {
    executor.stop()
  })
}
