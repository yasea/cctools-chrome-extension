/**
 * OTP 填入：供 content script 与 chrome.scripting.executeScript 共用。
 * 暴露 globalThis._cctoolsOtpFill(code) → { ok, error? }
 */
(function () {
    'use strict';

    function isVisible(el) {
        if (!el || el.disabled) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function visitNodeAndShadow(node, visitor) {
        if (!node) return;
        visitor(node);
        if (node.shadowRoot) {
            visitNodeAndShadow(node.shadowRoot, visitor);
        }
        const kids = node.children;
        if (!kids) return;
        for (let i = 0; i < kids.length; i++) {
            visitNodeAndShadow(kids[i], visitor);
        }
    }

    /** @param {string} selector */
    function queryDeepSelectorAll(selector) {
        const out = [];
        try {
            visitNodeAndShadow(document.documentElement, (node) => {
                if (node.nodeType !== 1) return;
                try {
                    if (node.matches(selector)) out.push(node);
                } catch (e) {
                    /* 选择器在极旧环境无效 */
                }
            });
        } catch (e) {
            /* ignore */
        }
        return out;
    }

    function getDeepInputs() {
        const out = [];
        visitNodeAndShadow(document.documentElement, (node) => {
            if (node.nodeName === 'INPUT') out.push(node);
        });
        return out;
    }

    function otpHintRegex() {
        return /code|验证码|otp|2fa|mfa|认证|动态|口令|安全码|验证|pin/i;
    }

    function tryActiveOtpInput() {
        let el = document.activeElement;
        if (!el || el.nodeName !== 'INPUT') return null;
        if (!isVisible(el) || el.disabled) return null;
        const t = (el.type || 'text').toLowerCase();
        if (!['text', 'tel', 'number', 'password'].includes(t) && t !== '') return null;
        const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        const nm = ((el.name || '') + (el.id || '') + (el.getAttribute('aria-label') || '')).toLowerCase();
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        if (ac === 'one-time-code') return el;
        if (ml >= 6 && ml <= 10 && (otpHintRegex().test(ph) || otpHintRegex().test(nm))) return el;
        if (ml >= 6 && ml <= 10 && /otp|totp|2fa|mfa|verify|auth|token|pin/.test(nm)) return el;
        const idL = (el.id || '').toLowerCase();
        const nameL = (el.name || '').toLowerCase();
        if (
            idL === 'code' ||
            nameL === 'code' ||
            idL === 'otp' ||
            nameL === 'otp' ||
            idL === 'totp' ||
            nameL === 'totp'
        )
            return el;
        return null;
    }

    /** 常见单字段验证码：id/name 为 code、otp 等（可无 maxlength） */
    function findGenericCodeField() {
        const selectors = [
            'input#code',
            'input[id="code"]',
            'input[name="code"]',
            'input#otp',
            'input[id="otp"]',
            'input[name="otp"]',
            'input#totp',
            'input[id="totp"]',
            'input[name="totp"]',
            'input[id="verificationCode"]',
            'input[name="verificationCode"]',
            'input[id="verification-code"]',
            'input[name="verification-code"]',
        ];
        function okType(el) {
            const t = (el.type || 'text').toLowerCase();
            return ['text', 'tel', 'number', 'password'].includes(t) || t === '';
        }
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el && okType(el) && isVisible(el) && !el.disabled) return el;
            } catch (e) {
                /* ignore */
            }
            let els;
            try {
                els = queryDeepSelectorAll(sel);
            } catch (e) {
                continue;
            }
            for (const el of els) {
                if (el && okType(el) && isVisible(el) && !el.disabled) return el;
            }
        }
        return null;
    }

    function findBySelectors() {
        const selectors = [
            'input[autocomplete="one-time-code"]',
            'input#code',
            'input[id="code"]',
            'input[name="code"]',
            'input#otp',
            'input[id="otp"]',
            'input[name="otp"]',
            'input[name*="otp" i]',
            'input[id*="otp" i]',
            'input[name*="totp" i]',
            'input[id*="totp" i]',
            'input[name*="2fa" i]',
            'input[id*="2fa" i]',
            'input[name*="mfa" i]',
            'input[id*="mfa" i]',
            'input[name*="verification" i]',
            'input[id*="verification" i]',
            'input[name*="verify" i][maxlength="6"]',
            'input[name*="code" i][maxlength="6"]',
            'input[id*="code" i][maxlength="6"]',
            'input[id*="verification-code" i]',
            'input[data-testid*="otp" i]',
            'input[name*="pin" i]',
            'input[id*="pin" i]',
            'input[inputmode="numeric"][maxlength="6"]',
            'input[inputmode="numeric"][maxlength="8"]',
            'input[type="password"][name*="otp" i]',
            'input[type="password"][id*="otp" i]',
            'input[type="password"][name*="code" i]',
            'input[type="password"][id*="code" i]',
            'input[type="password"][maxlength="6"]',
            'input[type="password"][maxlength="8"]',
        ];
        for (const sel of selectors) {
            try {
                const quick = document.querySelector(sel);
                if (quick && isVisible(quick) && !quick.disabled) return quick;
            } catch (e) {
                /* 可能不支持 i 标志等 */
            }
            let els;
            try {
                els = queryDeepSelectorAll(sel);
            } catch (e) {
                continue;
            }
            for (const el of els) {
                if (el && isVisible(el) && !el.disabled) return el;
            }
        }
        return null;
    }

    function findSplitOtpInputs() {
        const inputs = getDeepInputs().filter((el) => {
            if (!isVisible(el) || el.disabled) return false;
            const t = (el.type || 'text').toLowerCase();
            if (!['text', 'tel', 'number', 'password'].includes(t) && t !== '') return false;
            const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
            if (ml !== 1) return false;
            return true;
        });
        const groups = new Map();
        for (const el of inputs) {
            const form = typeof el.closest === 'function' ? el.closest('form') : null;
            const key = form || el.parentElement;
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(el);
        }
        for (const arr of groups.values()) {
            if (arr.length >= 6 && arr.length <= 8) {
                arr.sort((a, b) => {
                    const pos = a.compareDocumentPosition(b);
                    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                    return 0;
                });
                return arr;
            }
        }
        return null;
    }

    function findHeuristicSingle() {
        const plain = getDeepInputs().filter((el) => {
            const t = (el.type || 'text').toLowerCase();
            return ['text', 'tel', 'number', 'password'].includes(t) || t === '';
        });
        for (const el of plain) {
            if (!isVisible(el) || el.disabled) continue;
            const idL = (el.id || '').toLowerCase();
            const nameL = (el.name || '').toLowerCase();
            if (
                idL === 'code' ||
                nameL === 'code' ||
                idL === 'otp' ||
                nameL === 'otp' ||
                idL === 'totp' ||
                nameL === 'totp'
            )
                return el;
            const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
            if (ml < 6 || ml > 10) continue;
            const ph = (el.getAttribute('placeholder') || '').toLowerCase();
            if (otpHintRegex().test(ph)) return el;
            const nm = ((el.name || '') + (el.id || '') + (el.getAttribute('aria-label') || '')).toLowerCase();
            if (/code|otp|token|auth|verify|2fa|mfa|pin|totp/.test(nm)) return el;
        }
        for (const el of plain) {
            if (!isVisible(el) || el.disabled) continue;
            const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
            if (ml === 6 || ml === 8) return el;
        }
        return null;
    }

    function findContentEditableOtp() {
        const candidates = [];
        visitNodeAndShadow(document.documentElement, (node) => {
            if (node.nodeType !== 1) return;
            if (!node.isContentEditable) return;
            if (!isVisible(node)) return;
            const ml = parseInt(node.getAttribute('maxlength') || node.getAttribute('data-maxlength') || '0', 10);
            const hint =
                (node.getAttribute('aria-label') || '') +
                (node.getAttribute('data-testid') || '') +
                (node.className || '');
            if ((ml >= 6 && ml <= 10) || otpHintRegex().test(hint)) candidates.push(node);
        });
        return candidates.length ? candidates[0] : null;
    }

    function findOtpTarget() {
        const active = tryActiveOtpInput();
        if (active) return { kind: 'single', el: active };

        const sel = findBySelectors();
        if (sel) return { kind: 'single', el: sel };

        const genericCode = findGenericCodeField();
        if (genericCode) return { kind: 'single', el: genericCode };

        const split = findSplitOtpInputs();
        if (split) return { kind: 'split', inputs: split };

        const heur = findHeuristicSingle();
        if (heur) return { kind: 'single', el: heur };

        const ce = findContentEditableOtp();
        if (ce) return { kind: 'contenteditable', el: ce };

        return null;
    }

    function setNativeInputValue(el, value) {
        const proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
        if (proto) {
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && desc.set) {
                desc.set.call(el, value);
                return;
            }
        }
        el.value = value;
    }

    function prepareInput(el) {
        if (el.readOnly) {
            try {
                el.readOnly = false;
            } catch (e) {
                /* ignore */
            }
        }
    }

    function dispatchInputEvents(el, str) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        try {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: str, inputType: 'insertText' }));
        } catch (e) {
            /* InputEvent 在极旧环境可能不存在 */
        }
    }

    function fillSingle(el, code) {
        const str = String(code);
        prepareInput(el);
        el.focus();
        setNativeInputValue(el, str);
        dispatchInputEvents(el, str);
        try {
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: str.slice(-1) || 'Unidentified' }));
        } catch (e) {
            /* ignore */
        }
    }

    function fillSplit(inputs, code) {
        const digits = String(code).replace(/\D/g, '').split('');
        if (!digits.length) return;
        const n = Math.min(digits.length, inputs.length);
        for (let i = 0; i < inputs.length; i++) {
            const ch = i < n ? digits[i] : '';
            prepareInput(inputs[i]);
            inputs[i].focus();
            setNativeInputValue(inputs[i], ch);
            dispatchInputEvents(inputs[i], ch);
        }
        const last = inputs[inputs.length - 1];
        if (last) {
            last.focus();
            try {
                last.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: digits[n - 1] || 'Unidentified' }));
            } catch (e) {
                /* ignore */
            }
        }
    }

    function fillContentEditable(el, code) {
        const str = String(code);
        el.focus();
        el.textContent = str;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** 供弹窗判断当前 frame 是否可能出现验证码输入场景（与 findOtpTarget 一致） */
    function cctoolsDetectOtpPage() {
        return { likely: findOtpTarget() != null };
    }

    function cctoolsOtpFill(code) {
        const target = findOtpTarget();
        if (!target) {
            return { ok: false, error: '未找到验证码输入框' };
        }
        try {
            if (target.kind === 'single') {
                fillSingle(target.el, code);
            } else if (target.kind === 'split') {
                fillSplit(target.inputs, code);
            } else if (target.kind === 'contenteditable') {
                fillContentEditable(target.el, code);
            } else {
                return { ok: false, error: '内部错误' };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
        }
    }

    globalThis._cctoolsOtpFill = cctoolsOtpFill;
    globalThis._cctoolsDetectOtpPage = cctoolsDetectOtpPage;
})();
