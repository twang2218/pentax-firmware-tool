'use strict';

var logger = null;

//  Constants

//      Deobfuscate
const SECTION_0x00080000 = 0x00080000;
const SECTION_0x00A00000 = 0x00A00000;
const SECTION_0x00C00000 = 0x00C00000;
const SECTION_0x00C40000 = 0x00C40000;
const SECTION_0x01000000 = 0x01000000;
const SECTION_0x02000000 = 0x02000000;

const OFFSET_BASE_0 = 0;

const OFFSET_IV_0 = 0;
const OFFSET_IV_100 = 0x100
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
        val = val >>> 0;
        if (this._isLittleEndian) {
            this._buffer.writeUInt32LE(val, offset);
        } else {
            this._buffer.writeUInt32BE(val, offset);
        }
    }

    xor32(offset, val) {
        this.writeUInt32(this.readUInt32(offset) ^ val, offset);
    }

    strcmp(offset, text) {
        //  convert the string to byte array
        let strbuf = new Uint8Array(new Buffer(text));

        //  whether there is enough data to compare
        if (offset + strbuf.length > this._buffer.length) {
            return false;
        }

        //  compare the byte one by one
        for (let i = 0; i < strbuf.length; ++i) {
            if (this._buffer.readUInt8(offset + i) != strbuf[i]) {
                return false;
            }
        }
        return true;
    }

    error(message) {
        if (logger != null) {
            logger.error(message);
        };

        throw new Error(message);
    }

    //  Deobfuscate Functions

    loadIv(offset) {
        return [
            this.readUInt32(offset),
            this.readUInt32(offset + 4),
            this.readUInt32(offset + 8),
            this.readUInt32(offset + 12)
        ];
    }

    calculateKey(iv) {
        let tmp = new Uint32Array(4);

        tmp[0] = iv[0] + ~iv[2];
        tmp[1] = iv[1] + ~iv[3];
        tmp[2] = ~tmp[0];
        tmp[3] = ~tmp[1];

        let key = new Uint32Array(KEY_SIZE);
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
            error('Arguments {offset: 0x' + offset.toString(16) +
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
        let iv = this.loadIv(offsetBase + offsetIV);
        let key = this.calculateKey(iv);
        this.mangleBlocks(offsetStart, length, offsetBase, key);
    }

    //  Decompress Functions

    //  Validate the K-S1/K-S2 firmware
    validateKS() {
        //  check 4-byte alignment
        if (this._buffer.length & 0x3) {
            error('Wrong firmware size.');
        }

        //  validate SYSV checksum
        let checksum = 0,
            offset = 0;
        while (offset < this._buffer.length) {
            checksum += this._buffer.readUInt32LE(offset);
            offset += 4;
        }
        checksum &= 0xFFFFFFFF;
        if (checksum != 0) {
            error('Firmware checksum failed. (' + checksum.toString(16) +
                ')');
        }

        //  check compressed signiture
        if (this._buffer.readUInt16BE(OFFSET_COMPRESSED_SIGN) == 0) {
            error('Firmware compression check failed.');
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
            error('Incorrect Block Size.');
        }

        let blockEnd = offset + blockLength + 2 + 2 + 2;
        if (blockEnd > this._buffer.length) {
            error('The input block is not completed.');
        }

        return blockLength;
    }

    copy(dest, pDestStart, src, pSrcStart, length) {
        if (dest.start + length > dest.length) {
            error('Dest buffer is not large enough for copying.');
        }

        for (let i = 0; i < length; ++i) {
            dest[pDestStart + i] = src[pSrcStart + i];
        }
    }

    decompressBlock(dest, pDestStart, src, pSrcStart, blockLength) {
        let pSrc = pSrcStart;
        let pDest = pDestStart;

        let copymask = 0,
            copymap = 0;

        while (pSrc < pSrcStart + blockLength - 2) {
            if (copymask === 0) {
                copymap = src.readUInt16BE(pSrc);
                pSrc += 2;
                copymask = COPY_MASK_INITIAL;

                if (logger !== null)
                    logger.debug('  map: 0x' + copymap.toString(16));
            } else {

                if ((copymap & copymask) != 0) {
                    //  This is a COPY
                    let s0 = src[pSrc],
                        s1 = src[pSrc + 1];
                    pSrc += 2;

                    let length = (s0 & LENGTH_MASK) + LENGTH_MIN;
                    //  extended the length field
                    if (length === LENGTH_EXTENDED) {
                        do {
                            length += src[pSrc];
                        } while (src[pSrc++] === 0xFF);
                    }

                    let offset = ((s0 & OFFSET_MASK) << OFFSET_BITS) | s1;
                    if (offset === 0) {
                        error('The offset is Zero.');
                    }

                    if (logger !== null)
                        logger.debug('  mask: 0x' + copymask.toString(16) +
                            ', length: 0x' + length.toString(16) +
                            ', offset: 0x' + offset.toString(16) +
                            ', I: 0x' + pSrc.toString(16) +
                            ', O: 0x' + pDest.toString(16)
                        );

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
        if (src.readUInt16BE(pSrc) != 0) {
            error('Missing block end.\n');
        }

        return pDest;
    }

    decompress(offset, model) {
        let out = new Buffer(MAX_FIRMWARE_SIZE);
        let pOut = 0;
        let pIn = offset;

        while (true) {
            if (pOut > out.length) {
                error('Not enough output buffer.');
            }

            let blockLength = this.getBlockLength(pIn, model);
            pIn += 2;

            if (logger !== null)
                logger.debug('block: 0x' + (pIn - 2).toString(16) +
                    ', length: 0x' + blockLength.toString(16));

            if (blockLength == 0) {
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

    //  Entrance

    decode(input) {
        this._buffer = input;

        let inSize = this._buffer.length;

        if (this.strcmp(OFFSET_COPYRIGHT_024, COPYRIGHT)) {
            this._isLittleEndian = false;

            if (logger !== null)
                logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
                    OFFSET_COPYRIGHT_024.toString(16) + ', [Big-Endian]');

            this.deobfuscate(
                OFFSET_BASE_0,
                OFFSET_IV_0,
                OFFSET_START_100,
                SECTION_0x00A00000 - OFFSET_START_100);
            this.deobfuscate(
                SECTION_0x00A00000,
                OFFSET_IV_0,
                OFFSET_START_100,
                SECTION_0x00080000 - OFFSET_START_100);
        } else if (this.strcmp(OFFSET_COPYRIGHT_F24, COPYRIGHT)) {
            this._isLittleEndian = false;

            if (logger !== null)
                logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
                    OFFSET_COPYRIGHT_F24.toString(16) + ', [Big-Endian]');

            this.deobfuscate(
                OFFSET_BASE_0,
                OFFSET_IV_F00,
                OFFSET_START_0,
                OFFSET_IV_F00);
            this.deobfuscate(
                OFFSET_BASE_0,
                OFFSET_IV_F00,
                OFFSET_START_1000,
                SECTION_0x00C00000 - OFFSET_START_1000);

            if (inSize >= SECTION_0x00C00000 + OFFSET_IV_3FF80) {
                this.deobfuscate(
                    SECTION_0x00C00000,
                    OFFSET_IV_3FF80,
                    OFFSET_START_0,
                    OFFSET_IV_3FF80);
            }
        } else if (this.strcmp(OFFSET_COPYRIGHT_124, COPYRIGHT)) {
            this._isLittleEndian = true;

            if (logger !== null)
                logger.debug('Found "' + COPYRIGHT + '" @ 0x' +
                    OFFSET_COPYRIGHT_124.toString(16) + ', [Little-Endian]'
                );

            this.deobfuscate(
                OFFSET_BASE_0,
                OFFSET_IV_100,
                OFFSET_START_0,
                OFFSET_IV_100);

            let partSize = 0;
            if ((inSize > SECTION_0x02000000 + 20) &&
                this.strcmp(SECTION_0x02000000 + 10, COPYRIGHT)) {
                partSize = SECTION_0x02000000;
            } else {
                partSize = SECTION_0x01000000;
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
            let model = this._buffer.readUInt8(OFFSET_MODEL) -
                '0'.charCodeAt(0);
            if (logger !== null)
                logger.info('Found firmware of ' + PENTAX_KS + model);
            this.validateKS();
            return this.decompress(BLOCK_START, model);
        } else {
            error('Unknown firmware format.');
        }

        return this._buffer;
    }

    setLogger(target) {
        logger = target;
    }
}

module.exports = new Decipher();
