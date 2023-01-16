'use strict'

const { test } = require('tap')
const backoff = require('../lib/backoff')

test('backoff generator', async ({ teardown, equal, plan }) => {
  const gen = backoff()
  equal(gen.next().value, 100)
  equal(gen.next().value, 200)
  equal(gen.next().value, 400)
})

test('maxRetries', async ({ teardown, equal, plan }) => {
  plan(3)

  const gen = backoff({ maxRetries: 2 })
  equal(gen.next().value, 100)
  equal(gen.next().value, 200)
  try {
    gen.next().value
  } catch (e) {
    equal(e.message, 'max retries reached')
  }
})

test('negative maxRetries', async ({ teardown, equal, plan }) => {
  plan(1)
  try {
    const g = backoff({ maxRetries: -1 })
    g.next()
  } catch (e) {
    equal(e.message, 'backoff requires maxRetries greater or equal to one')
  }
})
