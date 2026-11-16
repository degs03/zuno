// Just enough Node typing for catalog.check.ts, which runs under node (`npm run check`).
// The app itself never touches the filesystem from the webview, so @types/node is not a dependency.
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function statSync(path: string): { isDirectory(): boolean };
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
declare const process: { cwd(): string };
