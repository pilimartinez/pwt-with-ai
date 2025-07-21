import { codingAgent } from "./agent";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

codingAgent("Navigate to https://checklyhq.com and generate a playwright test suite covering 3 of the most critical user flows and interactions.")
  .then(console.log)
  .catch(console.error);
