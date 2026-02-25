#!/bin/bash
cd /app/packages/web
bunx playwright test tests/e2e/auth.spec.ts --config playwright.config.docker.ts --workers=1 --timeout=30000 2>&1
