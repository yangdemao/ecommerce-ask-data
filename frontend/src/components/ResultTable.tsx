/**
 * 查询结果表格组件
 * 将后端返回的结构化数据归一化为可滚动表格，并提供复制/下载导出
 */
import { Braces, Check, ClipboardCopy, Database, FileDown, FileJson, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/format";

function exportCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toTsv(columns: string[], rows: Array<Record<string, unknown>>) {
  const esc = (value: unknown) => exportCell(value).replace(/[\t\n\r]/g, " ");
  return [columns.join("\t"), ...rows.map((row) => columns.map((c) => esc(row[c])).join("\t"))].join("\n");
}

function toMarkdown(columns: string[], rows: Array<Record<string, unknown>>) {
  const esc = (value: unknown) => exportCell(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${columns.map(esc).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((c) => esc(row[c])).join(" | ")} |`),
  ].join("\n");
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>) {
  const esc = (value: unknown) => {
    const text = exportCell(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [columns.map(esc).join(","), ...rows.map((row) => columns.map((c) => esc(row[c])).join(","))].join("\r\n");
  return `\uFEFF${body}`;
}

function toPrettyJson(columns: string[], rows: Array<Record<string, unknown>>) {
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))),
    null,
    2,
  );
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { 序号: index + 1, 值: item },
    );
  }

  if (data && typeof data === "object") {
    return [data as Record<string, unknown>];
  }

  return [{ 值: data ?? "" }];
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ResultTable({ data }: { data: unknown }) {
  const rows = normalizeRows(data);
  const columns = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  );

  const [flashState, setFlashState] = useState<{ name: string; ok: boolean } | null>(null);
  const flashTimer = useRef<number | null>(null);

  const flash = (name: string, ok: boolean) => {
    setFlashState({ name, ok });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashState(null), 1200);
  };

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  if (columns.length === 0) {
    return null;
  }

  const actions = [
    {
      name: "tsv",
      label: "TSV",
      title: "复制为 TSV（可直接粘贴进 Excel）",
      icon: ClipboardCopy,
      run: () => navigator.clipboard.writeText(toTsv(columns, rows)),
    },
    {
      name: "md",
      label: "MD",
      title: "复制为 Markdown 表格",
      icon: FileText,
      run: () => navigator.clipboard.writeText(toMarkdown(columns, rows)),
    },
    {
      name: "csv",
      label: "CSV",
      title: "下载 CSV（含 BOM，Excel 打开中文不乱码）",
      icon: FileDown,
      run: async () => downloadFile("查询结果.csv", toCsv(columns, rows), "text/csv"),
    },
    {
      name: "json",
      label: "JSON",
      title: "下载 JSON",
      icon: Braces,
      run: async () => downloadFile("查询结果.json", toPrettyJson(columns, rows), "application/json"),
    },
  ];

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-rule bg-white/65 shadow-glow backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Database className="h-4 w-4 text-accent" aria-hidden="true" />
          查询结果
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
            {rows.length} 行
          </div>
          <div className="flex items-center gap-1">
            {actions.map((action) => {
              const active = flashState?.name === action.name;
              const ok = flashState?.ok ?? true;
              const Icon = active ? (ok ? Check : X) : action.icon;
              return (
                <button
                  key={action.name}
                  type="button"
                  title={action.title}
                  data-ripple
                  onClick={() => {
                    void action.run().then(
                      () => flash(action.name, true),
                      () => flash(action.name, false),
                    );
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
                    active
                      ? ok
                        ? "border-ok/40 text-ok"
                        : "border-danger/40 text-danger"
                      : "border-rule bg-white/60 text-muted hover:border-accent/40 hover:text-accent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-rule px-4 py-3 font-semibold text-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="result-row odd:bg-white/40 even:bg-white/10">
                {columns.map((column) => (
                  <td key={column} className="border-b border-ink/5 px-4 py-3 text-ink/85">
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
