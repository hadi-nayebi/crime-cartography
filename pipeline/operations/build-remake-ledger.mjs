#!/usr/bin/env node

import {mkdir, rename, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildRemakeLedger} from "./remake-ledger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, "experiment/remake-ledger.json");
const ledger = await buildRemakeLedger({root});
await mkdir(dirname(output), {recursive: true});
const temporary = `${output}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`);
await rename(temporary, output);
process.stdout.write(`${output}\n`);
