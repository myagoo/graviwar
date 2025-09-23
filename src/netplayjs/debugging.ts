import * as log from "loglevel";

export const DEV: boolean = process.env.NODE_ENV === "development";
console.log("DEV", DEV);

if (DEV) {
  log.enableAll();
}
