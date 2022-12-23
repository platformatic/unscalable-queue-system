/// <reference path="./global.d.ts" />
'use strict'

const { request } = require('undici')

/** @param {import('fastify').FastifyInstance} app */
module.exports = async function (app) {
  let timer = null
  let nextTime = -1

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

    const [next] = await app.platformatic.entities.item.find({
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

    for (const item of items) {
      const { callbackUrl, method, body } = item
      try {
        const res = await request(callbackUrl, {
          method,
          headers: {
            'content-type': 'application/json'
          },
          body
        })
        if (res.statusCode >= 200 && res.statusCode < 300) {
          await app.platformatic.entities.item.save({
            input: {
              id: item.id,
              sentAt: new Date().getTime()
            }
          })
          // TODO try again if it fails
        }
        app.log.log({ callbackUrl, method }, 'callback!')
      } catch (err) {
        app.log.error(err)
      }
    }

    if (next) {
      const delay = next.when - now
      timer = setTimeout(execute, delay)
    }
  }

  await execute()

  app.addHook('onClose', () => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}
