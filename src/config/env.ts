import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL"];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] ${key} is not set; using placeholder. Set it in your .env file.`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/safetysecretary",
  openAiKey: process.env.OPENAI_API_KEY
};
