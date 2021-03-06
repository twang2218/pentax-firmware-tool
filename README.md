[![NPM version][npm-image]][npm-url]
[![GPL-2 license][license-image]]([license-url])
[![Dependency Status][dependency-image]][dependency-url]

[npm-image]: http://img.shields.io/npm/v/pfwtool.svg?style=flat
[npm-url]: https://npmjs.org/package/pfwtool

[license-image]: http://img.shields.io/badge/license-GPL--2.0-brightgreen.svg
[license-url]: http://opensource.org/licenses/GPL-2.0

[dependency-image]: http://img.shields.io/gemnasium/twang2218/pentax-firmware-tool.svg
[dependency-url]: https://gemnasium.com/twang2218/pentax-firmware-tool

Pentax Firmware Decode Tool
===============================

This is a Pentax Firmware Decryption/Decompression tool, which is based on [MooseV2's code](https://github.com/MooseV2/pfwtool_html), [svenpeter42's code](https://github.com/svenpeter42/pfwtool), and [the decompress's patch made by bootcoder](http://www.pentaxforums.com/forums/6-pentax-dslr-discussion/250555-resurrecting-pentax-firmware-hacking-36.html#post3395067).

Made for the [PHDK project](http://www.pentaxforums.com/forums/6-pentax-dslr-discussion/250555-resurrecting-pentax-firmware-hacking.html).

Install
=======

First you need to make sure you have installed Node.js, in case you haven't, [here is how](https://nodejs.org/en/download/package-manager/).

Installing `pfwtool` is very simple, just:

```bash
npm i pfwtool -g
```

Usage
=======

To use this tool is straight forward:

```bash
pfwtool -i <in> -o <out>
```

 * `<in>` is the filename/path of the firmware from downloaded package, such as `fwdc220b.bin`, which is encrypted/compressed.

 * `<out>` is the output file name of the decrypted/decompressed firmware.

To extract the resources file in K-S1/K-S2 firmware:

```bash
pfwtool -i ks1.bin -e resdir
```

For other arguments, please check the `--help` arguments

```bash
$ pfwtool -h

  Usage: pfwtool [options]

  A command line tool to decrypt/decompress Pentax firmware

  Options:

    -h, --help                     output usage information
    -V, --version                  output the version number
    -i, --input <filename>         Encrypted firmware filename (e.g. "fwdc226b.bin"). If no input filename is specified, the standard input will be used.
    -o, --output <filename>        Output decrypted filename.
    -d, --debug [logfile]          Enable debug, log to file if the log filename is given, otherwise it will log to the console.
    -l, --list-resources           List resource files in the firmware.
    -e, --extract-resources <dir>  Extract the resource to the given directory.
```
