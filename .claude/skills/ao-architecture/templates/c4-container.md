# C4 — Container (ao-architecture default)

<!-- Embedded inline in SAD §5. One Container per declared target_surface; the rest are the
     recommended containers from references/repo-practice.md §Recommended containers.
     Bounded contexts are a nested Container_Boundary inside core. Drop a container only with a
     reason in §5 prose. Syntax → references/c4-mermaid-syntax.md -->

```mermaid
C4Container
    title Containers — <feature>

    Person(member, "<glossary role, e.g. член правління>", "<intent>")

    System_Boundary(sys, "<product>") {
        Container(web, "Web client", "React, TanStack Router", "<screens for this feature>")
        Container_Boundary(core, "Core API — Go modular monolith") {
            Container(ctx_new, "<new context>", "Go bounded context", "<what it owns>")
            Container(ctx_ref, "<existing context, e.g. governance>", "Go bounded context", "<what it provides>")
        }
        ContainerDb(db, "Database", "Postgres, goose + sqlc", "<tables per context>")
        ContainerDb(files, "File storage", "<per ADR>", "<signed scans, case documents>")
    }

    System_Ext(otel, "Observability", "OpenTelemetry → Grafana LGTM")
    System_Ext(ai, "<Text generation service>", "<wording and warnings only>")

    Rel(member, web, "uses", "HTTPS")
    Rel(web, ctx_new, "calls", "OpenAPI, JSON")
    Rel(ctx_new, ctx_ref, "reads <what>", "through module.go")
    Rel(ctx_new, db, "reads/writes own tables", "SQL")
    Rel(ctx_new, files, "stores files")
    Rel(ctx_new, ai, "requests wording", "HTTPS")
    Rel(ctx_new, otel, "traces, metrics", "OTLP")
```
