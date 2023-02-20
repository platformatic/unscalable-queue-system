/// <reference path="./global.d.ts" />
'use strict'

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
        const date = new Date(input.when)
        executor.updateTimer(date)
      }

      return res
    },

    async save (original, { input, ...rest }) {
      if (!input.when) {
        input.when = new Date().getTime() // now
      }

      const res = await original({ input, ...rest })

      const date = new Date(input.when)
      executor.updateTimer(date)

      return res
    }
  })

  await app.register(cronPlugin)

  await executor.execute()

  app.addHook('onClose', () => {
    executor.stop()
  })
}
