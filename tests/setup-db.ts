import "dotenv/config";

// Integration tests must never touch development data.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/_test(\?|$)/.test(testUrl)) {
  throw new Error("TEST_DATABASE_URL must be set and point at a database whose name ends in _test");
}
process.env.DATABASE_URL = testUrl;
