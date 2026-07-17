#!/usr/bin/env node
/**
 * Build a compact JSON lookup index from Folkets Swedish–English XML.
 * Source: data/dictionaries/folkets_sv_en_public.xml (CC BY-SA 2.5)
 */

const { writeFolketsIndex, DEFAULT_XML, DEFAULT_INDEX } = require("./folkets-lib");

const xmlPath = process.argv[2] || DEFAULT_XML;
const outputPath = process.argv[3] || DEFAULT_INDEX;

const result = writeFolketsIndex(outputPath, xmlPath);
console.log(
  `Folkets index: ${result.entries} entries -> ${result.outputPath}`
);
