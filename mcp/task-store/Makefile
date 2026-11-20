# task-store MCP server demo (лекція 8.6)
# Стандартний API: make run / make clean (+ build, test, inspect, inspect-buggy, run-http)
# Python-дзеркало (python/): make py-install / py-run / py-test

.PHONY: install run run-http seed build test inspect inspect-buggy \
	run-advanced inspect-advanced clean py-install py-run py-test

node_modules: package.json
	npm install

install: node_modules

build: node_modules
	npm run build

run: build
	node dist/server.js

# Лекція 8.8: той самий сервер через Streamable HTTP на :3335 (src/server-http.ts).
# Register-секції без змін - інший лише транспортний wiring.
run-http: build
	node dist/server-http.js

# Лекція 8.12: кладе 2-3 демо-задачі у data/tasks.json через store, щоб у
# задеплоєного task-store одразу було що показати через list_tasks і /healthz.
seed: build
	node dist/seed.js

test: node_modules
	npm test

# Смок-тест через MCP Inspector у CLI-режимі: список tools без UI.
inspect: build
	npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list

# ─── Підсумкове ДЗ модуля 8: докази для власного tool-а delete_task ───
# Inspector 2.16: якщо tool повертає isError: true, CLI виходить з кодом 5 і пише
# {"error":{"code":"tool_is_error",...}} у stderr, а stdout лишається чистим JSON.
# Тому в таргетах з jq вирішує код jq: 0 - контракт зелений, 1 - червоний.
INSPECT = npx @modelcontextprotocol/inspector --cli node dist/server.js

# Короткий tools/list: скільки tools і мій tool з inputSchema та outputSchema.
inspect-mine: build
	@$(INSPECT) --method tools/list 2>/dev/null \
		| jq '{count: (.tools | length), names: [.tools[].name], delete_task: (.tools[] | select(.name == "delete_task") | {name, description, inputSchema: .inputSchema.properties, outputSchema: {properties: .outputSchema.properties, required: .outputSchema.required}, annotations})}'

# Щасливий шлях: створюємо задачу через add_task і видаляємо саме її.
# Другий виклик показуємо сирим (stdout + stderr Inspector-а, без jq), щоб було
# видно і structuredContent, і помилку валідації, якщо вихід не збігся зі схемою.
call-ok: build
	@$(INSPECT) --method tools/call --tool-name add_task --tool-arg "title=Inspector happy path" 2>/dev/null \
		| jq -r '.structuredContent.id' > .last-id
	@echo "# add_task створив `cat .last-id`; тепер delete_task id=`cat .last-id`"
	@$(INSPECT) --method tools/call --tool-name delete_task --tool-arg id=`cat .last-id` 2>&1; \
		echo "# inspector exit=$$?"

# Помилковий вхід: неіснуючий id. Очікуємо isError: true і людське пояснення.
call-err: build
	@$(INSPECT) --method tools/call --tool-name delete_task --tool-arg id=task-999 2>/dev/null \
		| jq '{isError, text: .content[0].text, structuredContent}'

# Контракт для CI: exit 0 лише якщо фейковий id чесно дає isError: true.
contract: build
	@$(INSPECT) --method tools/call --tool-name delete_task --tool-arg id=task-999 2>/dev/null \
		| jq -e '.isError == true'

# Для лекції 8.7: викликаємо complete_task з фейковим id на зламаному сервері.
# Очікувана ПРАВИЛЬНА поведінка: isError + пояснення.
# Фактична: success: true. Це і є баг, який шукаємо Inspector-ом.
inspect-buggy: build
	npx @modelcontextprotocol/inspector --cli node dist/server.buggy.js \
		--method tools/call --tool-name complete_task --tool-arg id=task-999

# Лекція 8.10: розширений сервер - 7 tools поверх task-store (src/server-advanced.ts).
# Чотири advanced-tools демонструють client features: sampling, roots, elicitation,
# progress/logging. Це клієнтські можливості, тож сервер їх лише викликає.
run-advanced: build
	node dist/server-advanced.js

# UI-режим Inspector: показати sampling/elicit/roots/progress наживо.
# CLI на цьому сервері вміє лише tools/list - відповісти на sampling/elicit
# (вкладка Sampling, форма Elicitation, конфіг Roots) можна тільки у UI.
inspect-advanced: build
	npx @modelcontextprotocol/inspector node dist/server-advanced.js

# ─── Python-дзеркало (python/, лекція 8.6 секція 9) ───
# Той самий task-store на офіційному Python SDK (FastMCP). Той самий домен,
# той самий файл data/tasks.json - клієнт не бачить різниці мов.

# Залежності у власне віртуальне оточення (mcp + pytest).
py-install:
	cd python && uv sync

# Запуск Python-сервера на stdio (чекає JSON-RPC на stdin, Ctrl+C щоб вийти).
py-run:
	cd python && uv run server.py

# pytest: ті самі 17 тестів за духом (store + MCP-шар через in-memory клієнт).
py-test:
	cd python && uv run pytest

clean:
	rm -rf node_modules dist data
