'use strict'

const { test } = require('tap')
const { computeBackoff } = require('../lib/backoff')

test('negative maxRetries', async ({ teardown, equal, plan }) => {
  plan(1)
  try {
    computeBackoff({ maxRetries: -1 })
  } catch (e) {
    equal(e.message, 'backoff requires maxRetries greater or equal to one')
  }
})

test('computeBackoff', async ({ teardown, same, plan }) => {
  same(computeBackoff({ retries: 0, maxRetries: 5 }), { retries: 1, maxRetries: 5, waitFor: 100 })
  same(computeBackoff({ retries: 1, maxRetries: 5 }), { retries: 2, maxRetries: 5, waitFor: 200 })
  same(computeBackoff({ retries: 2, maxRetries: 5 }), { retries: 3, maxRetries: 5, waitFor: 400 })
  same(computeBackoff({ retries: 3, maxRetries: 5 }), { retries: 4, maxRetries: 5, waitFor: 800 })
  same(computeBackoff({ retries: 4, maxRetries: 5 }), { retries: 5, maxRetries: 5, waitFor: 1600 })
  same(computeBackoff({ retries: 5, maxRetries: 5 }), false)
})
