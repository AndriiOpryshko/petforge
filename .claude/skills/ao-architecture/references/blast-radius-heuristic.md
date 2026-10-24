# Blast-radius heuristic — when a decision becomes an ADR (ao-architecture)

## Коротко

**Масштаб удару** — наскільки боляче передумати рішення через 3 місяці. У курсовому скілі три
критерії; тут їх **чотири**, бо в ОСББ-продукті найдорожче переробляти дані, а не код:

1. **Незворотне** — переробка займе ≥3 днів.
2. **Кілька контекстів** — рішення бачать ≥2 bounded contexts або web і core разом.
3. **Чесна альтернатива** — через пів року хтось спитає «чому не X?», і X серйозний.
4. **Зачіпає базу** — нова таблиця, міграція наявних записів, зміна того, що зберігається роками
   (підписані протоколи, суми, склад правління), або політика зберігання й видалення.

**2 з 4 → ADR.** «Зачіпає базу» + «незворотне» → ADR завжди, навіть без інших. 1 з 4 →
питаємо явно. 0 → рішення лишається в `sad.md`.

---

Run on every **Approved** decision in step 6d (see [socratic-loop.md](./socratic-loop.md)). Record
the score in the ADR `## Blast radius` block and in the §9 row.

## The four criteria

### 1. Irreversible

> Would picking another option in three months take ≥3 days of rework?

Fires: storage shape of a legal record, sync vs async between contexts, ID strategy, where a file
lives (database vs object storage), who owns a state machine. Does not fire: a library inside one
package, a timeout value, a field name.

### 2. Multi-context

> Does it change a contract seen by ≥2 bounded contexts (`services/core/internal/<bc>/`) or by
> both `apps/web` and `services/core`?

Fires: a call through another context's `module.go`, a shared error-code prefix, an OpenAPI shape
the web client and two contexts use, an event between contexts. Does not fire: a private
repository method, a helper inside `adapters/postgres/` of one context.

### 3. Legitimate alternative

> Is there a real option a competent engineer would pick instead?

Excludes options already ruled out by `docs/adr/0001-0004` (stack, contexts, spec-first codegen,
migrations) or by `CLAUDE.md` layout rules — those are strawmen and the critic flags them (F6).

### 4. Touches the database

> Does it add or change a table, change what existing rows mean, need a migration with a backfill,
> or set how long records live?

Fires: a new table for protocols, linking protocols to existing `governance` meetings, storing a
signed scan, immutability of a locked record, soft vs hard delete, a retention period, a CHECK that
existing rows may violate. Does not fire: a new read query on existing columns, an index that can
be dropped in one migration.

Why it is separate from «irreversible»: a goose migration is cheap to write and expensive to undo
once real associations have signed records in it. Treating it as its own criterion keeps every
data-shape decision visible in an ADR with its migration consequence.

## How to score

1. Score the four criteria after each Approved decision.
2. Decide:
   - **0** → inline in `sad.md`.
   - **1** → ask: «Це рішення на межі ADR через <критерій>. Зафіксувати як ADR чи лишити в SAD?»
     Recommended = ADR when the one criterion is «зачіпає базу» or the decision is in §4.
   - **2+**, or **data + irreversible** → ADR.
3. Put the score in the ADR:

   ```
   ## Blast radius
   - Irreversible: yes — <why>
   - Multi-context: no
   - Legitimate alternative: yes — <option>
   - Touches the database: yes — <table / migration / retention>
   ```

## Expected counts

XS/S → 2-4, M → 5-12, L/XL → 10-15. With the fourth criterion, an M feature with a new aggregate
usually lands 1-2 ADRs higher than in the course skill; above 12 for M, bundle tactical
decisions back into `sad.md`.

## Closing self-review

1. §9 lists every file in the ADR folder; every row has a file.
2. Every ADR has `status: accepted`, a decision outcome and a filled `Blast radius` block.
3. Every decision that adds or changes stored data either has an ADR or a one-line reason in §8 why
   it scored below the gate.
4. No ADR re-decides a repo ADR (0001-0004) without naming it as superseded.

## Anti-patterns

- An ADR for a rejected option — it goes into `Considered options`.
- A problem-form title (`0003-protocol-storage.md`) instead of a decision (`0003-store-signed-scan-outside-postgres.md`).
- A migration decision hidden in §5 prose without the data criterion scored.
- One ADR per quality goal — goals live in §10.
