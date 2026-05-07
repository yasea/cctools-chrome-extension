/**
 * TOTP (RFC 6238) — compatible with Google Authenticator.
 * Uses Web Crypto HMAC-SHA1.
 */
(function (global) {
  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Encode(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < u8.length; i++) {
      value = (value << 8) | u8[i];
      bits += 8;
      while (bits >= 5) {
        output += BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += BASE32[(value << (5 - bits)) & 31];
    }
    return output;
  }

  function base32Decode(str) {
    const s = String(str || '')
      .toUpperCase()
      .replace(/=+$/g, '')
      .replace(/\s/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const idx = BASE32.indexOf(s[i]);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  function parseOtpAuthUri(uri) {
    try {
      const u = new URL(uri.trim());
      if (u.protocol !== 'otpauth:' || u.hostname !== 'totp') return null;
      const path = decodeURIComponent(u.pathname.replace(/^\//, ''));
      let issuer = '';
      let account = path;
      if (path.includes(':')) {
        const parts = path.split(':');
        issuer = parts[0];
        account = parts.slice(1).join(':');
      }
      const secret = u.searchParams.get('secret');
      if (!secret) return null;
      const issuerParam = u.searchParams.get('issuer');
      if (issuerParam) issuer = issuerParam;
      const digits = parseInt(u.searchParams.get('digits') || '6', 10) || 6;
      const period = parseInt(u.searchParams.get('period') || '30', 10) || 30;
      const name = [issuer, account].filter(Boolean).join(' — ') || account || 'TOTP';
      return { name, issuer: issuer || '', account, secret, digits, period };
    } catch {
      return null;
    }
  }

  async function hmacSha1(keyBytes, messageBytes) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, messageBytes);
    return new Uint8Array(sig);
  }

  /**
   * @param {string} secretBase32
   * @param {{ digits?: number, period?: number, nowMs?: number }} opts
   */
  async function generateTotp(secretBase32, opts) {
    const digits = opts && opts.digits != null ? opts.digits : 6;
    const period = opts && opts.period != null ? opts.period : 30;
    const nowMs = opts && opts.nowMs != null ? opts.nowMs : Date.now();
    const key = base32Decode(secretBase32);
    if (!key.length) throw new Error('无效的密钥');

    const counter = Math.floor(nowMs / 1000 / period);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const high = Math.floor(counter / 0x100000000);
    const low = counter >>> 0;
    view.setUint32(0, high);
    view.setUint32(4, low);

    const hmac = await hmacSha1(key, new Uint8Array(buffer));
    const offset = hmac[hmac.length - 1] & 0x0f;
    const bin =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const mod = 10 ** digits;
    const otp = (bin % mod).toString().padStart(digits, '0');
    return otp;
  }

  function remainingSeconds(period, nowMs) {
    const p = period || 30;
    const t = nowMs != null ? nowMs : Date.now();
    return p - Math.floor(t / 1000) % p;
  }

  const PB_VARINT = 0;
  const PB_64BIT = 1;
  const PB_LEN = 2;
  const PB_32BIT = 5;

  /**
   * Protobuf varint：最多 10 字节（64 位）。Google OtpParameters 的 field 7（HOTP counter）可能很长，
   * 旧实现 shift>35 会误抛错；且 JS 的 (x<<shift) 在 shift≥32 时按 32 位截断，不可用。
   */
  function readProtobufVarint(bytes, pos) {
    let p = pos;
    if (typeof BigInt === 'function') {
      let acc = 0n;
      for (let i = 0; i < 10; i++) {
        if (p >= bytes.length) throw new Error('varint truncated');
        const b = bytes[p++];
        acc |= BigInt(b & 0x7f) << BigInt(7 * i);
        if ((b & 0x80) === 0) {
          if (acc > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('varint too large');
          }
          return { value: Number(acc), offset: p };
        }
      }
    } else {
      let acc = 0;
      for (let i = 0; i < 10; i++) {
        if (p >= bytes.length) throw new Error('varint truncated');
        const b = bytes[p++];
        const v = b & 0x7f;
        const add = v * Math.pow(2, 7 * i);
        if (!Number.isFinite(add) || acc + add > Number.MAX_SAFE_INTEGER) {
          throw new Error('varint too large');
        }
        acc += add;
        if ((b & 0x80) === 0) {
          return { value: acc, offset: p };
        }
      }
    }
    throw new Error('varint too long');
  }

  /** 只前进指针，不解析数值（用于跳过 HOTP counter 等 64 位 varint） */
  function skipProtobufVarintOnly(bytes, pos) {
    let p = pos;
    for (let i = 0; i < 10; i++) {
      if (p >= bytes.length) throw new Error('varint truncated');
      if ((bytes[p++] & 0x80) === 0) return p;
    }
    throw new Error('varint too long');
  }

  function skipProtobufField(bytes, pos, wireType) {
    if (wireType === PB_VARINT) return skipProtobufVarintOnly(bytes, pos);
    if (wireType === PB_64BIT) return pos + 8;
    if (wireType === PB_32BIT) return pos + 4;
    if (wireType === PB_LEN) {
      const len = readProtobufVarint(bytes, pos);
      return len.offset + len.value;
    }
    throw new Error('protobuf wire ' + wireType);
  }

  /** Google Authenticator MigrationPayload.OtpParameters */
  function parseMigrationOtpParameters(bytes) {
    let secret = null;
    let name = '';
    let issuer = '';
    let algorithm = 1;
    let digits = 6;
    let otpType = 2;
    let pos = 0;
    while (pos < bytes.length) {
      const key = readProtobufVarint(bytes, pos);
      pos = key.offset;
      const fieldNum = key.value >>> 3;
      const wireType = key.value & 7;
      if (wireType === PB_LEN) {
        const len = readProtobufVarint(bytes, pos);
        pos = len.offset;
        const data = bytes.subarray(pos, pos + len.value);
        pos += len.value;
        if (fieldNum === 1) secret = data;
        else if (fieldNum === 2) name = new TextDecoder('utf-8').decode(data);
        else if (fieldNum === 3) issuer = new TextDecoder('utf-8').decode(data);
      } else if (wireType === PB_VARINT) {
        if (fieldNum === 4 || fieldNum === 5 || fieldNum === 6) {
          const v = readProtobufVarint(bytes, pos);
          pos = v.offset;
          if (fieldNum === 4) algorithm = v.value;
          else if (fieldNum === 5) digits = v.value;
          else otpType = v.value;
        } else {
          pos = skipProtobufVarintOnly(bytes, pos);
        }
      } else {
        pos = skipProtobufField(bytes, pos, wireType);
      }
    }
    return { secret, name, issuer, algorithm, digits, type: otpType };
  }

  /** Google Authenticator MigrationPayload（仅解析 repeated otp_parameters） */
  function parseMigrationPayloadBytes(bytes) {
    const list = [];
    let pos = 0;
    while (pos < bytes.length) {
      const key = readProtobufVarint(bytes, pos);
      pos = key.offset;
      const fieldNum = key.value >>> 3;
      const wireType = key.value & 7;
      if (fieldNum === 1 && wireType === PB_LEN) {
        const len = readProtobufVarint(bytes, pos);
        pos = len.offset;
        const sub = bytes.subarray(pos, pos + len.value);
        pos += len.value;
        list.push(parseMigrationOtpParameters(sub));
      } else {
        pos = skipProtobufField(bytes, pos, wireType);
      }
    }
    return list;
  }

  function base64ToBytes(b64) {
    let s = String(b64 || '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/\s/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    let bin;
    try {
      bin = atob(s);
    } catch {
      s = String(b64 || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .replace(/[^A-Za-z0-9+/=]/g, '');
      const p2 = s.length % 4;
      if (p2) s += '='.repeat(4 - p2);
      bin = atob(s);
    }
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /** 去掉 BOM、零宽字符；统一弯引号；NFKC（部分全角拉丁会折叠）；全角 URL 符号转半角 */
  function normalizePasteForOtp(text) {
    let s = String(text == null ? '' : text)
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[“”«»]/g, '"')
      .replace(/['']/g, "'");
    try {
      s = s.normalize('NFKC');
    } catch {
      /* 极旧环境无 normalize */
    }
    return s
      .replace(/\uFF1A/g, ':')
      .replace(/\uFF0F/g, '/')
      .replace(/\uFF1F/g, '?')
      .replace(/\uFF06/g, '&')
      .replace(/\uFF1D/g, '=');
  }

  function stripWrappingQuotes(s) {
    let t = String(s).trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  function migrationDataParamFromUri(uri) {
    const s = String(uri)
      .trim()
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    const m = s.match(/[?&]data=([^&]+)/i);
    if (!m) throw new Error('migration 缺少 data 参数');
    let enc = m[1].replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    try {
      return decodeURIComponent(enc);
    } catch {
      return enc;
    }
  }

  /**
   * 匹配 migration 完整 URL：到空白为止。
   * 不用 [^#]+ 之类，否则 data= 后若含 #、引号等会被错误截断（虽少见，但部分剪贴板会带杂质）。
   */
  function extractMigrationUris(text) {
    const s0 = normalizePasteForOtp(text);
    const seen = new Set();
    const out = [];
    const add = (raw) => {
      if (raw == null) return;
      let u = stripWrappingQuotes(String(raw).trim());
      const sp = u.search(/\s/);
      if (sp >= 0) u = u.slice(0, sp).trim();
      if (!u.toLowerCase().startsWith('otpauth-migration://')) return;
      if (seen.has(u)) return;
      seen.add(u);
      out.push(u);
    };

    for (const line of s0.split(/\r?\n/)) {
      let t = stripWrappingQuotes(line.trim());
      if (!t || t.startsWith('#')) continue;
      const low = t.toLowerCase();
      const idx = low.indexOf('otpauth-migration://');
      if (idx >= 0) add(t.slice(idx));
    }

    let mm;
    const re = /otpauth-migration:\/\/[^\s]+/gi;
    while ((mm = re.exec(s0)) !== null) add(mm[0]);

    /* 链接在别处被自动换行打断：去掉空白后重扫 */
    if (!out.length && /otpauth-migration/i.test(s0)) {
      const flat = s0.replace(/\s+/g, '');
      const re2 = /otpauth-migration:\/\/[^\s]+/gi;
      let m2;
      while ((m2 = re2.exec(flat)) !== null) add(m2[0]);
    }

    /* 仅有 offline?data= 或 data= 长 Base64（无完整 scheme） */
    if (!out.length) {
      const flat = s0.replace(/\s+/g, '');
      let dm = flat.match(
        /\botpauth-migration:[/][/]offline[?]data=([A-Za-z0-9+/=%._-]+)/i
      );
      if (!dm) dm = flat.match(/\boffline[?]data=([A-Za-z0-9+/=%._-]+)/i);
      if (dm && dm[1].length >= 32) {
        add('otpauth-migration://offline?data=' + dm[1]);
      }
    }
    if (!out.length) {
      const flat = s0.replace(/\s+/g, '');
      const dm2 = flat.match(/(?:^|[?&])data=([A-Za-z0-9+/=%._-]{48,})/i);
      if (dm2) {
        add('otpauth-migration://offline?data=' + dm2[1]);
      }
    }

    /* Google 迁移包 Base64 解码后通常以 0x0a 开头，URL 里常见以 Ck… 起头 */
    if (!out.length) {
      const m = s0.match(/[?&](data=Ck[A-Za-z0-9%_.+/=-]{32,})/i);
      if (m) {
        add('otpauth-migration://offline?' + m[1]);
      }
    }

    return out;
  }

  /** Google DigitCount: UNSPECIFIED=0, SIX=1, EIGHT=2 */
  function migrationDigitCount(enumVal) {
    const v = enumVal == null ? 0 : enumVal;
    if (v === 2) return 8;
    return 6;
  }

  /**
   * 解析 Google Authenticator 导出的 otpauth-migration://offline?data=...（Protobuf）。
   * @returns {{ accounts: Array<{name:string,issuer:string,secret:string,digits:number,period:number}>, stats: object }}
   */
  function parseGoogleMigrationInput(text) {
    const accounts = [];
    const stats = {
      migrationUris: 0,
      migrationLinksFound: 0,
      skippedHotp: 0,
      skippedAlgo: 0,
      skippedNoSecret: 0,
      parseErrors: 0,
    };

    const uris = extractMigrationUris(text);
    stats.migrationLinksFound = uris.length;
    for (const uri of uris) {
      try {
        const b64 = migrationDataParamFromUri(uri);
        const bytes = base64ToBytes(b64);
        const rawList = parseMigrationPayloadBytes(bytes);
        stats.migrationUris++;
        for (const p of rawList) {
          if (!p.secret || p.secret.length === 0) {
            stats.skippedNoSecret++;
            continue;
          }
          if (p.type === 1) {
            stats.skippedHotp++;
            continue;
          }
          if (p.type != null && p.type !== 0 && p.type !== 2) {
            stats.skippedHotp++;
            continue;
          }
          if (p.algorithm !== 0 && p.algorithm !== 1) {
            stats.skippedAlgo++;
            continue;
          }
          const d = migrationDigitCount(p.digits);
          const secretB32 = base32Encode(p.secret);
          const name =
            [p.issuer, p.name].filter(Boolean).join(' — ') || p.name || p.issuer || 'TOTP';
          accounts.push({
            name,
            issuer: p.issuer || '',
            secret: secretB32,
            digits: d,
            period: 30,
          });
        }
      } catch (e) {
        stats.parseErrors++;
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[TOTP migration]', e);
        }
      }
    }
    return { accounts, stats };
  }

  /**
   * 从整段文本中提取 otpauth://totp/...（支持多行、或一行内多条）。
   * 忽略 # 注释行；不处理 otpauth-migration://。
   */
  function extractOtpAuthUris(text) {
    const s0 = normalizePasteForOtp(text);
    const seen = new Set();
    const out = [];
    const add = (raw) => {
      let u = stripWrappingQuotes(String(raw).trim());
      if (!u.toLowerCase().startsWith('otpauth://totp/')) return;
      if (seen.has(u)) return;
      seen.add(u);
      out.push(u);
    };

    for (const line of s0.split(/\r?\n/)) {
      let t = stripWrappingQuotes(line.trim());
      if (!t || t.startsWith('#')) continue;
      const low = t.toLowerCase();
      const idx = low.indexOf('otpauth://totp/');
      if (idx >= 0) add(t.slice(idx));
    }

    const re = /otpauth:\/\/totp\/[^\s#'"<>]+/gi;
    let m;
    while ((m = re.exec(s0)) !== null) add(m[0]);

    if (!out.length && /otpauth:\/\/totp/i.test(s0)) {
      const flat = s0.replace(/\s+/g, '');
      const re2 = /otpauth:\/\/totp\/[^\s#'"<>]+/gi;
      let m2;
      while ((m2 = re2.exec(flat)) !== null) add(m2[0]);
    }

    return out;
  }

  global.TOTP = {
    base32Decode,
    base32Encode,
    parseOtpAuthUri,
    generateTotp,
    remainingSeconds,
    extractOtpAuthUris,
    extractMigrationUris,
    parseGoogleMigrationInput,
  };
})(typeof self !== 'undefined' ? self : this);
