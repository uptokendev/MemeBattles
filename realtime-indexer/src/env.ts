import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const ENV = {
  DATABASE_URL: req("DATABASE_URL"),
  ABLY_API_KEY: req("ABLY_API_KEY"),

  BSC_RPC_HTTP_97: req("BSC_RPC_HTTP_97"),
  BSC_RPC_HTTP_56: process.env.BSC_RPC_HTTP_56 || "",

  FACTORY_ADDRESS_97: process.env.FACTORY_ADDRESS_97 || "",
  FACTORY_ADDRESS_56: process.env.FACTORY_ADDRESS_56 || "",

  CONFIRMATIONS: Number(process.env.CONFIRMATIONS || "5"),
  LOG_CHUNK_SIZE: Number(process.env.LOG_CHUNK_SIZE || "2000"),

  PORT: Number(process.env.PORT || "3000")
};
