# webhook-channel: канал Claude Code з вебхук-входом (підсумкове ДЗ модуля 8).
# Усі таргети працюють через `make -C <абсолютний шлях до цієї теки> <таргет>`.

.PHONY: install build test smoke-listen hook-nosecret hook-ok hook-bad acks clean

URL = http://127.0.0.1:$${WEBHOOK_PORT:-8791}/webhook
PAYLOAD = fixtures/build-failed.json
# -w друкує код відповіді окремим рядком після тіла.
CURL = curl -sS -w 'HTTP %{http_code}\n' -X POST

node_modules: package.json
	npm install
	@touch node_modules

install: node_modules

build: node_modules
	npm run build

test: node_modules
	npm test

# Фальшива «сесія»: слухає канал 30 секунд і друкує нотифікації (без Claude Code).
smoke-listen: build
	node scripts/fake-session.mjs 30

# Секрет читаємо з .env у змінну середовища і ніде не друкуємо: make показує
# команду з літералом $WEBHOOK_SECRET, значення підставляє вже shell.

# Без секрету: очікуємо HTTP 401, у сесію нічого не йде.
hook-nosecret:
	. ./.env; $(CURL) "$(URL)" -H 'content-type: application/json' -d @$(PAYLOAD)

# Валідний запит: очікуємо HTTP 202 і тег <channel> у сесії.
hook-ok:
	. ./.env; $(CURL) "$(URL)" -H "x-webhook-secret: $$WEBHOOK_SECRET" -H 'content-type: application/json' -d @$(PAYLOAD)

# Секрет правильний, але payload не проходить схему: очікуємо HTTP 422.
hook-bad:
	. ./.env; $(CURL) "$(URL)" -H "x-webhook-secret: $$WEBHOOK_SECRET" -H 'content-type: application/json' -d @fixtures/poisoned.json

# Що Claude відповів каналу через ack_event.
acks:
	@cat data/acks.jsonl 2>/dev/null || echo "ack-ів ще немає"

clean:
	rm -rf node_modules dist data
