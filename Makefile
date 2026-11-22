# Runs each command on the Node version in .node-version when fnm is installed,
# and on the Node on the PATH otherwise.
NODE_RUN := $(if $(shell command -v fnm 2>/dev/null),fnm exec --using=.node-version --,)

# The installed packages. Targets that run a package's tool depend on this file, so a fresh
# checkout installs the locked packages first instead of npx fetching a lone copy of the tool.
PACKAGES := node_modules/.package-lock.json

.PHONY: setup check check-format check-lint check-types test check-audit acceptance build dev install

setup:
	$(NODE_RUN) npm ci --ignore-scripts

$(PACKAGES): package-lock.json
	$(NODE_RUN) npm ci --ignore-scripts

check: check-format check-lint check-types test check-audit

check-format: $(PACKAGES)
	$(NODE_RUN) npx --no-install prettier --check .

check-lint: $(PACKAGES)
	$(NODE_RUN) npx --no-install eslint .

check-types: $(PACKAGES)
	$(NODE_RUN) npx --no-install tsc --noEmit -p packages/core
	$(NODE_RUN) npx --no-install tsc --noEmit -p apps/cli

test: $(PACKAGES)
	$(NODE_RUN) npx --no-install vitest run

check-audit: $(PACKAGES)
	$(NODE_RUN) npm audit --omit=dev --audit-level=high

acceptance:
	acceptance/run

# What the owner tries: dist/flight, which runs the CLI from this checkout.
build: $(PACKAGES)
	rm -rf dist
	mkdir -p dist
	printf '#!/bin/sh\nexec node "%s/apps/cli/src/main.ts" "$$@"\n' "$(CURDIR)" > dist/flight
	chmod +x dist/flight

# Runs the CLI from source: make dev ARGS='ask "Which delivery took longest?"'
dev: $(PACKAGES)
	$(NODE_RUN) node apps/cli/src/main.ts $(ARGS)

install: $(PACKAGES)
	$(NODE_RUN) npm link --workspace apps/cli
