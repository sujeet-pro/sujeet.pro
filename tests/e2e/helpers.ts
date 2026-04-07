const bp = process.env.BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${bp}${path}`;
}
