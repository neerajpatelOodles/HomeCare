/**
 * File storage adapter. Phase 2 ships the "local" driver (private folder on the
 * server). The interface is deliberately tiny (save / open / remove) so an S3
 * driver can be added later without touching any module code:
 *
 *   save(buffer, ext)  -> storageKey
 *   open(storageKey)   -> readable stream
 *   remove(storageKey) -> void
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const KEY_PATTERN = /^[a-f0-9-]{36}\.[a-z0-9]{2,5}$/;

function localDriver() {
  const root = path.resolve(env.storage.uploadDir);

  const resolveKey = (key) => {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return path.join(root, key);
  };

  return {
    async save(buffer, ext) {
      await fsp.mkdir(root, { recursive: true, mode: 0o700 });
      const key = `${crypto.randomUUID()}${ext}`;
      await fsp.writeFile(resolveKey(key), buffer, { flag: 'wx', mode: 0o600 });
      return key;
    },
    open(key) {
      return fs.createReadStream(resolveKey(key));
    },
    async remove(key) {
      await fsp.rm(resolveKey(key), { force: true });
    },
  };
}

if (env.storage.driver !== 'local') {
  throw new Error(`Unsupported STORAGE_DRIVER "${env.storage.driver}" (only "local" is implemented)`);
}

module.exports = localDriver();
