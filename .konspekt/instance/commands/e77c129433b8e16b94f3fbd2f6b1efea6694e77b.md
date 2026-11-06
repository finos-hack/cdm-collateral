cd architecture && python generate_architecture.py $SCRATCHPAD/gen.json && git diff --no-index --stat prototype.architecture.json $SCRATCHPAD/gen.json
