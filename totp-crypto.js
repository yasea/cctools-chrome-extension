/**
 * TOTP 保险箱：PBKDF2 派生密钥 + AES-GCM 加密（Web Crypto）。
 */
(function (global) {
  const PBKDF2_ITER = 150000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const AES_BITS = 256;

  function hasChromeStorageArea(area) {
    return (
      typeof chrome !== 'undefined' &&
      chrome &&
      chrome.storage &&
      area &&
      typeof area.get === 'function' &&
      typeof area.set === 'function' &&
      typeof area.remove === 'function'
    );
  }

  function localGet(keys) {
    const out = {};
    const arr = Array.isArray(keys) ? keys : Object.keys(keys || {});
    for (const k of arr) {
      const v = localStorage.getItem(String(k));
      if (v != null) out[k] = v;
    }
    return out;
  }

  function localSet(obj) {
    Object.entries(obj || {}).forEach(([k, v]) =>
      localStorage.setItem(String(k), String(v ?? ''))
    );
  }

  function localRemove(keys) {
    (Array.isArray(keys) ? keys : [keys]).forEach((k) =>
      localStorage.removeItem(String(k))
    );
  }

  function bufToB64(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function b64ToBuf(s) {
    const bin = atob(String(s));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function randomBytes(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }

  async function deriveKeyFromPassword(password, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(String(password)),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITER,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: AES_BITS },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptWithKey(cryptoKey, plaintextUtf8) {
    const iv = randomBytes(IV_BYTES);
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      enc.encode(plaintextUtf8)
    );
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  }

  async function decryptWithKey(cryptoKey, ivB64, ctB64) {
    const iv = b64ToBuf(ivB64);
    const ct = b64ToBuf(ctB64);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct);
    return new TextDecoder().decode(pt);
  }

  /**
   * @param {object} vault { salt, iv, ct } (base64)
   * @param {string} password
   * @returns {Promise<{ plaintext: string, cryptoKey: CryptoKey }>}
   */
  async function decryptVaultWithPassword(vault, password) {
    const salt = b64ToBuf(vault.salt);
    const key = await deriveKeyFromPassword(password, salt);
    const plaintext = await decryptWithKey(key, vault.iv, vault.ct);
    return { plaintext, cryptoKey: key };
  }

  async function exportRawKeyB64(cryptoKey) {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey);
    return bufToB64(new Uint8Array(raw));
  }

  async function importRawKeyB64(b64) {
    const raw = b64ToBuf(b64);
    return crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM', length: AES_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }

  const SESSION_KEY = 'totpSessionKeyRawB64';
  /** 本地免密解锁（与保险箱 vault 分开存储） */
  const PERSIST_UNLOCK_KEY = 'totpUnlockKeyB64';
  const PERSIST_UNLOCK_EXP = 'totpUnlockExpiresAt';
  const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000;

  function sessionArea() {
    if (
      typeof chrome !== 'undefined' &&
      chrome &&
      chrome.storage &&
      chrome.storage.session &&
      hasChromeStorageArea(chrome.storage.session)
    ) {
      return chrome.storage.session;
    }
    // file:// 预览兜底：用内存 session（不持久化、刷新即失效）
    const mem = (global.__cctoolsTotpSessionMem = global.__cctoolsTotpSessionMem || {});
    return {
      async get(key) {
        if (Array.isArray(key)) {
          const out = {};
          key.forEach((k) => (out[k] = mem[k]));
          return out;
        }
        if (typeof key === 'string') return { [key]: mem[key] };
        const out = {};
        Object.keys(key || {}).forEach((k) => (out[k] = mem[k]));
        return out;
      },
      async set(obj) {
        Object.assign(mem, obj || {});
      },
      async remove(keys) {
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete mem[k]);
      },
    };
  }

  async function cacheSessionKey(cryptoKey) {
    const area = sessionArea();
    if (!area) return;
    const b64 = await exportRawKeyB64(cryptoKey);
    await area.set({ [SESSION_KEY]: b64 });
  }

  /** 写入会话 + 本地 TTL（默认 3 小时），关闭浏览器后仍可免密至过期 */
  async function cacheSessionKeyWithTTL(cryptoKey, ttlMs) {
    const ttl = ttlMs != null ? ttlMs : DEFAULT_TTL_MS;
    const b64 = await exportRawKeyB64(cryptoKey);
    const exp = Date.now() + ttl;
    if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local && hasChromeStorageArea(chrome.storage.local)) {
      await chrome.storage.local.set({
        [PERSIST_UNLOCK_KEY]: b64,
        [PERSIST_UNLOCK_EXP]: exp,
      });
    } else {
      localSet({ [PERSIST_UNLOCK_KEY]: b64, [PERSIST_UNLOCK_EXP]: String(exp) });
    }
    await cacheSessionKey(cryptoKey);
  }

  async function clearSessionKey() {
    const area = sessionArea();
    if (!area) return;
    await area.remove(SESSION_KEY);
  }

  async function clearPersistentUnlock() {
    if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local && hasChromeStorageArea(chrome.storage.local)) {
      await chrome.storage.local.remove([PERSIST_UNLOCK_KEY, PERSIST_UNLOCK_EXP]);
    } else {
      localRemove([PERSIST_UNLOCK_KEY, PERSIST_UNLOCK_EXP]);
    }
  }

  async function clearAllUnlockSession() {
    await clearPersistentUnlock();
    await clearSessionKey();
  }

  async function tryImportSessionKey() {
    const area = sessionArea();
    if (!area) return null;
    const r = await area.get(SESSION_KEY);
    const b64 = r[SESSION_KEY];
    if (!b64) return null;
    try {
      return await importRawKeyB64(b64);
    } catch {
      await clearSessionKey();
      return null;
    }
  }

  async function tryImportPersistentSessionKey() {
    let r;
    if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local && hasChromeStorageArea(chrome.storage.local)) {
      r = await chrome.storage.local.get([PERSIST_UNLOCK_KEY, PERSIST_UNLOCK_EXP]);
    } else {
      r = localGet([PERSIST_UNLOCK_KEY, PERSIST_UNLOCK_EXP]);
    }
    const expRaw = r[PERSIST_UNLOCK_EXP];
    const exp = expRaw == null ? null : Number(expRaw);
    const b64 = r[PERSIST_UNLOCK_KEY];
    if (!b64 || exp == null) return null;
    if (Date.now() > exp) {
      await clearPersistentUnlock();
      return null;
    }
    try {
      return await importRawKeyB64(b64);
    } catch {
      await clearPersistentUnlock();
      return null;
    }
  }

  global.TOTPCrypto = {
    bufToB64,
    b64ToBuf,
    randomSaltB64: () => bufToB64(randomBytes(SALT_BYTES)),
    deriveKeyFromPassword,
    encryptWithKey,
    decryptWithKey,
    decryptVaultWithPassword,
    exportRawKeyB64,
    importRawKeyB64,
    cacheSessionKey,
    cacheSessionKeyWithTTL,
    clearSessionKey,
    clearPersistentUnlock,
    clearAllUnlockSession,
    tryImportSessionKey,
    tryImportPersistentSessionKey,
    PERSIST_UNLOCK_EXP,
  };
})(typeof self !== 'undefined' ? self : this);
