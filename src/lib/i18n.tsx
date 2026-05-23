import { createContext, useContext, useEffect, useState } from "react";

type Lang = "ru" | "en";

const dict = {
  ru: {
    hi: "Привет", welcomeBack: "С возвращением",
    balance: "Баланс", dailyLimit: "Дневной лимит", daysLeft: "Дней до конца",
    operation: "Операция", incomeExpense: "Доход / расход",
    subscription: "Подписка", monthly: "Каждый месяц",
    pendingSubs: "Подписки до конца месяца", free: "Свободно",
    recent: "Последние операции", all: "Все", empty: "Пока пусто",
    home: "Главная", operations: "Операции", profile: "Профиль", subscriptions: "Подписки",
    settings: "Настройки", theme: "Тема", light: "Светлая", dark: "Тёмная",
    language: "Язык", logout: "Выйти", account: "Аккаунт",
    journal: "Журнал", search: "Поиск по категории...",
    edit: "Изменить", delete: "Удалить", confirmDelete: "Удалить операцию?",
    newOperation: "Новая операция", editOperation: "Изменить операцию",
    expense: "Расход", income: "Доход", amount: "Сумма",
    category: "Категория", comment: "Комментарий", save: "Сохранить", saving: "Сохраняем...",
    inMonth: "В месяц", noSubs: "Нет активных подписок", chargeDay: "-го числа",
    newSub: "Новая подписка", name: "Название",
    manual: "Вручную", auto: "Автоматически",
    uploadScreenshot: "Загрузить скрин из банка",
    uploadHint: "AI распознает операции и предложит список",
    recognize: "Распознать", recognizing: "Распознаём...",
    recognized: "Найдено операций", nothingFound: "Ничего не найдено. Попробуйте другое изображение.",
    saveAll: "Сохранить все", review: "Проверьте и отредактируйте",
    chooseImage: "Выбрать изображение", changeImage: "Заменить",
    weeklyLimit: "Недельный лимит", expectedIncome: "Ожидаемый доход",
    shifts: "Смены", debts: "Долги", addShift: "Добавить смену", addDebt: "Добавить долг",
    shiftDate: "Дата смены", expectedAmount: "Ожидаемая сумма", noteOpt: "Заметка (необязательно)",
    markPaid: "Отметить как полученное", markPaidConfirm: "Создать доход и закрыть смену?",
    upcoming: "Ближайшие", noShifts: "Пока нет смен", noDebts: "Долгов нет",
    iOwe: "Я должен", owedToMe: "Мне должны", counterparty: "Кому / от кого",
    dueDate: "До какого числа", optional: "необязательно",
    settle: "Закрыть", settleConfirm: "Закрыть долг? Будет создана транзакция.",
    overdue: "Просрочено", newShift: "Новая смена", newDebt: "Новый долг",
    direction: "Тип", noDueDate: "Без срока",
  },
  en: {
    hi: "Hi", welcomeBack: "Welcome back",
    balance: "Balance", dailyLimit: "Daily limit", daysLeft: "Days left",
    operation: "Operation", incomeExpense: "Income / expense",
    subscription: "Subscription", monthly: "Every month",
    pendingSubs: "Subscriptions left this month", free: "Free",
    recent: "Recent operations", all: "All", empty: "Nothing yet",
    home: "Home", operations: "Operations", profile: "Profile", subscriptions: "Subscriptions",
    settings: "Settings", theme: "Theme", light: "Light", dark: "Dark",
    language: "Language", logout: "Sign out", account: "Account",
    journal: "Journal", search: "Search by category...",
    edit: "Edit", delete: "Delete", confirmDelete: "Delete this operation?",
    newOperation: "New operation", editOperation: "Edit operation",
    expense: "Expense", income: "Income", amount: "Amount",
    category: "Category", comment: "Comment", save: "Save", saving: "Saving...",
    inMonth: "Per month", noSubs: "No active subscriptions", chargeDay: "th",
    newSub: "New subscription", name: "Name",
    manual: "Manual", auto: "Automatic",
    uploadScreenshot: "Upload bank screenshot",
    uploadHint: "AI will detect operations and suggest a list",
    recognize: "Recognize", recognizing: "Recognizing...",
    recognized: "Operations found", nothingFound: "Nothing found. Try another image.",
    saveAll: "Save all", review: "Review and edit",
    chooseImage: "Choose image", changeImage: "Replace",
    weeklyLimit: "Weekly limit", expectedIncome: "Expected income",
    shifts: "Work shifts", debts: "Debts", addShift: "Add shift", addDebt: "Add debt",
    shiftDate: "Shift date", expectedAmount: "Expected amount", noteOpt: "Note (optional)",
    markPaid: "Mark as paid", markPaidConfirm: "Create income and close this shift?",
    upcoming: "Upcoming", noShifts: "No shifts yet", noDebts: "No debts",
    iOwe: "I owe", owedToMe: "Owed to me", counterparty: "To / from whom",
    dueDate: "Due date", optional: "optional",
    settle: "Settle", settleConfirm: "Settle this debt? A transaction will be created.",
    overdue: "Overdue", newShift: "New shift", newDebt: "New debt",
    direction: "Type", noDueDate: "No due date",
  },
} as const;

type Key = keyof (typeof dict)["ru"];

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "ru", setLang: () => {}, t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (saved) setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };

  const t = (k: Key) => dict[lang][k] ?? dict.ru[k];

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
