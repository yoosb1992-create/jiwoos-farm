export const MAP_DIMENSION_MIN = 8;
/** Keep the editor free from the old per-axis 200-tile cap while still
 * preventing an accidental gigantic map from locking the browser. */
export const MAP_TILE_BUDGET = 400_000;

export const parseMapDimension = (value: string | number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : NaN;
};

export const mapSizeError = (width: number, height: number): string | null => {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return "가로와 세로는 정수여야 합니다.";
  if (width < MAP_DIMENSION_MIN || height < MAP_DIMENSION_MIN) return `가로와 세로는 각각 ${MAP_DIMENSION_MIN}타일 이상이어야 합니다.`;
  if (width * height > MAP_TILE_BUDGET) return `맵 전체 타일 수는 ${MAP_TILE_BUDGET.toLocaleString("ko-KR")}개 이하로 설정해 주세요.`;
  return null;
};
