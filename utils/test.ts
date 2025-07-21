import { codingAgent } from "./agent";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

codingAgent("Navigate to https://checklyhq.com and generate a test suite covering the most critical user flows and interactions.")
  .then(console.log)
  .catch(console.error);
