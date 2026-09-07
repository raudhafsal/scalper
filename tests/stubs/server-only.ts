// Test-only stub for the `server-only` package - see vitest.config.ts.
// Next.js's real build still enforces the genuine client/server boundary;
// this stub exists purely so unit tests can import server-side modules
// under plain Node without a bundler applying the "react-server" export
// condition.
export {};
