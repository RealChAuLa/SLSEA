const [command, increment] = process.argv.slice(2);
console.error(
  `${command} is not implemented in I0. It becomes available in ${increment}.`,
);
process.exitCode = 1;
