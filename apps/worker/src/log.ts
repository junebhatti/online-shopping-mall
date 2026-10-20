const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string, extra?: unknown) => console.log(`${stamp()} ${msg}`, extra ?? ""),
  warn: (msg: string, extra?: unknown) => console.warn(`${stamp()} WARN ${msg}`, extra ?? ""),
  error: (msg: string, err?: unknown) =>
    console.error(`${stamp()} ERROR ${msg}`, err instanceof Error ? (err.stack ?? err.message) : (err ?? "")),
};
