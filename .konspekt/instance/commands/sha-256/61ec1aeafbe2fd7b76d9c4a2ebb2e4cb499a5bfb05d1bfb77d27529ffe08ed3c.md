for i in $(seq 1 60); do curl localhost:8300/store/v1/health, 8201 and 8202 /ledger/v1/health, 8001 and 8002 /api/v1/health; all "ok":true && exit 0; sleep 3; done   # wait for the five health checks
