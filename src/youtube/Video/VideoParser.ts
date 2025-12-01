import { getContinuationFromItems, Thumbnails, YoutubeRawData } from "../../common";
import { BaseVideoParser } from "../BaseVideo";
import { Comment } from "../Comment";
import { Video } from "./Video";

export class VideoParser {
	static loadVideo(target: Video, data: YoutubeRawData): Video {
		const videoInfo = BaseVideoParser.parseRawData(data);
		target.duration = +videoInfo.videoDetails.lengthSeconds;

		const itemSectionRenderer = data.response.contents.twoColumnWatchNextResults.results.results.contents
			.reverse()
			.find((c: YoutubeRawData) => c.itemSectionRenderer)?.itemSectionRenderer;

		target.comments.continuation = getContinuationFromItems(
			itemSectionRenderer?.contents || []
		);

		const chapters =
			data.response.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer
				?.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap?.[0]
				.value.chapters;

		target.chapters =
			chapters?.map(({ chapterRenderer: c }: YoutubeRawData) => ({
				title: c.title.simpleText,
				start: c.timeRangeStartMillis,
				thumbnails: new Thumbnails().load(c.thumbnail.thumbnails),
			})) || [];

		const musicPanel = data.response.engagementPanels?.find((e: YoutubeRawData) =>
			e.engagementPanelSectionListRenderer.content?.structuredDescriptionContentRenderer?.items.find(
				(i: YoutubeRawData) =>
					i.horizontalCardListRenderer?.footerButton?.buttonViewModel.iconName === "MUSIC"
			)
		);

		if (!musicPanel) {
			target.music = null;
		} else {
			const cards = musicPanel.engagementPanelSectionListRenderer.content.structuredDescriptionContentRenderer.items.find(
				(i: YoutubeRawData) =>
					i.horizontalCardListRenderer?.footerButton?.buttonViewModel.iconName === "MUSIC"
			).horizontalCardListRenderer.cards;

			const music = cards.find((i: YoutubeRawData) => i.videoAttributeViewModel)
				.videoAttributeViewModel;

			target.music = {
				imageUrl: music.image.sources[0].url,
				title: music.title,
				artist: music.subtitle,
				album: music.secondarySubtitle?.content || null,
			};
		}

		// Extract comment count from engagement panels
		const commentsPanel = data.response.engagementPanels?.find(
			(panel: YoutubeRawData) =>
				panel.engagementPanelSectionListRenderer?.panelIdentifier ===
				"engagement-panel-comments-section"
		);

		if (commentsPanel?.engagementPanelSectionListRenderer?.header?.engagementPanelTitleHeaderRenderer?.contextualInfo?.runs) {
			// 合并所有 runs 的文本，因为评论数可能被分割成多个 runs
			// 例如在英文环境下 "1," 和 "712" 可能被分成两个 runs，只取第一个会得到 "1," 或 "17"
			const runs = commentsPanel.engagementPanelSectionListRenderer.header.engagementPanelTitleHeaderRenderer.contextualInfo.runs;
			const commentCountText = runs.map((run: YoutubeRawData) => run.text || '').join('');

			// 解析评论数，支持格式如 "1,712"、"1.7K"、"1.2M" 等
			let commentCount: number | null = null;

			// 尝试匹配带单位的格式（如 "1.7K", "1.2M"）
			const unitMatch = commentCountText.match(/([\d,.]+)\s*([KMkm])/i);
			if (unitMatch) {
				const num = parseFloat(unitMatch[1].replace(/,/g, ''));
				const unit = unitMatch[2].toUpperCase();
				if (unit === 'K') {
					commentCount = Math.floor(num * 1000);
				} else if (unit === 'M') {
					commentCount = Math.floor(num * 1000000);
				}
			} else {
				// 如果没有单位，移除所有非数字字符（保留逗号和点号用于解析）
				const cleanedText = commentCountText.replace(/[^\d,.]/g, '').replace(/,/g, '');
				const num = parseFloat(cleanedText);
				commentCount = isNaN(num) ? null : Math.floor(num);
			}

			target.commentCount = commentCount;
		} else {
			target.commentCount = null;
		}

		return target;
	}

	static parseComments(data: YoutubeRawData, video: Video): Comment[] {
		const endpoints = data.onResponseReceivedEndpoints.find((c: YoutubeRawData) => {
			return (
				c.appendContinuationItemsAction ||
				c.reloadContinuationItemsCommand?.slot === "RELOAD_CONTINUATION_SLOT_BODY"
			);
		});

		const repliesContinuationItems = (
			endpoints.reloadContinuationItemsCommand || endpoints.appendContinuationItemsAction
		).continuationItems;

		const comments = data.frameworkUpdates.entityBatchUpdate.mutations
			.filter((m: YoutubeRawData) => m.payload.commentEntityPayload)
			.map((m: YoutubeRawData) => {
				const repliesItems = repliesContinuationItems.find(
					(r: YoutubeRawData) =>
						r.commentThreadRenderer.commentViewModel.commentKey === m.key
				)?.commentThreadRenderer;

				return {
					...m.payload.commentEntityPayload,
					...repliesItems,
				};
			});

		return comments.map((c: YoutubeRawData) =>
			new Comment({ video, client: video.client }).load(c)
		);
	}

	static parseCommentContinuation(data: YoutubeRawData): string | undefined {
		const endpoints = data.onResponseReceivedEndpoints.at(-1);

		const continuationItems = (
			endpoints.reloadContinuationItemsCommand || endpoints.appendContinuationItemsAction
		).continuationItems;

		return getContinuationFromItems(continuationItems);
	}
}
