'use strict';

//  Constants
const COPYRIGHT = 'Copyright';

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

const OFFSET_COPYRIGHT = 0x24;
const OFFSET_COPYRIGHT_1 = OFFSET_IV_0 + OFFSET_COPYRIGHT;
const OFFSET_COPYRIGHT_2 = OFFSET_IV_100 + OFFSET_COPYRIGHT;
const OFFSET_COPYRIGHT_3 = OFFSET_IV_F00 + OFFSET_COPYRIGHT;

const KEY_SIZE = 0x20;
const BLOCK_SIZE = 0x80;

class Decipher {
    constructor() {
        this._buffer = null;
        this._isLittleEndian = false;
    }

    readUInt8(offset) {
        return this._buffer.readUInt8(offset);
    }

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
        let strbuf = new Uint8Array(new Buffer(text));

        if (offset + strbuf.length > this._buffer.length) {
            return false;
        }

        let isEqual = true;
        strbuf.map((b, i) => {
            if (this.readUInt8(offset + i) !== b) {
                isEqual = false;
            }
        });
        return isEqual;
    }

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
            throw new Error(
                'Arguments {offset: ' + offset.toString(16) +
                ', length: ' + length.toString(16) +
                '} should be aligned to BLOCK_SIZE(' + BLOCK_SIZE.toString(
                    16) + ') ');
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

    decode(input) {
        this._buffer = input;

        let inSize = this._buffer.length;

        if (this.strcmp(OFFSET_COPYRIGHT_1, COPYRIGHT)) {
            this._isLittleEndian = false;

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
        } else if (this.strcmp(OFFSET_COPYRIGHT_3, COPYRIGHT)) {
            this._isLittleEndian = false;

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
        } else if (this.strcmp(OFFSET_COPYRIGHT_2, COPYRIGHT)) {
            this._isLittleEndian = true;

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
        } else {
            throw new Error('Unknown firmware format.');
        }

        return this._buffer;
    }
}

module.exports = new Decipher();
