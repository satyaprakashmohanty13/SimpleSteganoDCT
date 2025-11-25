
// Steganography implementation
class SimpleStegano {
    constructor(config = {}) {
        this.config = Object.assign({
            blockSize: 8,
            syncMarker: "10101010",
            redundancy: 4,
            rsErrorCorrection: 20,
            coeffPositions: [[2, 2], [2, 3], [3, 2], [3, 3]],
            alpha: 1.5
        }, config);

        this.rsEncoder = new ReedSolomonEncoder(GenericGF.DATA_MATRIX_FIELD_256());
        this.rsDecoder = new ReedSolomonDecoder(GenericGF.DATA_MATRIX_FIELD_256());
    }

    // DCT and IDCT implementations
    dct(matrix) {
        const size = matrix.length;
        const result = Array.from({ length: size }, () => Array(size).fill(0));

        for (let u = 0; u < size; u++) {
            for (let v = 0; v < size; v++) {
                let sum = 0;
                for (let i = 0; i < size; i++) {
                    for (let j = 0; j < size; j++) {
                        sum += matrix[i][j] * Math.cos(((2 * i + 1) * u * Math.PI) / (2 * size)) * Math.cos(((2 * j + 1) * v * Math.PI) / (2 * size));
                    }
                }
                const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
                const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
                result[u][v] = (2 / size) * cu * cv * sum;
            }
        }
        return result;
    }

    idct(matrix) {
        const size = matrix.length;
        const result = Array.from({ length: size }, () => Array(size).fill(0));

        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                let sum = 0;
                for (let u = 0; u < size; u++) {
                    for (let v = 0; v < size; v++) {
                        const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
                        const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
                        sum += cu * cv * matrix[u][v] * Math.cos(((2 * i + 1) * u * Math.PI) / (2 * size)) * Math.cos(((2 * j + 1) * v * Math.PI) / (2 * size));
                    }
                }
                result[i][j] = (2 / size) * sum;
            }
        }
        return result;
    }

    embed(image, text) {
        const { blockSize, syncMarker, rsErrorCorrection } = this.config;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const yChannel = this._getYChannel(imageData.data, image.width, image.height);

        // 1) Prepare the actual message with sync marker
        const messageWithMarker = this._stringToBytes(syncMarker + text);
        const encoded1 = new Uint8Array(messageWithMarker.length + rsErrorCorrection);
        encoded1.set(messageWithMarker);
        this.rsEncoder.encode(encoded1, rsErrorCorrection);

        // 2) Prepare length bytes (4 bytes big-endian) and encode with RS
        const lengthBytes = this._intToBytes(encoded1.length);
        const encoded2 = new Uint8Array(lengthBytes.length + rsErrorCorrection);
        encoded2.set(lengthBytes);
        this.rsEncoder.encode(encoded2, rsErrorCorrection);

        // final payload to embed
        const finalPayload = new Uint8Array(encoded2.length + encoded1.length);
        finalPayload.set(encoded2);
        finalPayload.set(encoded1, encoded2.length);
        const stegoYChannel = this._embedInDct(yChannel, finalPayload);

        // Reconstruct the image
        const stegoImageData = this._reconstructImageData(imageData, stegoYChannel);
        ctx.putImageData(stegoImageData, 0, 0);
        return canvas.toDataURL();
    }

    extract(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const yChannel = this._getYChannel(imageData.data, image.width, image.height);

        // Extract the length of the message
        const { rsErrorCorrection } = this.config;
        const encoded2SizeInBits = this.getRsEncodedLength() * 8;
        const extractedBitsForEncoded2 = this._extractFromDct(yChannel, encoded2SizeInBits);
        const encoded2Bytes = this._bitsToBytes(extractedBitsForEncoded2);
        this.rsDecoder.decode(encoded2Bytes, rsErrorCorrection);
        const encoded1Length = this._bytesToInt(encoded2Bytes.slice(0, 4));

        // Extract the message itself
        const encoded1SizeInBits = encoded1Length * 8;
        const extractedBitsForEncoded1 = this._extractFromDct(yChannel, encoded2SizeInBits + encoded1SizeInBits).substring(encoded2SizeInBits);
        const encoded1Bytes = this._bitsToBytes(extractedBitsForEncoded1);
        this.rsDecoder.decode(encoded1Bytes, rsErrorCorrection);
        const message = this._bytesToString(encoded1Bytes);

        // Validate sync marker
        if (message.startsWith(this.config.syncMarker)) {
            return message.substring(this.config.syncMarker.length);
        } else {
            throw new Error("Sync marker not found. Extraction failed.");
        }
    }

    _getYChannel(data, width, height) {
        const yChannel = new Array(height).fill(0).map(() => new Array(width).fill(0));
        this.crChannel = new Array(height).fill(0).map(() => new Array(width).fill(0));
        this.cbChannel = new Array(height).fill(0).map(() => new Array(width).fill(0));

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
            const row = Math.floor((i / 4) / width);
            const col = (i / 4) % width;
            yChannel[row][col] = y;
            this.cbChannel[row][col] = cb;
            this.crChannel[row][col] = cr;
        }
        return yChannel;
    }

    _reconstructImageData(imageData, yChannel) {
        const { data, width, height } = imageData;
        for (let i = 0; i < data.length; i += 4) {
            const row = Math.floor((i / 4) / width);
            const col = (i / 4) % width;
            const y = yChannel[row][col];
            const cb = this.cbChannel[row][col];
            const cr = this.crChannel[row][col];

            const r = y + 1.402 * (cr - 128);
            const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
            const b = y + 1.772 * (cb - 128);

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
        return imageData;
    }

    _embedInDct(yChannel, message) {
        const { blockSize, coeffPositions, alpha } = this.config;
        const messageBits = Array.from(message).map(byte => byte.toString(2).padStart(8, '0')).join('');
        let messageIndex = 0;

        for (let i = 0; i < yChannel.length; i += blockSize) {
            for (let j = 0; j < yChannel[0].length; j += blockSize) {
                if (messageIndex >= messageBits.length) break;

                const block = yChannel.slice(i, i + blockSize).map(row => row.slice(j, j + blockSize));
                if (block.length === blockSize && block[0].length === blockSize) {
                    const dctBlock = this.dct(block);

                    for (const pos of coeffPositions) {
                        if (messageIndex < messageBits.length) {
                            const bit = parseInt(messageBits[messageIndex], 10);
                            this._embedBitInCoefficient(dctBlock, pos, bit);
                            messageIndex++;
                        }
                    }

                    const modifiedBlock = this.idct(dctBlock);
                    for (let row = 0; row < blockSize; row++) {
                        for (let col = 0; col < blockSize; col++) {
                            yChannel[i + row][j + col] = Math.max(0, Math.min(255, modifiedBlock[row][col]));
                        }
                    }
                }
            }
        }
        return yChannel;
    }

    _extractFromDct(yChannel, totalBits) {
        const { blockSize, coeffPositions } = this.config;
        let extractedBits = '';

        for (let i = 0; i < yChannel.length; i += blockSize) {
            for (let j = 0; j < yChannel[0].length; j += blockSize) {
                if (extractedBits.length >= totalBits) break;

                const block = yChannel.slice(i, i + blockSize).map(row => row.slice(j, j + blockSize));
                if (block.length === blockSize && block[0].length === blockSize) {
                    const dctBlock = this.dct(block);

                    for (const pos of coeffPositions) {
                        if (extractedBits.length < totalBits) {
                            extractedBits += this._extractBitFromCoefficient(dctBlock, pos);
                        }
                    }
                }
            }
        }
        return extractedBits;
    }

    _embedBitInCoefficient(dctBlock, position, bit) {
        const { alpha } = this.config;
        const [i, j] = position;
        const c = dctBlock[i][j];
        const qstep = alpha * LUMINANCE_QUANT_MATRIX_70[i][j];
        let k = Math.round(c / qstep);

        if (bit === 1) {
            if (k % 2 === 0) k++;
        } else {
            if (k % 2 !== 0) k++;
        }

        dctBlock[i][j] = k * qstep;
    }

    _extractBitFromCoefficient(dctBlock, position) {
        const { alpha } = this.config;
        const [i, j] = position;
        const c = dctBlock[i][j];
        const qstep = alpha * LUMINANCE_QUANT_MATRIX_70[i][j];
        const k = Math.round(c / qstep);
        return k % 2 === 1 ? 1 : 0;
    }

    getRsEncodedLength() {
        return 4 + this.config.rsErrorCorrection;
    }

    _stringToBytes(str) {
        return new TextEncoder().encode(str);
    }

    _bytesToString(bytes) {
        return new TextDecoder().decode(bytes);
    }

    _intToBytes(num) {
        const bytes = new Uint8Array(4);
        bytes[0] = (num >> 24) & 0xff;
        bytes[1] = (num >> 16) & 0xff;
        bytes[2] = (num >> 8) & 0xff;
        bytes[3] = num & 0xff;
        return bytes;
    }

    _bytesToInt(bytes) {
        return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    }

    _bitsToBytes(bits) {
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
            bytes.push(parseInt(bits.substring(i, i + 8), 2));
        }
        return new Uint8Array(bytes);
    }
}

const LUMINANCE_QUANT_MATRIX_70 = [
    [10, 7, 6, 10, 14, 24, 31, 37],
    [7, 7, 8, 11, 16, 35, 36, 33],
    [8, 8, 10, 14, 24, 34, 41, 34],
    [8, 10, 13, 17, 31, 52, 48, 37],
    [11, 13, 22, 34, 41, 65, 62, 46],
    [14, 21, 33, 38, 49, 62, 68, 55],
    [29, 38, 47, 52, 62, 73, 72, 61],
    [43, 55, 57, 59, 67, 60, 62, 59]
];
