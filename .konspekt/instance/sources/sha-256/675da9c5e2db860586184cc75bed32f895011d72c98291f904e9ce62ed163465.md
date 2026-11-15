## Maintainer

The close-out and substitution flows change CollateralControl, so the live specs need a new contract deployment. scripts/live-e2e.sh never redeploys over contracts/deployments/besu.json. How should I deploy for the local live run?
- New set, same chain (Recommended)
- Full reset
- Skip the live run

## User

New set, same chain (Recommended)
