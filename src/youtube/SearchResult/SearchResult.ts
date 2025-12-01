import { BaseChannel } from "../BaseChannel";
import { Continuable, ContinuableConstructorParams, FetchResult } from "../Continuable";
import { PlaylistCompact } from "../PlaylistCompact";
import { VideoCompact } from "../VideoCompact";
import { I_END_POINT } from "../constants";
import { SearchResultParser } from "./SearchResultParser";
import { optionsToProto, SearchProto } from "./proto";

export type SearchOptions = {
	type?: SearchType;
	duration?: SearchDuration;
	uploadDate?: SearchUploadDate;
	sortBy?: SearchSort;
	features?: SearchFeature[];
};

export namespace SearchEnum {
	export enum UploadDate {
		All = "all",
		Hour = "hour",
		Today = "today",
		Week = "week",
		Month = "month",
		Year = "year",
	}

	export enum Type {
		Video = "video",
		Playlist = "playlist",
		Channel = "channel",
		All = "all",
	}

	export enum Duration {
		All = "all",
		Short = "short",
		Medium = "medium",
		Long = "long",
	}

	export enum Sort {
		Relevance = "relevance",
		Rating = "rating",
		Date = "date",
		View = "view",
	}

	export enum Feature {
		Live = "live",
		"4K" = "4k",
		UHD = "4k",
		HD = "hd",
		Subtitles = "subtitles",
		CreativeCommons = "creativeCommons",
		Spherical = "360",
		VR180 = "vr180",
		"3D" = "3d",
		ThreeDimensions = "3d",
		HDR = "hdr",
		Location = "location",
	}
}

export type SearchUploadDate =
	| "all"
	| "hour"
	| "today"
	| "week"
	| "month"
	| "year"
	| SearchEnum.UploadDate;
export type SearchType = "all" | "video" | "channel" | "playlist" | SearchEnum.Type;
export type SearchDuration = "all" | "short" | "medium" | "long" | SearchEnum.Duration;
export type SearchSort = "relevance" | "rating" | "date" | "view" | SearchEnum.Sort;
export type SearchFeature =
	| "live"
	| "4k"
	| "hd"
	| "subtitles"
	| "creativeCommons"
	| "360"
	| "vr180"
	| "3d"
	| "hdr"
	| "location"
	| SearchEnum.Feature;

export type SearchResultItem<T = "all"> = T extends "video" | VideoCompact
	? VideoCompact
	: T extends "channel" | BaseChannel
	? BaseChannel
	: T extends "playlist" | PlaylistCompact
	? PlaylistCompact
	: VideoCompact | BaseChannel | PlaylistCompact;

/**
 * Represents search result, usually returned from `client.search();`.
 *
 * {@link SearchResult} is a helper class to manage search result
 *
 * @example
 * ```ts
 * const result = await youtube.search("Keyword");
 *
 * console.log(result.items); // search result from first page
 *
 * let nextSearchResult = await result.next();
 * console.log(nextSearchResult); // search result from second page
 *
 * nextSearchResult = await result.next();
 * console.log(nextSearchResult); // search result from third page
 *
 * console.log(result.items); // search result from first, second, and third page.
 * ```
 *
 * @noInheritDoc
 */
export class SearchResult<T extends SearchType | undefined = "all"> extends Continuable<
	SearchResultItem<T>
> {
	/** The estimated search result count */
	estimatedResults!: number;

	/** @hidden */
	constructor({ client }: ContinuableConstructorParams) {
		super({ client });
	}

	/**
	 * Initialize data from search
	 *
	 * @param query Search query
	 * @param options Search Options
	 *
	 * @hidden
	 */
	async search(query: string, options: SearchOptions): Promise<SearchResult<T>> {
		this.items = [];
		this.estimatedResults = 0;

		const bufferParams = SearchProto.encode(optionsToProto(options)).finish();

		const response = await this.client.http.post(`${I_END_POINT}/search`, {
			data: {
				query,
				params: Buffer.from(bufferParams).toString("base64"),
			},
		});

		this.estimatedResults = +response.data.estimatedResults;

		// 打印原始响应数据用于调试
		console.log("[SearchResult] 原始响应数据:");
		console.log(`  estimatedResults 原始值: ${response.data.estimatedResults}`);
		console.log(`  estimatedResults 类型: ${typeof response.data.estimatedResults}`);
		console.log(`  解析后的 estimatedResults: ${this.estimatedResults}`);
		console.log(`  response.data 的键: ${Object.keys(response.data || {}).join(", ")}`);

		// 打印部分响应数据（避免输出过大）
		try {
			const dataStr = JSON.stringify(response.data, null, 2);
			if (dataStr.length > 2000) {
				console.log(`  response.data (前2000字符): ${dataStr.substring(0, 2000)}...`);
			} else {
				console.log(`  response.data: ${dataStr}`);
			}
		} catch (stringifyError) {
			console.log(`  无法序列化 response.data: ${(stringifyError as Error).message}`);
		}
		console.log();

		// 即使 estimatedResults 无效（NaN 或 0），也尝试解析结果
		// 因为 API 响应可能包含有效数据，只是 estimatedResults 字段缺失或格式不对
		try {
			const { data, continuation } = SearchResultParser.parseInitialSearchResult(
				response.data,
				this.client
			);
			this.items.push(...(data as SearchResultItem<T>[]));
			this.continuation = continuation;
		} catch (parseError) {
			// 如果解析失败，但 estimatedResults 有效，说明可能是响应格式问题
			// 如果 estimatedResults 无效，可能是 API 响应格式变化
			if (!isNaN(this.estimatedResults) && this.estimatedResults > 0) {
				throw parseError;
			}
		}

		return this;
	}

	protected async fetch(): Promise<FetchResult<SearchResultItem<T>>> {
		const response = await this.client.http.post(`${I_END_POINT}/search`, {
			data: { continuation: this.continuation },
		});

		const { data, continuation } = SearchResultParser.parseContinuationSearchResult(
			response.data,
			this.client
		);

		return {
			items: (data as unknown) as SearchResultItem<T>[],
			continuation,
		};
	}
}
