# Runs each command on the Node version in .node-version when fnm is installed,
# and on the Node on the PATH otherwise.
NODE_RUN := $(if $(shell command -v fnm 2>/dev/null),fnm exec --using=.node-version --,)

# The installed packages. Targets that run a package's tool depend on this file, so a fresh
# checkout installs the locked packages first instead of npx fetching a lone copy of the tool.
PACKAGES := node_modules/.package-lock.json

.PHONY: setup check check-format check-lint check-types test check-audit acceptance build dev install record

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

# What the owner tries: dist/flight, which carries its own Node, source and runtime packages, so it
# runs from any folder and keeps working after this checkout is moved or deleted.
build: $(PACKAGES)
	$(NODE_RUN) scripts/build-dist

# Records the replies of the cases that are not hand-written again, from the live model on the synthetic
# log. It needs ANTHROPIC_API_KEY and spends a little; make check never runs it.
record: $(PACKAGES)
	$(NODE_RUN) node apps/cli/tests/record.ts
	$(NODE_RUN) npx --no-install prettier --write apps/cli/tests/recordings

# Runs the CLI from source: make dev ARGS='ask "Which delivery took longest?"'
dev: $(PACKAGES)
	$(NODE_RUN) node apps/cli/src/main.ts $(ARGS)

install: $(PACKAGES)
	$(NODE_RUN) npm link --workspace apps/cli
