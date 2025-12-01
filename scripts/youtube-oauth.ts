import { Client } from "../src";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * 简单的 OAuth 授权脚本：
 *
 * 用法（在 libs/youtubei 目录下）：
 *   npx tsx scripts/youtube-oauth.ts
 *
 * 流程：
 *   1. 运行上面的命令。
 *   2. 控制台会打印一个 URL 和一个代码，例如：
 *        [youtubei] Open https://www.google.com/device and enter XXX-XXX-XXX
 *   3. 在浏览器打开该 URL，登录你的 Google / YouTube 账号，输入代码并完成授权。
 *   4. 授权完成后，脚本会在控制台打印 accessToken / refreshToken 等信息。
 *   5. 请妥善保存 refreshToken（例如写入服务器环境变量：YOUTUBE_OAUTH_REFRESH_TOKEN）。
 */
async function main() {
    try {
        console.log("开始执行 YouTube OAuth 授权流程...");
        console.log("请按照提示在浏览器中打开指定链接并输入代码完成授权。\n");

        // 读取代理配置，与测试脚本保持一致
        const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

        const clientOptions: any = {
            youtubeClientOptions: { hl: "zh-CN", gl: "CN" },
            fetchOptions: {
                timeout: 30000,
            },
            oauth: {
                enabled: true,
            },
        };

        if (proxyUrl) {
            console.log(`使用代理: ${proxyUrl}`);
            console.log("提示: 可以通过环境变量 HTTP_PROXY 或 HTTPS_PROXY 设置代理");
            console.log();

            const proxyAgent = new HttpsProxyAgent(proxyUrl);
            clientOptions.fetchOptions.agent = proxyAgent;
        } else {
            console.log("未配置 HTTP_PROXY/HTTPS_PROXY，直接连接 YouTube（无代理）");
            console.log("提示: 如果需要使用代理，请设置环境变量 HTTP_PROXY 或 HTTPS_PROXY");
            console.log();
        }

        // 通过 Client 触发 OAuth 授权流程（参考官方文档）
        const youtube = new Client(clientOptions);

        console.log("即将触发 OAuth 授权，请根据终端提示在浏览器中完成登录与授权...");
        // 调用任意需要访问接口的方法来触发 OAuth 设备码流程
        // 使用一个公共视频 ID 即可
        await youtube.getVideo("dQw4w9WgXcQ");

        console.log("\n=== OAuth 授权完成 ===");
        console.log("完整 OAuth 状态（请勿在公共环境泄露）:");
        console.log(JSON.stringify({
            accessToken: youtube.oauth.token,
            expiresAt: youtube.oauth.expiresAt,
            refreshToken: youtube.oauth.refreshToken,
        }, null, 2));

        if (youtube.oauth.refreshToken) {
            console.log("\n=== 重要：Refresh Token ===");
            console.log(youtube.oauth.refreshToken);
            console.log("\n请将该 refreshToken 安全地保存到服务器环境变量，例如：");
            console.log('  export YOUTUBE_OAUTH_REFRESH_TOKEN="' + youtube.oauth.refreshToken + '"');
            console.log("\n然后在服务器上重启后端服务，即可让 youtubei 使用登录态访问 YouTube。");
        } else {
            console.warn("\n警告：未从 OAuth 状态中获取到 refreshToken，请检查授权流程是否正确完成。");
        }
    } catch (error) {
        console.error("OAuth 授权流程失败:", error);
        process.exit(1);
    }
}

main();


