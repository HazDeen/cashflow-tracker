import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  // data URL формата "data:image/png;base64,...."
  imageBase64: z.string().min(32),
});

export type ExtractedItem = {
  type: "income" | "expense";
  amount: number;
  category: string;
  comment: string;
  occurred_on: string; // YYYY-MM-DD
};

// Список синхронизирован с src/lib/categories.ts. Дублируем строкой,
// чтобы файл оставался серверным и не тянул иконки lucide.
const ALLOWED_CATEGORIES = [
  "Продукты", "Кафе и рестораны", "Кофейни", "Маркетплейсы",
  "Транспорт", "Такси", "Топливо", "Путешествия",
  "Жильё", "ЖКХ", "Связь и интернет", "Подписки",
  "Развлечения", "Кино и шоу", "Музыка",
  "Здоровье", "Аптека", "Красота",
  "Одежда", "Электроника",
  "Образование", "Спорт",
  "Дети", "Питомцы",
  "Подарки", "Переводы", "Налоги и штрафы", "Долги",
  "Зарплата", "Работа", "Инвестиции", "Возврат",
  "Прочее",
];

export const extractTransactionsFromImage = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<{ items: ExtractedItem[]; error: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { items: [], error: "AI gateway is not configured" };
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt =
      "Ты помощник, который извлекает операции (расходы и доходы) со скриншотов банковских выписок и приложений. Отвечай ТОЛЬКО валидным JSON без пояснений.";
    const userInstruction =
      `Распознай ВСЕ операции на изображении. Верни JSON: ` +
      `{"items":[{"type":"expense" или "income","amount":число (только число, без валюты),"category":"одна из: ${ALLOWED_CATEGORIES.join(", ")}","comment":"короткое описание/мерчант","occurred_on":"YYYY-MM-DD"}]}. ` +
      `Подбирай категорию максимально точно по названию мерчанта/описанию. Примеры: "Пятёрочка/Магнит/Лента" → Продукты; "Wildberries/Ozon/Яндекс Маркет/AliExpress" → Маркетплейсы; "Yandex Go/Uber/Bolt" → Такси; "Лукойл/Shell/Газпромнефть" → Топливо; "МТС/Билайн/Tele2/Мегафон/Ростелеком" → Связь и интернет; "Netflix/Spotify/YouTube Premium/iCloud" → Подписки; "KFC/McDonald's/Burger King/кафе/ресторан" → Кафе и рестораны; "Старбакс/Cofix/кофейня" → Кофейни; "Apteka/Аптека/Ригла" → Аптека; "Stockmann/Zara/H&M" → Одежда; "DNS/Эльдорадо/М.Видео" → Электроника. ` +
      `Если дата операции не видна — используй ${today}. Если категорию точно определить нельзя — "Прочее". ` +
      `Положительные суммы / поступления = income, списания = expense. Никаких пояснений вне JSON.`;

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userInstruction },
                { type: "image_url", image_url: { url: data.imageBase64 } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      console.error("AI gateway request failed:", e);
      return { items: [], error: "AI service is unavailable" };
    }

    if (res.status === 429) return { items: [], error: "Слишком много запросов. Попробуйте позже." };
    if (res.status === 402) return { items: [], error: "Закончились AI-кредиты в воркспейсе." };
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, txt);
      return { items: [], error: `Ошибка распознавания (${res.status})` };
    }

    const json = await res.json().catch(() => null) as any;
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    const raw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items: ExtractedItem[] = raw
      .map((i: any) => {
        const amount = Number(i?.amount);
        if (!isFinite(amount) || amount <= 0) return null;
        const type = i?.type === "income" ? "income" : "expense";
        const category = ALLOWED_CATEGORIES.includes(i?.category) ? i.category : "Прочее";
        const occurred_on = typeof i?.occurred_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.occurred_on)
          ? i.occurred_on : today;
        return {
          type,
          amount: Math.round(amount * 100) / 100,
          category,
          comment: String(i?.comment ?? "").slice(0, 200),
          occurred_on,
        } as ExtractedItem;
      })
      .filter(Boolean) as ExtractedItem[];

    return { items, error: null };
  });
