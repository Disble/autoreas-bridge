export namespace contracts {
	
	export class AnimeCover {
	    dataUrl?: string;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeCover(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dataUrl = source["dataUrl"];
	        this.source = source["source"];
	    }
	}
	export class AnimeCreateResult {
	    outcome: string;
	    message?: string;
	    animeIds?: string[];
	    modifiedAt: number;
	    conflictId?: string;
	    details?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreateResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outcome = source["outcome"];
	        this.message = source["message"];
	        this.animeIds = source["animeIds"];
	        this.modifiedAt = source["modifiedAt"];
	        this.conflictId = source["conflictId"];
	        this.details = source["details"];
	    }
	}
	export class AnimeDetailDownload {
	    page?: string;
	    folder?: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeDetailDownload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.page = source["page"];
	        this.folder = source["folder"];
	    }
	}
	export class AnimeDetailContent {
	    kind?: number;
	    durationMinutes?: number;
	    genres: string[];
	    studios?: string;
	    origin?: string;
	    cover?: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeDetailContent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.durationMinutes = source["durationMinutes"];
	        this.genres = source["genres"];
	        this.studios = source["studios"];
	        this.origin = source["origin"];
	        this.cover = source["cover"];
	    }
	}
	export class AnimeDetailDates {
	    created?: number;
	    firstWatch?: number;
	    lastWatched?: number;
	    deleted?: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeDetailDates(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.created = source["created"];
	        this.firstWatch = source["firstWatch"];
	        this.lastWatched = source["lastWatched"];
	        this.deleted = source["deleted"];
	    }
	}
	export class MobileAnimeDay {
	    day: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileAnimeDay(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.order = source["order"];
	    }
	}
	export class AnimeDetailProgress {
	    watched: number;
	    total?: number;
	    remaining?: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeDetailProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.watched = source["watched"];
	        this.total = source["total"];
	        this.remaining = source["remaining"];
	    }
	}
	export class AnimeDetail {
	    id: string;
	    name: string;
	    status: number;
	    active: number;
	    firstCycle: number;
	    progress: AnimeDetailProgress;
	    schedule: MobileAnimeDay[];
	    dates: AnimeDetailDates;
	    content: AnimeDetailContent;
	    download: AnimeDetailDownload;
	    modified_at: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.active = source["active"];
	        this.firstCycle = source["firstCycle"];
	        this.progress = this.convertValues(source["progress"], AnimeDetailProgress);
	        this.schedule = this.convertValues(source["schedule"], MobileAnimeDay);
	        this.dates = this.convertValues(source["dates"], AnimeDetailDates);
	        this.content = this.convertValues(source["content"], AnimeDetailContent);
	        this.download = this.convertValues(source["download"], AnimeDetailDownload);
	        this.modified_at = source["modified_at"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class AnimeEditorCoverDTO {
	    kind: string;
	    type?: string;
	    path?: string;
	    raw?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorCoverDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.type = source["type"];
	        this.path = source["path"];
	        this.raw = source["raw"];
	    }
	}
	export class AnimeEditorStringListDTO {
	    kind: string;
	    values: string[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorStringListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.values = source["values"];
	    }
	}
	export class AnimeEditorNullableStringDTO {
	    kind: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableStringDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.value = source["value"];
	    }
	}
	export class AnimeEditorNullableIntDTO {
	    kind: string;
	    value: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableIntDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.value = source["value"];
	    }
	}
	export class AnimeEditorNullableTimeDTO {
	    kind: string;
	    unixMilli: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableTimeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.unixMilli = source["unixMilli"];
	    }
	}
	export class AnimeEditorDetailFields {
	    premieredAt: AnimeEditorNullableTimeDTO;
	    duration: AnimeEditorNullableIntDTO;
	    origin: AnimeEditorNullableStringDTO;
	    genres: AnimeEditorStringListDTO;
	    studios: AnimeEditorStringListDTO;
	    cover: AnimeEditorCoverDTO;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorDetailFields(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.premieredAt = this.convertValues(source["premieredAt"], AnimeEditorNullableTimeDTO);
	        this.duration = this.convertValues(source["duration"], AnimeEditorNullableIntDTO);
	        this.origin = this.convertValues(source["origin"], AnimeEditorNullableStringDTO);
	        this.genres = this.convertValues(source["genres"], AnimeEditorStringListDTO);
	        this.studios = this.convertValues(source["studios"], AnimeEditorStringListDTO);
	        this.cover = this.convertValues(source["cover"], AnimeEditorCoverDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeEditorFrequentFields {
	    name: string;
	    status: number;
	    progress: number;
	    totalEpisodes: AnimeEditorNullableIntDTO;
	    active: boolean;
	    kind: AnimeEditorNullableIntDTO;
	    sourceUrl: AnimeEditorNullableStringDTO;
	    folder: AnimeEditorNullableStringDTO;
	    placements: MobileAnimeDay[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorFrequentFields(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.totalEpisodes = this.convertValues(source["totalEpisodes"], AnimeEditorNullableIntDTO);
	        this.active = source["active"];
	        this.kind = this.convertValues(source["kind"], AnimeEditorNullableIntDTO);
	        this.sourceUrl = this.convertValues(source["sourceUrl"], AnimeEditorNullableStringDTO);
	        this.folder = this.convertValues(source["folder"], AnimeEditorNullableStringDTO);
	        this.placements = this.convertValues(source["placements"], MobileAnimeDay);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class AnimeEditorRecord {
	    animeId: string;
	    modifiedAt: number;
	    frequent: AnimeEditorFrequentFields;
	    details: AnimeEditorDetailFields;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.modifiedAt = source["modifiedAt"];
	        this.frequent = this.convertValues(source["frequent"], AnimeEditorFrequentFields);
	        this.details = this.convertValues(source["details"], AnimeEditorDetailFields);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeEditorRecordResult {
	    outcome: string;
	    message: string;
	    details?: Record<string, string>;
	    record?: AnimeEditorRecord;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorRecordResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outcome = source["outcome"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.record = this.convertValues(source["record"], AnimeEditorRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeEditorSaveResult {
	    outcome: string;
	    message: string;
	    details?: Record<string, string>;
	    animeId?: string;
	    modifiedAt?: number;
	    conflictId?: string;
	    record?: AnimeEditorRecord;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorSaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outcome = source["outcome"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.animeId = source["animeId"];
	        this.modifiedAt = source["modifiedAt"];
	        this.conflictId = source["conflictId"];
	        this.record = this.convertValues(source["record"], AnimeEditorRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeScheduleBoardEntry {
	    animeId: string;
	    name: string;
	    active: boolean;
	    modifiedAt: number;
	    placements: MobileAnimeDay[];
	    status: number;
	    progress: number;
	    cover?: string;
	    originHighlighted: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AnimeScheduleBoardEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.name = source["name"];
	        this.active = source["active"];
	        this.modifiedAt = source["modifiedAt"];
	        this.placements = this.convertValues(source["placements"], MobileAnimeDay);
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.cover = source["cover"];
	        this.originHighlighted = source["originHighlighted"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeScheduleDestination {
	    id: string;
	    label: string;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeScheduleDestination(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kind = source["kind"];
	    }
	}
	export class AnimeEditorScheduleBoard {
	    originAnimeId: string;
	    boardModifiedAt: number;
	    destinations: AnimeScheduleDestination[];
	    entries: AnimeScheduleBoardEntry[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorScheduleBoard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.originAnimeId = source["originAnimeId"];
	        this.boardModifiedAt = source["boardModifiedAt"];
	        this.destinations = this.convertValues(source["destinations"], AnimeScheduleDestination);
	        this.entries = this.convertValues(source["entries"], AnimeScheduleBoardEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeEditorScheduleApplyResult {
	    outcome: string;
	    message: string;
	    details?: Record<string, string>;
	    modifiedAt?: number;
	    conflictId?: string;
	    board?: AnimeEditorScheduleBoard;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorScheduleApplyResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outcome = source["outcome"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.modifiedAt = source["modifiedAt"];
	        this.conflictId = source["conflictId"];
	        this.board = this.convertValues(source["board"], AnimeEditorScheduleBoard);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AnimeEditorScheduleBoardResult {
	    outcome: string;
	    message: string;
	    details?: Record<string, string>;
	    board?: AnimeEditorScheduleBoard;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorScheduleBoardResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outcome = source["outcome"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.board = this.convertValues(source["board"], AnimeEditorScheduleBoard);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AnimeHistoryItem {
	    id: string;
	    name: string;
	    episodesWatched: number;
	    lastWatchedAt: number;
	    status: number;
	    kind?: number;
	    createdAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeHistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.episodesWatched = source["episodesWatched"];
	        this.lastWatchedAt = source["lastWatchedAt"];
	        this.status = source["status"];
	        this.kind = source["kind"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AnimeListItem {
	    id: string;
	    name: string;
	    status: number;
	    episodesWatched: number;
	    totalEpisodes?: number;
	    active: number;
	    kind?: number;
	    days: string[];
	    genres: string[];
	    hasDownloadPage: boolean;
	    hasFolder: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AnimeListItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.episodesWatched = source["episodesWatched"];
	        this.totalEpisodes = source["totalEpisodes"];
	        this.active = source["active"];
	        this.kind = source["kind"];
	        this.days = source["days"];
	        this.genres = source["genres"];
	        this.hasDownloadPage = source["hasDownloadPage"];
	        this.hasFolder = source["hasFolder"];
	    }
	}
	
	
	export class DeviceInfo {
	    device_id: string;
	    device_name: string;
	    paired_at_ms: number;
	    last_seen_at_ms: number;
	    last_ack_changelog_id: number;
	    sync_status: string;
	    connection_status: string;
	    auth_state: string;
	    blocks_changelog_pruning: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_id = source["device_id"];
	        this.device_name = source["device_name"];
	        this.paired_at_ms = source["paired_at_ms"];
	        this.last_seen_at_ms = source["last_seen_at_ms"];
	        this.last_ack_changelog_id = source["last_ack_changelog_id"];
	        this.sync_status = source["sync_status"];
	        this.connection_status = source["connection_status"];
	        this.auth_state = source["auth_state"];
	        this.blocks_changelog_pruning = source["blocks_changelog_pruning"];
	    }
	}
	export class HosterPriorityItem {
	    hoster: string;
	    priority: number;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HosterPriorityItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hoster = source["hoster"];
	        this.priority = source["priority"];
	        this.enabled = source["enabled"];
	    }
	}
	export class ScheduleConfig {
	    mode: string;
	    dailyTimeHHMM: string;
	    enabled: boolean;
	    lastRunAtMs: number;
	    lastRunStatus: string;
	    nextRunAtMs: number;
	    running: boolean;
	    enabledWeekdays: number;
	
	    static createFrom(source: any = {}) {
	        return new ScheduleConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.dailyTimeHHMM = source["dailyTimeHHMM"];
	        this.enabled = source["enabled"];
	        this.lastRunAtMs = source["lastRunAtMs"];
	        this.lastRunStatus = source["lastRunStatus"];
	        this.nextRunAtMs = source["nextRunAtMs"];
	        this.running = source["running"];
	        this.enabledWeekdays = source["enabledWeekdays"];
	    }
	}
	export class JDStatus {
	    email: string;
	    hasPassword: boolean;
	    deviceName: string;
	    exePathOverride: string;
	    defaultDestDir: string;
	    lastSeenStatus: string;
	    lastSeenAtMs: number;
	    lastDecryptError?: string;
	
	    static createFrom(source: any = {}) {
	        return new JDStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.email = source["email"];
	        this.hasPassword = source["hasPassword"];
	        this.deviceName = source["deviceName"];
	        this.exePathOverride = source["exePathOverride"];
	        this.defaultDestDir = source["defaultDestDir"];
	        this.lastSeenStatus = source["lastSeenStatus"];
	        this.lastSeenAtMs = source["lastSeenAtMs"];
	        this.lastDecryptError = source["lastDecryptError"];
	    }
	}
	export class DownloadConfig {
	    jd: JDStatus;
	    schedule: ScheduleConfig;
	    hosterPriority: HosterPriorityItem[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jd = this.convertValues(source["jd"], JDStatus);
	        this.schedule = this.convertValues(source["schedule"], ScheduleConfig);
	        this.hosterPriority = this.convertValues(source["hosterPriority"], HosterPriorityItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ManualLink {
	    anime: string;
	    episode: number;
	    links: string[];
	
	    static createFrom(source: any = {}) {
	        return new ManualLink(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.anime = source["anime"];
	        this.episode = source["episode"];
	        this.links = source["links"];
	    }
	}
	export class DownloadRunView {
	    runId: string;
	    startedAtMs: number;
	    finishedAtMs?: number;
	    trigger: string;
	    animesChecked: number;
	    episodesFound: number;
	    episodesDownloaded: number;
	    episodesFailed: number;
	    skippedCount: number;
	    upToDateCount: number;
	    jdAvailable: boolean;
	    status: string;
	    errorSummary?: string;
	    manualLinks?: ManualLink[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadRunView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runId = source["runId"];
	        this.startedAtMs = source["startedAtMs"];
	        this.finishedAtMs = source["finishedAtMs"];
	        this.trigger = source["trigger"];
	        this.animesChecked = source["animesChecked"];
	        this.episodesFound = source["episodesFound"];
	        this.episodesDownloaded = source["episodesDownloaded"];
	        this.episodesFailed = source["episodesFailed"];
	        this.skippedCount = source["skippedCount"];
	        this.upToDateCount = source["upToDateCount"];
	        this.jdAvailable = source["jdAvailable"];
	        this.status = source["status"];
	        this.errorSummary = source["errorSummary"];
	        this.manualLinks = this.convertValues(source["manualLinks"], ManualLink);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EpisodeCommandResult {
	    status: string;
	    message?: string;
	    animeId?: string;
	    outcome?: string;
	    modifiedAt: number;
	    conflictId?: string;
	    animeName?: string;
	    animeStatus?: number;
	    episodesWatched?: number;
	    occurredAtMs?: number;
	    correlationId?: string;
	
	    static createFrom(source: any = {}) {
	        return new EpisodeCommandResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.animeId = source["animeId"];
	        this.outcome = source["outcome"];
	        this.modifiedAt = source["modifiedAt"];
	        this.conflictId = source["conflictId"];
	        this.animeName = source["animeName"];
	        this.animeStatus = source["animeStatus"];
	        this.episodesWatched = source["episodesWatched"];
	        this.occurredAtMs = source["occurredAtMs"];
	        this.correlationId = source["correlationId"];
	    }
	}
	export class EpisodeDayCount {
	    day: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new EpisodeDayCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.count = source["count"];
	    }
	}
	export class EpisodeScheduleItem {
	    animeId: string;
	    animeName: string;
	    status: number;
	    episodesWatched: number;
	    totalEpisodes?: number;
	    day: string;
	    dayOrder: number;
	    modified_at: number;
	    folderPath?: string;
	    pageUrl?: string;
	    hasCover: boolean;
	    lastWatched?: number;
	    firstWatched?: number;
	
	    static createFrom(source: any = {}) {
	        return new EpisodeScheduleItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.animeName = source["animeName"];
	        this.status = source["status"];
	        this.episodesWatched = source["episodesWatched"];
	        this.totalEpisodes = source["totalEpisodes"];
	        this.day = source["day"];
	        this.dayOrder = source["dayOrder"];
	        this.modified_at = source["modified_at"];
	        this.folderPath = source["folderPath"];
	        this.pageUrl = source["pageUrl"];
	        this.hasCover = source["hasCover"];
	        this.lastWatched = source["lastWatched"];
	        this.firstWatched = source["firstWatched"];
	    }
	}
	
	export class JDConfigInput {
	    email: string;
	    plaintextPassword?: string;
	    deviceName: string;
	    exePathOverride: string;
	    defaultDestDir: string;
	
	    static createFrom(source: any = {}) {
	        return new JDConfigInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.email = source["email"];
	        this.plaintextPassword = source["plaintextPassword"];
	        this.deviceName = source["deviceName"];
	        this.exePathOverride = source["exePathOverride"];
	        this.defaultDestDir = source["defaultDestDir"];
	    }
	}
	
	
	export class MobileRepeticion {
	    numRepetitions: number;
	    episodesWatched: number;
	    status: number;
	    createdAt?: number;
	    premieredAt?: number;
	    lastWatchedAt?: number;
	    deletedAt?: number;
	    repeatedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileRepeticion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.numRepetitions = source["numRepetitions"];
	        this.episodesWatched = source["episodesWatched"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	        this.premieredAt = source["premieredAt"];
	        this.lastWatchedAt = source["lastWatchedAt"];
	        this.deletedAt = source["deletedAt"];
	        this.repeatedAt = source["repeatedAt"];
	    }
	}
	export class MobileAnime {
	    id: string;
	    name: string;
	    status: number;
	    episodesWatched: number;
	    totalEpisodes?: number;
	    active: number;
	    firstCycle: number;
	    days: MobileAnimeDay[];
	    genres: string[];
	    kind?: number;
	    lastWatchedAt?: number;
	    premieredAt?: number;
	    createdAt?: number;
	    deletedAt?: number;
	    cover?: string;
	    sourceUrl?: string;
	    folder?: string;
	    studios?: string;
	    origin?: string;
	    durationMinutes?: number;
	    repetitions?: MobileRepeticion[];
	    modified_at: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileAnime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.episodesWatched = source["episodesWatched"];
	        this.totalEpisodes = source["totalEpisodes"];
	        this.active = source["active"];
	        this.firstCycle = source["firstCycle"];
	        this.days = this.convertValues(source["days"], MobileAnimeDay);
	        this.genres = source["genres"];
	        this.kind = source["kind"];
	        this.lastWatchedAt = source["lastWatchedAt"];
	        this.premieredAt = source["premieredAt"];
	        this.createdAt = source["createdAt"];
	        this.deletedAt = source["deletedAt"];
	        this.cover = source["cover"];
	        this.sourceUrl = source["sourceUrl"];
	        this.folder = source["folder"];
	        this.studios = source["studios"];
	        this.origin = source["origin"];
	        this.durationMinutes = source["durationMinutes"];
	        this.repetitions = this.convertValues(source["repetitions"], MobileRepeticion);
	        this.modified_at = source["modified_at"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class SyncingAnimeItem {
	    animeId: string;
	    title: string;
	    changeType: string;
	    pendingChanges: number;
	    changedFields: string[];
	    progressCurrent?: number;
	    progressTotal?: number;
	    lastChangedAtMs: number;
	    active: number;
	
	    static createFrom(source: any = {}) {
	        return new SyncingAnimeItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.title = source["title"];
	        this.changeType = source["changeType"];
	        this.pendingChanges = source["pendingChanges"];
	        this.changedFields = source["changedFields"];
	        this.progressCurrent = source["progressCurrent"];
	        this.progressTotal = source["progressTotal"];
	        this.lastChangedAtMs = source["lastChangedAtMs"];
	        this.active = source["active"];
	    }
	}

}

export namespace logger {
	
	export class LogEntry {
	    timestamp: string;
	    domain: string;
	    level?: string;
	    message: string;
	    correlationId?: string;
	    entityId?: string;
	    eventType?: string;
	    durationMs?: number;
	    metadata?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.domain = source["domain"];
	        this.level = source["level"];
	        this.message = source["message"];
	        this.correlationId = source["correlationId"];
	        this.entityId = source["entityId"];
	        this.eventType = source["eventType"];
	        this.durationMs = source["durationMs"];
	        this.metadata = source["metadata"];
	    }
	}

}

export namespace main {
	
	export class AnimeCreateNeighborDTO {
	    animeId: string;
	    baseModifiedAt: number;
	    placements: contracts.MobileAnimeDay[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreateNeighborDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.baseModifiedAt = source["baseModifiedAt"];
	        this.placements = this.convertValues(source["placements"], contracts.MobileAnimeDay);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeCreateCoverDTO {
	    type: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreateCoverDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.path = source["path"];
	    }
	}
	export class AnimeCreatePlacementDTO {
	    day: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreatePlacementDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.order = source["order"];
	    }
	}
	export class AnimeCreateItemDTO {
	    nombre: string;
	    pagina: string;
	    dias: AnimeCreatePlacementDTO[];
	    carpeta?: string;
	    tipo?: number;
	    episodesWatched?: number;
	    totalEpisodes?: number;
	    durationMinutes?: number;
	    origin?: string;
	    genres?: string[];
	    studios?: string[];
	    cover?: AnimeCreateCoverDTO;
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreateItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nombre = source["nombre"];
	        this.pagina = source["pagina"];
	        this.dias = this.convertValues(source["dias"], AnimeCreatePlacementDTO);
	        this.carpeta = source["carpeta"];
	        this.tipo = source["tipo"];
	        this.episodesWatched = source["episodesWatched"];
	        this.totalEpisodes = source["totalEpisodes"];
	        this.durationMinutes = source["durationMinutes"];
	        this.origin = source["origin"];
	        this.genres = source["genres"];
	        this.studios = source["studios"];
	        this.cover = this.convertValues(source["cover"], AnimeCreateCoverDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AnimeCreateCommandDTO {
	    creates: AnimeCreateItemDTO[];
	    changedNeighbors: AnimeCreateNeighborDTO[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeCreateCommandDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.creates = this.convertValues(source["creates"], AnimeCreateItemDTO);
	        this.changedNeighbors = this.convertValues(source["changedNeighbors"], AnimeCreateNeighborDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class AnimeEditorCoverPatchDTO {
	    present: boolean;
	    clear: boolean;
	    type: string;
	    path: string;
	    raw: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorCoverPatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.present = source["present"];
	        this.clear = source["clear"];
	        this.type = source["type"];
	        this.path = source["path"];
	        this.raw = source["raw"];
	    }
	}
	export class AnimeEditorNullableIntPatchDTO {
	    present: boolean;
	    clear: boolean;
	    value: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableIntPatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.present = source["present"];
	        this.clear = source["clear"];
	        this.value = source["value"];
	    }
	}
	export class AnimeEditorNullableStringPatchDTO {
	    present: boolean;
	    clear: boolean;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableStringPatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.present = source["present"];
	        this.clear = source["clear"];
	        this.value = source["value"];
	    }
	}
	export class AnimeEditorNullableTimePatchDTO {
	    present: boolean;
	    clear: boolean;
	    unixMilli: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorNullableTimePatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.present = source["present"];
	        this.clear = source["clear"];
	        this.unixMilli = source["unixMilli"];
	    }
	}
	export class AnimeEditorStudiosPatchDTO {
	    present: boolean;
	    clear: boolean;
	    values: string[];
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorStudiosPatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.present = source["present"];
	        this.clear = source["clear"];
	        this.values = source["values"];
	    }
	}
	export class AnimeEditorPatchDTO {
	    name?: string;
	    status?: number;
	    progress?: number;
	    totalEpisodes: AnimeEditorNullableIntPatchDTO;
	    page: AnimeEditorNullableStringPatchDTO;
	    folder: AnimeEditorNullableStringPatchDTO;
	    origin: AnimeEditorNullableStringPatchDTO;
	    duration: AnimeEditorNullableIntPatchDTO;
	    kind: AnimeEditorNullableIntPatchDTO;
	    premieredAt: AnimeEditorNullableTimePatchDTO;
	    placements?: contracts.MobileAnimeDay[];
	    genres?: string[];
	    studios: AnimeEditorStudiosPatchDTO;
	    cover: AnimeEditorCoverPatchDTO;
	    active?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AnimeEditorPatchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.totalEpisodes = this.convertValues(source["totalEpisodes"], AnimeEditorNullableIntPatchDTO);
	        this.page = this.convertValues(source["page"], AnimeEditorNullableStringPatchDTO);
	        this.folder = this.convertValues(source["folder"], AnimeEditorNullableStringPatchDTO);
	        this.origin = this.convertValues(source["origin"], AnimeEditorNullableStringPatchDTO);
	        this.duration = this.convertValues(source["duration"], AnimeEditorNullableIntPatchDTO);
	        this.kind = this.convertValues(source["kind"], AnimeEditorNullableIntPatchDTO);
	        this.premieredAt = this.convertValues(source["premieredAt"], AnimeEditorNullableTimePatchDTO);
	        this.placements = this.convertValues(source["placements"], contracts.MobileAnimeDay);
	        this.genres = source["genres"];
	        this.studios = this.convertValues(source["studios"], AnimeEditorStudiosPatchDTO);
	        this.cover = this.convertValues(source["cover"], AnimeEditorCoverPatchDTO);
	        this.active = source["active"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ApplyAnimeScheduleDraftEntryDTO {
	    animeId: string;
	    baseModifiedAt: number;
	    placements: contracts.MobileAnimeDay[];
	
	    static createFrom(source: any = {}) {
	        return new ApplyAnimeScheduleDraftEntryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.baseModifiedAt = source["baseModifiedAt"];
	        this.placements = this.convertValues(source["placements"], contracts.MobileAnimeDay);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ApplyAnimeScheduleDraftCommandDTO {
	    boardModifiedAt: number;
	    entries: ApplyAnimeScheduleDraftEntryDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ApplyAnimeScheduleDraftCommandDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.boardModifiedAt = source["boardModifiedAt"];
	        this.entries = this.convertValues(source["entries"], ApplyAnimeScheduleDraftEntryDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ApplyScheduleDTO {
	    status: string;
	    applied: number;
	    failed: string[];
	
	    static createFrom(source: any = {}) {
	        return new ApplyScheduleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.applied = source["applied"];
	        this.failed = source["failed"];
	    }
	}
	export class ConfirmSelectionDTO {
	    status: string;
	    approved: number;
	    rejected: number;
	    quotaExceeded: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConfirmSelectionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.approved = source["approved"];
	        this.rejected = source["rejected"];
	        this.quotaExceeded = source["quotaExceeded"];
	    }
	}
	export class OrderingCardDTO {
	    animeId: string;
	    name: string;
	    dia: string;
	    orden: number;
	    section: string;
	    isNewcomer: boolean;
	
	    static createFrom(source: any = {}) {
	        return new OrderingCardDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.name = source["name"];
	        this.dia = source["dia"];
	        this.orden = source["orden"];
	        this.section = source["section"];
	        this.isNewcomer = source["isNewcomer"];
	    }
	}
	export class OrderingBoardDTO {
	    rail: OrderingCardDTO[];
	    grid: OrderingCardDTO[];
	    appliedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new OrderingBoardDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rail = this.convertValues(source["rail"], OrderingCardDTO);
	        this.grid = this.convertValues(source["grid"], OrderingCardDTO);
	        this.appliedAt = source["appliedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SaveAnimeEditorCommandDTO {
	    animeId: string;
	    baseModifiedAt: number;
	    patch: AnimeEditorPatchDTO;
	
	    static createFrom(source: any = {}) {
	        return new SaveAnimeEditorCommandDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.baseModifiedAt = source["baseModifiedAt"];
	        this.patch = this.convertValues(source["patch"], AnimeEditorPatchDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SeasonAnimeCandidateDTO {
	    title: string;
	    pageUrl: string;
	    score: number;
	
	    static createFrom(source: any = {}) {
	        return new SeasonAnimeCandidateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.pageUrl = source["pageUrl"];
	        this.score = source["score"];
	    }
	}
	export class SeasonAnimeDTO {
	    id: string;
	    rawName: string;
	    matchStatus: string;
	    matchedSlug: string;
	    candidates: SeasonAnimeCandidateDTO[];
	    availability: string;
	    availableEpisodes: number;
	    animeId: string;
	    section: string;
	    sectionOrder: number;
	    grade: number;
	    gradeSource: string;
	    ratedAt?: number;
	    skipGrading: boolean;
	    consideration: string;
	    folderPath: string;
	    pageUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new SeasonAnimeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rawName = source["rawName"];
	        this.matchStatus = source["matchStatus"];
	        this.matchedSlug = source["matchedSlug"];
	        this.candidates = this.convertValues(source["candidates"], SeasonAnimeCandidateDTO);
	        this.availability = source["availability"];
	        this.availableEpisodes = source["availableEpisodes"];
	        this.animeId = source["animeId"];
	        this.section = source["section"];
	        this.sectionOrder = source["sectionOrder"];
	        this.grade = source["grade"];
	        this.gradeSource = source["gradeSource"];
	        this.ratedAt = source["ratedAt"];
	        this.skipGrading = source["skipGrading"];
	        this.consideration = source["consideration"];
	        this.folderPath = source["folderPath"];
	        this.pageUrl = source["pageUrl"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SeasonDTO {
	    id: string;
	    name: string;
	    minApprovalGrade: number;
	    slots: number;
	    status: string;
	    selectionConfirmedAt?: number;
	    appliedAt?: number;
	    closedAt?: number;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SeasonDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.minApprovalGrade = source["minApprovalGrade"];
	        this.slots = source["slots"];
	        this.status = source["status"];
	        this.selectionConfirmedAt = source["selectionConfirmedAt"];
	        this.appliedAt = source["appliedAt"];
	        this.closedAt = source["closedAt"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class SendToVerHoyDTO {
	    status: string;
	    pastDownloadTime: boolean;
	    downloadTime: string;
	
	    static createFrom(source: any = {}) {
	        return new SendToVerHoyDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.pastDownloadTime = source["pastDownloadTime"];
	        this.downloadTime = source["downloadTime"];
	    }
	}

}

