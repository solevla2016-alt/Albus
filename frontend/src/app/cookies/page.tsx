"use client";

import Link from "next/link";

import { LegalFooter } from "@/components/LegalFooter";
import { OPERATOR, hasRequisites } from "@/lib/operator";

const COOKIE_BLOCKS = [
  {
    title: "1. Какие cookie использует Мессенджер Albus",
    body: [
      "1.1. Сайт не использует рекламные, аналитические и маркетинговые cookie, не подключает счётчики посещаемости и не строит поведенческий профиль пользователя.",
      "1.2. Используются только cookie, необходимые для работы сайта (категория «строго необходимые»).",
    ],
  },
  {
    title: "2. Перечень и назначение cookie",
    body: [
      "2.1. sessionid — идентификатор сессии. Используется для авторизации пользователя и сохранения его прав доступа между запросами. Содержит непрозрачный идентификатор, а не персональные данные. Срок жизни — до закрытия браузера.",
      "2.2. csrftoken — токен защиты от межсайтовой подделки запроса (CSRF). Служебный, не связан с идентификацией пользователя. Срок жизни — 1 год.",
      "2.3. cookie настройки интерфейса (тема оформления, состояние панели) хранятся в localStorage браузера, а не в cookie, и передаются на сервер только по запросу к обслуживающим их страницам.",
    ],
  },
  {
    title: "3. Возможность отказа",
    body: [
      "3.1. Отказ от cookie строго необходимой категории делает невозможным вход в Мессенджер и работу с чатами, поэтому технически такие cookie не отключаются.",
      "3.2. Пользователь может самостоятельно удалить все cookie в настройках браузера, а также очистить localStorage. Удаление cookie приведёт к выходу из учётной записи.",
      "3.3. Сайт не устанавливает cookie, от установки которых можно отказаться через интерфейс, поскольку иные категории не используются.",
    ],
  },
  {
    title: "4. Изменение политики",
    body: [
      "4.1. Политика может быть изменена. Новая редакция публикуется по адресу /cookies.",
    ],
  },
];

export default function CookiesPage() {
  return (
    <main className="min-h-dvh overflow-y-auto bg-[var(--bg-primary)] px-4 py-8">
        <article className="mx-auto max-w-3xl">
        <Link
          href="/chat"
          className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
        >
          ← Вернуться в мессенджер
        </Link>

        <h1 className="mt-4 text-2xl font-bold">
          Политика использования файлов cookie
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Редакция 1.0 · действует с {OPERATOR.effectiveFrom}
        </p>

        <div className="mt-6 space-y-6">
          {COOKIE_BLOCKS.map((block) => (
            <section key={block.title}>
              <h2 className="text-lg font-semibold">{block.title}</h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {block.body.map((paragraph) => (
                  <li key={paragraph} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--brand-primary)]"
                    />
                    <span>{paragraph}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">
          <h2 className="text-sm font-semibold">Обработка персональных данных</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Порядок обработки персональных данных описан в{" "}
            <Link
              href="/privacy"
              className="text-[var(--brand-primary)] hover:underline"
            >
              политике обработки персональных данных
            </Link>
            .
          </p>
        </div>

        {!hasRequisites() && (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border-color)] p-4 text-xs text-[var(--text-muted)]">
            Реквизиты оператора не заполнены в src/lib/operator.ts. До их
            заполнения документ нельзя считать готовым: Роскомнадзор ожидает
            наименование, адрес, email, ИНН и ОГРН оператора.
          </p>
        )}
      </article>
        <LegalFooter />
      </main>
  );
}