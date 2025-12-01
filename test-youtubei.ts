import { HttpsProxyAgent } from "https-proxy-agent";
import { Client, LiveVideo, Video, VideoCompact, Channel } from "./src";

/**
 * 解析订阅者数量字符串为数字
 * 支持格式：
 * - 中文: "247万位订阅者", "1.2万位订阅者", "5000位订阅者", "247万"
 * - 英文: "2.47M subscribers", "1.2K subscribers", "5000 subscribers", "2.47M"
 */
function parseSubscriberCount(subscriberCountStr: string | undefined): number | null {
    if (!subscriberCountStr) {
        return null;
    }

    // 移除常见后缀（中文和英文）
    let cleaned = subscriberCountStr.trim()
        .replace(/(位订阅者|subscribers?|订阅者)/gi, '')
        .trim();

    // 匹配数字和单位
    // 中文格式: "247万", "1.2万", "5000", "247.5万"
    // 英文格式: "2.47M", "1.2K", "5000", "2.47M"
    const chineseMatch = cleaned.match(/^([\d.]+)([万千亿])?/);
    const englishMatch = cleaned.match(/^([\d.]+)([KM])?/i);

    let number: number;
    let multiplier: number = 1;

    if (chineseMatch) {
        number = parseFloat(chineseMatch[1]);
        const unit = chineseMatch[2];
        if (unit === '万') {
            multiplier = 10000;
        } else if (unit === '千') {
            multiplier = 1000;
        } else if (unit === '亿') {
            multiplier = 100000000;
        }
    } else if (englishMatch) {
        number = parseFloat(englishMatch[1]);
        const unit = englishMatch[2]?.toUpperCase();
        if (unit === 'K') {
            multiplier = 1000;
        } else if (unit === 'M') {
            multiplier = 1000000;
        } else if (unit === 'B') {
            multiplier = 1000000000;
        }
    } else {
        // 尝试直接解析数字
        const numMatch = cleaned.match(/[\d.]+/);
        if (numMatch) {
            number = parseFloat(numMatch[0]);
        } else {
            return null;
        }
    }

    if (isNaN(number)) {
        return null;
    }

    return Math.round(number * multiplier);
}

/**
 * 格式化 Continuable 对象信息
 */
function formatContinuableInfo(continuable: any, name: string): string {
    const lines: string[] = [];
    lines.push(`\n  ${name} (Continuable):`);

    if (!continuable) {
        lines.push(`    [对象不存在]`);
        return lines.join("\n");
    }

    // 基本信息
    if (continuable.items !== undefined) {
        lines.push(`    已加载项目数: ${Array.isArray(continuable.items) ? continuable.items.length : 'N/A'}`);
    }

    if (continuable.continuation !== undefined) {
        if (continuable.continuation === null) {
            lines.push(`    continuation: null (无更多数据)`);
        } else if (continuable.continuation === '') {
            lines.push(`    continuation: "" (空字符串)`);
        } else {
            const contStr = String(continuable.continuation);
            lines.push(`    continuation: ${contStr.substring(0, 50)}${contStr.length > 50 ? '...' : ''} (有更多数据)`);
        }
    }

    // 显示前几个项目的信息
    if (Array.isArray(continuable.items) && continuable.items.length > 0) {
        lines.push(`\n    前 ${Math.min(3, continuable.items.length)} 个项目:`);
        continuable.items.slice(0, 3).forEach((item: any, index: number) => {
            lines.push(`      [${index + 1}]`);
            if (item && typeof item === 'object') {
                if (item.id !== undefined) lines.push(`        ID: ${item.id}`);
                if (item.title !== undefined) {
                    const title = String(item.title);
                    lines.push(`        标题: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
                }
                if (item.channel?.name !== undefined) {
                    lines.push(`        频道: ${item.channel.name}`);
                }
            } else {
                lines.push(`        ${JSON.stringify(item).substring(0, 100)}`);
            }
        });

        if (continuable.items.length > 3) {
            lines.push(`      ... 还有 ${continuable.items.length - 3} 个项目`);
        }
    } else if (Array.isArray(continuable.items)) {
        lines.push(`    项目列表: [空数组]`);
    }

    // 其他属性
    const continuableProps = ['items', 'continuation', 'client'];
    const otherProps = Object.getOwnPropertyNames(continuable).filter(
        prop => !continuableProps.includes(prop) && !prop.startsWith('_')
    );

    if (otherProps.length > 0) {
        lines.push(`\n    其他属性: ${otherProps.join(', ')}`);
    }

    return lines.join("\n");
}

/**
 * 格式化频道信息用于显示
 */
function formatChannelInfo(channel: Channel | any): string {
    if (!channel) {
        return "❌ 无法获取频道信息";
    }

    const lines: string[] = [];
    lines.push("📺 频道详细信息:");
    lines.push("=".repeat(60));

    // 基本属性
    if (channel.id !== undefined) lines.push(`  频道 ID: ${channel.id}`);
    if (channel.name !== undefined) lines.push(`  频道名称: ${channel.name}`);
    if (channel.handle !== undefined) lines.push(`  句柄 (Handle): ${channel.handle}`);
    if (channel.url !== undefined) lines.push(`  频道 URL: ${channel.url}`);

    // Tags（检查 Channel 是否有 tags 属性）
    if ('tags' in channel) {
        if (channel.tags && Array.isArray(channel.tags) && channel.tags.length > 0) {
            lines.push(`  标签: ${channel.tags.join(", ")}`);
        } else {
            lines.push(`  标签: 无标签`);
        }
    } else {
        lines.push(`  标签: [不支持] (Channel 类没有 tags 属性)`);
    }

    // 描述
    if (channel.description !== undefined) {
        const desc = channel.description || "(无描述)";
        const descPreview = desc.length > 200 ? desc.substring(0, 200) + "..." : desc;
        lines.push(`  描述: ${descPreview}`);
        lines.push(`  描述长度: ${desc.length} 字符`);
    }

    // 统计数据
    if (channel.subscriberCount !== undefined) {
        const subscriberCountStr = channel.subscriberCount;
        const subscriberCountNum = parseSubscriberCount(subscriberCountStr);

        if (subscriberCountNum !== null) {
            lines.push(`  订阅者数: ${subscriberCountStr} (解析为: ${subscriberCountNum.toLocaleString()})`);
        } else {
            lines.push(`  订阅者数: ${subscriberCountStr} (无法解析)`);
        }
    }
    if (channel.videoCount !== undefined) {
        lines.push(`  视频数: ${channel.videoCount}`);
    }

    // 缩略图
    if (channel.thumbnails !== undefined) {
        lines.push(`\n  缩略图:`);
        if (channel.thumbnails && typeof channel.thumbnails === 'object') {
            try {
                const thumbnailsStr = JSON.stringify(channel.thumbnails, null, 4);
                lines.push(thumbnailsStr.substring(0, 500) + (thumbnailsStr.length > 500 ? '\n  ...' : ''));
            } catch (e) {
                lines.push(`    [无法序列化]`);
            }
        }
    }

    // Banner
    if (channel.banner !== undefined) {
        lines.push(`\n  Banner:`);
        if (channel.banner && typeof channel.banner === 'object') {
            try {
                const bannerStr = JSON.stringify(channel.banner, null, 4);
                lines.push(bannerStr.substring(0, 500) + (bannerStr.length > 500 ? '\n  ...' : ''));
            } catch (e) {
                lines.push(`    [无法序列化]`);
            }
        }
    }

    if (channel.mobileBanner !== undefined) {
        lines.push(`\n  Mobile Banner:`);
        try {
            const mobileBannerStr = JSON.stringify(channel.mobileBanner, null, 4);
            lines.push(mobileBannerStr.substring(0, 300) + (mobileBannerStr.length > 300 ? '\n  ...' : ''));
        } catch (e) {
            lines.push(`    [无法序列化]`);
        }
    }

    if (channel.tvBanner !== undefined) {
        lines.push(`\n  TV Banner:`);
        try {
            const tvBannerStr = JSON.stringify(channel.tvBanner, null, 4);
            lines.push(tvBannerStr.substring(0, 300) + (tvBannerStr.length > 300 ? '\n  ...' : ''));
        } catch (e) {
            lines.push(`    [无法序列化]`);
        }
    }

    // Shelves
    if (channel.shelves !== undefined && Array.isArray(channel.shelves)) {
        lines.push(`\n  Shelves 数量: ${channel.shelves.length}`);
        channel.shelves.forEach((shelf: any, index: number) => {
            lines.push(`    Shelf ${index + 1}: ${shelf.title || '无标题'}`);
        });
    }

    // Continuable 对象（videos, playlists, shorts, live, posts）
    if (channel.videos !== undefined) {
        lines.push(formatContinuableInfo(channel.videos, "Videos"));
    }
    if (channel.playlists !== undefined) {
        lines.push(formatContinuableInfo(channel.playlists, "Playlists"));
    }
    if (channel.shorts !== undefined) {
        lines.push(formatContinuableInfo(channel.shorts, "Shorts"));
    }
    if (channel.live !== undefined) {
        lines.push(formatContinuableInfo(channel.live, "Live"));
    }
    if (channel.posts !== undefined) {
        lines.push(formatContinuableInfo(channel.posts, "Posts"));
    }

    // 所有其他属性（通过遍历对象）
    lines.push(`\n  其他属性:`);
    const knownProps = ['id', 'name', 'handle', 'url', 'description', 'subscriberCount',
        'videoCount', 'thumbnails', 'banner', 'mobileBanner', 'tvBanner', 'shelves',
        'videos', 'playlists', 'shorts', 'live', 'posts', 'client', 'tags'];
    const allProps = Object.getOwnPropertyNames(channel);
    const otherProps = allProps.filter(key => !knownProps.includes(key) && !key.startsWith('_'));

    if (otherProps.length > 0) {
        otherProps.forEach(prop => {
            try {
                const value = (channel as any)[prop];
                if (value !== undefined && value !== null) {
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        const objKeys = Object.keys(value);
                        lines.push(`    ${prop}: [对象] 属性: ${objKeys.slice(0, 5).join(', ')}${objKeys.length > 5 ? '...' : ''}`);
                    } else if (Array.isArray(value)) {
                        lines.push(`    ${prop}: [数组] 长度: ${value.length}`);
                    } else if (typeof value === 'function') {
                        lines.push(`    ${prop}: [函数]`);
                    } else {
                        const strValue = String(value);
                        lines.push(`    ${prop}: ${strValue.substring(0, 100)}${strValue.length > 100 ? '...' : ''}`);
                    }
                }
            } catch (e) {
                lines.push(`    ${prop}: [无法访问: ${(e as Error).message}]`);
            }
        });
    } else {
        lines.push(`    (无其他可枚举属性)`);
    }

    // 打印完整 JSON（尝试序列化所有可序列化的属性）
    lines.push(`\n  完整 JSON 结构 (前2000字符):`);
    try {
        // 创建一个简化的对象用于 JSON 序列化
        const serializable: any = {};
        for (const key of knownProps) {
            if (key in channel && key !== 'videos' && key !== 'playlists' && key !== 'shorts' &&
                key !== 'live' && key !== 'posts' && key !== 'client') {
                try {
                    serializable[key] = (channel as any)[key];
                } catch (e) {
                    serializable[key] = '[无法序列化]';
                }
            }
        }
        const jsonStr = JSON.stringify(serializable, null, 2);
        lines.push(jsonStr.substring(0, 2000) + (jsonStr.length > 2000 ? '\n  ...' : ''));
    } catch (e) {
        lines.push(`    [无法序列化为 JSON: ${(e as Error).message}]`);
    }

    lines.push("=".repeat(60));
    return lines.join("\n");
}

/**
 * 格式化视频信息用于显示
 */
function formatVideoInfo(video: Video | LiveVideo | undefined): string {
    if (!video) {
        return "❌ 无法获取视频信息";
    }

    const info: Record<string, string> = {
        "视频 ID": video.id,
        "标题": video.title,
        "频道": video.channel?.name || "未知",
        "上传日期": video.uploadDate || "未知",
        "观看次数": video.viewCount ? video.viewCount.toLocaleString() : "隐藏",
        "点赞数": video.likeCount ? video.likeCount.toLocaleString() : "隐藏",
        "是否为直播": video.isLiveContent ? "是" : "否",
        "描述长度": video.description ? `${video.description.length} 字符` : "无",
    };

    // 添加 Tags（Video 类型有）
    if (video.tags && Array.isArray(video.tags) && video.tags.length > 0) {
        info["标签"] = video.tags.join(", ");
    } else if (video.tags !== undefined) {
        info["标签"] = "无标签";
    }

    // 添加评论数（仅 Video 类型有）
    if ("commentCount" in video) {
        info["评论数"] = video.commentCount !== null && video.commentCount !== undefined
            ? video.commentCount.toLocaleString()
            : "隐藏";
    }

    if ("duration" in video) {
        const minutes = Math.floor(video.duration / 60);
        const seconds = video.duration % 60;
        info["时长"] = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    return Object.entries(info)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");
}

/**
 * 测试获取视频数据
 */
async function testGetVideo() {
    console.log("正在初始化 YouTube 客户端...");

    // 代理配置：如果设置了环境变量则使用代理，否则直接连接（适用于服务器环境）
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    // OAuth 刷新令牌（可选）：用于在测试脚本中模拟服务端的 OAuth 行为
    const oauthRefreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

    let youtube: Client;

    if (proxyUrl) {
        console.log(`使用代理: ${proxyUrl}`);
        console.log("提示: 可以通过环境变量 HTTP_PROXY 或 HTTPS_PROXY 设置代理");
        console.log();

        // 创建代理 agent
        const proxyAgent = new HttpsProxyAgent(proxyUrl);

        youtube = new Client({
            youtubeClientOptions: { hl: "zh-CN", gl: "CN" },
            fetchOptions: {
                agent: proxyAgent,
                timeout: 30000,
            },
            oauth: oauthRefreshToken
                ? {
                    enabled: true,
                    refreshToken: oauthRefreshToken,
                }
                : undefined,
        });
    } else {
        console.log("未配置 HTTP_PROXY/HTTPS_PROXY，直接连接 YouTube（无代理）");
        console.log("提示: 如果需要使用代理，请设置环境变量 HTTP_PROXY 或 HTTPS_PROXY");
        console.log();

        youtube = new Client({
            youtubeClientOptions: { hl: "zh-CN", gl: "CN" },
            fetchOptions: {
                timeout: 30000,
            },
            oauth: oauthRefreshToken
                ? {
                    enabled: true,
                    refreshToken: oauthRefreshToken,
                }
                : undefined,
        });
    }

    // 打印当前 OAuth 状态，方便在服务器上调试
    console.log("[DEBUG] OAuth 当前状态:", {
        token: youtube.oauth.token ? "[存在 accessToken]" : null,
        expiresAt: youtube.oauth.expiresAt,
        refreshToken: youtube.oauth.refreshToken ? "[存在 refreshToken]" : null,
    });

    console.log("=".repeat(60));
    console.log("YouTube 视频数据获取测试");
    console.log("=".repeat(60));
    console.log();

    // 使用命令行参数或默认 videoId
    const videoId = process.argv[2] || "KA5FmevAzTc";

    console.log(`📹 测试获取视频数据`);
    console.log(`   视频 ID: ${videoId}`);
    console.log("-".repeat(60));
    console.log();

    try {
        const video = await youtube.getVideo(videoId);

        if (video) {
            console.log("✅ 成功获取视频数据！");
            console.log();
            console.log(formatVideoInfo(video));

            // 打印频道全部信息
            if (video.channel) {
                console.log();
                console.log("=".repeat(60));
                console.log(formatChannelInfo(video.channel));
                console.log();
            }

            // 如果是 Video 类型，尝试获取第一页评论
            if (video instanceof Video && video.comments) {
                console.log();
                console.log("-".repeat(60));
                console.log("💬 正在获取第一页评论...");
                console.log();

                try {
                    const comments = await video.comments.next();

                    if (comments && comments.length > 0) {
                        console.log(`✅ 成功获取 ${comments.length} 条评论`);
                        console.log();
                        console.log("📝 评论列表:");
                        console.log("-".repeat(60));

                        // 显示前 10 条评论
                        const displayCount = Math.min(10, comments.length);
                        comments.slice(0, displayCount).forEach((comment, index) => {
                            console.log(`\n评论 #${index + 1}:`);
                            console.log(`  作者: ${comment.author?.name || '未知'}`);
                            if (comment.author?.handle) {
                                console.log(`  作者句柄: ${comment.author.handle}`);
                            }
                            const contentPreview = comment.content?.substring(0, 100) || '(无内容)';
                            console.log(`  内容: ${contentPreview}${comment.content && comment.content.length > 100 ? '...' : ''}`);
                            console.log(`  点赞数: ${comment.likeCount?.toLocaleString() || 0}`);
                            console.log(`  回复数: ${comment.replyCount || 0}`);
                            console.log(`  发布日期: ${comment.publishDate || '未知'}`);
                            if (comment.isPinned) {
                                console.log(`  ⭐ 置顶评论`);
                            }
                        });

                        if (comments.length > displayCount) {
                            console.log(`\n  ... 还有 ${comments.length - displayCount} 条评论未显示`);
                        }

                        // 统计信息
                        console.log("\n📊 评论统计:");
                        const totalLikes = comments.reduce((sum, c) => sum + (c.likeCount || 0), 0);
                        const totalReplies = comments.reduce((sum, c) => sum + (c.replyCount || 0), 0);
                        const pinnedCount = comments.filter(c => c.isPinned).length;
                        const authorCommentsCount = comments.filter(c => c.isAuthorChannelOwner).length;

                        console.log(`  总点赞数: ${totalLikes.toLocaleString()}`);
                        console.log(`  总回复数: ${totalReplies.toLocaleString()}`);
                        console.log(`  置顶评论数: ${pinnedCount}`);
                        console.log(`  作者评论数: ${authorCommentsCount}`);

                        if (video.comments.continuation) {
                            console.log("\n💡 提示: 可以使用 video.comments.next() 继续加载更多评论");
                        }
                    } else {
                        console.log("⚠️ 该视频暂无评论");
                    }
                } catch (commentError) {
                    const commentErr = commentError as Error;
                    console.log(`❌ 获取评论失败: ${commentErr.message}`);
                    if (commentErr.stack) {
                        console.log(`   错误堆栈: ${commentErr.stack.split("\n").slice(0, 3).join("\n")}`);
                    }
                }
            } else if (video instanceof LiveVideo) {
                console.log("\n⚠️ 直播视频不支持获取评论");
            }
        } else {
            console.log("❌ 返回 undefined - 无法获取视频数据");
        }
    } catch (error) {
        const err = error as Error;
        console.log("❌ 错误:", err.message);
        if (err.stack) {
            console.log("   详细错误:", err.stack.split("\n")[0]);
        }
        // 检查是否是网络错误
        if (err.message.includes("ENOTFOUND") || err.message.includes("ECONNREFUSED")) {
            console.log("   💡 提示: 可能是网络连接问题，请检查：");
            console.log("      1. 网络连接是否正常");
            console.log("      2. 是否需要配置代理（在中国大陆可能需要）");
            console.log("      3. 防火墙设置");
        }
    }

    console.log();
    console.log("=".repeat(60));
    console.log("测试完成！");
    console.log("=".repeat(60));
}

/**
 * 格式化搜索结果信息用于显示
 */
function formatSearchResultInfo(item: VideoCompact | Video, index: number): string {
    const info: Record<string, string> = {
        "序号": `${index + 1}`,
        "视频 ID": item.id,
        "标题": item.title || "未知",
        "频道": item.channel?.name || "未知",
    };

    if (item instanceof Video) {
        info["观看次数"] = item.viewCount ? item.viewCount.toLocaleString() : "隐藏";
        info["点赞数"] = item.likeCount ? item.likeCount.toLocaleString() : "隐藏";
        info["上传日期"] = item.uploadDate || "未知";

        if (item.commentCount !== null && item.commentCount !== undefined) {
            info["评论数"] = item.commentCount.toLocaleString();
        }

        if (item.duration) {
            const minutes = Math.floor(item.duration / 60);
            const seconds = item.duration % 60;
            info["时长"] = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        }
    } else if (item instanceof VideoCompact) {
        info["观看次数"] = item.viewCount ? item.viewCount.toLocaleString() : "未知";
        if (item.duration !== null && item.duration !== undefined) {
            const minutes = Math.floor(item.duration / 60);
            const seconds = item.duration % 60;
            info["时长"] = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        } else {
            info["时长"] = "未知";
        }
    }

    return Object.entries(info)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");
}

/**
 * 测试搜索功能
 * @param keyword 搜索关键词，默认为 'animals'
 * @param limit 显示结果数量，默认为 10
 */
async function testSearchVideos(keyword: string = "animals", limit: number = 10) {
    console.log("正在初始化 YouTube 客户端...");

    // 代理配置：如果设置了环境变量则使用代理，否则直接连接（适用于服务器环境）
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

    let youtube: Client;

    if (proxyUrl) {
        console.log(`使用代理: ${proxyUrl}`);
        console.log("提示: 可以通过环境变量 HTTP_PROXY 或 HTTPS_PROXY 设置代理");
        console.log();

        // 创建代理 agent
        const proxyAgent = new HttpsProxyAgent(proxyUrl);

        youtube = new Client({
            youtubeClientOptions: { hl: "zh-CN", gl: "CN" },
            fetchOptions: {
                agent: proxyAgent,
                timeout: 30000,
            }
        });
    } else {
        console.log("未配置 HTTP_PROXY/HTTPS_PROXY，直接连接 YouTube（无代理）");
        console.log("提示: 如果需要使用代理，请设置环境变量 HTTP_PROXY 或 HTTPS_PROXY");
        console.log();

        youtube = new Client({
            youtubeClientOptions: { hl: "zh-CN", gl: "CN" },
            fetchOptions: {
                timeout: 30000,
            }
        });
    }

    console.log("=".repeat(60));
    console.log("YouTube 视频搜索测试");
    console.log("=".repeat(60));
    console.log();

    console.log(`🔍 测试搜索视频`);
    console.log(`   关键词: ${keyword}`);
    console.log(`   显示数量: ${limit}`);
    console.log("-".repeat(60));
    console.log();

    try {
        console.log("⏳ 正在搜索...");

        // 参考测试代码，使用简单的搜索调用（不指定 type，使用默认值）
        let searchResult;
        try {
            searchResult = await youtube.search(keyword);
        } catch (searchError) {
            const err = searchError as Error;
            console.log(`❌ 搜索请求失败: ${err.message}`);
            if (err.stack) {
                console.log(`   错误堆栈: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
            }

            // 检查是否是网络错误
            if (err.message.includes("ETIMEDOUT") || err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND")) {
                console.log();
                console.log("💡 网络连接问题，可能的原因：");
                console.log("   1. 代理服务器未启动或配置错误");
                console.log("   2. 网络连接不稳定");
                console.log("   3. 防火墙阻止了连接");
                console.log("   4. 需要配置代理才能访问 YouTube");
                console.log();
                console.log("   建议：");
                console.log("   - 检查代理服务器是否正常运行（http://127.0.0.1:7890）");
                console.log("   - 尝试在浏览器中访问 YouTube 确认网络连接");
                console.log("   - 检查环境变量 HTTP_PROXY 或 HTTPS_PROXY 是否正确设置");
            }
            return;
        }

        console.log(`✅ 搜索请求完成！`);
        const estimatedResults = searchResult.estimatedResults || 0;
        const estimatedResultsStr = isNaN(estimatedResults) || estimatedResults === 0
            ? '未知'
            : estimatedResults.toLocaleString();
        console.log(`   估计结果数: ${estimatedResultsStr}`);
        console.log(`   第一页结果数: ${searchResult.items.length}`);
        console.log(`   continuation: ${searchResult.continuation ? '有' : '无'}`);

        // 如果 estimatedResults 是 NaN 但 items 为空，可能是解析逻辑问题
        // 尝试手动触发解析（如果 continuation 存在）
        if (isNaN(estimatedResults) && searchResult.items.length === 0 && searchResult.continuation) {
            console.log();
            console.log("💡 检测到 estimatedResults 为 NaN 但 continuation 存在，尝试手动解析...");
            try {
                const nextItems = await searchResult.next(1);
                console.log(`   手动解析后结果数: ${nextItems.length}`);
                if (nextItems.length > 0) {
                    console.log(`   ✅ 手动解析成功！`);
                }
            } catch (parseError) {
                console.log(`   手动解析失败: ${(parseError as Error).message}`);
            }
        }
        console.log();

        // 调试信息：检查搜索结果的结构
        if (searchResult.items.length === 0 || isNaN(searchResult.estimatedResults)) {
            console.log("🔍 调试信息:");
            console.log(`   searchResult 类型: ${searchResult.constructor.name}`);
            console.log(`   searchResult.items 类型: ${Array.isArray(searchResult.items) ? 'Array' : typeof searchResult.items}`);
            console.log(`   searchResult.items 长度: ${searchResult.items?.length || 0}`);
            console.log(`   estimatedResults 原始值: ${(searchResult as any).estimatedResults}`);
            console.log(`   estimatedResults 类型: ${typeof (searchResult as any).estimatedResults}`);
            console.log(`   estimatedResults 是否为 NaN: ${isNaN((searchResult as any).estimatedResults)}`);
            console.log();

            console.log("⚠️ 搜索结果为空或 estimatedResults 为 NaN，可能的原因：");
            console.log("   1. API 响应格式变化，解析失败");
            console.log("   2. 代理返回了错误的响应");
            console.log("   3. YouTube API 限制或阻止了请求");
            console.log("   4. 网络连接问题导致响应不完整");
            console.log();

            // 尝试不使用代理重新搜索（参考测试代码）
            console.log("💡 尝试使用默认客户端（无代理）重新搜索...");
            try {
                const defaultClient = new Client();
                const defaultSearchResult = await defaultClient.search(keyword);
                console.log(`   默认客户端搜索结果数: ${defaultSearchResult.items.length}`);
                console.log(`   默认客户端估计结果数: ${defaultSearchResult.estimatedResults || '未知'}`);
                if (defaultSearchResult.items.length > 0) {
                    const firstItem = defaultSearchResult.items[0];
                    const firstItemTitle = (firstItem as any)?.title || '未知';
                    console.log(`   ✅ 默认客户端搜索成功！第一个结果: ${firstItemTitle}`);
                    // 使用默认客户端的结果
                    searchResult.items = defaultSearchResult.items;
                    searchResult.estimatedResults = defaultSearchResult.estimatedResults;
                }
            } catch (defaultError) {
                const defaultErr = defaultError as Error;
                console.log(`   默认客户端搜索失败: ${defaultErr.message}`);
                if (defaultErr.message.includes("ETIMEDOUT") || defaultErr.message.includes("ECONNREFUSED")) {
                    console.log(`   ⚠️ 直接连接 YouTube 失败，需要代理才能访问`);
                }
            }
            console.log();

            // 尝试调用 next() 获取更多结果
            if (searchResult.continuation) {
                console.log("💡 尝试获取下一页结果...");
                try {
                    const nextItems = await searchResult.next(1);
                    console.log(`   下一页结果数: ${nextItems.length}`);
                    if (nextItems.length > 0) {
                        console.log(`   第一个结果类型: ${nextItems[0]?.constructor?.name || 'unknown'}`);
                        console.log(`   第一个结果ID: ${(nextItems[0] as any)?.id || 'unknown'}`);
                    }
                } catch (nextError) {
                    console.log(`   获取下一页失败: ${(nextError as Error).message}`);
                }
                console.log();
            }
        }

        if (searchResult.items.length === 0) {
            console.log("⚠️ 未找到任何视频");
            return;
        }

        console.log("📹 搜索结果列表:");
        console.log("=".repeat(60));

        // 直接使用 items 数组（Continuable.items 是普通数组）
        const displayCount = Math.min(limit, searchResult.items.length);
        let processedCount = 0;

        for (let i = 0; i < displayCount; i++) {
            const item = searchResult.items[i];

            if (!item) continue;

            try {
                // 如果是 VideoCompact，需要获取完整视频信息
                let fullVideo: Video;
                if (item instanceof Video) {
                    fullVideo = item;
                } else if (item instanceof VideoCompact) {
                    console.log(`\n[${i + 1}] 正在获取完整视频信息: ${item.id}...`);
                    fullVideo = await item.getVideo();
                    if (!fullVideo) {
                        console.log(`   ⚠️ 无法获取完整视频信息，跳过`);
                        continue;
                    }
                } else {
                    continue;
                }

                processedCount++;
                console.log();
                console.log("-".repeat(60));
                console.log(formatSearchResultInfo(fullVideo, i));

                // 显示描述预览
                if (fullVideo.description) {
                    const descPreview = fullVideo.description.substring(0, 150);
                    console.log(`  描述预览: ${descPreview}${fullVideo.description.length > 150 ? '...' : ''}`);
                }
            } catch (error) {
                const err = error as Error;
                console.log(`\n[${i + 1}] ❌ 处理失败: ${err.message}`);
                continue;
            }
        }

        console.log();
        console.log("=".repeat(60));
        console.log(`📊 处理统计:`);
        console.log(`   成功处理: ${processedCount} 个视频`);
        console.log(`   总结果数: ${searchResult.items.length}`);
        console.log(`   估计总数: ${searchResult.estimatedResults.toLocaleString()}`);

        if (searchResult.items.length < searchResult.estimatedResults) {
            console.log(`\n💡 提示: 可以使用 searchResult.next() 继续加载更多结果`);
        }

    } catch (error) {
        const err = error as Error;
        console.log("❌ 错误:", err.message);
        if (err.stack) {
            console.log("   详细错误:", err.stack.split("\n")[0]);
        }
        // 检查是否是网络错误
        if (err.message.includes("ENOTFOUND") || err.message.includes("ECONNREFUSED")) {
            console.log("   💡 提示: 可能是网络连接问题，请检查：");
            console.log("      1. 网络连接是否正常");
            console.log("      2. 是否需要配置代理（在中国大陆可能需要）");
            console.log("      3. 防火墙设置");
        }
    }

    console.log();
    console.log("=".repeat(60));
    console.log("搜索测试完成！");
    console.log("=".repeat(60));
}

// 根据命令行参数决定运行哪个测试
const firstArg = process.argv[2]?.toLowerCase();

// 判断是否为视频ID格式（YouTube视频ID通常是11个字符，只包含字母、数字、连字符和下划线）
function looksLikeVideoId(str: string): boolean {
    // YouTube视频ID通常是11个字符，只包含字母、数字、连字符、下划线和减号
    // 如果包含空格或特殊字符，肯定不是视频ID
    if (str.includes(' ') || str.length < 8 || str.length > 15) {
        return false;
    }
    // 检查是否只包含视频ID允许的字符
    return /^[a-zA-Z0-9_-]+$/.test(str);
}

if (firstArg === 'search' || firstArg === 's') {
    // 如果第一个参数是 'search' 或 's'，则运行搜索测试
    // 关键词从第二个参数开始，如果没有则使用默认值 'animals'
    const keyword = process.argv[3] || "animals";
    const limit = process.argv[4] ? parseInt(process.argv[4], 10) : 10;

    testSearchVideos(keyword, limit).catch((error) => {
        console.error("搜索测试执行失败:", error);
        process.exit(1);
    });
} else if (firstArg && !looksLikeVideoId(firstArg)) {
    // 如果第一个参数存在且看起来不像视频ID（比如是普通关键词），则执行搜索测试
    const keyword = firstArg;
    const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 10;

    testSearchVideos(keyword, limit).catch((error) => {
        console.error("搜索测试执行失败:", error);
        process.exit(1);
    });
} else {
    // 默认运行视频获取测试（第一个参数是视频ID或没有参数）
    testGetVideo().catch((error) => {
        console.error("测试脚本执行失败:", error);
        process.exit(1);
    });
}

