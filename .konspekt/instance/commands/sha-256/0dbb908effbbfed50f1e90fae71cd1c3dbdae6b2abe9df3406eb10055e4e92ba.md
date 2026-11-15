(cd console && npx tsc --noEmit 2>&1 | tail -8 | cut -c1-200; npx vitest run 2>&1 | tail -14 | cut -c1-200)
