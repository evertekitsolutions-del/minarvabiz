export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: T[], params: PageParams = {}): PageResult<T> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
  const page = Math.max(params.page ?? 1, 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}
