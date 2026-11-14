// npm run test:db -- ensure   start the test stack if it isn't running, and write .test-stack/.env
// npm run test:db -- reset    rebuild its schema and seed it
// npm run test:db -- stop
import { ensure, reset, stop, sync } from "./test-stack";

const command = process.argv[2] ?? "ensure";
const commands: Record<string, () => void> = { ensure, reset, stop, sync };
if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
commands[command]();
