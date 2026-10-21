---
name: slice-tests
description: Run a scaffolded petforge slice's tests on a real database, implement the spec's cross-field rules test-first, and fix failures. Third step of the petforge workflow. Use after slice-scaffold, or when asked to "test the slice", "add the business rules", "/petforge:slice-tests [spec]".
argument-hint: "[path to spec; defaults to the newest .petforge/slices/*.json]"
---

# slice-tests

The generator already wrote tests for every field rule (domain unit tests and HTTP integration tests
for 201, 422 per rule, 404, pagination, bad cursor). This step adds what the generator cannot know.

## Steps

1. Run only the context's tests: `cd <service> && go test ./internal/<context>/...`
   (Docker must be running for the database tests).
2. For each entry in the spec's `rules`, test-first:
   - add a failing case to `domain/<entity>_test.go` (`TestValidate`) and one to the context's
     integration test (`TestCreate<Entity>RejectsInvalidBody`, pointer of the field the rule names);
   - run the tests and see them fail;
   - add the check to `<Entity>Fields.Validate()` (add a `Field<Name>` constant and a
     `bodyPointers` entry in `adapters/http/handler.go` when the field had none);
   - rerun until green.
   Mirror the rule in the migration as a `CHECK` constraint when it is expressible in SQL.
3. Fix any other failure in hand-written code; never weaken a generated assertion to pass.
4. Report the test count and every rule you implemented.
