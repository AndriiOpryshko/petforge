// event.ts: контракт події вебхука, без жодного import з MCP SDK і без HTTP.
//
// Тіло вебхука - недовірений зовнішній текст, який ляже прямо у контекст моделі.
// Тому з нього беремо тільки три речі - хто, що, посилання - і кожну обмежуємо
// формою і довжиною. Усе, чого немає у схемі, zod мовчки відкидає.

import { z } from "zod";

// Текст для людини/моделі: один рядок без керівних символів і без кутових дужок,
// щоб payload не міг закрити тег <channel> чи підробити сусідній тег.
const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^<>\p{Cc}]+$/u, "керівні символи і кутові дужки заборонені");

export const WebhookEventSchema = z.object({
  // хто: логін чи назва системи. Іде в атрибут тегу, тому лише безпечні символи.
  actor: z
    .string()
    .regex(/^[A-Za-z0-9._@-]{1,64}$/, "дозволені літери, цифри і . _ @ - (до 64 символів)"),
  // що: закритий перелік типів подій + ідентифікатор об'єкта + короткий опис.
  event: z.enum(["build_failed", "build_passed", "deploy_finished"]),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/, "дозволені літери, цифри і . _ - (до 64 символів)"),
  summary: plainLine(200),
  // посилання: тільки http(s), без облікових даних у URL.
  url: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .refine((value) => {
      const parsed = new URL(value);
      return parsed.username === "" && parsed.password === "";
    }, "URL з логіном чи паролем заборонений"),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export type ParseResult =
  | { ok: true; event: WebhookEvent }
  | { ok: false; errors: { field: string; problem: string }[] };

// Повертає або очищену подію, або перелік зламаних полів.
// У помилках назви полів і правила, але не значення: чужий текст не повертаємо
// ні в лог, ні у відповідь.
export function parseWebhookEvent(body: unknown): ParseResult {
  const result = WebhookEventSchema.safeParse(body);
  if (result.success) {
    return { ok: true, event: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      problem: issue.message,
    })),
  };
}

// Те, що побачить модель усередині тегу <channel>. Формат фіксований:
// сирий JSON вебхука сюди не потрапляє.
export function renderEvent(event: WebhookEvent): string {
  return `${event.event} ${event.ref}: ${event.summary}\n${event.url}`;
}
