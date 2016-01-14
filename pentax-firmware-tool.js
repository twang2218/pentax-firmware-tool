#!/usr/bin/env node

// dependencies
const program = require('commander');
const toArray = require('stream-to-array');
const fs = require('fs');
//  config
const config = require('./package.json');

//  arguments
program
    .version(config.version)
    .description('A command line tool to decrypt/decompress Pentax firmware')
    .option('-i, --input <filename>',
        'Encrypted firmware filename (e.g. "fwdc226b.bin"). If no input filename is specified, the standard input will be used.'
    )
    .option('-o, --output <filename>',
        'Output decrypted filename. If no output file name is specified, the standard output will be used.'
    )
    .parse(process.argv);

//  Prepare I/O
// var in , out;
console.log(' input: ' + program.input);
console.log(' output: ' + program.output);

load(program.input);

function load(filename) {
    if (typeof filename !== 'undefined') {
        //  read file
        fs.readFile(filename, function (err, data) {
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
    console.log(data.length + ' bytes');
    console.log(data);

    save(program.output, data);
}
