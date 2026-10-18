"use client";

import Link from "next/link";

import { LegalFooter } from "@/components/LegalFooter";
import {
  INSTRUCTION_INTRO,
  INSTRUCTION_SECTIONS,
  splitBold,
  type Block,
} from "@/lib/instruction";

function renderText(text: string) {
  return splitBold(text).map((part, index) =>
    part.bold ? (
      <strong key={index} className="font-semibold text-[var(--text-primary)]">
        {part.text}
      </strong>
    ) : (
      <span key={index}>{part.text}</span>
    )
  );
}

function renderBlock(block: Block, index: number) {
  if (block.kind === "p") {
    return (
      <p
        key={index}
        className="text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        {renderText(block.text)}
      </p>
    );
  }

  if (block.kind === "list") {
    return (
      <ul key={index} className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} className="flex gap-2">
            <span
              aria-hidden
              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--brand-primary)]"
            />
            <span>{renderText(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "table") {
    return (
      <div key={index} className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              {block.head.map((cell, cellIndex) => (
                <th
                  key={cellIndex}
                  className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                >
                  {renderText(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-[var(--border-color)] last:border-0"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-2 pr-3 align-top leading-relaxed text-[var(--text-secondary)]"
                  >
                    {renderText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p
      key={index}
      className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-xs leading-relaxed text-[var(--text-muted)]"
    >
      {renderText(block.text)}
    </p>
  );
}

export default function InstructionPage() {
  return (
    <main className="min-h-dvh overflow-y-auto bg-[var(--bg-primary)] px-4 py-8">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/chat"
          className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
        >
          ← Вернуться в мессенджер
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Инструкция по работе с Albus</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {INSTRUCTION_INTRO}
        </p>

        <nav className="mt-4 flex flex-wrap gap-2 text-xs">
          {INSTRUCTION_SECTIONS.map((section) => (
            <a
              key={section.title}
              href={`#${section.title.replace(/\s+/g, "-")}`}
              className="rounded-full border border-[var(--border-color)] px-2.5 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-6">
          {INSTRUCTION_SECTIONS.map((section) => (
            <section
              key={section.title}
              id={section.title.replace(/\s+/g, "-")}
              className="scroll-mt-4"
            >
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-2 space-y-3">
                {section.blocks.map(renderBlock)}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">
          <h2 className="text-sm font-semibold">Юридические документы</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
            <li>
              <Link
                href="/privacy"
                className="text-[var(--brand-primary)] hover:underline"
              >
                Политика обработки персональных данных
              </Link>
            </li>
            <li>
              <Link
                href="/cookies"
                className="text-[var(--brand-primary)] hover:underline"
              >
                Политика использования файлов cookie
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-[var(--brand-primary)] hover:underline"
              >
                Правила использования
              </Link>
            </li>
          </ul>
        </div>
      </article>
      <LegalFooter />
    </main>
  );
}