# OSBB domain reference for ao-discovery

Read in phase 0. Seeds only: the interview overrides anything here with what the user says.

## Socratic questions

Ask in Ukrainian, 2-3 per batch, at least one per block.

**Document and decision**
- Який документ виходить у результаті і хто його підписує?
- Хто читатиме його пізніше: мешканці, ревізор, банк, суд, підрядник?
- Що в документі змінюється щоразу, а що завжди однакове?

**Today's workaround**
- Як це роблять зараз: шаблон у Word, Viber-група, Excel, бухгалтер?
- Скільки часу йде на один документ і як часто він потрібен?
- Що вже пробували і чому покинули?

**Cost of a mistake**
- Що станеться, якщо в документі буде неправильне число або дата?
- Чи був випадок, коли рішення довелося переголосовувати або виправляти?
- Хто відповідає особисто, якщо документ неправильний?

**Competence**
- Це рішення правління чи тільки загальних зборів?
- Які обмеження ставить статут: ліміт суми, джерело коштів, кворум?
- Чи є рішення зборів, які це обмежують або дозволяють?

**Success**
- Як зрозуміти через місяць, що стало краще: час, кількість правок, суперечки?
- Яке число зараз і яке хочемо?

## Glossary seeds (frequent homonyms)

- протокол правління - NOT протокол загальних зборів: different body, different competence and quorum.
- рішення - NOT питання порядку денного: the item is what is voted on; the decision is the outcome.
- кошторис - NOT рахунок: the budget for the year vs one invoice from a contractor.
- співвласник - NOT мешканець: the owner votes and pays; a resident may do neither.
- справа - NOT протокол: the case is the bundle of source documents a protocol is built from.
- кворум - NOT більшість: presence needed to decide vs votes needed to pass.
- джерело коштів - NOT стаття витрат: where the money comes from vs what it is spent on.

## Approach seeds (typical alternatives in this market)

- **Simplicity** - a better template: one editable form with fixed blocks; the chair still
  types every number. Cheapest; does not remove copy-paste errors.
- **Differentiation** - AI drafts the whole document from the case documents, with warnings
  against the charter and meeting decisions; the human edits and signs.
- **Balanced** - typed slots: requisites, dates, members and amounts are rendered from data
  and case documents; AI writes only the wording and non-blocking warnings with a link to the
  source; the human approves.

Status quo to compare against: Word or Google Docs template, Viber/Telegram group for
approvals, Excel for numbers, the accountant as the person who "knows where the number is".

## Repo reference (petforge conventions)

Used in phase 10 (Feasibility) and §17 only. Never in the product sections.

- Layout: Go + React modular monolith, one folder per bounded context, each with
  domain / app / adapter layers, an OpenAPI spec, migrations and SQL queries
  (see the petforge README vertical slice). Cross-context imports are not allowed.
- Sentinel errors: `<context>.<snake_case>` returned by the domain layer and mapped to HTTP
  codes in the adapter. Typical seeds for a protocol feature:
  - `protocol.quorum_missing`
  - `protocol.outside_board_competence`
  - `protocol.amount_mismatch` (number in the text differs from the source document)
  - `protocol.source_not_found` (a slot has no document to cite)
  - `protocol.version_immutable` (editing a signed version)
- Status at the time of writing: petforge has no Go modules yet, so Feasibility must say
  "no adjacent module in repo" honestly rather than cite a pattern that does not exist.
