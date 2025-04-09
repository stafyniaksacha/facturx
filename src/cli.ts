import { defineCommand, runMain as _runMain, ParsedArgs, ArgsDef } from "citty";
import pkg from "../package.json" assert { type: "json" };


export const main = defineCommand({
  meta: {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
  },
  subCommands: {
    extract: () => import('./commands/extract').then((r) => r.default),
    generate: () => import('./commands/generate').then((r) => r.default),
    check: () => import('./commands/check').then((r) => r.default),
  }
})

export const runMain = () => _runMain(main);