// handlers/index.js — built-in tool dispatch map.
import { readFile as readFileHandler } from './read-file.js';
import { writeFile as writeFileHandler } from './write-file.js';
import { editFile as editFileHandler } from './edit-file.js';
import { listDir as listDirHandler } from './list-dir.js';
import { findFiles as findFilesHandler } from './find-files.js';
import { grepSearch as grepSearchHandler } from './grep-search.js';
import { runCommand as runCommandHandler } from './run-command.js';

export const toolHandlers = {
  readFile: readFileHandler,
  writeFile: writeFileHandler,
  editFile: editFileHandler,
  listDir: listDirHandler,
  findFiles: findFilesHandler,
  grepSearch: grepSearchHandler,
  runCommand: runCommandHandler,
};
