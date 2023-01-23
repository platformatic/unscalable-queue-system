# unscalable-queue-system

Tiny Queue System that will call your service back
after a given time.

![Architecture](./architecture.png)

## TODO

* [x] support multiple content-types
* [x] add tests for callbacks in the future
* [x] implement at-least-once semantics / retry if target fails
* [x] cron job capability / repeat
* [x] authorization
* [ ] Dead letter endpoint
* [ ] implement batching (call endpoints in parallel)
* [ ] 100% code coverage

## License

Apache 2.0
