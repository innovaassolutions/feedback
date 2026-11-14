// Loads environment for command-line scripts. FEEDBACK_ENV_FILE points a script at another
// stack, which is how the tests seed their own database.
import { existsSync } from "node:fs";

const file = process.env.FEEDBACK_ENV_FILE ?? ".env.local";
if (existsSync(file)) process.loadEnvFile(file);
