timeout 900 bash scripts/live-e2e.sh up > /tmp/up.log 2>&1; echo exit $?; tail -30 /tmp/up.log   # start the live stack
