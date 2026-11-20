import sys

p = sys.argv[1] + "/src/server.ts"
s = open(p, encoding="utf8").read()
good = '''        return {
          ...textResult(task),
          structuredContent: { ...task },
        };
      } catch (error) {
        if (error instanceof TaskNotFoundError) {
          return {
            ...textResult(
              `Задачі з id "${id}" не існує, видаляти нічого.'''
bad = '''        return {
          ...textResult(task),
          // ЗЛАМАНО НАВМИСНО (крок 3 ДЗ): createdAt числом, а outputSchema обіцяє рядок.
          structuredContent: { ...task, createdAt: Date.parse(task.createdAt) },
        };
      } catch (error) {
        if (error instanceof TaskNotFoundError) {
          return {
            ...textResult(
              `Задачі з id "${id}" не існує, видаляти нічого.'''
mode = sys.argv[2]
src, dst = (good, bad) if mode == "break" else (bad, good)
assert s.count(src) == 1, "anchor not found: already in target state?"
open(p, "w", encoding="utf8").write(s.replace(src, dst))
print(mode, "done")
