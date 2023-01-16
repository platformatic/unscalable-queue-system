'use strict'

function* backoff(opts) {
  opts ||= {}
  opts.maxRetries ||= Number.MAX_SAFE_INTEGER
  if (!(opts.maxRetries >= 1)) {
    throw new Error('backoff requires maxRetries greater or equal to one')
  }
  const maxRetries = opts.maxRetries
  let delay = 100;
  for (let i = 0; i < maxRetries; i++) {
    yield delay;
    delay *= 2;
  }
  throw new Error('max retries reached');
}

module.exports = backoff
