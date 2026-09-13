/** A scroll-free navigation layout with a usable row size at short heights. */
export function getSidebarLayout({
  itemCount,
  availableHeight,
  preferredRowHeight = 40,
  minimumRowHeight = 32,
  gap = 2,
  pagerHeight = 36,
}: {
  itemCount: number;
  availableHeight: number;
  preferredRowHeight?: number;
  minimumRowHeight?: number;
  gap?: number;
  pagerHeight?: number;
}) {
  const count = Math.max(0, Math.floor(itemCount));
  const preferred = Math.max(minimumRowHeight, preferredRowHeight);
  // The initial SSR grid still shrinks in CSS before its first measurement.
  if (!count || availableHeight <= 0) return { pageSize: count, pageCount: 1, rowHeight: preferred };
  const fits = count * minimumRowHeight + (count - 1) * gap <= availableHeight;
  const rowSpace = Math.max(0, availableHeight - (fits ? 0 : pagerHeight));
  const pageSize = fits ? count : Math.max(1, Math.min(count, Math.floor((rowSpace + gap) / (minimumRowHeight + gap))));
  return {
    pageSize,
    pageCount: Math.ceil(count / pageSize),
    rowHeight: Math.floor(Math.max(0, Math.min(preferred, (rowSpace - (pageSize - 1) * gap) / pageSize)) * 100) / 100,
  };
}
