import { useEffect, useMemo, useState } from "react";

export const DEFAULT_CLIENT_PAGE_SIZE = 30;

type UseClientPaginationOptions = {
  pageSize?: number;
  resetKey?: string | number;
};

export function useClientPagination<T>(items: T[], options?: UseClientPaginationOptions) {
  const pageSize = options?.pageSize ?? DEFAULT_CLIENT_PAGE_SIZE;
  const [page, setPage] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [options?.resetKey, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    pageItems,
    pageSize,
    setPage,
    totalItems,
    totalPages,
  };
}
