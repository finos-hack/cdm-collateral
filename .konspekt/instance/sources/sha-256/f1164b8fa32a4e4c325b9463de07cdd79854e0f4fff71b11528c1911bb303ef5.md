## User

start the speed tasks

(mid-task) PR run failed. flow-call-cancellation: secured party withdraws an unanswered call; requests cancellation
of an agreed call -> pledgor accepts, proposal void.

    Error: expect(received).toMatch(expected)
    Expected pattern: /^cancelled$/i
    Received string:  "Agreed"

## Maintainer (finding while measuring)

Each suite run moves value from A to B (enforcement, close-out, VM transfers). After four runs on one deployment A's
free tUSD was 98,752 of 6.4 million, and pledge, transfer and netting reverted with ERC20InsufficientBalance.
