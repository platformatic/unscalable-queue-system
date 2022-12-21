/// <reference path="./global.d.ts" />
'use strict'

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app) {

  app.platformatic.addEntityHooks('item', {
    async save (original, { input, ...rest }) {
      if (!input.when) {
        input.when = (new Date()).toISOString() // now
      }

      return original({ input, ...rest })
    }
  })

}
