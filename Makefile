# Runs each command on the Node version in .node-version when fnm is installed,
# and on the Node on the PATH otherwise.
NODE_RUN := $(if $(shell command -v fnm 2>/dev/null),fnm exec --using=.node-version --,)

.PHONY: setup check check-format check-lint check-types test check-audit acceptance build dev install

setup:
	$(NODE_RUN) npm ci

check: check-format check-lint check-types test check-audit

check-format:
	$(NODE_RUN) npx prettier --check .

check-lint:
	$(NODE_RUN) npx eslint .

check-types:
	$(NODE_RUN) npx tsc --noEmit -p packages/core
	$(NODE_RUN) npx tsc --noEmit -p apps/cli

test:
	$(NODE_RUN) npx vitest run

check-audit:
	$(NODE_RUN) npm audit --omit=dev --audit-level=high

acceptance:
	acceptance/run

# What the owner tries: dist/flight, which runs the CLI from this checkout.
build:
	rm -rf dist
	mkdir -p dist
	printf '#!/bin/sh\nexec node "%s/apps/cli/src/main.ts" "$$@"\n' "$(CURDIR)" > dist/flight
	chmod +x dist/flight

# Runs the CLI from source: make dev ARGS='ask "Which delivery took longest?"'
dev:
	$(NODE_RUN) node apps/cli/src/main.ts $(ARGS)

install:
	$(NODE_RUN) npm link --workspace apps/cli
