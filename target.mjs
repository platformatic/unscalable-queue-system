import fastify from 'fastify'

const app = fastify({
  logger: {
    transport: {
      target: 'pino-pretty'
    }
  }
})

app.post('/', async (request, reply) => {
  request.log.info({ body: request.body }, 'request body')
  return { status: 'ok' }
})

await app.listen({ port: 3000 })
