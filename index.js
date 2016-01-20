'use strict';

const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');

//  Constants

//      Deobfuscate
const SECTION_00080000 = 0x00080000;
const SECTION_00A00000 = 0x00A00000;
const SECTION_00C00000 = 0x00C00000;
const SECTION_00C40000 = 0x00C40000;
const SECTION_01000000 = 0x01000000;
const SECTION_02000000 = 0x02000000;

const OFFSET_BASE_0 = 0;

const OFFSET_IV_0 = 0;
const OFFSET_IV_100 = 0x100;
const OFFSET_IV_F00 = 0xF00;
const OFFSET_IV_3FF80 = 0x3FF80;

const OFFSET_START_0 = 0;
const OFFSET_START_80 = 0x80;
const OFFSET_START_100 = 0x100;
const OFFSET_START_200 = 0x200;
const OFFSET_START_1000 = 0x1000;

const COPYRIGHT = 'Copyright';

const OFFSET_COPYRIGHT = 0x24;
const OFFSET_COPYRIGHT_024 = OFFSET_IV_0 + OFFSET_COPYRIGHT;
const OFFSET_COPYRIGHT_124 = OFFSET_IV_100 + OFFSET_COPYRIGHT;
const OFFSET_COPYRIGHT_F24 = OFFSET_IV_F00 + OFFSET_COPYRIGHT;

const KEY_SIZE = 0x20;
const BLOCK_SIZE = 0x80;

//      Decompress
const PENTAX_KS = 'PENTAX K-S';
const OFFSET_PENTAX_KS = 0;
const OFFSET_MODEL = PENTAX_KS.length;

const OFFSET_COMPRESSED_SIGN = 0x1F6;

const MAX_FIRMWARE_SIZE = 0x02000000;
const CAMERA_K_S1 = 1;
const CAMERA_K_S2 = 2;

const BLOCK_LENGTH_CAMERA_DEPS = 0xE000;
const BLOCK_LENGTH_K_S1 = 0xC002;
const BLOCK_LENGTH_K_S2 = 0x6000;
const BLOCK_LENGTH_MAX = 0x8000;

const COPY_MASK_INITIAL = 0x8000;
const NBBY = 8;
const LENGTH_BITS = 3;
const OFFSET_BITS = NBBY - LENGTH_BITS;
const LENGTH_MIN = 3;
const OFFSET_MASK = (0xFF << LENGTH_BITS) & 0xFF;
const LENGTH_MASK = (~OFFSET_MASK) & 0xFF;
const LENGTH_EXTENDED = 10;
const BLOCK_START = 0x200;

//      Resources
const OFFSET_RESOURCE = 0x800200;

let logger = null;

class Decipher {
  constructor() {
    this._buffer = null;
    this._isLittleEndian = false;
  }

  //  Common Tools

  readUInt32(offset) {
    return this._isLittleEndian ? this._buffer.readUInt32LE(offset) :
      this._buffer.readUInt32BE(offset);
  }

  writeUInt32(val, offset) {
    //  make sure the val is unsigned
    const v = val >>> 0;
    if (this._isLittleEndian) {
      this._buffer.writeUInt32LE(v, offset);
    } else {
      this._buffer.writeUInt32BE(v, offset);
    }
  }

  xor32(offset, val) {
    this.writeUInt32(this.readUInt32(offset) ^ val, offset);
  }

  strcmp(offset, text) {
    //  convert the string to byte array
    const strbuf = new Uint8Array(new Buffer(text));

    //  whether there is enough data to compare
    if (offset + strbuf.length > this._buffer.length) {
      return false;
    }

    //  compare the byte one by one
    for (let i = 0; i < strbuf.length; ++i) {
      if (this._buffer.readUInt8(offset + i) !== strbuf[i]) {
        return false;
      }
    }
    return true;
  }

  error(message) {
    if (logger !== null) {
      logger.error(message);
    }

    throw new Error(message);
  }

  //  Deobfuscate Functions

  loadIv(offset) {
    return [
      this.readUInt32(offset),
      this.readUInt32(offset + 4),
      this.readUInt32(offset + 8),
      this.readUInt32(offset + 12),
    ];
  }

  calculateKey(iv) {
    const tmp = new Uint32Array(4);

    tmp[0] = iv[0] + ~iv[2];
    tmp[1] = iv[1] + ~iv[3];
    tmp[2] = ~tmp[0];
    tmp[3] = ~tmp[1];

    const key = new Uint32Array(KEY_SIZE);
    for (let i = 0; i < 4; ++i) {
      for (let j = 0; j < 4; ++j) {
        key[i + 8 * j + 0] = tmp[i] + iv[j] - 1;
        key[i + 8 * j + 4] = tmp[i] - iv[j] - 1;
      }
    }

    return key;
  }

  mangleBlocks(offset, length, base, key) {
    //  Make sure the offset/length is BLOCK_SIZE aligned.
    if (offset % BLOCK_SIZE || length % BLOCK_SIZE) {
      this.error('Arguments {offset: 0x' + offset.toString(16) +
        ', length: 0x' + length.toString(16) +
        '} should be aligned to BLOCK_SIZE(0x' +
        BLOCK_SIZE.toString(16) + ') ');
    }

    //  process
    for (let b = 0; b < length / BLOCK_SIZE; ++b) {
      for (let i = 0; i < KEY_SIZE; ++i) {
        this.xor32(
          base + (b * BLOCK_SIZE + offset) + 4 * i,
          key[i] - (b * BLOCK_SIZE + offset)
        );
      }
    }
  }

  deobfuscate(offsetBase, offsetIV, offsetStart, length) {
    const iv = this.loadIv(offsetBase + offsetIV);
    const key = this.calculateKey(iv);
    this.mangleBlocks(offsetStart, length, offsetBase, key);
  }

  //  Decompress Functions

  //  Validate the K-S1/K-S2 firmware
  validateKS() {
    //  check 4-byte alignment
    if (this._buffer.length & 0x3) {
      this.error('Wrong firmware size.');
    }

    //  validate SYSV checksum
    let checksum = 0;
    let offset = 0;
    while (offset < this._buffer.length) {
      checksum += this._buffer.readUInt32LE(offset);
      offset += 4;
    }
    checksum &= 0xFFFFFFFF;
    if (checksum !== 0) {
      this.error('Firmware checksum failed. (' + checksum.toString(16) +
        ')');
    }

    //  check compressed signiture
    if (this._buffer.readUInt16BE(OFFSET_COMPRESSED_SIGN) === 0) {
      this.error('Firmware compression check failed.');
    }
  }

  getBlockLength(offset, model) {
    let blockLength = this._buffer.readUInt16BE(offset);

    if (blockLength === 0) {
      //  End of Stream
      return blockLength;
    }

    if (blockLength === BLOCK_LENGTH_CAMERA_DEPS) {
      //  camera model dependent case
      if (model === CAMERA_K_S1) {
        blockLength = BLOCK_LENGTH_K_S1;
      } else {
        blockLength = BLOCK_LENGTH_K_S2;
      }
    } else if (blockLength > BLOCK_LENGTH_MAX) {
      this.error('Incorrect Block Size.');
    }

    const blockEnd = offset + blockLength + 2 + 2 + 2;
    if (blockEnd > this._buffer.length) {
      this.error('The input block is not completed.');
    }

    return blockLength;
  }

  copy(dest, pDestStart, src, pSrcStart, length) {
    if (dest.start + length > dest.length) {
      this.error('Dest buffer is not large enough for copying.');
    }

    for (let i = 0; i < length; ++i) {
      dest[pDestStart + i] = src[pSrcStart + i];
    }
  }

  decompressBlock(dest, pDestStart, src, pSrcStart, blockLength) {
    let pSrc = pSrcStart;
    let pDest = pDestStart;

    let copymask = 0;
    let copymap = 0;

    while (pSrc < pSrcStart + blockLength - 2) {
      if (copymask === 0) {
        copymap = src.readUInt16BE(pSrc);
        pSrc += 2;
        copymask = COPY_MASK_INITIAL;

        if (logger !== null) {
          logger.debug('  map: 0x' + copymap.toString(16));
        }
      } else {
        if ((copymap & copymask) !== 0) {
          //  This is a COPY
          const s0 = src[pSrc];
          const s1 = src[pSrc + 1];
          pSrc += 2;

          let length = (s0 & LENGTH_MASK) + LENGTH_MIN;
          //  extended the length field
          if (length === LENGTH_EXTENDED) {
            do {
              length += src[pSrc];
            } while (src[pSrc++] === 0xFF);
          }

          const offset = ((s0 & OFFSET_MASK) << OFFSET_BITS) | s1;
          if (offset === 0) {
            this.error('The offset is Zero.');
          }

          if (logger !== null) {
            logger.debug('  mask: 0x' + copymask.toString(16) +
              ', length: 0x' + length.toString(16) +
              ', offset: 0x' + offset.toString(16) +
              ', I: 0x' + pSrc.toString(16) +
              ', O: 0x' + pDest.toString(16)
            );
          }

          this.copy(dest, pDest, dest, pDest - offset, length);
          pDest += length;
        } else {
          //  This is a LITERAL
          dest[pDest++] = src[pSrc++];
        }
        //  shift mask to next
        copymask >>>= 1;
      }
    }

    //  Trailer
    if (src.readUInt16BE(pSrc) !== 0) {
      this.error('Missing block end.\n');
    }

    return pDest;
  }

  decompress(offset, model) {
    const out = new Buffer(MAX_FIRMWARE_SIZE);
    let pOut = 0;
    let pIn = offset;

    /* eslint-disable no-constant-condition */
    while (true) {
      if (pOut > out.length) {
        this.error('Not enough output buffer.');
      }

      const blockLength = this.getBlockLength(pIn, model);
      pIn += 2;

      if (logger !== null) {
        logger.debug('block: 0x' + (pIn - 2).toString(16) +
          ', length: 0x' + blockLength.toString(16));
      }

      if (blockLength === 0) {
        //  EOF
        break;
      } else if (model === CAMERA_K_S1 &&
        blockLength === BLOCK_LENGTH_K_S1) {
        //  for some reason the last 2 bytes ignored
        this.copy(out, pOut, this._buffer, pIn, blockLength - 2);
        pIn += blockLength;
        pOut += blockLength - 2;
      } else if (model === CAMERA_K_S2 &&
        blockLength === BLOCK_LENGTH_K_S2) {
        this.copy(out, pOut, this._buffer, pIn, blockLength);
        pOut += blockLength;
        pIn += blockLength;
      } else {
        //  decompress the block
        pOut = this.decompressBlock(out, pOut, this._buffer, pIn,
          blockLength
        );
        pIn += blockLength;
      }
    }

    return out.slice(0, pOut);
  }

  //  Resources Extraction
  //    Get Resource list
  getResourceList() {
    if (!this.strcmp(OFFSET_PENTAX_KS, PENTAX_KS) || this._buffer.length < OFFSET_RESOURCE + 4) {
      throw new Error('Unknown file format for extracting resources.');
    }

    const res = [];
    const resCount = this._buffer.readUInt32LE(OFFSET_RESOURCE);
    for (let i = 0; i < resCount; ++i) {
      const pos = OFFSET_RESOURCE + 32 * i + 16;
      const resInfo = {
        name: this._buffer.slice(pos, pos + 24).toString('utf8').replace(/\0/g, ''),
        offset: this._buffer.readUInt32LE(pos + 24),
        length: this._buffer.readUInt32LE(pos + 24 + 4),
      };
      res.push(resInfo);
    }
    return res;
  }

  //    Extrace the resources
  extractResource(resInfo, resDir) {
    const filename = path.join(resDir, resInfo.name.replace(/:/g, '').replace(/\\/g, path.sep));
    if (logger !== null) {
      logger.debug('old: "' + resInfo.name + '", new: "' + filename + '"');
    }
    const dir = path.dirname(filename);
    mkdirp(dir, err => {
      if (err) throw err;
      const offsetStart = OFFSET_RESOURCE + resInfo.offset;
      const offsetEnd = offsetStart + resInfo.length;
      fs.writeFile(filename, this._buffer.slice(offsetStart, offsetEnd), error => {
        if (error) throw error;
      });
    });
  }

  extractResources(res, resDir) {
    res.map(r => {
      this.extractResource(r, resDir);
    });
  }

  //  Entrance
  decode() {
    const inSize = this._buffer.length;

    if (this.strcmp(OFFSET_COPYRIGHT_024, COPYRIGHT)) {
      this._isLittleEndian = false;

      if (logger !== null) {
        logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
          OFFSET_COPYRIGHT_024.toString(16) + ', [Big-Endian]');
      }

      this.deobfuscate(
        OFFSET_BASE_0,
        OFFSET_IV_0,
        OFFSET_START_100,
        SECTION_00A00000 - OFFSET_START_100);
      this.deobfuscate(
        SECTION_00A00000,
        OFFSET_IV_0,
        OFFSET_START_100,
        SECTION_00080000 - OFFSET_START_100);
    } else if (this.strcmp(OFFSET_COPYRIGHT_F24, COPYRIGHT) &&
      (inSize === SECTION_00C00000 || inSize === SECTION_00C40000)) {
      this._isLittleEndian = false;

      if (logger !== null) {
        logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
          OFFSET_COPYRIGHT_F24.toString(16) + ', [Big-Endian]');
      }

      this.deobfuscate(
        OFFSET_BASE_0,
        OFFSET_IV_F00,
        OFFSET_START_0,
        OFFSET_IV_F00);
      this.deobfuscate(
        OFFSET_BASE_0,
        OFFSET_IV_F00,
        OFFSET_START_1000,
        SECTION_00C00000 - OFFSET_START_1000);

      if (inSize >= SECTION_00C00000 + OFFSET_IV_3FF80) {
        this.deobfuscate(
          SECTION_00C00000,
          OFFSET_IV_3FF80,
          OFFSET_START_0,
          OFFSET_IV_3FF80);
      }
    } else if (this.strcmp(OFFSET_COPYRIGHT_124, COPYRIGHT)) {
      this._isLittleEndian = true;

      if (logger !== null) {
        logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
          OFFSET_COPYRIGHT_124.toString(16) + ', [Little-Endian]'
        );
      }

      this.deobfuscate(
        OFFSET_BASE_0,
        OFFSET_IV_100,
        OFFSET_START_0,
        OFFSET_IV_100);

      let partSize = 0;
      if ((inSize > SECTION_02000000 + 20) &&
        this.strcmp(SECTION_02000000 + 10, COPYRIGHT)) {
        partSize = SECTION_02000000;
      } else {
        partSize = SECTION_01000000;
      }

      this.deobfuscate(
        OFFSET_BASE_0,
        OFFSET_IV_100,
        OFFSET_START_200,
        partSize - OFFSET_START_200);

      this.deobfuscate(
        partSize,
        OFFSET_IV_0,
        OFFSET_START_80,
        inSize - partSize - OFFSET_START_80);
    } else if (this.strcmp(OFFSET_PENTAX_KS, PENTAX_KS)) {
      const model = this._buffer.readUInt8(OFFSET_MODEL) - '0'.charCodeAt(0);

      if (logger !== null) {
        logger.info('Found firmware of ' + PENTAX_KS + model);
      }

      this.validateKS();
      return this.decompress(BLOCK_START, model);
    } else {
      this.error('Unknown firmware format.');
    }

    return this._buffer;
  }

  setInput(data) {
    this._buffer = data;
  }

  setLogger(target) {
    logger = target;
  }
}

module.exports = new Decipher();
