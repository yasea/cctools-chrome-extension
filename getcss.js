function analyzeCSSUsage(targetElement = document.body, includeAllStates = true) {
    if (!(targetElement instanceof HTMLElement)) {
        throw new Error('targetElement must be a valid HTML Element');
    }

    const pseudoClasses = [':hover', ':active', ':focus', ':visited', ':link'];

    function getAllStyleSheets() {
        return Array.from(document.styleSheets).filter(styleSheet => {
            try {
                return styleSheet.cssRules;
            } catch (e) {
                console.warn('Cannot access stylesheet:', e);
                return false;
            }
        });
    }

    function expandSelector(selector) {
        const variants = [selector];
        if (includeAllStates) {
            pseudoClasses.forEach(pseudoClass => {
                variants.push(selector + pseudoClass);
            });
        }
        return variants;
    }

    function isSelectorUsed(selector) {
        try {
            document.querySelector(selector.replace(/::?[\w-]+/g, ''));
            const expandedSelectors = expandSelector(selector);
            return expandedSelectors.some(sel => {
                try {
                    return targetElement.matches(sel) || targetElement.querySelector(sel);
                } catch {
                    return false;
                }
            });
        } catch (e) {
            console.warn('Invalid selector:', selector);
            return false;
        }
    }

    function isAnimationUsed(animationName) {
        const elements = [targetElement, ...targetElement.querySelectorAll('*')];
        return elements.some(element => {
            const styles = window.getComputedStyle(element);
            return styles.animationName.split(',').some(name => name.trim() === animationName);
        });
    }

    function extractComputedStyles(element) {
        const styles = window.getComputedStyle(element);
        const computedStyles = {};
        for (let i = 0; i < styles.length; i++) {
            const property = styles[i];
            computedStyles[property] = styles.getPropertyValue(property);
        }
        return computedStyles;
    }

    function extractUsedFonts() {
        const fonts = new Set();
        const elements = [targetElement, ...targetElement.querySelectorAll('*')];
        elements.forEach(element => {
            const styles = window.getComputedStyle(element);
            if (styles.fontFamily) fonts.add(styles.fontFamily);
        });
        return Array.from(fonts);
    }

    function processRule(rule, parentMediaQuery = null) {
        if (rule instanceof CSSMediaRule) {
            const mediaRules = [];
            Array.from(rule.cssRules).forEach(r => {
                const processed = processRule(r, rule.conditionText);
                if (processed) {
                    mediaRules.push(processed);
                }
            });
            return mediaRules.length > 0 ? {
                type: 'media',
                mediaText: parentMediaQuery || rule.conditionText,
                rules: mediaRules
            } : null;
        }

        if (rule instanceof CSSStyleRule) {
            const selectors = rule.selectorText.split(',').map(s => s.trim());
            const usedSelectors = selectors.filter(isSelectorUsed);
            if (usedSelectors.length > 0) {
                return {
                    type: 'style',
                    selectors: usedSelectors,
                    styles: rule.style.cssText,
                    mediaQuery: parentMediaQuery
                };
            }
        }

        if (rule instanceof CSSKeyframesRule) {
            if (isAnimationUsed(rule.name)) {
                return {
                    type: 'keyframes',
                    name: rule.name,
                    rules: Array.from(rule.cssRules).map(r => ({
                        keyText: r.keyText,
                        styles: r.style.cssText
                    }))
                };
            }
        }

        if (rule instanceof CSSFontFaceRule) {
            return {
                type: 'font-face',
                fontFamily: rule.style.getPropertyValue('font-family'),
                src: rule.style.getPropertyValue('src'),
                style: rule.cssText
            };
        }

        return null;
    }

    function generateCSS(rules) {
        let css = '';
        rules.forEach(rule => {
            if (rule.type === 'style') {
                css += `${rule.mediaQuery ? `@media ${rule.mediaQuery} {\n  ` : ''}${rule.selectors.join(', ')} { ${rule.styles} }${rule.mediaQuery ? '\n}' : ''}\n`;
            } else if (rule.type === 'media') {
                css += generateCSS(rule.rules);
            } else if (rule.type === 'keyframes') {
                css += `@keyframes ${rule.name} {\n`;
                rule.rules.forEach(keyframe => {
                    css += `  ${keyframe.keyText} { ${keyframe.styles} }\n`;
                });
                css += '}\n';
            } else if (rule.type === 'font-face') {
                css += `${rule.style}\n`;
            }
        });
        return css;
    }

    function analyze() {
        const styleSheets = getAllStyleSheets();
        const allRules = [];
        const fontFaceRules = [];

        styleSheets.forEach(sheet => {
            Array.from(sheet.cssRules).forEach(rule => {
                const processed = processRule(rule);
                if (processed) {
                    if (processed.type === 'font-face') {
                        fontFaceRules.push(processed);
                    } else if (Array.isArray(processed)) {
                        allRules.push(...processed);
                    } else {
                        allRules.push(processed);
                    }
                }
            });
        });

        const computedStyles = extractComputedStyles(targetElement);
        const optimizedCSS = generateCSS([...allRules, ...fontFaceRules]);
        const usedFonts = extractUsedFonts();

        const result = {
            css: optimizedCSS,
            computedStyles: computedStyles,
            fonts: usedFonts,
            fontFaces: fontFaceRules,
            embeddedStyles: Array.from(document.querySelectorAll('style')).map(style => style.textContent.trim()),
            inlineStyles: Array.from(targetElement.querySelectorAll('*')).filter(el => el.style && el.style.length).map(el => ({
                element: el.tagName,
                style: el.style.cssText
            })),
            elementInfo: {
                tagName: targetElement.tagName,
                id: targetElement.id,
                classes: Array.from(targetElement.classList)
            }
        };

        console.log(`=== CSS Analysis for ${targetElement.tagName}#${targetElement.id} ===`);
        console.log(result);
        return result.css;
    }

    return analyze();
}
