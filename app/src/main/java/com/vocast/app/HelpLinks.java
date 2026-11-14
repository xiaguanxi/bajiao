package com.vocast.app;

/** Fixed official help destinations; never navigate the privileged WebView off-app. */
final class HelpLinks {
    static String url(String id) {
        switch(id) {
            case "keys": return "https://platform.xiaomimimo.com/#/console/api-keys";
            case "account": return "https://id.mi.com/";
            case "docs": return "https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call";
            case "pricing": return "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go";
            default: throw new IllegalArgumentException("未知的帮助链接");
        }
    }
}
