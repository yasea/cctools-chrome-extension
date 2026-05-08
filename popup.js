function debugMsg(str) {
    if (console) {
        console.log(str);
    }
    $("#debugbox").html(str);
}

function hasChromeStorage() {
    return (
        typeof chrome !== 'undefined' &&
        chrome &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.get === 'function' &&
        typeof chrome.storage.local.set === 'function'
    );
}

function hasChromeTabsAndScripting() {
    return (
        typeof chrome !== 'undefined' &&
        chrome &&
        chrome.tabs &&
        typeof chrome.tabs.query === 'function' &&
        chrome.scripting &&
        typeof chrome.scripting.executeScript === 'function'
    );
}

function storageGet(keys) {
    if (hasChromeStorage()) {
        return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }
    const out = {};
    (Array.isArray(keys) ? keys : Object.keys(keys || {})).forEach((k) => {
        const v = localStorage.getItem(String(k));
        if (v != null) out[k] = v;
    });
    return Promise.resolve(out);
}

function storageSet(obj) {
    if (hasChromeStorage()) {
        return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
    }
    Object.entries(obj || {}).forEach(([k, v]) => localStorage.setItem(String(k), String(v ?? '')));
    return Promise.resolve();
}

function storageRemove(keys) {
    if (hasChromeStorage()) {
        return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
    }
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => localStorage.removeItem(String(k)));
    return Promise.resolve();
}
function __loadJS(src, callback) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = function () {
        callback();
    };
    document.body.appendChild(script);
}

// 页面加载时恢复上一次的内容
document.addEventListener('DOMContentLoaded', () => {
    const contentBox = document.getElementById("contentBox");
    // 从本地存储中恢复内容（扩展环境用 chrome.storage；本地预览用 localStorage）
    storageGet(['savedContent']).then((result) => {
        if (result && result.savedContent) contentBox.value = result.savedContent;
    });
    // 添加输入事件监听器，实时保存内容
    contentBox.addEventListener('input', () => {
        void storageSet({ savedContent: contentBox.value });
    });
    // 添加清空按钮功能
    const clearBtn = document.getElementById('btn-ClearContent');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            contentBox.value = '';
            void storageRemove('savedContent');
        });
    }

    setupAutoCopy('#debugbox');
    setupAutoCopy('#contentBox');

    // 非扩展环境：仅禁用需要 chrome.tabs / scripting 的能力（验证器可用 WebCrypto + localStorage 预览）
    if (!hasChromeTabsAndScripting()) {
        const btnGetCss = document.getElementById('btn-getCSS');
        if (btnGetCss) btnGetCss.setAttribute('disabled', 'disabled');
        const sfBar = document.getElementById('smart-fill-bar');
        if (sfBar) sfBar.hidden = true;
        const totpErr = document.getElementById('totp-unlock-err');
        if (totpErr) {
            totpErr.textContent = '提示：当前为 file:// 预览模式，智能填充/注入页面功能不可用；但验证器可用本地存储进行预览。';
        }
    }

});

// 清空按钮的逻辑已在 DOMContentLoaded 中绑定（避免重复绑定 / file:// 错误）

// 检查文本内容
function detectContentType(text) {
    text = text.trim();
    if (/^<!DOCTYPE html>|<html[\s>]|<head[\s>]|<body[\s>]|<div[\s>]|<span[\s>]/i.test(text)) {
        return 'html';
    }
    if (/^<\?xml|^<\w+/.test(text)) {
        if (text.includes('</') && text.endsWith('>')) {
            return 'xml';
        }
    }
    if (/^[\{\[]/.test(text)) {
        try {
            JSON.parse(text);
            return 'json';
        } catch (e) { }
    }

    if (/[@\w-]+\s*[:{][^}]*[;}]/s.test(text)) {
        return 'css';
    }
    if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i.test(text)) {
        return 'sql';
    }
    return "";
}

document.getElementById("btn-formater").addEventListener("click", () => {

    codeType = detectContentType($('#contentBox').val());
    debugMsg("执行内容格式化: [" + codeType + "]");
    try {
        if (codeType == "") return;
        if (codeType == "html") {
            $('#contentBox').formatHtml({
                indentSize: 2,
                maxLineLength: 80, //单行最大长度
                removeComments: false,
                compactTags: ['meta', 'link', 'img', 'br', 'hr', 'input', 'source'],
                inlineTags: ['a', 'span', 'b', 'i', 'strong', 'em', 'code', 'label'],//内联元素列表
                noIndentTags: ['html', '!doctype', 'head', 'body'],//不需要缩进的标签
                keepWithNext: ['title', 'script', 'style']
            });
        } else {
            $('#contentBox').format({ method: codeType });
        }
        void storageSet({ savedContent: $('#contentBox').val() });
    } catch (e) {
        debugMsg(e);
    }
})

document.getElementById("btn-compress").addEventListener("click", () => {

    codeType = detectContentType($('#contentBox').val());
    debugMsg("执行内容简化:[" + codeType + "]");
    try {
        if (codeType == "") return;
        $('#contentBox').format({ method: codeType + "min" });
        void storageSet({ savedContent: $('#contentBox').val() });
    } catch (e) {
        debugMsg(e);
    }
})

function processBase64(input) {
    // BASE64字符集正则
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    try {
        // 转换为字符串
        const str = String(input);
        // 检查是否为BASE64
        if (base64Regex.test(str)) {
            // 优先使用URL解码，失败则直接解码
            try {
                return decodeURIComponent(atob(str));
            } catch {
                return atob(str);
            }
        } else {
            // 编码
            return btoa(encodeURIComponent(str));
        }
    } catch {
        return null;
    }
}

function processURL(input) {
    // URL编码的简单检测正则
    const urlEncodedRegex = /%[0-9A-Fa-f]{2}/;
    try {
        const str = String(input);
        if (urlEncodedRegex.test(str)) {
            try {
                return decodeURIComponent(str);
            } catch {
                return str;
            }
        } else {
            return encodeURIComponent(str);
        }
    } catch {
        return null;
    }
}

function processTimestamp(input) {
    // 检测输入是否为时间戳的正则表达式
    const timestampRegex = /^\d{10,13}$/;
    const now = new Date();
    if (input === null || input === undefined || input === '') {
        return {
            originType: '当前时间',
            timeResult: Math.floor(now.getTime() / 1000),
            time2: now.getTime()
        };
    }
    try {
        const str = String(input);
        // 检查是否为数字时间戳
        if (timestampRegex.test(str)) {
            const timestamp = Number(str);
            const isSeconds = timestamp < 9999999999;
            const msTimestamp = isSeconds ? timestamp * 1000 : timestamp;
            const date = new Date(msTimestamp);
            return {
                originType: isSeconds ? '秒级时间戳' : '毫秒级时间戳',
                timeResult: date.toLocaleString(),
                time2: ''
            };
        } else {
            const date = new Date(str);
            if (isNaN(date.getTime())) {
                return {
                    originType: '当前时间',
                    timeResult: Math.floor(now.getTime() / 1000),
                    time2: now.getTime()
                };
            }
            return {
                originType: '日期',
                timeResult: Math.floor(date.getTime() / 1000).toString(),
                time2: date.getTime().toString()
            };
        }
    } catch (error) {
        console.error('时间戳转换错误:', error);
        return null;
    }
}
document.getElementById("btn-timestamp").addEventListener("click", () => {
    debugMsg("timestamp.....");
    inputValue = $('#contentBox').val().trim();
    var result = processTimestamp(inputValue);
    var msg = result.timeResult + (result.time2 == "" ? "" : "\t\t" + result.time2);
    debugMsg(result.originType + ": " + msg);
})
function generatePassword() {
    const charsets = {
        lowercase: 'abcdefghijklmnopqrstuvwxyz',
        uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        numbers: '0123456789',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
    };
    const difficulties = ['easy', 'medium', 'hard', 'extreme'];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    const config = {
        easy: { length: [8, 10], types: ['lowercase', 'uppercase'] },
        medium: { length: [10, 14], types: ['lowercase', 'uppercase', 'numbers'] },
        hard: { length: [14, 18], types: ['lowercase', 'uppercase', 'numbers', 'symbols'] },
        extreme: { length: [18, 24], types: ['lowercase', 'uppercase', 'numbers', 'symbols'] }
    }[difficulty];

    const passwordLength = Math.floor(Math.random() * (config.length[1] - config.length[0] + 1) + config.length[0]);
    const allChars = config.types.map(type => charsets[type]).join('');

    const password = Array.from(
        { length: passwordLength },
        () => allChars[Math.floor(Math.random() * allChars.length)]
    ).join('');

    return {
        password: password,
        length: password.length,
        difficulty: difficulty
    };
}


function setupAutoCopy(selector) {
    document.querySelectorAll(selector).forEach(el => {
        el.addEventListener('mouseup', () => {
            const selectedText = window.getSelection().toString().trim();
            if (selectedText) {
                navigator.clipboard.writeText(selectedText)
                    .catch(err => console.error('复制失败:', err));
            }
        });
    });
}



document.getElementById("btn-password").addEventListener("click", () => {
    debugMsg("password.....");
    pwdResult = generatePassword();
    debugMsg("随机密码: [" + pwdResult.difficulty + "] &gt;&gt;&gt;" + pwdResult.password);
    $('#contentBox').val(pwdResult.password);
})

document.getElementById("btn-base64").addEventListener("click", () => {
    debugMsg("base64.....");
    inputValue = $('#contentBox').val().trim();
    if (inputValue) {
        var result = processBase64(inputValue);
        debugMsg("BASE64：" + result);
    }
})

document.getElementById("btn-urlencoder").addEventListener("click", () => {
    debugMsg("urlencoder.....");
    inputValue = $('#contentBox').val().trim();
    if (inputValue) {
        var result = processURL(inputValue);
        debugMsg("URL：" + result);
    }
})

document.getElementById("btn-md5").addEventListener("click", () => {
    debugMsg("md5.....");
    inputValue = $('#contentBox').val().trim();
    if (inputValue) {
        var md5Result = md5(inputValue);
    } else {
        var newUUID = uuid.v4();
        var md5Result = md5(newUUID);
    }
    debugMsg("MD5：" + md5Result);
})

document.getElementById("btn-getCSS").addEventListener("click", () => {
    if (!hasChromeTabsAndScripting()) {
        alert('该功能需要在浏览器扩展环境运行（chrome.tabs / chrome.scripting）。');
        return;
    }
    // 发送消息到内容脚本获取 CSS
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript(
            {
                target: { tabId: tabs[0].id },
                function: analyzeCSSUsage, // 调用内容脚本中的函数
            },
            (results) => {
                if (results && results[0]) {
                    document.getElementById("contentBox").value = results[0].result;
                    debugMsg("获取当前TAB页CSS");
                }
            }
        );
    });
});

function autoSelect(contentBox, skip_first_row = false) {
    var start = 0;
    if (skip_first_row) {
        start = contentBox.value.indexOf('\n') + 1;
    }
    contentBox.focus();
    contentBox.setSelectionRange(start > 0 ? start : 0, contentBox.value.length);
}

// Deepseek Address Organizer
document.getElementById("btn-deepseek-address").addEventListener("click", async () => {
    debugMsg("正在整理地址...");
    const contentBox = document.getElementById("contentBox");
    const text = contentBox.value.trim();

    if (!text) {
        alert("请先在文本框中输入需要整理的地址信息");
        debugMsg("地址内容为空");
        return;
    }

    // Get API Key
    storageGet(['deepseek_api_key']).then(async (result) => {
        let apiKey = result && result.deepseek_api_key;
        if (!apiKey) {
            apiKey = prompt("请输入您的 Deepseek API Key:");
            if (apiKey) {
                await storageSet({ deepseek_api_key: apiKey });
            } else {
                debugMsg("未提供 API Key，取消操作");
                return;
            }
        }

        try {
            const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "qwen3.5-flash",
                    messages: [
                        {
                            role: "system",
                            content: `你是一个地址数据提取助手。请分析用户输入的文本，提取以下信息：
1. 收件地址 (Address)[针对地址信息中缺少省份的情况， 自动补充能确定的省份信息]
2. 收件人姓名 (Name) [注意：如果找不到明确姓名，请留空]
3. 数量 (Quantity) [默认为1，如果是多件请提取]
4. 规格 (Specification) [仅输出数字10或者20，10=5公斤=10斤=10斤装=十斤，20=10kg=20斤=20斤装=20斤]
5. 电话 (Phone)

请严格按照以下 TSV (Tab Separated Values) 格式输出，每一行一条记录。
输出格式要求：
收件地址<TAB>物流单号(空)<TAB>收件人<TAB>数量<TAB>规格<TAB>电话

注意：
- 物流单号列必须为空，即连续两个TAB。
- 不要输出 Markdown 代码块，只输出纯文本。
- 第一行必须是表头：收件地址\t物流单号\t收件人\t数量\t规格\t电话
`
                        },
                        {
                            role: "user",
                            content: text
                        }
                    ],
                    stream: false,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            // Update content box
            contentBox.value = content;
            await storageSet({ savedContent: content });
            tokens = data.usage.total_tokens;
            debugMsg("地址整理完成！tokens = " + tokens);
            // 自动选中
            autoSelect(contentBox, true);

        } catch (error) {
            console.error("Deepseek API Error:", error);
            debugMsg("整理失败: " + error.message);
            // If 401, maybe clear key
            if (error.message.includes('401')) {
                await storageRemove('deepseek_api_key');
                alert("API Key 无效，请重新尝试");
            }
        }
    });
});

/* ---------- Google Authenticator / TOTP（加密保险箱） ---------- */
const TOTP_VAULT_KEY = 'totpVault';
const TOTP_LEGACY_KEY = 'totpAccounts';

/** 内置初始管理密码（不向界面展示字面量）；输入框留空时等同使用该密码尝试解锁 */
const TOTP_BUILTIN_MASTER_PASSWORD = 'pwd#ccdd';

function effectiveTotpMasterPassword(input) {
    const s = input == null ? '' : String(input).trim();
    return s.length ? s : TOTP_BUILTIN_MASTER_PASSWORD;
}

let totpAccounts = [];
let totpTick = null;
let selectedTotpId = null;
let smartFillSelectedId = null;
/** @type {CryptoKey | null} */
let totpSessionCryptoKey = null;
/** @type {string | null} */
let totpVaultSaltB64 = null;
let smartFillAutoRoutedToUnlock = false;

function routeToTotpUnlockWithHint(msg) {
    const t = document.getElementById('tab-totp');
    if (t) t.click();
    const errEl = document.getElementById('totp-unlock-err');
    if (errEl) errEl.textContent = msg || '检测到验证码输入框，请先解锁验证器。';
    const pwdEl = document.getElementById('totp-master-pwd');
    if (pwdEl) {
        pwdEl.focus();
        pwdEl.select();
    }
}

function stopTotpTicker() {
    if (totpTick) {
        clearInterval(totpTick);
        totpTick = null;
    }
}

function startTotpTicker() {
    stopTotpTicker();
    totpTick = setInterval(() => {
        refreshTotpDisplay();
    }, 1000);
}

function setTotpUiLocked(locked) {
    const lockEl = document.getElementById('totp-lock');
    const mainEl = document.getElementById('totp-main');
    if (lockEl) lockEl.hidden = !locked;
    if (mainEl) mainEl.hidden = locked;
}

async function persistTotpVault() {
    if (!totpSessionCryptoKey || totpVaultSaltB64 == null) {
        throw new Error('未解锁');
    }
    const pack = await TOTPCrypto.encryptWithKey(totpSessionCryptoKey, JSON.stringify(totpAccounts));
    const vault = { v: 1, salt: totpVaultSaltB64, iv: pack.iv, ct: pack.ct };
    await storageSet({ [TOTP_VAULT_KEY]: JSON.stringify(vault) });
}

async function tryUnlockFromSession() {
    if (totpSessionCryptoKey != null && totpVaultSaltB64 != null) {
        return true;
    }
    const local = await storageGet([TOTP_VAULT_KEY]);
    let vault = local[TOTP_VAULT_KEY];
    if (typeof vault === 'string') {
        try { vault = JSON.parse(vault); } catch { vault = null; }
    }
    if (!vault || !vault.salt || !vault.iv || !vault.ct) return false;
    const key =
        (await TOTPCrypto.tryImportPersistentSessionKey()) ||
        (await TOTPCrypto.tryImportSessionKey());
    if (!key) return false;
    try {
        const json = await TOTPCrypto.decryptWithKey(key, vault.iv, vault.ct);
        let arr;
        try {
            arr = JSON.parse(json);
        } catch {
            await TOTPCrypto.clearAllUnlockSession();
            return false;
        }
        totpAccounts = Array.isArray(arr) ? arr : [];
        totpSessionCryptoKey = key;
        totpVaultSaltB64 = vault.salt;
        return true;
    } catch {
        await TOTPCrypto.clearAllUnlockSession();
        return false;
    }
}

async function unlockWithPassword(password) {
    const pwd = effectiveTotpMasterPassword(password);
    const local = await storageGet([TOTP_VAULT_KEY, TOTP_LEGACY_KEY]);
    let vault = local[TOTP_VAULT_KEY];
    if (typeof vault === 'string') {
        try { vault = JSON.parse(vault); } catch { vault = null; }
    }
    let legacy = local[TOTP_LEGACY_KEY];
    if (typeof legacy === 'string') {
        try { legacy = JSON.parse(legacy); } catch { legacy = null; }
    }

    if (vault && vault.salt && vault.iv && vault.ct) {
        let result;
        try {
            result = await TOTPCrypto.decryptVaultWithPassword(vault, pwd);
        } catch {
            throw new Error('密码错误或数据已损坏');
        }
        let arr;
        try {
            arr = JSON.parse(result.plaintext);
        } catch {
            throw new Error('保险箱数据格式无效');
        }
        totpAccounts = Array.isArray(arr) ? arr : [];
        totpSessionCryptoKey = result.cryptoKey;
        totpVaultSaltB64 = vault.salt;
    } else {
        const saltB64 = TOTPCrypto.randomSaltB64();
        const saltBytes = TOTPCrypto.b64ToBuf(saltB64);
        totpSessionCryptoKey = await TOTPCrypto.deriveKeyFromPassword(password, saltBytes);
        totpVaultSaltB64 = saltB64;

        if (Array.isArray(legacy)) {
            totpAccounts = legacy;
            await persistTotpVault();
            await storageRemove(TOTP_LEGACY_KEY);
        } else {
            totpAccounts = [];
            await persistTotpVault();
        }
    }

    await TOTPCrypto.cacheSessionKeyWithTTL(totpSessionCryptoKey, 24 * 60 * 60 * 1000);
}

const TOTP_NEW_PWD_MIN_LEN = 6;

async function changeTotpMasterPassword(currentRaw, newRaw, confirmRaw) {
    if (!totpSessionCryptoKey) {
        throw new Error('请先解锁保险箱');
    }
    const newPwd = String(newRaw || '').trim();
    const confirm = String(confirmRaw || '').trim();
    if (newPwd.length < TOTP_NEW_PWD_MIN_LEN) {
        throw new Error(`新密码至少 ${TOTP_NEW_PWD_MIN_LEN} 位`);
    }
    if (newPwd !== confirm) {
        throw new Error('两次输入的新密码不一致');
    }
    const local = await storageGet([TOTP_VAULT_KEY]);
    let vault = local[TOTP_VAULT_KEY];
    if (typeof vault === 'string') {
        try { vault = JSON.parse(vault); } catch { vault = null; }
    }
    if (!vault || !vault.salt || !vault.iv || !vault.ct) {
        throw new Error('未找到保险箱数据');
    }
    const currentEffective = effectiveTotpMasterPassword(currentRaw);
    try {
        await TOTPCrypto.decryptVaultWithPassword(vault, currentEffective);
    } catch {
        throw new Error('当前密码错误');
    }
    const saltB64 = TOTPCrypto.randomSaltB64();
    const saltBytes = TOTPCrypto.b64ToBuf(saltB64);
    totpSessionCryptoKey = await TOTPCrypto.deriveKeyFromPassword(newPwd, saltBytes);
    totpVaultSaltB64 = saltB64;
    await persistTotpVault();
    await TOTPCrypto.cacheSessionKeyWithTTL(totpSessionCryptoKey, 24 * 60 * 60 * 1000);
}

async function lockTotpSession() {
    stopTotpTicker();
    totpAccounts = [];
    totpSessionCryptoKey = null;
    totpVaultSaltB64 = null;
    selectedTotpId = null;
    await TOTPCrypto.clearAllUnlockSession();
    setTotpUiLocked(true);
    const errEl = document.getElementById('totp-unlock-err');
    if (errEl) errEl.textContent = '';
    void updateTotpSessionHint();
    void updateSmartFillBar();
}

async function openTotpPanelFlow() {
    const ok = await tryUnlockFromSession();
    if (ok) {
        setTotpUiLocked(false);
        renderTotpList();
        startTotpTicker();
        void updateTotpSessionHint();
    } else {
        setTotpUiLocked(true);
        const errEl = document.getElementById('totp-unlock-err');
        if (errEl) errEl.textContent = '';
    }
    void updateSmartFillBar();
}

async function refreshTotpDisplay() {
    const rows = document.querySelectorAll('.totp-row[data-id]');
    for (const row of rows) {
        if (row.querySelector('.totp-row-name-input')) continue;
        const id = row.getAttribute('data-id');
        const acc = totpAccounts.find((a) => a.id === id);
        if (!acc) continue;
        const codeEl = row.querySelector('.totp-row-code');
        const secEl = row.querySelector('.totp-row-sec');
        const fillEl = row.querySelector('.totp-row-track-fill');
        const period = acc.period || 30;
        try {
            const code = await TOTP.generateTotp(acc.secret, {
                digits: acc.digits || 6,
                period,
            });
            if (codeEl) codeEl.textContent = code;
            const rem = TOTP.remainingSeconds(period);
            if (secEl) secEl.textContent = String(rem);
            if (fillEl) {
                const pct = Math.max(0, Math.min(100, (rem / period) * 100));
                fillEl.style.width = pct + '%';
            }
        } catch (e) {
            if (codeEl) codeEl.textContent = '错误';
            if (secEl) secEl.textContent = '—';
            if (fillEl) fillEl.style.width = '0%';
        }
    }
    void updateTotpSessionHint();
}

function formatRemainMs(ms) {
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function updateTotpSessionHint() {
    const el = document.getElementById('totp-session-hint');
    if (!el || typeof TOTPCrypto === 'undefined') return;
    if (!totpSessionCryptoKey) {
        el.textContent = '';
        el.hidden = true;
        return;
    }
    const expKey = TOTPCrypto.PERSIST_UNLOCK_EXP || 'totpUnlockExpiresAt';
    const r = await storageGet([expKey]);
    const exp = r[expKey] == null ? null : Number(r[expKey]);
    if (exp == null) {
        el.textContent = '';
        el.hidden = true;
        return;
    }
    const left = formatRemainMs(exp - Date.now());
    el.hidden = false;
    el.textContent = left ? `免密剩余 ${left}` : '免密已过期，请重新解锁';
}

function compareTotpAccountsByName(a, b) {
    const na = String(a.name || '').toLowerCase();
    const nb = String(b.name || '').toLowerCase();
    let c = na.localeCompare(nb, 'zh-CN', { numeric: true });
    if (c !== 0) return c;
    c = String(a.issuer || '')
        .toLowerCase()
        .localeCompare(String(b.issuer || '').toLowerCase(), 'zh-CN', { numeric: true });
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
}

function renderTotpList() {
    const list = document.getElementById('totp-list');
    if (!list) return;
    if (!totpAccounts.length) {
        list.innerHTML = '<div class="totp-empty">暂无帐号，请在上方添加密钥、otpauth 链接或使用批量导入。</div>';
        return;
    }
    list.innerHTML = [...totpAccounts]
        .sort(compareTotpAccountsByName)
        .map((a) => {
            const issuerLine =
                a.issuer && !String(a.name).includes(a.issuer)
                    ? `<span class="totp-row-issuer">${escapeHtml(a.issuer)}</span>`
                    : '';
            return `
      <div class="totp-row${selectedTotpId === a.id ? ' is-selected' : ''}" data-id="${escapeHtml(a.id)}" title="${escapeHtml((a.issuer ? a.issuer + ' — ' : '') + a.name)}">
        <div class="totp-row-main">
          <div class="totp-row-idblock">
            <span class="totp-row-name" title="双击修改名称">${escapeHtml(a.name)}</span>
            ${issuerLine}
          </div>
          <span class="totp-row-code">······</span>
          <span class="totp-row-sec">—</span>
          <button type="button" class="totp-copy" data-id="${escapeHtml(a.id)}">复制</button>
          <button type="button" class="totp-fill" data-id="${escapeHtml(a.id)}" title="填入当前标签页（含 iframe、多分格）">填入</button>
          <button type="button" class="totp-btn-danger totp-del" data-id="${escapeHtml(a.id)}">删除</button>
        </div>
        <div class="totp-row-track" aria-hidden="true"><div class="totp-row-track-fill"></div></div>
      </div>`;
        })
        .join('');
    refreshTotpDisplay();
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function getTotpAccountById(id) {
    return totpAccounts.find((a) => a.id === id);
}

function normalizeTotpSecret(s) {
    return String(s).replace(/\s/g, '').toUpperCase();
}

/** @returns {boolean} 是否新增长帐号 */
function pushTotpAccountUnique(p) {
    const sec = normalizeTotpSecret(p.secret);
    if (totpAccounts.some((a) => normalizeTotpSecret(a.secret) === sec)) return false;
    totpAccounts.push({
        id: typeof uuid !== 'undefined' ? uuid.v4() : String(Date.now()) + Math.random(),
        name: p.name || '未命名',
        issuer: p.issuer || '',
        secret: sec,
        digits: p.digits != null ? p.digits : 6,
        period: p.period != null ? p.period : 30,
    });
    return true;
}

async function getCodeForAccount(acc) {
    if (!acc) return '';
    try {
        return await TOTP.generateTotp(acc.secret, {
            digits: acc.digits || 6,
            period: acc.period || 30,
        });
    } catch {
        return '';
    }
}

function parseTabUrlHost(url) {
    try {
        const u = new URL(url);
        if (!u.protocol.startsWith('http')) return '';
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch (e) {
        return '';
    }
}

/** 与验证器列表一致：主行 name；issuer 仅在 name 中未出现时以「 · 」附在末尾（对应列表第二行） */
function totpAccountOptionLabel(acc) {
    if (!acc) return '';
    const name = acc.name || '未命名';
    const iss = String(acc.issuer || '').trim();
    if (iss && !String(name).includes(iss)) {
        return name + ' · ' + iss;
    }
    return name;
}

/** 展示名里常见间隔（不含空格，避免误切多词 issuer）；取首段与域名/title 比对 */
const TOTP_LABEL_HEAD_SPLIT = /[—–\-／/|｜:：·•，,、]+/;

/**
 * 取字符串在首个间隔符之前的部分（无间隔则整段）
 * @param {string} s
 * @returns {string | null}
 */
function totpLabelHeadSegment(s) {
    const t = String(s || '').trim();
    if (!t) return null;
    const head = t.split(TOTP_LABEL_HEAD_SPLIT)[0];
    const h = head ? head.trim() : '';
    return h || null;
}

/**
 * @param {string} s
 * @returns {Set<string>}
 */
function totpCollectHeadMatchTokens(s) {
    const out = new Set();
    const h = totpLabelHeadSegment(s);
    if (!h) return out;
    const low = h.toLowerCase();
    if (low.length >= 2 || /[\u4e00-\u9fff]/.test(low)) out.add(low);
    const slug = h.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '').toLowerCase();
    if (slug.length >= 2 || /[\u4e00-\u9fff]/.test(slug)) out.add(slug);
    return out;
}

/**
 * issuer / name / 合成展示名 各自取「首段」，去重后用于匹配
 * @param {object} acc
 * @returns {string[]}
 */
function totpAccountHeadTokens(acc) {
    const bag = new Set();
    const add = (s) => {
        totpCollectHeadMatchTokens(s).forEach((t) => bag.add(t));
    };
    add(acc.issuer || '');
    add(acc.name || '');
    add(totpAccountOptionLabel(acc));
    return [...bag].filter((t) => t && t.length >= 1);
}

/** @returns {{ acc: object, score: number }[]} */
function rankTotpAccountsForPage(url, title, accounts) {
    if (!accounts || !accounts.length) return [];
    const host = parseTabUrlHost(url).toLowerCase();
    const titleL = String(title || '').toLowerCase();
    const genericTLD = new Set([
        'www',
        'com',
        'cn',
        'net',
        'org',
        'io',
        'co',
        'me',
        'ai',
        'dev',
        'app',
        'tech',
        'gov',
        'edu',
        'info',
        'cc',
    ]);
    const hostParts = host.split('.').filter((p) => {
        const pl = p.toLowerCase();
        return pl.length >= 2 && !genericTLD.has(pl);
    });

    function tokenMatchesHostOrTitle(token) {
        let s = 0;
        if (!token || token.length < 2) {
            if (!token || !/[\u4e00-\u9fff]/.test(token)) return 0;
        }
        if (titleL.includes(token)) s += 100;
        if (host && host.includes(token)) s += 120;
        for (const part of hostParts) {
            const pl = part.toLowerCase();
            if (!pl) continue;
            if (pl === token) s += 95;
            else if (pl.includes(token) || token.includes(pl)) s += 85;
        }
        return s;
    }

    function scoreAcc(acc) {
        const tokens = totpAccountHeadTokens(acc);
        let s = 0;
        const seen = new Set();
        for (const token of tokens) {
            const key = token.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            s += tokenMatchesHostOrTitle(key);
        }
        return s;
    }

    return accounts
        .map((acc) => ({ acc, score: scoreAcc(acc) }))
        .sort((a, b) => b.score - a.score);
}

function isUndetectableTabUrl(url) {
    if (!url) return true;
    return (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('devtools:') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('view-source:')
    );
}

/** Chrome API 要求 files 与 func 不能同一次传入，须先注入脚本再执行 func */
function injectOtpDomFillAllFrames(tabId, callback) {
    chrome.scripting.executeScript(
        { target: { tabId, allFrames: true }, files: ['otp-dom-fill.js'] },
        callback
    );
}

function detectOtpLikelyOnTab(tabId, callback) {
    if (tabId == null) {
        callback(false);
        return;
    }
    injectOtpDomFillAllFrames(tabId, () => {
        if (chrome.runtime.lastError) {
            callback(false);
            return;
        }
        chrome.scripting.executeScript(
            {
                target: { tabId, allFrames: true },
                func: () =>
                    typeof globalThis._cctoolsDetectOtpPage === 'function'
                        ? globalThis._cctoolsDetectOtpPage()
                        : { likely: false },
            },
            (results) => {
                if (chrome.runtime.lastError) {
                    callback(false);
                    return;
                }
                const likely = results && results.some((r) => r && r.result && r.result.likely);
                callback(!!likely);
            }
        );
    });
}

async function maybeRestoreTotpSessionForPopup() {
    if (typeof TOTPCrypto === 'undefined') return;
    if (totpSessionCryptoKey) return;
    const ok = await tryUnlockFromSession();
    if (ok) {
        setTotpUiLocked(false);
        renderTotpList();
        startTotpTicker();
        void updateTotpSessionHint();
    }
}

function updateSmartFillBar() {
    if (!hasChromeTabsAndScripting()) return;
    const bar = document.getElementById('smart-fill-bar');
    if (!bar) return;

    const sfDropdown = document.getElementById('smart-fill-dropdown');
    const btn = document.getElementById('smart-fill-btn');
    const gotoBtn = document.getElementById('smart-fill-goto-totp');

    const hideBar = () => {
        bar.hidden = true;
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || tab.id == null || isUndetectableTabUrl(tab.url || '')) {
            hideBar();
            return;
        }

        detectOtpLikelyOnTab(tab.id, (likely) => {
            if (!likely) {
                hideBar();
                return;
            }

            bar.hidden = false;

            if (!totpSessionCryptoKey) {
                if (sfDropdown) sfDropdown.hidden = true;
                if (btn) btn.hidden = true;
                if (gotoBtn) {
                    gotoBtn.hidden = false;
                    gotoBtn.title = '前往验证器解锁保险箱';
                }
                if (!smartFillAutoRoutedToUnlock) {
                    smartFillAutoRoutedToUnlock = true;
                    routeToTotpUnlockWithHint('检测到验证码输入框：免密未开启或已过期，请输入管理密码解锁。');
                }
                return;
            }

            if (!totpAccounts.length) {
                if (sfDropdown) sfDropdown.hidden = true;
                if (btn) btn.hidden = true;
                if (gotoBtn) {
                    gotoBtn.hidden = false;
                    gotoBtn.title = '前往验证器添加帐号';
                }
                return;
            }

            if (gotoBtn) gotoBtn.hidden = true;

            const ranked = rankTotpAccountsForPage(tab.url || '', tab.title || '', totpAccounts);
            if (sfDropdown) {
                sfDropdown.hidden = false;
                populateSmartFillDropdown(ranked);
            }
            if (btn) btn.hidden = false;
        });
    });
}

function populateSmartFillDropdown(ranked) {
    const panel = document.getElementById('smart-fill-panel');
    const labelEl = document.getElementById('smart-fill-label');
    if (!panel) return;

    panel.innerHTML = '';
    ranked.forEach(({ acc }, i) => {
        const li = document.createElement('li');
        li.className = 'sf-item';
        li.setAttribute('role', 'option');
        li.dataset.id = acc.id;

        const name = acc.name || acc.issuer || acc.id;
        const issuer = (acc.issuer && acc.issuer !== name) ? acc.issuer : '';

        li.innerHTML =
            `<span class="sf-item-dot"></span>` +
            `<span class="sf-item-info">` +
            `<span class="sf-item-name">${escHtml(name)}</span>` +
            (issuer ? `<span class="sf-item-issuer">${escHtml(issuer)}</span>` : '') +
            `</span>` +
            `<svg class="sf-item-check" viewBox="0 0 14 14" fill="none" aria-hidden="true">` +
            `<path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
            `</svg>`;

        li.addEventListener('click', () => {
            smartFillSelectedId = acc.id;
            if (labelEl) labelEl.textContent = totpAccountOptionLabel(acc);
            panel.querySelectorAll('.sf-item').forEach((el) =>
                el.classList.toggle('sf-selected', el.dataset.id === acc.id)
            );
            closeSfDropdown();
        });

        panel.appendChild(li);
    });

    // pre-select first (best match)
    if (ranked.length > 0) {
        const first = ranked[0].acc;
        smartFillSelectedId = first.id;
        if (labelEl) labelEl.textContent = totpAccountOptionLabel(first);
        panel.firstElementChild && panel.firstElementChild.classList.add('sf-selected');
    }
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openSfDropdown() {
    const d = document.getElementById('smart-fill-dropdown');
    const t = document.getElementById('smart-fill-trigger');
    if (!d || !t) return;
    d.setAttribute('aria-expanded', 'true');
    if (t) t.setAttribute('aria-expanded', 'true');
}

function closeSfDropdown() {
    const d = document.getElementById('smart-fill-dropdown');
    const t = document.getElementById('smart-fill-trigger');
    if (!d) return;
    d.setAttribute('aria-expanded', 'false');
    if (t) t.setAttribute('aria-expanded', 'false');
}

function fillOtpInActiveTab(code, opts) {
    const c = String(code);
    const closeOnSuccess = !opts || opts.closeOnSuccess !== false;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0] && tabs[0].id;
        if (tabId == null) {
            debugMsg('无法获取当前标签页');
            return;
        }
        injectOtpDomFillAllFrames(tabId, () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
                debugMsg('填入失败：' + msg);
                alert(
                    '无法注入页面：' +
                        msg +
                        '\n（chrome:// 等特殊地址不支持扩展脚本；普通网页请刷新后再试。）'
                );
                return;
            }
            chrome.scripting.executeScript(
                {
                    target: { tabId, allFrames: true },
                    func: (x) =>
                        typeof globalThis._cctoolsOtpFill === 'function'
                            ? globalThis._cctoolsOtpFill(x)
                            : { ok: false, error: '验证码模块缺失，请刷新页面后重试' },
                    args: [c],
                },
                (results) => {
                    if (chrome.runtime.lastError) {
                        const msg = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
                        debugMsg('填入失败：' + msg);
                        alert(
                            '无法注入页面：' +
                                msg +
                                '\n（chrome:// 等特殊地址不支持扩展脚本；普通网页请刷新后再试。）'
                        );
                        return;
                    }
                    const ok = results && results.some((r) => r && r.result && r.result.ok);
                    if (ok) {
                        debugMsg('已填入验证码');
                        if (closeOnSuccess) window.close();
                        return;
                    }
                    const errObj =
                        results && results.map((r) => r && r.result).find((x) => x && !x.ok && x.error);
                    const msg =
                        (errObj && errObj.error) ||
                        '未找到验证码框。可先点击页面上的输入框再点「填入」，或使用「复制」后手动粘贴。';
                    debugMsg(msg);
                    alert(msg);
                }
            );
        });
    });
}

function isTotpPaneVisible() {
    const p = document.getElementById('pane-totp');
    return p && !p.hidden;
}

document.addEventListener('DOMContentLoaded', () => {
    smartFillAutoRoutedToUnlock = false;
    const paneTools = document.getElementById('pane-tools');
    const paneTotp = document.getElementById('pane-totp');
    document.querySelectorAll('.app-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const name = tab.getAttribute('data-tab');
            document.querySelectorAll('.app-tab').forEach((t) => {
                t.classList.toggle('is-active', t === tab);
                t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            });
            if (name === 'tools') {
                if (paneTools) {
                    paneTools.hidden = false;
                    paneTools.setAttribute('aria-hidden', 'false');
                }
                if (paneTotp) {
                    paneTotp.hidden = true;
                    paneTotp.setAttribute('aria-hidden', 'true');
                }
                stopTotpTicker();
                void updateSmartFillBar();
            } else if (name === 'totp') {
                if (paneTools) {
                    paneTools.hidden = true;
                    paneTools.setAttribute('aria-hidden', 'true');
                }
                if (paneTotp) {
                    paneTotp.hidden = false;
                    paneTotp.setAttribute('aria-hidden', 'false');
                }
                openTotpPanelFlow();
            }
        });
    });

    const btnAdd = document.getElementById('totp-add-btn');
    const listEl = document.getElementById('totp-list');
    const btnUnlock = document.getElementById('totp-unlock-btn');
    const btnLockSession = document.getElementById('totp-lock-session-btn');
    const btnBatch = document.getElementById('totp-batch-import');

    if (btnUnlock) {
        btnUnlock.addEventListener('click', async () => {
            const pwdEl = document.getElementById('totp-master-pwd');
            const errEl = document.getElementById('totp-unlock-err');
            const pwd = pwdEl ? pwdEl.value : '';
            if (errEl) errEl.textContent = '';
            try {
                await unlockWithPassword(pwd);
                setTotpUiLocked(false);
                renderTotpList();
                startTotpTicker();
                void updateTotpSessionHint();
                debugMsg('已解锁身份验证器');
                void updateSmartFillBar();
            } catch (e) {
                if (errEl) errEl.textContent = e.message || '解锁失败';
            }
        });
    }
    // 回车自动提交解锁（避免用户必须点按钮）
    const pwdInput = document.getElementById('totp-master-pwd');
    if (pwdInput && btnUnlock) {
        pwdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnUnlock.click();
            }
        });
    }

    if (btnLockSession) {
        btnLockSession.addEventListener('click', async () => {
            await lockTotpSession();
            debugMsg('已锁定身份验证器');
        });
    }

    const pwdSaveBtn = document.getElementById('totp-pwd-save');
    const pwdMsgEl = document.getElementById('totp-pwd-msg');
    if (pwdSaveBtn) {
        pwdSaveBtn.addEventListener('click', async () => {
            const curEl = document.getElementById('totp-pwd-current');
            const n1El = document.getElementById('totp-pwd-new');
            const n2El = document.getElementById('totp-pwd-new2');
            if (pwdMsgEl) {
                pwdMsgEl.textContent = '';
                pwdMsgEl.className = '';
            }
            try {
                await changeTotpMasterPassword(
                    curEl ? curEl.value : '',
                    n1El ? n1El.value : '',
                    n2El ? n2El.value : ''
                );
                if (curEl) curEl.value = '';
                if (n1El) n1El.value = '';
                if (n2El) n2El.value = '';
                if (pwdMsgEl) {
                    pwdMsgEl.textContent = '已更新管理密码';
                    pwdMsgEl.className = 'is-ok';
                }
                const pwdWrap = document.getElementById('totp-pwd-change-wrap');
                if (pwdWrap) pwdWrap.open = false;
                void updateTotpSessionHint();
            } catch (e) {
                if (pwdMsgEl) {
                    pwdMsgEl.textContent = e.message || '保存失败';
                    pwdMsgEl.className = 'is-err';
                }
            }
        });
    }

    if (btnAdd) {
        btnAdd.addEventListener('click', async () => {
            if (!totpSessionCryptoKey) {
                alert('请先解锁身份验证器');
                return;
            }
            let name = document.getElementById('totp-add-name').value.trim();
            const raw = document.getElementById('totp-add-secret').value.trim();
            if (!raw) {
                alert('请输入密钥（Base32）或完整的 otpauth:// 链接');
                return;
            }
            let digits = 6;
            let period = 30;
            let secret = '';
            let issuer = '';
            if (raw.toLowerCase().startsWith('otpauth-migration://')) {
                const mig = TOTP.parseGoogleMigrationInput(raw);
                if (mig.stats.migrationUris === 0) {
                    alert(
                        mig.stats.parseErrors
                            ? '迁移数据解析失败，请确认粘贴完整（含 data= 后整段 Base64，勿缺字符）'
                            : '未识别为 otpauth-migration 链接'
                    );
                    return;
                }
                let added = 0;
                let skipped = 0;
                for (const p of mig.accounts) {
                    if (pushTotpAccountUnique(p)) added++;
                    else skipped++;
                }
                try {
                    await persistTotpVault();
                    document.getElementById('totp-add-secret').value = '';
                    if (isTotpPaneVisible()) renderTotpList();
                    void updateSmartFillBar();
                    debugMsg('迁移导入：新增 ' + added + '，跳过 ' + skipped + '（重复或 HOTP/算法）');
                } catch (e) {
                    debugMsg('保存失败：' + (e.message || e));
                }
                return;
            }
            if (raw.toLowerCase().startsWith('otpauth://')) {
                const p = TOTP.parseOtpAuthUri(raw);
                if (!p) {
                    alert('无法解析 otpauth 链接，请检查格式');
                    return;
                }
                if (!name) name = p.name;
                secret = p.secret;
                digits = p.digits;
                period = p.period;
                issuer = p.issuer || '';
            } else {
                secret = raw.replace(/\s/g, '').toUpperCase();
                if (!name) {
                    alert('手动添加时请填写显示名称');
                    return;
                }
            }
            if (
                !pushTotpAccountUnique({
                    name: name || '未命名',
                    issuer,
                    secret,
                    digits,
                    period,
                })
            ) {
                alert('该密钥已存在');
                return;
            }
            try {
                await persistTotpVault();
                document.getElementById('totp-add-name').value = '';
                document.getElementById('totp-add-secret').value = '';
                if (isTotpPaneVisible()) {
                    renderTotpList();
                }
                void updateSmartFillBar();
                debugMsg('已添加身份验证帐号');
            } catch (e) {
                debugMsg('保存失败：' + (e.message || e));
            }
        });
    }

    if (btnBatch) {
        btnBatch.addEventListener('click', async () => {
            if (!totpSessionCryptoKey) {
                alert('请先解锁身份验证器');
                return;
            }
            const Tlib =
                typeof window !== 'undefined' && window.TOTP
                    ? window.TOTP
                    : typeof TOTP !== 'undefined'
                      ? TOTP
                      : null;
            if (!Tlib || typeof Tlib.parseGoogleMigrationInput !== 'function') {
                alert('TOTP 脚本未加载：请在 chrome://extensions 中点击本扩展的「重新加载」');
                debugMsg('window.TOTP 不可用');
                return;
            }
            const ta = document.getElementById('totp-batch-text');
            const outEl = document.getElementById('totp-batch-result');
            const text = ta ? ta.value : '';
            let mig;
            try {
                mig = Tlib.parseGoogleMigrationInput(text);
            } catch (e) {
                debugMsg('parseGoogleMigrationInput 异常：' + (e && e.message ? e.message : e));
                mig = {
                    accounts: [],
                    stats: {
                        migrationUris: 0,
                        migrationLinksFound: 0,
                        parseErrors: 1,
                        skippedHotp: 0,
                        skippedAlgo: 0,
                        skippedNoSecret: 0,
                    },
                };
            }
            let added = 0;
            let skipped = 0;
            for (const p of mig.accounts) {
                if (pushTotpAccountUnique(p)) added++;
                else skipped++;
            }
            const uris = Tlib.extractOtpAuthUris(text);
            for (const uri of uris) {
                const p = Tlib.parseOtpAuthUri(uri);
                if (!p) {
                    skipped++;
                    continue;
                }
                if (pushTotpAccountUnique(p)) added++;
                else skipped++;
            }
            try {
                await persistTotpVault();
                renderTotpList();
                void updateSmartFillBar();
                if (outEl) {
                    const parts = [
                        '成功 ' + added + ' 条',
                        '跳过 ' + skipped + ' 条（重复/无法解析/HOTP/非 SHA1）',
                    ];
                    if (mig.stats.migrationUris) {
                        parts.push(
                            '迁移包解码 ' +
                                mig.stats.migrationUris +
                                ' 个' +
                                (mig.stats.skippedHotp ? '，HOTP ' + mig.stats.skippedHotp : '') +
                                (mig.stats.skippedAlgo ? '，非 SHA1 ' + mig.stats.skippedAlgo : '') +
                                (mig.stats.parseErrors ? '，解码失败次数 ' + mig.stats.parseErrors : '')
                        );
                    }
                    outEl.textContent = parts.join('；');
                    if (!added && !mig.stats.migrationUris && !uris.length && text.trim()) {
                        if (mig.stats.migrationLinksFound > 0) {
                            outEl.textContent =
                                '已提取 ' +
                                mig.stats.migrationLinksFound +
                                ' 条迁移链接，但 Base64/Protobuf 解码失败。请右键扩展弹窗 → 检查 → Console，查看 [TOTP migration]。并在 chrome://extensions 对本扩展点「重新加载」后再试。';
                        } else {
                            outEl.textContent =
                                '未识别到 otpauth://totp/ 或 otpauth-migration://（或 data=Ck…）。请粘贴从 otpauth-migration 到行尾的一整段连续字符，勿只复制半截。';
                        }
                    }
                }
                debugMsg('批量导入完成');
            } catch (e) {
                if (outEl) outEl.textContent = '保存失败';
                debugMsg('批量导入保存失败：' + (e.message || e));
            }
        });
    }

    if (listEl) {
        listEl.addEventListener('click', async (ev) => {
            const row = ev.target.closest('.totp-row');
            const del = ev.target.closest('.totp-del');
            const copy = ev.target.closest('.totp-copy');
            const fill = ev.target.closest('.totp-fill');

            if (del) {
                ev.stopPropagation();
                if (!totpSessionCryptoKey) return;
                const id = del.getAttribute('data-id');
                const acc = getTotpAccountById(id);
                const label = acc ? totpAccountOptionLabel(acc) : '该帐号';
                if (!confirm(`确认删除：${label}？此操作不可撤销。`)) return;
                totpAccounts = totpAccounts.filter((a) => a.id !== id);
                if (selectedTotpId === id) selectedTotpId = null;
                try {
                    await persistTotpVault();
                    renderTotpList();
                    void updateSmartFillBar();
                    debugMsg('已删除帐号');
                } catch (e) {
                    debugMsg('保存失败：' + (e.message || e));
                }
                return;
            }
            if (copy) {
                ev.stopPropagation();
                const acc = getTotpAccountById(copy.getAttribute('data-id'));
                const code = await getCodeForAccount(acc);
                if (code) {
                    navigator.clipboard.writeText(code).catch(() => {});
                    debugMsg('已复制验证码');
                }
                return;
            }
            if (fill) {
                ev.stopPropagation();
                const acc = getTotpAccountById(fill.getAttribute('data-id'));
                const code = await getCodeForAccount(acc);
                if (!code) {
                    debugMsg('无法生成验证码');
                    return;
                }
                fillOtpInActiveTab(code, { closeOnSuccess: true });
                return;
            }
            if (row && row.getAttribute('data-id')) {
                selectedTotpId = row.getAttribute('data-id');
                document.querySelectorAll('.totp-row.is-selected').forEach((el) => el.classList.remove('is-selected'));
                row.classList.add('is-selected');
            }
        });

        listEl.addEventListener('dblclick', (ev) => {
            const nameSpan = ev.target.closest('.totp-row-name');
            if (!nameSpan) return;
            const row = nameSpan.closest('.totp-row');
            if (!row || !totpSessionCryptoKey) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (row.querySelector('.totp-row-name-input')) return;
            const id = row.getAttribute('data-id');
            const acc = getTotpAccountById(id);
            if (!acc) return;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'totp-row-name-input';
            input.value = acc.name;
            input.setAttribute('autocomplete', 'off');
            nameSpan.replaceWith(input);
            input.focus();
            input.select();
            let finished = false;
            const finish = async (save) => {
                if (finished) return;
                finished = true;
                const span = document.createElement('span');
                span.className = 'totp-row-name';
                span.title = '双击修改名称';
                if (save) {
                    const newName = input.value.trim();
                    if (newName && newName !== acc.name) {
                        acc.name = newName;
                        try {
                            await persistTotpVault();
                            void updateSmartFillBar();
                        } catch (e) {
                            debugMsg('保存失败：' + (e.message || e));
                        }
                    }
                }
                span.textContent = acc.name;
                input.replaceWith(span);
                row.title = (acc.issuer ? acc.issuer + ' — ' : '') + acc.name;
            };
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void finish(true);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    void finish(false);
                }
            });
            input.addEventListener('blur', () => {
                void finish(true);
            });
        });
    }

    const smartFillBtn = document.getElementById('smart-fill-btn');
    if (smartFillBtn) {
        smartFillBtn.addEventListener('click', async () => {
            const id = smartFillSelectedId;
            const acc = getTotpAccountById(id);
            const code = await getCodeForAccount(acc);
            if (!code) {
                alert('无法生成验证码');
                return;
            }
            fillOtpInActiveTab(code, { closeOnSuccess: true });
        });
    }

    // custom dropdown trigger
    const sfTrigger = document.getElementById('smart-fill-trigger');
    if (sfTrigger) {
        sfTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = document.getElementById('smart-fill-dropdown');
            const isOpen = d && d.getAttribute('aria-expanded') === 'true';
            if (isOpen) closeSfDropdown(); else openSfDropdown();
        });
    }
    // close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const d = document.getElementById('smart-fill-dropdown');
        if (d && !d.contains(e.target)) closeSfDropdown();
    });

    const smartFillGotoTotp = document.getElementById('smart-fill-goto-totp');
    if (smartFillGotoTotp) {
        smartFillGotoTotp.addEventListener('click', () => {
            const t = document.getElementById('tab-totp');
            if (t) t.click();
        });
    }

    void (async () => {
        await maybeRestoreTotpSessionForPopup();
        updateSmartFillBar();
    })();
});
