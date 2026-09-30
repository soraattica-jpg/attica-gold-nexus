export type CsvCellValue = string | number | boolean | null | undefined;

export function escapeCsvValue(value: CsvCellValue) {
  const normalized = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCellValue[][]) {
  const headerCount = headers.length;
  const csv = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => (
      Array.from({ length: headerCount }, (_, index) => row[index] ?? "")
        .map(escapeCsvValue)
        .join(",")
    )),
  ].join("\r\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
