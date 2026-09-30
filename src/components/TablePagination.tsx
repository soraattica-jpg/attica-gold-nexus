type TablePaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

function getVisiblePageNumbers(page: number, totalPages: number) {
  if (totalPages <= 1) return [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  const adjustedStart = Math.max(1, endPage - 4);
  return Array.from({ length: endPage - adjustedStart + 1 }, (_, index) => adjustedStart + index);
}

export default function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  disabled = false,
  compact = false,
}: TablePaginationProps) {
  if (totalItems <= 0) return null;

  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const startItem = totalItems === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);
  const visiblePageNumbers = getVisiblePageNumbers(safePage, totalPages);

  return (
    <div className={`flex min-w-0 flex-wrap items-center justify-between border-t border-border ${compact ? "gap-1 px-2 py-1.5" : "gap-3 px-4 py-3"}`}>
      <p className={compact ? "min-w-0 text-[11px] text-muted-foreground" : "text-sm text-muted-foreground"}>
        {compact ? `${startItem}-${endItem} / ${totalItems}` : `Showing ${startItem} to ${endItem} of ${totalItems}`}
      </p>
      {totalPages > 1 ? (
        <div className={`flex min-w-0 flex-wrap items-center ${compact ? "gap-1" : "gap-2"}`}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={disabled || safePage <= 1}
            className={`action-outline disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
          >
            {compact ? "Prev" : "Previous"}
          </button>
          {visiblePageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              disabled={disabled}
              className={pageNumber === safePage
                ? `action-gold justify-center ${compact ? "min-w-7 px-2 py-1 text-xs" : "min-w-10 px-3 py-2 text-sm"}`
                : `action-outline justify-center ${compact ? "min-w-7 px-2 py-1 text-xs" : "min-w-10 px-3 py-2 text-sm"}`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={disabled || safePage >= totalPages}
            className={`action-outline disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
          >
            {compact ? "Next" : "Next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
