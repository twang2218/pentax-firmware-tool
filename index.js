var holder = document.getElementById('holder'),
    state = document.getElementById('apistatus'),
    buffer = null,
    dataview = null,
    filename = 'decrypt.bin',
    littleEndian = false;

if (navigator.userAgent.toLowerCase().indexOf('chrome') > -1)
    document.getElementById("browser-warning").style.display = 'none';



if (typeof window.FileReader === 'undefined') {
    state.className = 'fail';
} else {
    state.className = 'success';
    state.innerHTML = 'File API & FileReader available';
}

holder.ondragover = function() {
    this.className = 'hover';
    return false;
};
holder.ondragend = function() {
    this.className = '';
    return false;
};
holder.ondrop = function(e) {
    this.className = '';
    e.preventDefault();

    var file = e.dataTransfer.files[0],
        fReader = new FileReader();
    filename = "decrypted-" + file.name;
    fReader.readAsArrayBuffer(file);
    fReader.onload = function(evt) {
        buffer = evt.target.result;
        decrypt();
    };
};

function decrypt() {

    dataview = new DataView(buffer);
    var in_size = buffer.byteLength;

    if (getStringFromAB(buffer, 0x24, 9) == "Copyright")
    {
        littleEndian = false;
        deobfuscate(0, 0, 0x100, 0x0a00000 - 0x100);
        deobfuscate(0x0a00000, 0, 0x100, 0x80000 - 0x100);
    }
    else if (getStringFromAB(buffer, 0xf24, 9) == "Copyright")
    {
        littleEndian = false;
        deobfuscate(0, 0xf00, 0, 0xf00);
        deobfuscate(0, 0xf00, 0x1000, 0xc00000 - 0x1000);
        deobfuscate(0xc00000, 0x3ff80, 0, 0x3ff80);
    }
    else if (getStringFromAB(buffer, 0x124, 9) == "Copyright")
    {
        littleEndian = true;
        deobfuscate(0, 0x100, 0, 0x100);
        deobfuscate(0, 0x100, 0x200, 0x1000000 - 0x200);
        deobfuscate(0x1000000, 0, 0x80, in_size - 0x1000000 - 0x80);
    }
    else
    {
        state.className = 'fail';
        state.innerHTML = 'Unknown input file.';
        return;
    }

    var blob = new Blob([dataview]);
    saveAs(blob, filename, "application/octet-stream");

}

function getStringFromAB(buffer, start, length)
{
    return String.fromCharCode.apply(null, new Uint8Array(buffer, start, length));
}

function deobfuscate(off_base, off_iv, off_start, length)
{
    var iv = load_iv(off_base + off_iv);
    var key = calculate_key(iv);
    if (mangle_blocks(off_start, length, off_base, key) != 0) {
        state.className = 'fail';
        state.innerHTML = 'Function mangle_blocks failed.';
    }

}

function mangle_blocks(offset, length, base, fullkey)
{
    var blocks;

    if (offset % 0x80)
        return -1;

    if (length % 0x80)
        return -1;

    blocks = length / 0x80;

    while (blocks--) {
        for (var i = 0; i < 0x20; ++i)
            xor32(base + offset + 4*i, fullkey[i] - offset);
        offset += 0x80;
    }
    return 0;

}

function xor32(offset, val) {
    write32(offset, read32(offset) ^ val);
}

function write32(offset, val) {
    if (littleEndian)
    {
        dataview.setUint8(offset + 3, val >> 24);
        dataview.setUint8(offset + 2, val >> 16);
        dataview.setUint8(offset + 1, val >> 8);
        dataview.setUint8(offset + 0, val);
    }
    else {
        dataview.setUint8(offset + 0, val >> 24);
        dataview.setUint8(offset + 1, val >> 16);
        dataview.setUint8(offset + 2, val >> 8);
        dataview.setUint8(offset + 3, val);
    }
}

function load_iv(offset)
{
    var iv = new Uint32Array(4);
    iv[0] = read32(offset);
    iv[1] = read32(offset + 4);
    iv[2] = read32(offset + 8);
    iv[3] = read32(offset + 12);
    return iv;
}

function read32(offset) {
    var data = new Uint8Array(buffer, offset, 4);
    var result = 0;

    if (littleEndian) {
        result |= data[3] << 24;
        result |= data[2] << 16;
        result |= data[1] << 8;
        result |= data[0];
    }
    else {
        result |= data[0] << 24;
        result |= data[1] << 16;
        result |= data[2] << 8;
        result |= data[3];
    }

    return result;
}

function calculate_key(iv)
{
    var key = new Uint32Array(32);
    var tmp = new Uint32Array(4);
    tmp[0] = iv[0] + ~iv[2];
    tmp[1] = iv[1] + ~iv[3];
    tmp[2] = ~tmp[0];
    tmp[3] = ~tmp[1];
    for (var i=0; i < 4; ++i) {
        for (var j=0; j<4; ++j) {
            key[i + 8*j + 0] = tmp[i] + iv[j] - 1;
            key[i + 8*j + 4] = tmp[i] - iv[j] - 1;
        }
    }

    return key;
}
