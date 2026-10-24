.PHONY: help install run bad-prompt test clean

# Target project: any repo laid out as services/<svc>/internal/<context>.
TARGET ?= ../../../spilno
BASE ?= main
PY := uv run --project $(CURDIR) python

help:
	@echo "Targets:"
	@echo "  make install                      - create the venv (claude-agent-sdk, pyyaml)"
	@echo "  make run [TARGET=..] [BASE=main]  - update TARGET/docs/api from contract changes since BASE"
	@echo "  make bad-prompt [TARGET=..]       - schema-violation check: must report is_error and exit 1"
	@echo "  make test                         - offline tests (guard, spec parsing, schema)"
	@echo "  make clean                        - drop the venv and saved runs"

install:
	uv sync --project $(CURDIR)

run:
	@cd $(TARGET) && $(PY) $(CURDIR)/api_autodoc.py --base $(BASE) $(ARGS)

bad-prompt:
	@cd $(TARGET) && $(PY) $(CURDIR)/api_autodoc.py --bad-prompt --max-turns 2

test:
	@$(PY) -m unittest discover -s $(CURDIR) -p 'test_*.py' -v

clean:
	rm -rf .venv runs __pycache__
