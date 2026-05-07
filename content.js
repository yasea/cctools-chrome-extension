// content.js  页面加载中自动处理程序
(function () {
    // 配置要填入的密码值
    const PASSWORD_TO_FILL_KEY1 = "1jd831";
    const PASSWORD_TO_FILL_KEY2 = "473*fb";

    function debugMsg(str) {
        if (console) {
            console.log(str);
        }
    }

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.action === "fillOtp" && msg.code) {
            const fn = globalThis._cctoolsOtpFill;
            sendResponse(
                typeof fn === "function"
                    ? fn(msg.code)
                    : { ok: false, error: "验证码填入模块未加载" }
            );
            return true;
        }
        return false;
    });
    // 密码管理系统自动填写密码 
    function ccInitPageContent() {
        current_url = window.location.href;
        debugMsg(current_url);
        // 密码管理系统
        if(current_url.indexOf("mm.lefux.net/password/UpdatePwd.cfm") >0){
            debugMsg("自动填充管理密码.");
            const passwordInput1 = document.querySelector('input[name="KeyA"][id="KeyA"][type="password"]');
            const passwordInput2 = document.querySelector('input[name="KeyB"][id="KeyB"][type="password"]');
            if (passwordInput1) {
                passwordInput1.value = PASSWORD_TO_FILL_KEY1;
            }
            if (passwordInput2) {
                passwordInput2.value = PASSWORD_TO_FILL_KEY2;
            }            
        } 
        // 110.35宿主机
        if(current_url.indexOf("172.16.110.35:8006") > 0){
            const passwordInput1 = document.querySelector('input[id="textfield-1068-inputEl"][type="password"]');
            if (passwordInput1) {
                passwordInput1.value = "dalong35!e5GBxEnAJUde7Y*Sep";
            }
        } 
    }   
    // 当页面加载完成时执行检查
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ccInitPageContent);
    } else {
        ccInitPageContent();
    } 
    
})();


