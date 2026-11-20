# Модуль 8 «MCP» — підсумкове ДЗ, пакет здачі

Код: `task-store/` (власний сервер на скелеті 8.6) і `webhook-channel/` (власний канал).
Усі команди запускаються з будь-якої теки через `make -C <абсолютний шлях> <таргет>`.

## Що зараховано → чим закрито

| Пункт | Доказ |
|---|---|
| Готовий сервер підключений через `.mcp.json`, є живий виклик | `claude mcp list` → `context7: npx -y @upstash/context7-mcp - ✔ Connected` (project scope, `spilno/.mcp.json`); живий виклик `resolve-library-id` + `query-docs` у сесії (документація Claude Code про канали) |
| Власний tool, `npm test` зелений, `isError: true` | `make -C task-store test` → `Tests 25 passed (25)`; `make -C task-store inspect-mine` → `count: 4`, `delete_task`; `make -C task-store call-err` → `isError: true` |
| `outputSchema`, зламане поле ловиться валідацією | `inspect-mine` → `delete_task.outputSchema`; у зламаному стані `call-ok` → `MCP error -32602: Output validation error … path ["createdAt"] … expected string, received number`; `test` → `1 failed \| 24 passed` |
| Inspector: щасливий і помилковий шлях | `call-ok` → `structuredContent`, `# inspector exit=0`; `call-err` → `isError: true` |
| Канал приймає `POST /webhook` і штовхає подію | `make -C webhook-channel hook-ok` → `HTTP 202`, `event_id a3ba4bfe`; у сесії `webhook: build_failed build-1042: …` |
| Секрет і схема, відхилений і прийнятий запити | `hook-nosecret` → `HTTP 401 {"error":"unauthorized"}`; `hook-ok` → `HTTP 202`; код: `webhook-channel/src/channel.ts:178` (`secretMatches`), `:206` (`parseWebhookEvent`), схема `src/event.ts:19` |
| Claude реагує на подію каналу | лог сесії: подія → `Read build-1042.log` → `ack_event`; `make -C webhook-channel acks` → `a3ba4bfe`, `handled` |
| Висновок про довіру | текст нижче |

## Чек-лист вибору готового сервера (Context7)

- **Автор:** Upstash, пакет `@upstash/context7-mcp` 4.7.3, MIT, відкритий код `github.com/upstash/context7`.
- **Tools:** 2 — `resolve-library-id`, `query-docs`. Обидва лише читають.
- **Permissions:** ключ не потрібен; до файлів і shell доступу не просить; ходить у мережу до API Context7, тож текст запиту йде назовні (секретів і приватного коду в запит не кладемо).
- **Ризики:** запускається через `npx -y` без зафіксованої версії; повернута документація — чужий текст у контексті моделі.
- **Чому підходить:** мало tools (дешево в контексті), read-only, закриває реальну потребу — свіжі доки бібліотек.

## Вимір

- Сервер віддає **4 tools**: `add_task`, `complete_task`, `list_tasks`, `delete_task` (мій), плюс 2 resources і 1 prompt.
- Definitions коштують **приблизно 900 токенів**. Як рахував: мінімізований JSON масиву `tools` з `tools/list` — 3023 символи, з них 606 кирилиці; латиниця/JSON ≈ 4 символи на токен, кирилиця ≈ 2 символи на токен → 2417/4 + 606/2 ≈ 907. `delete_task` сам ≈ 390 токенів, і більшість із них — `outputSchema` з описами полів.
- **Найважче рішення в error-контракті:** що робити з `outputSchema` на помилковому шляху. Схема описує лише успіх, тому на неіснуючий id повертаю `isError: true` з текстом-підказкою і без `structuredContent`, а не «порожню задачу», яка пройшла б схему, але збрехала б про успіх. Друге — невідомі помилки не маскую: ловлю тільки `TaskNotFoundError`, решта летить далі.

## Висновок про довіру до каналу

Звичайний MCP-сервер відповідає лише тоді, коли модель сама його викликала, і я бачу цей виклик. Канал працює навпаки: будь-хто, хто дістався до `POST /webhook`, кладе текст прямо в контекст моделі в момент, який обирає він, без мого підтвердження. Тобто відкритий у мережу канал — це готовий вхід для prompt injection у сесію, яка має мої інструменти і права.

Якби сервер ішов далі за localhost, обов'язковими були б обидва запобіжники:

1. **Автентифікація відправника** — секрет у заголовку, перевірка до читання тіла, порівняння за сталий час, fail closed без секрету (у проді — HMAC-підпис тіла і TLS).
2. **Схема-allowlist** — у подію йдуть лише `actor`, `event` (закритий перелік), `ref`, `summary`, `url` з обмеженнями форми й довжини; сирий payload, кутові дужки, керівні символи і не-http посилання відкидаються з `422`.

Додатково в інструкції каналу сказано, що тіло події — дані, а не команди.

## Публікація

Додав до task-store власний tool `delete_task` з `outputSchema` і чесним `isError`, а зверху — канал, який приймає вебхук про впалий білд і сам штовхає його в живу сесію Claude. Найбільше здивувало, що SDK перевіряє `structuredContent` уже після виконання handler-а: на зламаному полі клієнт отримує помилку валідації, а задача на той момент уже видалена.

## Відтворення

```
make -C task-store test inspect-mine call-ok call-err
python3 task-store/break-field.py task-store break   # зламати поле; fix - повернути
make -C webhook-channel test
cp webhook-channel/.env.example webhook-channel/.env  # і свій секрет: openssl rand -hex 32
claude mcp add -s local webhook -- node --env-file=<abs>/webhook-channel/.env <abs>/webhook-channel/dist/server.js
claude --dangerously-load-development-channels server:webhook
make -C webhook-channel hook-nosecret hook-ok hook-bad acks
```
