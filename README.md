[![MIT license](http://img.shields.io/badge/license-GPL--2.0-brightgreen.svg)](http://opensource.org/licenses/GPL-2.0)

Pentax Firmware Decode Tool
===============================

This is a Pentax Firmware Decryption/Decompression tool, which is based on [MooseV2's code](https://github.com/MooseV2/pfwtool_html), which is a Javascript implementation based on [svenpeter42's code](https://github.com/svenpeter42/pfwtool). Also, I included [the decompress's patch made by bootcoder](http://www.pentaxforums.com/forums/6-pentax-dslr-discussion/250555-resurrecting-pentax-firmware-hacking-36.html#post3395067).

Made for the [PHDK project](http://www.pentaxforums.com/forums/6-pentax-dslr-discussion/250555-resurrecting-pentax-firmware-hacking.html).

Usage
=======

First you need to make sure you have installed Node.js, in case you haven't, here is how:

Install Node.js
----------------

### Ubuntu/Debian based Linux

```bash
curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Mac OSX

It's pretty simple on OSX, but you need install [HomeBrew](http://brew.sh/) first, then:

```bash
brew install node
```

### Windows

If you have Scoop installed, it's simple, just:

```bash
scoop install nodejs
```

Otherwise, you can download the installer from [Node.js website](https://nodejs.org/en/#download) directly.

### Others

Don't cry if you're on other platforms, have a look at [Node.js site](https://nodejs.org/en/download/package-manager/), they supports many platforms.

Install `pentax-firmware-tool`
---------

[TODO]
After Node.js installed, it's simple to install this tool:

```bash
npm install pentax-firmware-tool -g
```

Decrypt/Decompress Firmware
-----------------------------

To use this tool is straight forward:

```
pentax-firmware-tool <in> <out>
```

 * `<in>` is the filename/path of the `fwdc220b.bin` from downloaded package, which is encrypted/compressed.

 * `<out>` is the output file name of the decrypted/decompressed firmware.
