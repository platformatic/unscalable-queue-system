'use strict'

function* backoffGenerator (opts) {
  while (true) {
    opts = computeBackoff(opts)
    yield opts.waitFor
  }
}

function computeBackoff (opts) {
  opts ||= {}
  opts.maxRetries ||= Number.MAX_SAFE_INTEGER
  if (!(opts.maxRetries >= 1)) {
    throw new Error('backoff requires maxRetries greater or equal to one')
  }
  const maxRetries = opts.maxRetries
  let retries = opts.retries || 0
  const waitFor = 100 * Math.pow(2, retries)
  if (retries++ >= maxRetries) {
    throw new Error('max retries reached')
  }
  return { retries, maxRetries, waitFor }
}

module.exports.backoffGenerator = backoffGenerator
module.exports.computeBackoff = computeBackoff
