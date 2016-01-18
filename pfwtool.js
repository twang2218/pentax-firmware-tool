#!/usr/bin/env node

'use strict';

// dependencies
const program = require('commander');
const toArray = require('stream-to-array');
const fs = require('fs');
const tracer = require('tracer');

const decipher = require('./');

//  config
const config = require('./package.json');

function getLogger() {
  let log = null;
  if (typeof program.debug !== 'undefined') {
    const DATE_FORMAT = 'HH:MM:ss.L';
    if (program.debug === true) {
      //  no log file specified.
      if (typeof program.output !== 'undefined') {
        //  we can use stdout, as the decrypted firmware will be stored on file.
        log = tracer.colorConsole({
          dateformat: DATE_FORMAT,
        });
      } else {
        //  we cannot use stdout, so use stderr instead.
        log = tracer.colorConsole({
          transport: (data) => {
            console.error(data.output);
          },
          dateformat: DATE_FORMAT,
        });
      }
    } else {
      //  log to file
      log = tracer.console({
        transport: (data) => {
          fs.appendFile(program.debug, data.output + '\n',
            err => {
              if (err) throw err;
            });
        },
        dateformat: DATE_FORMAT,
      });
    }
  }

  return log;
}

//  Setup the log
const logger = getLogger();
decipher.setLogger(logger);

function save(filename, data) {
  if (typeof filename !== 'undefined') {
    //  write to file
    fs.writeFileSync(filename, data);
  } else {
    //  write to standard output
    process.stdout.write(data);
  }
}

function decode(data) {
  if (logger !== null) {
    logger.info('Encrpyted file size: ' + data.length + ' bytes');
  }

  const out = decipher.decode(data);

  if (logger !== null) {
    logger.info('Decrypted file size: ' + out.length + ' bytes');
  }

  save(program.output, out);
}

function main() {
  //  load
  if (typeof program.input !== 'undefined') {
    //  read file
    fs.readFile(program.input, (err, data) => {
      if (err) throw err;
      decode(data);
    });
  } else {
    //  read standard input
    toArray(process.stdin)
      .then(parts => decode(Buffer.concat(parts.map(
        p => (p instanceof Buffer ? p : new Buffer(p))))));
  }
}

//  arguments
program
  .version(config.version)
  .description('A command line tool to decrypt/decompress Pentax firmware')
  .option('-i, --input <filename>',
    'Encrypted firmware filename (e.g. "fwdc226b.bin"). ' +
    'If no input filename is specified, the standard input will be used.'
  )
  .option('-o, --output <filename>',
    'Output decrypted filename. If no output file name is specified, ' +
    'the standard output will be used.'
  )
  .option('-d, --debug [logfile]',
    'Enable debug, log to file if the log filename is given, ' +
    'otherwise it will log to the console.'
  )
  .parse(process.argv);

main();
