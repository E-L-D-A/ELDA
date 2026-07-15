export async function go(): Promise<number> {
  try {
    await Promise.resolve();
  } catch {
    return 1;
  }
  return 0;
}
