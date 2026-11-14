import { reset } from "../scripts/test-stack";

export default function globalSetup() {
  if (process.env.SKIP_DB_RESET !== "1") reset();
}
