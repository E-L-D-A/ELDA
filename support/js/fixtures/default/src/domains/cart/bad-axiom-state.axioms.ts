let cache: Record<string, number> = {};

export const remember = (key: string, value: number): number => {
  cache[key] = value;
  return value;
};
