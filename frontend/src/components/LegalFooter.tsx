import Link from "next/link";

import { OPERATOR, hasRequisites } from "@/lib/operator";

/**
 * Legal footer. 152-ФЗ and the advertising-marking rules both expect the
 * operator's full requisites to be reachable from any page, not only from a
 * dedicated legal page.
 */
export function LegalFooter() {
  return (
    <footer className="border-t border-[var(--border-color)] px-4 py-6 text-xs leading-relaxed text-[var(--text-muted)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          {hasRequisites() ? (
            <>
              <span className="font-medium text-[var(--text-secondary)]">
                {OPERATOR.name}
              </span>
              <span>{OPERATOR.address}</span>
              <span>
                <Link
                  href={`mailto:${OPERATOR.email}`}
                  className="text-[var(--brand-primary)] hover:underline"
                >
                  {OPERATOR.email}
                </Link>
                {OPERATOR.inn ? ` · ИНН ${OPERATOR.inn}` : ""}
                {OPERATOR.ogrn ? ` · ОГРН ${OPERATOR.ogrn}` : ""}
              </span>
            </>
          ) : (
            <span>
              Реквизиты оператора не указаны — заполните{" "}
              <code>src/lib/operator.ts</code>
            </span>
          )}
        </div>

        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy" className="hover:text-[var(--text-secondary)] hover:underline">
            Политика обработки персональных данных
          </Link>
          <Link href="/cookies" className="hover:text-[var(--text-secondary)] hover:underline">
            Политика cookie
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-secondary)] hover:underline">
            Правила использования
          </Link>
        </nav>
      </div>
    </footer>
  );
}