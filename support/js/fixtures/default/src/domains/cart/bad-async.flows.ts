// elda/no-async-inner (LAYER.4): async and try/catch in an inner layer.
export async function fetchIt(): Promise<number> {
  try {
    return await Promise.resolve(1);
  } catch {
    return 0;
  }
}
